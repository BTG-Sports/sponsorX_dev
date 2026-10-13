/**
 * The fact ledger's one writer — 3S1-BE-01
 * (documentation/SponsorX-Fact-Ledger.md; stack-decision Addendum D).
 *
 * LIKE `audit` AND `enqueue`, IT TAKES THE TRANSACTION. The fact is written
 * in the same transaction as the change it records, and the daily summary row
 * it belongs to is updated in that same transaction: both are saved, or
 * neither is. The figures can therefore never disagree with the app, and
 * there is no copy that could fall behind.
 *
 * Three rules make the summaries exactly the sum of the facts:
 *   - one fact per business event: the caller's `key` is unique per tenant, so
 *     a retried action finds it and adds nothing;
 *   - facts are never edited (a database trigger refuses it): a correction is
 *     `reverseFact`, a new fact with the measures negated, at most once;
 *   - the summary is moved by `+= delta` in one statement (INSERT … ON
 *     CONFLICT DO UPDATE), so two actions at the same moment both count.
 * `checkFactSummaries` proves it on demand.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import {
  FACT_CHANNELS, FACT_KINDS, FACT_MEASURES, INVENTORY_KINDS, MEASURE_COLUMNS,
  inventoryKey, marketKey, normaliseMarket,
  type FactChannel, type FactKind, type FactMeasure, type InventoryKind,
} from "./fact-rules";

export class FactError extends Error {
  readonly status = 500;
  constructor(message: string) {
    super(message);
    this.name = "FactError";
  }
}

export type FactInput = {
  tenantId: string;
  kind: Exclude<FactKind, "REVERSAL">;
  /** Unique per tenant for this business event, e.g. `order.booked:<orderId>`. */
  key: string;
  /** The day it happened (UTC); the summary counts it on that day. */
  occurredOn: Date;
  campaignId?: string | null;
  athleteId?: string | null;
  inventory?: { kind: InventoryKind; id: string } | null;
  channel: FactChannel;
  /** Raw state and city; normalised here, the one place it is done. */
  market?: { state: string | null | undefined; city?: string | null } | null;
  source: { type: string; id: string };
  measures: Partial<Record<FactMeasure, number>>;
};

type Tx = Prisma.TransactionClient;
const dayOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

function checkMeasures(measures: Record<string, unknown>): Array<[FactMeasure, number]> {
  const entries = Object.entries(measures);
  if (!entries.length) throw new FactError("A fact needs at least one measure.");
  for (const [m, v] of entries) {
    if (!(FACT_MEASURES as string[]).includes(m)) throw new FactError(`"${m}" is not a fact measure.`);
    if (typeof v !== "number" || !Number.isSafeInteger(v)) throw new FactError(`The measure "${m}" must be a whole number, not ${String(v)}.`);
  }
  return entries.filter(([, v]) => v !== 0) as Array<[FactMeasure, number]>;
}

type Stored = {
  id: string; tenantId: string; kind: string; occurredOn: Date; campaignId: string | null; athleteId: string | null;
  inventoryKind: string | null; inventoryId: string | null; channel: string; marketState: string; marketCity: string; measures: unknown;
};

/** Move the summary row a fact belongs to by the fact's measures — one statement, so concurrent moves all count. */
async function moveSummary(tx: Tx, f: Stored, measures: Array<[FactMeasure, number]>): Promise<void> {
  if (!measures.length) return;
  const cols = measures.map(([m]) => `"${MEASURE_COLUMNS[m]}"`);
  const params: unknown[] = [
    f.tenantId, f.campaignId ?? "", f.athleteId ?? "", f.channel, inventoryKey(f.inventoryKind, f.inventoryId),
    marketKey({ state: f.marketState, city: f.marketCity }), dayOf(f.occurredOn),
    ...measures.map(([, v]) => BigInt(v)),
  ];
  const values = measures.map((_, i) => `$${8 + i}`);
  await tx.$executeRawUnsafe(
    /* tenant-scope: the fact's own tenant is the first column of the key. */
    `INSERT INTO "CampaignDaySummary" (id, "tenantId", "campaignId", "athleteId", channel, "inventoryKey", "marketKey", day, ${cols.join(", ")})
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7::date, ${values.join(", ")})
     ON CONFLICT ("tenantId", "campaignId", "athleteId", channel, "inventoryKey", "marketKey", day)
     DO UPDATE SET ${cols.map((c) => `${c} = "CampaignDaySummary".${c} + EXCLUDED.${c}`).join(", ")}, "updatedAt" = now()`,
    ...params,
  );
}

