import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   3S1-DATA-03 — the benchmark pipeline (documentation/SponsorX-Fact-Ledger.md §11).

   Orders and their views are written through the ledger (recordFact), as the
   live writers file them: the booking under CAMPAIGN, the views under the
   deliverable's channel, both keyed by campaign, athlete and NIL job. Each
   expected figure below is worked out by hand from the CPMs listed.

   Done when: benchmarks compute with sample sizes exposed and refresh on
   schedule (the worker, after the nightly fact check).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-DATA-03 · benchmarks", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact } = await import("../src/domain/facts");
  const { refreshBenchmarks, listBenchmarks, BENCHMARK_MIN_SAMPLE } = await import("../src/domain/benchmarks");

  const T = "bm_t";
  const OTHER = "bm_o";
  const NOW = new Date("2026-10-14T19:05:00Z");
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
  const athletes: Record<string, { sport: string; state: string | null; tier: string | null }> = {
    bm_a1: { sport: "Soccer", state: "MD", tier: "CREATOR" },
    bm_a2: { sport: "Soccer", state: "VA", tier: "PREMIUM" },
    bm_a3: { sport: "Basketball", state: "md", tier: "EMERGING" },
    bm_a4: { sport: "Tennis", state: null, tier: null },
    bm_b1: { sport: "Soccer", state: "MD", tier: "CREATOR" },
  };

  let n = 0;
  /** One order: booked `sell` cents `bookedDaysAgo`, then views by label, then (optionally) cancelled. */
  async function order(tenantId: string, athleteId: string, job: string, sell: number, views: Partial<Record<"views_verified_api" | "views_verified_manual" | "views_self_reported" | "views_estimated", number>>, opts: { bookedDaysAgo?: number; cancelled?: number } = {}) {
    const id = `bm_o${++n}`;
    const base = { tenantId, campaignId: `${id}_c`, athleteId, inventory: { kind: "NIL_JOB" as const, id: job }, market: { state: athletes[athleteId]!.state } };
    await prisma.$transaction(async (tx) => {
      await recordFact(tx, { ...base, kind: "ORDER_BOOKED", key: `order.booked:${id}`, occurredOn: daysAgo(opts.bookedDaysAgo ?? 30), channel: "CAMPAIGN", source: { type: "CampaignOrder", id }, measures: { booked_sell_cents: sell, booked_compensation_cents: Math.round(sell / 2) } });
      if (Object.keys(views).length) {
        await recordFact(tx, { ...base, kind: "METRIC_RECORDED", key: `metric:${id}`, occurredOn: daysAgo((opts.bookedDaysAgo ?? 30) - 10), channel: "SOCIAL_INSTAGRAM", source: { type: "MetricDaily", id }, measures: views });
      }
      if (opts.cancelled) {
        await recordFact(tx, { ...base, kind: "ORDER_CANCELLED", key: `order.cancelled:${id}`, occurredOn: daysAgo(5), channel: "CAMPAIGN", source: { type: "CampaignOrder", id }, measures: { cancelled_sell_cents: opts.cancelled } });
      }
    });
    return id;
  }
  const figures = async (tenantId: string) => Object.fromEntries((await listBenchmarks(prisma, tenantId)).map((b) => [`${b.dimension}:${b.segment}`, [b.p25, b.median, b.p75, b.sampleSize]]));

  async function clean() {
    for (const t of ["Benchmark", "CampaignDaySummary", "Fact", "Athlete"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Benchmarks" }, { id: OTHER, name: "Another operator" }] });
    for (const [id, a] of Object.entries(athletes)) {
      await prisma.athlete.create({ data: {
        id, tenantId: id.startsWith("bm_b") ? OTHER : T, slug: id.replace("_", "-"), legalName: id, displayName: id, email: `${id}@bm.invalid`,
        sport: a.sport, city: "Baltimore", stateCode: a.state, ageBand: "18_PLUS", state: "ACTIVE", tier: a.tier as never,
      }, select: { id: true } });
    }
    /* CPM = sell × 1,000 ÷ verified views, in cents. */
    await order(T, "bm_a1", "SX-04", 20000, { views_verified_api: 10000 });                              // 2000
    await order(T, "bm_a1", "SX-05", 30000, { views_verified_manual: 10000 });                           // 3000
    await order(T, "bm_a2", "SX-04", 10000, { views_verified_api: 5000, views_verified_manual: 5000 });  // 1000
    await order(T, "bm_a3", "SX-04", 40000, { views_verified_api: 10000 });                              // 4000
    await order(T, "bm_a2", "SX-05", 50000, { views_verified_api: 10000, views_self_reported: 90000 });  // 5000 — self-reported views don't count
    await order(T, "bm_a3", "SX-05", 30000, { views_verified_api: 10000 }, { cancelled: 10000 });        // 2000 — net of the part cancelled
    await order(T, "bm_a4", "SX-04", 10000, { views_verified_api: 10000 });                              // 1000 — no market, no tier
    /* Left out: */
    await order(T, "bm_a3", "SX-05", 20000, { views_verified_api: 10000 }, { cancelled: 20000 });        // cancelled in full: nothing paid
    await order(T, "bm_a1", "SX-04", 20000, { views_self_reported: 50000, views_estimated: 50000 });     // no verified views
    await order(T, "bm_a1", "SX-04", 20000, {});                                                         // no views yet
    await order(T, "bm_a1", "SX-05", 20000, { views_verified_api: 100 }, { bookedDaysAgo: 400 });        // booked before the 12 months
    /* Another tenant: ten orders, all at 99,990. */
    for (let i = 0; i < 10; i++) await order(OTHER, "bm_b1", "SX-04", 99990, { views_verified_api: 1000 });
  });

  afterAll(clean);

  it("computes low, middle and high per order, with the number of orders behind each", async () => {
    expect(await refreshBenchmarks(prisma, NOW, { tenantId: T })).toEqual({ tenants: 1, benchmarks: 11, skipped: [] });
    expect(await figures(T)).toEqual({
      /* 1000 1000 2000 2000 3000 4000 5000 */
      "ALL:": [1500, 2000, 3500, 7],
      "SPORT:Soccer": [1750, 2500, 3500, 4],
      "SPORT:Basketball": [2500, 3000, 3500, 2],
      "SPORT:Tennis": [1000, 1000, 1000, 1],
      "MARKET:MD": [2000, 2500, 3250, 4],
      "MARKET:VA": [2000, 3000, 4000, 2],
      "FORMAT:SX-04": [1000, 1500, 2500, 4],
      "FORMAT:SX-05": [2500, 3000, 4000, 3],
      "AUDIENCE:CREATOR": [2250, 2500, 2750, 2],
      "AUDIENCE:PREMIUM": [2000, 3000, 4000, 2],
      "AUDIENCE:EMERGING": [2500, 3000, 3500, 2],
    });
  });

  it("fewer than the minimum orders is shown, and marked a small sample", async () => {
    expect(BENCHMARK_MIN_SAMPLE).toBe(10);
    const all = (await listBenchmarks(prisma, T, "ALL"))[0]!;
    expect(all).toMatchObject({ metric: "EFFECTIVE_CPM_CENTS", sampleSize: 7, smallSample: true, windowDays: 365, refreshedAt: NOW.toISOString() });
  });

  it("each tenant has its own: another operator's orders never move this one's figures", async () => {
    await refreshBenchmarks(prisma, NOW, { tenantId: OTHER });
    expect((await listBenchmarks(prisma, OTHER, "ALL"))[0]).toMatchObject({ p25: 99990, median: 99990, p75: 99990, sampleSize: 10, smallSample: false });
    expect((await figures(T))["ALL:"]).toEqual([1500, 2000, 3500, 7]);
  });

  it("a refresh replaces the figures: an order cancelled since drops out, and its segment with it", async () => {
    await prisma.$transaction((tx) => recordFact(tx, {
      tenantId: T, kind: "ORDER_CANCELLED", key: "order.cancelled:bm_o7", occurredOn: daysAgo(1), campaignId: "bm_o7_c", athleteId: "bm_a4",
      inventory: { kind: "NIL_JOB", id: "SX-04" }, channel: "CAMPAIGN", source: { type: "CampaignOrder", id: "bm_o7" }, measures: { cancelled_sell_cents: 10000 },
    }));
    const later = new Date(NOW.getTime() + 86_400_000);
    await refreshBenchmarks(prisma, later, { tenantId: T });
    const now = await figures(T);
    expect(now["SPORT:Tennis"]).toBeUndefined();
    /* 1000 2000 2000 3000 4000 5000 */
    expect(now["ALL:"]).toEqual([2000, 2500, 3750, 6]);
    expect((await listBenchmarks(prisma, T, "ALL"))[0]!.refreshedAt).toBe(later.toISOString());
  });

  it("a tenant whose fact check failed keeps yesterday's figures", async () => {
    const before = await listBenchmarks(prisma, T);
    await order(T, "bm_a1", "SX-04", 90000, { views_verified_api: 1000 });
    expect(await refreshBenchmarks(prisma, new Date(NOW.getTime() + 2 * 86_400_000), { tenantId: T, skipTenants: [T] })).toEqual({ tenants: 0, benchmarks: 0, skipped: [T] });
    expect(await listBenchmarks(prisma, T)).toEqual(before);
  });
});
