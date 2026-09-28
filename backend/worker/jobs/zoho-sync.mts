/**
 * The Zoho CRM sync, worker side — P8-INT-01..07, §18, field-mapping §8.
 *
 * Thin by design: each handler resolves its tenant, builds the sync context
 * and calls one function in `src/domain/zoho-sync.ts`, where the rules live
 * and are tested. What is decided HERE is only the queue semantics:
 *
 *   - A `ZohoRecordError` (Zoho refused this record's data) is logged and the
 *     job completes. Retrying the same payload cannot succeed, and the
 *     nightly reconciliation reports the record as missing, so it is not lost
 *     from view — it is waiting for a person.
 *   - Anything else throws, and pg-boss retries: throttling, Zoho down, a
 *     missing credential, a network fault. Every write is an upsert on
 *     SponsorX_ID or an update by id, so a retry is idempotent (§8.2).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { ZohoRecordError, type ZohoClient } from "../../src/lib/zoho.ts";
import {
  applyZohoRecord,
  backfill,
  pushDeal,
  pushLead,
  pushFanLead,
  pushRenewal,
  pushTask,
  reconcile,
  type ApplyOutcome,
  type BackfillModule,
  type SyncCtx,
} from "../../src/domain/zoho-sync.ts";

export type Deps = { db: PrismaClient; zoho: () => ZohoClient };

const ctxFor = (deps: Deps, extra: Partial<SyncCtx> = {}): SyncCtx => ({
  db: deps.db,
  zoho: deps.zoho(),
  ...extra,
});

/** The drain stamps every payload with the outbox row's tenant. */
type Tenanted = { tenantId: string };

async function tolerateRecordErrors<T>(label: string, run: () => Promise<T>): Promise<T | { status: "refused"; reason: string }> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ZohoRecordError) {
      console.error(`[worker] ${label} refused by Zoho — not retried: ${error.message}`);
      return { status: "refused", reason: error.message };
    }
    throw error;
  }
}

export type DealJob = Tenanted & { briefId?: string; campaignId?: string };
export const handlePushDeal = (deps: Deps, job: DealJob) =>
  tolerateRecordErrors("zoho.pushDeal", () =>
    pushDeal(ctxFor(deps), job.tenantId, { briefId: job.briefId, campaignId: job.campaignId }));

export type TaskJob = Tenanted & { taskId: string };
export const handlePushTask = (deps: Deps, job: TaskJob) =>
  tolerateRecordErrors("zoho.pushTask", () => pushTask(ctxFor(deps), job.tenantId, job.taskId));

/** `zoho.pushLead` carries either a sponsor enquiry (P8-INT-06) or a fan who
 *  ticked "the sponsor may contact me" (2S6-INT-03). */
export type LeadJob = Tenanted & ({ inquiryId: string } | { fanEventId: string });
export const handlePushLead = (deps: Deps, job: LeadJob) =>
  tolerateRecordErrors("zoho.pushLead", () =>
    "fanEventId" in job
      ? pushFanLead(ctxFor(deps), job.tenantId, job.fanEventId)
      : pushLead(ctxFor(deps), job.tenantId, job.inquiryId));

export type RenewalJob = Tenanted & { campaignId: string };
export const handlePushRenewal = (deps: Deps, job: RenewalJob) =>
  tolerateRecordErrors("zoho.pushRenewal", () => pushRenewal(ctxFor(deps), job.tenantId, job.campaignId));

/**
 * `zoho.ingestCrm` — apply the records a verified notification named
 * (P8-INT-03/04). The delivery row the route wrote is closed out here:
 * APPLIED when anything was applied or recognised as an echo, REJECTED when
 * every record was one we do not know, FAILED (and retried) on an error.
 */
export type IngestCrmJob = { deliveryId: string };

export async function handleIngestCrm(
  deps: Deps,
  job: IngestCrmJob,
): Promise<{ status: string; outcomes: ApplyOutcome[] }> {
  const delivery = await deps.db.webhookDelivery.findUnique({
    where: { id: job.deliveryId },
    select: { id: true, status: true, payload: true },
  });
  if (!delivery) return { status: "SKIPPED", outcomes: [] };
  if (delivery.status !== "RECEIVED") return { status: `already ${delivery.status}`, outcomes: [] };

  const n = delivery.payload as { module: string; ids: string[]; operation: string };
  const outcomes: ApplyOutcome[] = [];
  try {
    if (n.operation === "delete") {
      /* A deletion in Zoho is not mirrored — our rows are the record of
         what was promised and delivered. Reconciliation will report the
         record as missing, which is where a person should see it. */
      outcomes.push({ status: "ignored", reason: `delete of ${n.ids.length} ${n.module} record(s) is not mirrored` });
    } else {
      const ctx = ctxFor(deps);
      for (const id of n.ids) {
        const record = await ctx.zoho.get(n.module, id);
        outcomes.push(
          record
            ? await applyZohoRecord(ctx, n.module, record)
            : { status: "ignored", reason: `${n.module} ${id} no longer exists in Zoho` },
        );
      }
    }
    const allUnknown = outcomes.every((o) => o.status === "unknown");
    const status = allUnknown ? "REJECTED" : "APPLIED";
    await deps.db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status,
        error: allUnknown ? outcomes.map((o) => (o.status === "unknown" ? o.reason : o.status)).join("; ").slice(0, 1000) : null,
      },
    });
    return { status, outcomes };
  } catch (error) {
    await deps.db.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: (error as Error).message.slice(0, 1000) },
    });
    if (error instanceof ZohoRecordError) return { status: "FAILED", outcomes };
    throw error;
  }
}