/** Record one fact and move its summary, inside the caller's transaction. */
export async function recordFact(tx: Tx, input: FactInput): Promise<{ id: string; created: boolean }> {
  const key = input.key?.trim();
  if (!key) throw new FactError("A fact needs a key that names its business event.");
  if (!(FACT_KINDS as readonly string[]).includes(input.kind) || input.kind === ("REVERSAL" as string)) throw new FactError(`"${input.kind}" is not a fact kind.`);
  if (!(FACT_CHANNELS as readonly string[]).includes(input.channel)) throw new FactError(`"${input.channel}" is not a fact channel.`);
  if (input.inventory && !(INVENTORY_KINDS as readonly string[]).includes(input.inventory.kind)) throw new FactError(`"${input.inventory.kind}" is not an inventory kind.`);
  const measures = checkMeasures(input.measures);
  const market = normaliseMarket(input.market?.state, input.market?.city);

  const inserted = await tx.$queryRawUnsafe<Stored[]>(
    /* tenant-scope: written under the caller's tenant; unique per tenant and key. */
    `INSERT INTO "Fact" (id, "tenantId", kind, "idempotencyKey", "occurredOn", "campaignId", "athleteId", "inventoryKind", "inventoryId",
                         channel, "marketState", "marketCity", measures, "sourceType", "sourceId")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4::date, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)
     ON CONFLICT ("tenantId", "idempotencyKey") DO NOTHING
     RETURNING id, "tenantId", kind, "occurredOn", "campaignId", "athleteId", "inventoryKind", "inventoryId", channel, "marketState", "marketCity", measures`,
    input.tenantId, input.kind, key, dayOf(input.occurredOn), input.campaignId ?? null, input.athleteId ?? null,
    input.inventory?.kind ?? null, input.inventory?.id ?? null, input.channel, market.state, market.city,
    JSON.stringify(Object.fromEntries(measures)), input.source.type, input.source.id,
  );
  if (!inserted.length) {
    const existing = await tx.fact.findUniqueOrThrow({
      /* tenant-scope: explicit — the caller's tenant and key. */
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: key } }, select: { id: true },
    });
    return { id: existing.id, created: false };
  }
  await moveSummary(tx, inserted[0]!, measures);
  return { id: inserted[0]!.id, created: true };
}

/**
 * Correct a fact: a new fact with its measures negated, on the day of the
 * correction, never an edit of the original. At most once per fact; a second
 * call finds the reversal and adds nothing.
 */
export async function reverseFact(
  tx: Tx,
  input: { tenantId: string; key: string; occurredOn: Date; reason: string },
): Promise<{ id: string; created: boolean }> {
  const original = await tx.fact.findUnique({
    /* tenant-scope: explicit — the caller's tenant and the original's key. */
    where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.key } },
    select: { id: true, kind: true, measures: true },
  });
  if (!original) throw new FactError(`No fact "${input.key}" to reverse.`);
  if (original.kind === "REVERSAL") throw new FactError("A reversal is not itself reversed; record the event again instead.");
  const negated = Object.entries(original.measures as Record<string, number>).map(([m, v]) => [m, -v] as [FactMeasure, number]);

  const inserted = await tx.$queryRawUnsafe<Stored[]>(
    /* tenant-scope: the original's own tenant; reversesId is unique, so a second reversal inserts nothing. */
    `INSERT INTO "Fact" (id, "tenantId", kind, "idempotencyKey", "occurredOn", "campaignId", "athleteId", "inventoryKind", "inventoryId",
                         channel, "marketState", "marketCity", measures, "sourceType", "sourceId", "reversesId", reason)
     SELECT gen_random_uuid()::text, "tenantId", 'REVERSAL', 'reverse:' || "idempotencyKey", $2::date, "campaignId", "athleteId", "inventoryKind", "inventoryId",
            channel, "marketState", "marketCity", $3::jsonb, "sourceType", "sourceId", id, $4
       FROM "Fact" WHERE id = $1
     ON CONFLICT DO NOTHING
     RETURNING id, "tenantId", kind, "occurredOn", "campaignId", "athleteId", "inventoryKind", "inventoryId", channel, "marketState", "marketCity", measures`,
    original.id, dayOf(input.occurredOn), JSON.stringify(Object.fromEntries(negated)), input.reason,
  );
  if (!inserted.length) {
    const existing = await tx.fact.findUniqueOrThrow({
      /* tenant-scope: the reversal of the fact found above in this tenant (reversesId is unique). */
      where: { reversesId: original.id }, select: { id: true },
    });
    return { id: existing.id, created: false };
  }
  await moveSummary(tx, inserted[0]!, negated.filter(([, v]) => v !== 0));
  return { id: inserted[0]!.id, created: true };
}

