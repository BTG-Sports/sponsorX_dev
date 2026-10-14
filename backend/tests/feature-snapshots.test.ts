import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { FactInput } from "../src/domain/facts";

/* --------------------------------------------------------------------------
   3S2-BE-01 — feature snapshots (documentation/SponsorX-Fact-Ledger.md §12).

   Orders, deliverables and views are written through the ledger as the live
   writers file them; every expected value below is worked out by hand from
   them. "Today" is 2026-10-14; the 90-day window is 2026-07-17 … 2026-10-14.

   Done when: feature snapshots generate on schedule and are retrievable by
   entity and date.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S2-BE-01 · feature snapshots", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { recordFact, reverseFact } = await import("../src/domain/facts");
  const { refreshBenchmarks } = await import("../src/domain/benchmarks");
  const { takeFeatureSnapshots, getFeatureSnapshot, listFeatureSnapshots, FEATURES_VERSION } = await import("../src/domain/feature-snapshots");

  const T = "fs_t";
  const OTHER = "fs_o";
  const NOW = new Date("2026-10-14T19:10:00Z");
  const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
  const ATHLETES = [
    { id: "fs_a1", tenantId: T, sport: "Soccer", stateCode: "MD", tier: "CREATOR", state: "ACTIVE" },
    { id: "fs_a2", tenantId: T, sport: "Soccer", stateCode: "md", tier: "CREATOR", state: "FEATURED" },
    { id: "fs_a3", tenantId: T, sport: "Basketball", stateCode: "VA", tier: "PREMIUM", state: "ACTIVE" },
    { id: "fs_a4", tenantId: T, sport: "Soccer", stateCode: "MD", tier: "CREATOR", state: "SUSPENDED" },
    { id: "fs_b1", tenantId: OTHER, sport: "Soccer", stateCode: "MD", tier: "CREATOR", state: "ACTIVE" },
  ];
  const stateOf = (athleteId: string) => ATHLETES.find((a) => a.id === athleteId)!.stateCode;

  type Measures = FactInput["measures"];
  const fact = (tenantId: string, athleteId: string, order: string, job: string, kind: FactInput["kind"], key: string, on: Date, measures: Measures, source = { type: "CampaignOrder", id: order }, channel: FactInput["channel"] = "CAMPAIGN") =>
    prisma.$transaction((tx) => recordFact(tx, {
      tenantId, kind, key, occurredOn: on, campaignId: `${order}_c`, athleteId, inventory: { kind: "NIL_JOB", id: job },
      channel, market: { state: stateOf(athleteId), city: "Baltimore" }, source, measures,
    }));
  const book = (tenantId: string, athleteId: string, order: string, job: string, on: Date, sell: number) =>
    fact(tenantId, athleteId, order, job, "ORDER_BOOKED", `order.booked:${order}`, on, { booked_sell_cents: sell, booked_compensation_cents: sell / 2 });
  const deliverable = (order: string, d: string, kind: FactInput["kind"], on: Date, measure: keyof Measures) =>
    fact(T, "fs_a1", order, "SX-04", kind, `${kind}:${d}`, on, { [measure]: 1 }, { type: "Deliverable", id: d }, "SOCIAL_INSTAGRAM");

  async function clean() {
    for (const t of ["FeatureSnapshot", "Benchmark", "CampaignDaySummary", "Fact", "AthleteSocial", "Athlete"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = ANY($1::text[])`, [T, OTHER]);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = ANY($1::text[])`, [T, OTHER]);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Features" }, { id: OTHER, name: "Another operator" }] });
    for (const a of ATHLETES) {
      await prisma.athlete.create({ data: {
        id: a.id, tenantId: a.tenantId, slug: a.id.replace("_", "-"), legalName: a.id, displayName: a.id, email: `${a.id}@fs.invalid`,
        sport: a.sport, city: "Baltimore", stateCode: a.stateCode, ageBand: "18_PLUS", state: a.state as never, tier: a.tier as never,
      }, select: { id: true } });
    }
    await prisma.athleteSocial.createMany({ data: [
      { tenantId: T, athleteId: "fs_a1", platform: "INSTAGRAM", handle: "a1", followers: 10000, avgViews: 2000, source: "SELF_REPORTED" },
      { tenantId: T, athleteId: "fs_a1", platform: "TIKTOK", handle: "a1", followers: 5000, avgViews: 1000, source: "VERIFIED_API" },
    ] });

    /* fs_a1, order A: booked 20 days ago; its views 10 days ago (self-reported ones never count). */
    await book(T, "fs_a1", "fs_A", "SX-04", ago(20), 20000);
    await fact(T, "fs_a1", "fs_A", "SX-04", "METRIC_RECORDED", "metric:fs_A", ago(10),
      { views_verified_api: 10000, engagements_verified_api: 500, views_self_reported: 50000, engagements_self_reported: 9000 }, { type: "MetricDaily", id: "fs_m" }, "SOCIAL_INSTAGRAM");
    /* d1 due 15 days ago, published the day before (on time), verified. */
    await deliverable("fs_A", "fs_d1", "DELIVERABLE_DUE", ago(15), "deliverables_due");
    await deliverable("fs_A", "fs_d1", "DELIVERABLE_PUBLISHED", ago(16), "deliverables_published");
    await deliverable("fs_A", "fs_d1", "DELIVERABLE_VERIFIED", ago(14), "deliverables_verified");
    /* d2 due 5 days ago, sent back once, published 2 days late. */
    await deliverable("fs_A", "fs_d2", "REVISION_REQUESTED", ago(6), "revisions_requested");
    await deliverable("fs_A", "fs_d2", "DELIVERABLE_DUE", ago(5), "deliverables_due");
    await deliverable("fs_A", "fs_d2", "DELIVERABLE_PUBLISHED", ago(3), "deliverables_published");
    /* d3 due in ten days: not due yet. */
    await deliverable("fs_A", "fs_d3", "DELIVERABLE_DUE", ago(-10), "deliverables_due");
    /* Order B: booked 200 days ago, cancelled 30 days ago; its deliverable no longer due. */
    await book(T, "fs_a1", "fs_B", "SX-05", ago(200), 30000);
    await fact(T, "fs_a1", "fs_B", "SX-05", "ORDER_CANCELLED", "order.cancelled:fs_B", ago(30), { cancelled_sell_cents: 30000 });
    await deliverable("fs_B", "fs_d4", "DELIVERABLE_DUE", ago(40), "deliverables_due");
    await prisma.$transaction((tx) => reverseFact(tx, { tenantId: T, key: "DELIVERABLE_DUE:fs_d4", occurredOn: ago(30), reason: "order cancelled" }));
    /* Order C: a year and four days ago — Soccer has a year of history, and one booking in October 2025. */
    await book(T, "fs_a1", "fs_C", "SX-04", new Date("2025-10-10T12:00:00Z"), 10000);
    /* Other Soccer bookings in Maryland: fs_a2 50 days ago, the suspended fs_a4 60 days ago. Basketball in Virginia, 30 days ago. */
    await book(T, "fs_a2", "fs_D", "SX-04", ago(50), 10000);
    await book(T, "fs_a4", "fs_E", "SX-04", ago(60), 10000);
    await book(T, "fs_a3", "fs_F", "SX-04", ago(30), 10000);
    /* Another operator's Soccer booking in Maryland: never counted here. */
    await book(OTHER, "fs_b1", "fs_G", "SX-04", ago(10), 99000);

    await refreshBenchmarks(prisma, NOW, { tenantId: T });
  });

  afterAll(clean);

  it("takes one snapshot per bookable athlete — active or featured, not suspended", async () => {
    expect(await takeFeatureSnapshots(prisma, NOW, { tenantId: T })).toEqual({ tenants: 1, athletes: 3, written: 3, alreadyTaken: 0, skipped: [] });
    expect(await getFeatureSnapshot(prisma, T, "fs_a4", NOW)).toBeNull();
  });

  it("holds every input, from the ledger and the app's records, as worked out by hand", async () => {
    const s = (await getFeatureSnapshot(prisma, T, "fs_a1", NOW))!;
    expect(s).toMatchObject({ athleteId: "fs_a1", day: "2026-10-14", version: FEATURES_VERSION });
    const cpm = { p25: 2000, median: 2000, p75: 2000, sampleSize: 1, smallSample: true };
    expect(s.features).toEqual({
      window: { days: 90, from: "2026-07-17", to: "2026-10-14" },
      audience: {
        platforms: [
          { platform: "INSTAGRAM", followers: 10000, avgViews: 2000, source: "SELF_REPORTED" },
          { platform: "TIKTOK", followers: 5000, avgViews: 1000, source: "VERIFIED_API" },
        ],
        totalFollowers: 15000, totalAvgViews: 3000, anyVerified: true,
      },
      engagement: { verifiedViews: 10000, verifiedEngagements: 500, rate: 0.05 },
      delivery: { due: 2, published: 2, verified: 1, revisionsRequested: 1, dueByToday: 2, publishedOnTime: 1, onTimeRate: 0.5, ordersCancelled: 1 },
      demand: { ordersBooked: 1, bookedNetCents: 20000, sameSportAndStateOrdersBooked: 3 },
      /* Soccer: 1 booking in October 2025; 4 in the last 365 days → 0.33 a month → 1 ÷ 0.33. */
      seasonality: { index: 3.03, bookingsThisMonthLastYear: 1, averageMonthlyBookings: 0.33, reason: null },
      geography: { state: "MD", city: "Baltimore", stateOrdersBooked: 3 },
      scarcity: { sameSportStateTier: 2 },
      benchmarks: { all: cpm, sport: cpm, market: cpm, audience: cpm },
    });
  });

  it("what cannot be known yet is null, with the reason — never a guess", async () => {
    const a2 = (await getFeatureSnapshot(prisma, T, "fs_a2", NOW))!.features;
    expect(a2.audience).toEqual({ platforms: [], totalFollowers: 0, totalAvgViews: 0, anyVerified: false });
    expect(a2.engagement.rate).toBeNull();
    expect(a2.delivery.onTimeRate).toBeNull();
    expect(a2.demand).toEqual({ ordersBooked: 1, bookedNetCents: 10000, sameSportAndStateOrdersBooked: 3 });
    const a3 = (await getFeatureSnapshot(prisma, T, "fs_a3", NOW))!.features;
    expect(a3.seasonality).toEqual({ index: null, bookingsThisMonthLastYear: 0, averageMonthlyBookings: 0.08, reason: "less than 365 days of Basketball bookings" });
    expect(a3.benchmarks).toEqual({ all: expect.any(Object), sport: null, market: null, audience: null });
  });

  it("is written once: a second run the same day changes nothing, even after new facts", async () => {
    const before = await getFeatureSnapshot(prisma, T, "fs_a1", NOW);
    await book(T, "fs_a1", "fs_H", "SX-05", ago(1), 50000);
    expect(await takeFeatureSnapshots(prisma, new Date(NOW.getTime() + 3_600_000), { tenantId: T })).toMatchObject({ written: 0, alreadyTaken: 3 });
    expect(await getFeatureSnapshot(prisma, T, "fs_a1", NOW)).toEqual(before);
  });

  it("is retrievable by athlete and date: that day's, or the latest before it", async () => {
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    await takeFeatureSnapshots(prisma, tomorrow, { tenantId: T });
    expect((await getFeatureSnapshot(prisma, T, "fs_a1", NOW))!.features.demand.ordersBooked).toBe(1);
    expect((await getFeatureSnapshot(prisma, T, "fs_a1", tomorrow))!.features.demand.ordersBooked).toBe(2);
    expect((await getFeatureSnapshot(prisma, T, "fs_a1", new Date("2026-10-20T00:00:00Z")))!.day).toBe("2026-10-15");
    expect(await getFeatureSnapshot(prisma, T, "fs_a1", ago(1))).toBeNull();
    expect((await listFeatureSnapshots(prisma, T, "fs_a1", ago(30), tomorrow)).map((x) => x.day)).toEqual(["2026-10-14", "2026-10-15"]);
  });

  it("each tenant has its own: another operator's athletes and orders never appear", async () => {
    expect(await getFeatureSnapshot(prisma, T, "fs_b1", NOW)).toBeNull();
    expect(await getFeatureSnapshot(prisma, OTHER, "fs_a1", NOW)).toBeNull();
    await takeFeatureSnapshots(prisma, NOW, { tenantId: OTHER });
    expect((await getFeatureSnapshot(prisma, OTHER, "fs_b1", NOW))!.features.demand).toEqual({ ordersBooked: 1, bookedNetCents: 99000, sameSportAndStateOrdersBooked: 1 });
  });

  it("a tenant whose fact check failed takes none that day", async () => {
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    expect(await takeFeatureSnapshots(prisma, later, { tenantId: T, skipTenants: [T] })).toEqual({ tenants: 0, athletes: 0, written: 0, alreadyTaken: 0, skipped: [T] });
    expect((await getFeatureSnapshot(prisma, T, "fs_a1", later))!.day).toBe("2026-10-15");
  });
});