/**
 * `zoho.backfill` — P8-INT-07. Kept and re-runnable. Users first (so tasks
 * get owners), then Accounts, then Contacts (a contact needs its account).
 */
export type BackfillJob = Tenanted & { modules?: BackfillModule[]; maxPages?: number };

export async function handleBackfill(deps: Deps, job: BackfillJob) {
  const ctx = ctxFor(deps, { pauseMs: 250 });
  const results = [];
  for (const module of job.modules ?? (["Users", "Accounts", "Contacts"] as BackfillModule[])) {
    results.push(await backfill(ctx, job.tenantId, module, { maxPages: job.maxPages }));
  }
  return results;
}

/**
 * The nightly drift report — P8-INT-05. Runs for every tenant; skips one
 * whose last report is under a day old, so restarts do not multiply it.
 */
export async function runReconciliation(deps: Deps, opts: { force?: boolean; tenantIds?: string[] } = {}) {
  const tenants = await deps.db.tenant.findMany({
    where: opts.tenantIds ? { id: { in: opts.tenantIds } } : {},
    select: { id: true },
  });
  const out = [];
  for (const t of tenants) {
    if (!opts.force) {
      const last = await deps.db.zohoReconciliation.findFirst({
        where: { tenantId: t.id },
        orderBy: { ranAt: "desc" },
        select: { ranAt: true },
      });
      if (last && Date.now() - last.ranAt.getTime() < 23 * 60 * 60 * 1000) continue;
    }
    const reports = await reconcile(ctxFor(deps, { pauseMs: 250 }), t.id);
    out.push({ tenantId: t.id, reports });
  }
  return out;
}

/**
 * Jobs that cannot run without CRM credentials. On a worker without them
 * (production, until real records move) the drain leaves these IN THE
 * OUTBOX rather than dispatching them into pg-boss, where each would fail
 * against the retry limit and be archived — lost. Waiting in the outbox,
 * they go the moment credentials are set, which is what "syncs wait" means.
 * `zoho.ingestInvoice` is not here: it applies a Books payload already on
 * disk and never calls the CRM.
 */
export const NEEDS_ZOHO_CRM = new Set([
  "zoho.pushDeal", "zoho.pushCampaign", "zoho.pushTask", "zoho.pushLead",
  "zoho.pushRenewal", "zoho.ingestCrm", "zoho.backfill",
]);

export function dispatchableJobs(handled: Iterable<string>, zohoConfigured: boolean): string[] {
  return [...handled].filter((name) => zohoConfigured || !NEEDS_ZOHO_CRM.has(name));
}

/** The four modules §18 makes bi-directional. */
export const WATCH_EVENTS = ["Accounts.all", "Contacts.all", "Deals.all", "Tasks.all"] as const;

/**
 * Keep the Notifications API channel subscribed. Zoho expires a channel, so
 * the worker renews it well inside the expiry; renewing an existing channel
 * id replaces it rather than adding a second.
 */
export async function renewWatch(
  zoho: ZohoClient,
  e: Record<string, string | undefined> = process.env,
): Promise<{ renewed: boolean; reason?: string; expires?: string }> {
  if (!e.ZOHO_NOTIFY_URL || !e.ZOHO_NOTIFY_TOKEN || !e.ZOHO_NOTIFY_CHANNEL_ID) {
    return { renewed: false, reason: "ZOHO_NOTIFY_URL / _TOKEN / _CHANNEL_ID not all set" };
  }
  const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await zoho.watch({
    channelId: e.ZOHO_NOTIFY_CHANNEL_ID,
    events: WATCH_EVENTS,
    notifyUrl: e.ZOHO_NOTIFY_URL,
    token: e.ZOHO_NOTIFY_TOKEN,
    expiry,
  });
  return { renewed: true, expires: expiry.toISOString() };
}