export type FactSummaryDifference = {
  tenantId: string; campaignId: string; athleteId: string; channel: string; inventoryKey: string; marketKey: string; day: string;
  measure: FactMeasure; summary: number; facts: number;
};

/**
 * Prove the summaries are exactly the sum of the facts, row by row and
 * measure by measure. The nightly check (3S1-QA-01) runs this; so do tests.
 */
export async function checkFactSummaries(
  db: PrismaClient | Tx,
  opts: { tenantId?: string } = {},
): Promise<{ ok: boolean; differences: FactSummaryDifference[] }> {
  const t = opts.tenantId ?? null;
  const facts = await db.$queryRawUnsafe<Array<{ k: string; m: string; v: string }>>(
    /* tenant-scope: $1 is the tenant, or every tenant for the platform check. */
    `SELECT concat_ws('|', f."tenantId", coalesce(f."campaignId", ''), coalesce(f."athleteId", ''), f.channel,
                     CASE WHEN f."inventoryKind" IS NOT NULL AND f."inventoryId" IS NOT NULL THEN f."inventoryKind" || ':' || f."inventoryId" ELSE '' END,
                     CASE WHEN f."marketState" <> '' THEN f."marketState" || ':' || f."marketCity" ELSE '' END,
                     to_char(f."occurredOn", 'YYYY-MM-DD')) AS k, m.key AS m, sum(m.value::bigint)::text AS v
       FROM "Fact" f, jsonb_each_text(f.measures) m
      WHERE $1::text IS NULL OR f."tenantId" = $1
      GROUP BY 1, 2`, t);
  const cols = FACT_MEASURES.map((m) => `"${MEASURE_COLUMNS[m]}"::text AS "${m}"`).join(", ");
  const rows = await db.$queryRawUnsafe<Array<Record<string, string>>>(
    /* tenant-scope: as above. */
    `SELECT concat_ws('|', "tenantId", "campaignId", "athleteId", channel, "inventoryKey", "marketKey", to_char(day, 'YYYY-MM-DD')) AS k, ${cols}
       FROM "CampaignDaySummary" WHERE $1::text IS NULL OR "tenantId" = $1`, t);

  const fromFacts = new Map(facts.map((r) => [`${r.k}#${r.m}`, Number(r.v)]));
  const fromSummary = new Map<string, number>();
  for (const r of rows) for (const m of FACT_MEASURES) if (Number(r[m]) !== 0) fromSummary.set(`${r.k}#${m}`, Number(r[m]));
  const differences: FactSummaryDifference[] = [];
  for (const id of new Set([...fromFacts.keys(), ...fromSummary.keys()])) {
    const a = fromSummary.get(id) ?? 0;
    const b = fromFacts.get(id) ?? 0;
    if (a === b) continue;
    const [k, measure] = id.split("#") as [string, FactMeasure];
    const [tenantId, campaignId, athleteId, channel, inv, market, day] = k.split("|") as string[];
    differences.push({ tenantId: tenantId!, campaignId: campaignId!, athleteId: athleteId!, channel: channel!, inventoryKey: inv!, marketKey: market!, day: day!, measure, summary: a, facts: b });
  }
  return { ok: differences.length === 0, differences };
}
