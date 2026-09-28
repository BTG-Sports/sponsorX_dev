/**
 * Integration health — P8-FE-01, §23, §20. What the admin portal shows when
 * someone asks "is Zoho syncing, is the worker keeping up, is anything
 * failing?". Read-only, tenant-wide, BTG only (`webhookDelivery` read, the
 * matrix's cell for this surface).
 *
 * FOUR SIGNALS, each from where the truth lives:
 *   dependencies — the same checks as /health/ready (Postgres, Redis, R2)
 *   sync         — per synced record type: how many are linked to Zoho, and
 *                  when the last sync landed (lastSyncAt on the rows)
 *   webhooks     — inbound Zoho deliveries in the last 7 days by status
 *                  (P8-INT-04 records every attempt, valid or not), with the
 *                  recent failures. Payloads are NEVER returned — they are
 *                  third-party data, and diagnosis needs status and error.
 *   queue        — the outbox (written in the request transaction, waiting
 *                  for the worker) and pg-boss (what the worker did with it):
 *                  backlog, oldest waiting, and recent failed jobs for this
 *                  tenant only (pg-boss rows carry tenantId in their data).
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { redisReachable } from "../lib/redis";
import { storageReachable } from "../lib/storage";

const WEEK = 7 * 86_400_000;

export type IntegrationHealth = {
  checkedAt: string;
  dependencies: { db: boolean; redis: boolean; storage: boolean };
  sync: { entity: string; linked: number; total: number; lastSyncAt: string | null }[];
  webhooks: {
    bySource: { source: string; received: number; applied: number; rejected: number; lastAt: string | null }[];
    recentFailures: { source: string; status: string; error: string | null; signatureOk: boolean; receivedAt: string }[];
  };
  queue: {
    outboxPending: { name: string; count: number; oldest: string }[];
    jobs: { name: string; state: string; count: number }[];
    recentFailed: { name: string; failedAt: string | null; error: string | null }[];
  };
};

export async function integrationHealth(actor: Actor, now = new Date()): Promise<IntegrationHealth> {
  assertTenantWide(actor, "webhookDelivery", "read");
  const tenantId = actor.tenantId;
  const since = new Date(now.getTime() - WEEK);

  const [db, redis, storage] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redisReachable(),
    storageReachable(),
  ]);

  /* Synced record types (§18) — linked = carries a Zoho id. Written out per
     model rather than generically: the columns differ (Athlete has no
     lastSyncAt), and a cast that hid that would fail at runtime. */
  const tenant = { tenantId };
  const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
  const [sp, spL, spM, at, atL, br, brL, brM, ca, caL, caM, tk, tkL, tkM] = await Promise.all([
    prisma.sponsor.count({ where: tenant }),
    prisma.sponsor.count({ where: { ...tenant, zohoAccountId: { not: null } } }),
    prisma.sponsor.aggregate({ where: tenant, _max: { lastSyncAt: true } }),
    prisma.athlete.count({ where: tenant }),
    prisma.athlete.count({ where: { ...tenant, zohoId: { not: null } } }),
    prisma.campaignBrief.count({ where: tenant }),
    prisma.campaignBrief.count({ where: { ...tenant, zohoDealId: { not: null } } }),
    prisma.campaignBrief.aggregate({ where: tenant, _max: { lastSyncAt: true } }),
    prisma.campaign.count({ where: tenant }),
    prisma.campaign.count({ where: { ...tenant, zohoDealId: { not: null } } }),
    prisma.campaign.aggregate({ where: tenant, _max: { lastSyncAt: true } }),
    prisma.syncTask.count({ where: tenant }),
    prisma.syncTask.count({ where: { ...tenant, zohoTaskId: { not: null } } }),
    prisma.syncTask.aggregate({ where: tenant, _max: { lastSyncAt: true } }),
  ]);
  const sync = [
    { entity: "Sponsors (Accounts)", linked: spL, total: sp, lastSyncAt: iso(spM._max.lastSyncAt) },
    { entity: "Athletes (Contacts)", linked: atL, total: at, lastSyncAt: null },
    { entity: "Briefs (Deals)", linked: brL, total: br, lastSyncAt: iso(brM._max.lastSyncAt) },
    { entity: "Campaigns (Deals)", linked: caL, total: ca, lastSyncAt: iso(caM._max.lastSyncAt) },
    { entity: "Tasks", linked: tkL, total: tk, lastSyncAt: iso(tkM._max.lastSyncAt) },
  ];

  const deliveries = await prisma.webhookDelivery.findMany({
    where: { tenantId, receivedAt: { gte: since } },
    select: { source: true, status: true, error: true, signatureOk: true, receivedAt: true },
    orderBy: { receivedAt: "desc" },
    take: 1000,
  });
  const bySourceMap = new Map<string, { source: string; received: number; applied: number; rejected: number; lastAt: string | null }>();
  for (const d of deliveries) {
    const b = bySourceMap.get(d.source) ?? { source: d.source, received: 0, applied: 0, rejected: 0, lastAt: null };
    b.received += 1;
    const st = d.status.toUpperCase();
    if (st === "APPLIED") b.applied += 1;
    if (st === "REJECTED") b.rejected += 1;
    b.lastAt ??= d.receivedAt.toISOString();
    bySourceMap.set(d.source, b);
  }
  const recentFailures = deliveries
    .filter((d) => d.status.toUpperCase() === "REJECTED" || d.error)
    .slice(0, 10)
    .map((d) => ({ source: d.source, status: d.status, error: d.error, signatureOk: d.signatureOk, receivedAt: d.receivedAt.toISOString() }));

  const pending = await prisma.outboxJob.groupBy({
    by: ["name"],
    where: { tenantId, dispatchedAt: null },
    _count: { _all: true },
    _min: { createdAt: true },
  });

  /* pg-boss is not a Prisma model; its rows carry the tenant in `data`. */
  let jobs: { name: string; state: string; count: number }[] = [];
  let recentFailed: { name: string; failedAt: string | null; error: string | null }[] = [];
  try {
    const grouped = await prisma.$queryRaw<{ name: string; state: string; count: bigint }[]>`
      SELECT name, state::text AS state, count(*) AS count
        FROM pgboss.job
       WHERE data->>'tenantId' = ${tenantId} AND created_on >= ${since}
       GROUP BY name, state ORDER BY name, state`;
    jobs = grouped.map((g) => ({ name: g.name, state: g.state, count: Number(g.count) }));
    const failed = await prisma.$queryRaw<{ name: string; completed_on: Date | null; output: unknown }[]>`
      SELECT name, completed_on, output
        FROM pgboss.job
       WHERE data->>'tenantId' = ${tenantId} AND state = 'failed'
       ORDER BY completed_on DESC NULLS LAST LIMIT 10`;
    recentFailed = failed.map((f) => ({
      name: f.name,
      failedAt: f.completed_on?.toISOString() ?? null,
      error: errorText(f.output),
    }));
  } catch {
    /* pg-boss not installed yet (fresh database before the worker's first
       start) — report an empty queue rather than fail the whole view. */
  }

  return {
    checkedAt: now.toISOString(),
    dependencies: { db, redis, storage },
    sync,
    webhooks: { bySource: [...bySourceMap.values()], recentFailures },
    queue: {
      outboxPending: pending.map((p) => ({ name: p.name, count: p._count._all, oldest: (p._min.createdAt ?? now).toISOString() })),
      jobs,
      recentFailed,
    },
  };
}

/** pg-boss stores a failure as { message, ... } or a string. Only the
 *  message is surfaced — never a stack or the job's data. */
function errorText(output: unknown): string | null {
  if (!output) return null;
  if (typeof output === "string") return output.slice(0, 300);
  const m = (output as { message?: unknown }).message;
  return typeof m === "string" ? m.slice(0, 300) : null;
}
