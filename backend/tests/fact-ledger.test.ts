import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FACT_MEASURES, normaliseMarket } from "../src/domain/fact-rules";

/* --------------------------------------------------------------------------
   3S1-BE-01 — the fact ledger and the daily summaries
   (documentation/SponsorX-Fact-Ledger.md; stack-decision Addendum D).

   The same transaction that books, cancels, pays or delivers also writes one
   fact row, and the daily summary row it belongs to is updated in that same
   transaction — both saved, or neither. Facts are never edited: a correction
   is a new fact that reverses the old one. The summaries are therefore always
   exactly the sum of the facts, which `checkFactSummaries` proves.

   Done when: facts and summaries are written in the same transaction as the
   change (both or neither); summaries always equal the sum of the facts; a
   correction adds rows and never edits one.
   -------------------------------------------------------------------------- */

describe("3S1-BE-01 · the rules, without a database", () => {
  it("measures are a closed list", () => {
    expect(FACT_MEASURES).toEqual(expect.arrayContaining(["booked_sell_cents", "deliverables_due", "views_verified_api", "invoice_paid_cents"]));
  });

  it("a market is normalised the way the summaries key it: trimmed state, title-cased city, nothing without a state", () => {
    expect(normaliseMarket(" md ", " baltimore ")).toEqual({ state: "MD", city: "Baltimore" });
    expect(normaliseMarket("TX", null)).toEqual({ state: "TX", city: "" });
    expect(normaliseMarket(null, "Austin")).toEqual({ state: "", city: "" });
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-BE-01 · the fact ledger against Postgres", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact, reverseFact, checkFactSummaries, FactError } = await import("../src/domain/facts");

  const T = "fl_t";
  const FS = { id: true, tenantId: true, kind: true, idempotencyKey: true, occurredOn: true, campaignId: true, athleteId: true, channel: true, measures: true, reversesId: true } as const;
  const DAY = new Date("2026-09-05T00:00:00Z");
  const booked = (key: string, sell: number, comp: number) => ({
    tenantId: T, kind: "ORDER_BOOKED" as const, key, occurredOn: DAY,
    campaignId: "fl_c1", athleteId: "fl_a1", inventory: { kind: "NIL_JOB" as const, id: "SX-01" }, channel: "CAMPAIGN" as const,
    market: { state: "MD", city: "Baltimore" }, source: { type: "CampaignOrder", id: key },
    measures: { booked_sell_cents: sell, booked_compensation_cents: comp },
  });
  const summary = async () => prisma.campaignDaySummary.findMany({ where: { tenantId: T }, orderBy: { day: "asc" },
    select: { day: true, campaignId: true, athleteId: true, channel: true, inventoryKey: true, marketKey: true, bookedSellCents: true, bookedCompensationCents: true } });

  async function clean() {
    await prisma.campaignDaySummary.deleteMany({ where: { tenantId: T } });
    await prisma.fact.deleteMany({ where: { tenantId: T } });
  }
  beforeAll(clean);
  afterAll(clean);

  it("writes the fact and its summary in the caller's transaction — both are there after commit", async () => {
    await prisma.$transaction(async (tx) => { await recordFact(tx, booked("fl_o1", 20000, 10000)); });
    expect(await prisma.fact.count({ where: { tenantId: T } })).toBe(1);
    const [row] = await summary();
    expect(row).toMatchObject({ campaignId: "fl_c1", athleteId: "fl_a1", channel: "CAMPAIGN", inventoryKey: "NIL_JOB:SX-01", marketKey: "MD:Baltimore" });
    expect(row!.bookedSellCents).toBe(20000n);
    expect(row!.bookedCompensationCents).toBe(10000n);
  });

  it("if anything in the transaction fails, neither the fact nor the summary is saved", async () => {
    await expect(prisma.$transaction(async (tx) => {
      await recordFact(tx, booked("fl_o2", 5000, 2500));
      throw new Error("the booking failed after the fact was written");
    })).rejects.toThrow("the booking failed");
    expect(await prisma.fact.count({ where: { tenantId: T, idempotencyKey: { contains: "fl_o2" } } })).toBe(0);
    expect((await summary())[0]!.bookedSellCents).toBe(20000n);
  });

  it("the same fact twice is recorded once (a retried action never double-counts)", async () => {
    const again = await prisma.$transaction(async (tx) => recordFact(tx, booked("fl_o1", 20000, 10000)));
    expect(again.created).toBe(false);
    expect(await prisma.fact.count({ where: { tenantId: T } })).toBe(1);
    expect((await summary())[0]!.bookedSellCents).toBe(20000n);
  });

  it("a correction is a new fact that reverses the old one; the old row is never edited", async () => {
    const original = await prisma.fact.findFirstOrThrow({ where: { tenantId: T, idempotencyKey: { contains: "fl_o1" } }, select: FS });
    await prisma.$transaction(async (tx) => {
      await reverseFact(tx, { tenantId: T, key: original.idempotencyKey, occurredOn: new Date("2026-09-10T00:00:00Z"), reason: "order cancelled" });
    });
    const after = await prisma.fact.findUniqueOrThrow({ where: { id: original.id }, select: FS });
    expect(after).toEqual(original);
    const reversal = await prisma.fact.findFirstOrThrow({ where: { reversesId: original.id }, select: FS });
    expect(reversal.measures).toEqual({ booked_sell_cents: -20000, booked_compensation_cents: -10000 });
    /* The reversal lands on its own day: the booking stays on the 5th, the minus on the 10th. */
    const rows = await summary();
    expect(rows.map((r) => [r.day.toISOString().slice(0, 10), r.bookedSellCents])).toEqual([["2026-09-05", 20000n], ["2026-09-10", -20000n]]);
  });

  it("the database itself refuses to edit or delete a fact", async () => {
    const f = await prisma.fact.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } });
    await expect(prisma.$executeRawUnsafe(`UPDATE "Fact" SET measures = '{"booked_sell_cents": 1}' WHERE id = $1`, f.id)).rejects.toThrow(/fact_append_only/);
    await expect(prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL sponsorx.audit_purge = 'off'`);
      await tx.$executeRawUnsafe(`DELETE FROM "Fact" WHERE id = $1`, f.id);
    })).rejects.toThrow(/fact_append_only/);
  });

  it("a fact is reversed at most once", async () => {
    const original = await prisma.fact.findFirstOrThrow({ where: { tenantId: T, idempotencyKey: { contains: "fl_o1" }, reversesId: null }, select: { idempotencyKey: true, id: true } });
    const second = await prisma.$transaction(async (tx) =>
      reverseFact(tx, { tenantId: T, key: original.idempotencyKey, occurredOn: new Date("2026-09-11T00:00:00Z"), reason: "again" }));
    expect(second.created).toBe(false);
    expect(await prisma.fact.count({ where: { reversesId: original.id } })).toBe(1);
  });

  it("twenty actions on the same summary row at the same moment all count — nothing lost", async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) =>
      prisma.$transaction(async (tx) => { await recordFact(tx, { ...booked(`fl_par_${i}`, 100, 40), occurredOn: new Date("2026-09-20T00:00:00Z") }); })));
    const row = (await summary()).find((r) => r.day.toISOString().startsWith("2026-09-20"))!;
    expect(row.bookedSellCents).toBe(2000n);
    expect(row.bookedCompensationCents).toBe(800n);
  });

  it("refuses a measure that is not on the list, a fractional amount, or a fact without a key", async () => {
    await expect(prisma.$transaction(async (tx) => recordFact(tx, { ...booked("fl_bad1", 1, 1), measures: { made_up: 5 } as never }))).rejects.toThrow(FactError);
    await expect(prisma.$transaction(async (tx) => recordFact(tx, { ...booked("fl_bad2", 1, 1), measures: { booked_sell_cents: 1.5 } }))).rejects.toThrow(FactError);
    await expect(prisma.$transaction(async (tx) => recordFact(tx, { ...booked("fl_bad3", 1, 1), key: " " }))).rejects.toThrow(FactError);
  });

  it("the summaries always equal the sum of the facts — and the check catches it when they don't", async () => {
    expect(await checkFactSummaries(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    await prisma.$executeRawUnsafe(`UPDATE "CampaignDaySummary" SET "bookedSellCents" = "bookedSellCents" + 1 WHERE "tenantId" = $1 AND day = '2026-09-20'`, T);
    const check = await checkFactSummaries(prisma, { tenantId: T });
    expect(check.ok).toBe(false);
    expect(check.differences).toEqual([expect.objectContaining({ measure: "booked_sell_cents", summary: 2001, facts: 2000 })]);
    await prisma.$executeRawUnsafe(`UPDATE "CampaignDaySummary" SET "bookedSellCents" = "bookedSellCents" - 1 WHERE "tenantId" = $1 AND day = '2026-09-20'`, T);
  });
});
