/**
 * Stored Zoho webhook bodies, trimmed after 90 days — 2S0-SEC-01 (the
 * owner's decision on O4, 2026-10-06).
 *
 * Every Zoho delivery is kept as a WebhookDelivery row with its body
 * (routes/v1/zoho-webhooks.ts): a body not yet applied must be on disk
 * behind its queued job, and a refused one is kept to say why. Nothing ever
 * pruned them, and a refused body is whatever was sent — a real Zoho payload
 * that didn't parse carries the customer's name and email.
 *
 * Once a delivery is FINISHED (APPLIED, REJECTED or FAILED — the ingest jobs
 * skip anything but RECEIVED, so a finished body is never read again) and
 * older than ZOHO_WEBHOOK_BODY_RETENTION_DAYS, its body is replaced by its
 * ids: the scalar `id` / `…Id` / `…_id` fields, a CRM notification's
 * `module`, `ids` and `operation`, and `trimmed: true`. The row itself stays
 * — source, status, error, signature verdict, `externalId`, received time —
 * so integration health still counts it and the record of what arrived, and
 * when, is intact. The audit log is not touched; each trim is audited.
 * A RECEIVED body (still to be applied) is never trimmed, however old.
 *
 * Payment-provider deliveries are not Zoho's and are already kept as ids
 * only (payment-events.ts `rejectedDeliveryRecord`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";

export const ZOHO_WEBHOOK_BODY_RETENTION_DAYS = 90;
const ZOHO_SOURCES = ["zoho", "zoho-crm"];
const FINISHED = ["APPLIED", "REJECTED", "FAILED"];
const BATCH = 500;

const scalar = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : typeof v === "number" || typeof v === "boolean" ? v : undefined);

/** A stored body, reduced to its ids. Pure. */
export function idsOnly(payload: unknown): Prisma.InputJsonObject {
  const out: Record<string, Prisma.InputJsonValue> = { trimmed: true };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (key === "ids" && Array.isArray(value)) {
      out.ids = value.filter((v): v is string => typeof v === "string" && /^\d{1,40}$/.test(v)).slice(0, 200);
    } else if (key === "id" || /(?:Id|_id)$/.test(key) || key === "module" || key === "operation") {
      const v = scalar(value);
      if (v !== undefined) out[key] = v;
    }
  }
  return out;
}

/**
 * The sweep: finished Zoho deliveries older than the window, their bodies
 * trimmed to ids, BATCH at a time. `tenantIds` narrows it to those tenants'
 * rows — a test's own; the worker passes none and sweeps every row,
 * including those recorded before a tenant was known (tenantId null, which
 * is every Zoho delivery today).
 */
export async function trimZohoWebhookBodies(now = new Date(), opts: { tenantIds?: string[] } = {}): Promise<{ trimmed: number }> {
  const before = new Date(now.getTime() - ZOHO_WEBHOOK_BODY_RETENTION_DAYS * 86_400_000);
  const scope = opts.tenantIds ?? null;
  /* Raw for the "not trimmed yet" test (`NOT payload ? 'trimmed'`): Prisma's JSON-path NOT is NULL, so false, for a
     body without the key. Parameters only.
     tenant-scope: the worker's sweep across every tenant (and none: a Zoho delivery is recorded before its tenant is known); a test passes its own tenantIds. */
  const rows = await prisma.$queryRaw<Array<{ id: string; tenantId: string | null; payload: unknown }>>`
    SELECT id, "tenantId", payload FROM "WebhookDelivery"
     WHERE source = ANY(${ZOHO_SOURCES}::text[]) AND status = ANY(${FINISHED}::text[]) AND "receivedAt" < ${before}
       AND NOT (jsonb_typeof(payload) = 'object' AND payload ? 'trimmed')
       AND (${scope}::text[] IS NULL OR "tenantId" = ANY(${scope}::text[]))
     ORDER BY "receivedAt" ASC
     LIMIT ${BATCH}`;
  if (!rows.length) return { trimmed: 0 };
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.webhookDelivery.update({
        /* tenant-scope: the row the sweep just read, by id. */
        where: { id: r.id }, data: { payload: idsOnly(r.payload) }, select: { id: true },
      });
    }
    /* One audit row per tenant the trimmed rows belong to; an unknown tenant's are in the books the Zoho jobs are queued in. */
    const byTenant = new Map<string, string[]>();
    for (const r of rows) {
      const t = r.tenantId ?? env.PUBLIC_INTAKE_TENANT_ID;
      byTenant.set(t, [...(byTenant.get(t) ?? []), r.id]);
    }
    for (const [tenantId, ids] of byTenant) {
      await audit(tx, { userId: null, tenantId }, "webhookDelivery.bodyTrimmed", "WebhookDelivery", ids.length === 1 ? ids[0]! : `${ids.length} deliveries`, {
        after: { olderThanDays: ZOHO_WEBHOOK_BODY_RETENTION_DAYS, deliveries: ids },
      });
    }
  });
  return { trimmed: rows.length };
}
