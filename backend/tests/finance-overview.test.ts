import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P1-ART-25 Task 2 — GET /finance/overview, the Treasury's one read.

   Against a real, seeded database (unlike sponsor-overview.test.ts's mocked
   Prisma): the arithmetic here crosses MarketplaceOrder, PaymentRefund,
   Payout, Earning, LedgerEntry, RefundDue, PaymentDispute and PaymentEvent at
   once, and a mock would only prove the query shapes, not that the numbers
   add up. SKIPPED, NOT FAILED, WITHOUT A DATABASE (tests/support/seeded-db.ts) —
   CI has one; a developer machine that does not is not taught to ignore red.

   Two tenants (fov-t1, fov-t2) get the same set of rows; the tenant-scoped
   assertions are absolute, so a leak across tenants shows up as a wrong
   figure. The only differences are each tenant's oldest row (a booking
   written at contract time in t1, a refund in t2), which sit outside every
   window but "all".

   NOW sits in 2004 on purpose: SUPER_ADMIN reads every tenant in the shared
   test database, and the rows other test files leave carry real-clock dates,
   so this file's windows hold only this file's money.

   The ledger is seeded as ledger.ts posts it: a booking's payables, a
   reserve released into a payable (RESERVE_RELEASE), a reversed booking with
   its REVERSAL mirror, and the PAYOUT journal behind the paid payout — the
   payable debited PAID, PAYOUT_CLEARING credited — exactly postPayout's shape.
   -------------------------------------------------------------------------- */

process.env.DATABASE_URL ??= "postgresql://sponsorx:sponsorx@localhost:5432/sponsorx";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@fov-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("GET /finance/overview — the Treasury (P1-ART-25)", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { financeOverview } = await import("../src/domain/finance-overview");
  const { ForbiddenError } = await import("../src/auth/errors");
  type Actor = import("../src/auth/actor").Actor;

  const NOW = new Date("2004-06-15T15:00:00Z");
  const DAY = 86_400_000;
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  /** One tenant's full set of money rows, every id prefixed `p` (`fov-t1-`/`fov-t2-`). */
  async function seedBooks(p: string, tenantId: string, oldest: "booking" | "refund") {
    await prisma.tenant.create({ data: { id: tenantId, name: `Finance overview ${p}` } });
    await prisma.sponsor.create({ data: { id: `${p}-sp1`, tenantId, name: `${p} sponsor` } });
    await prisma.athlete.create({
      data: {
        id: `${p}-ath1`, tenantId, slug: `${p}-athlete-1`, legalName: `${p} athlete`, displayName: `${p} athlete`,
        email: `${p}-athlete@fov-test.invalid`, sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
      },
    });

    /* Two marketplace orders paid in the window, one paid in the previous
       30-day window, and the reservations their (required, otherwise-unused)
       relation needs. */
    for (const n of [1, 2, 3]) {
      await prisma.reservation.create({ data: { id: `${p}-res${n}`, tenantId, sponsorId: `${p}-sp1`, cartId: `${p}-cart${n}`, expiresAt: ago(-3650) } });
    }
    const order = (n: number, totalCents: number, paidAt: Date) =>
      prisma.marketplaceOrder.create({ data: {
        id: `${p}-order${n}`, tenantId, sponsorId: `${p}-sp1`, reservationId: `${p}-res${n}`,
        subtotalCents: totalCents, feesCents: 0, totalCents, requiresApproval: false, approvalReasons: [], paidAt,
      } });
    await order(1, 10_000, ago(5));
    await order(2, 5_000, ago(4));
    await order(3, 2_500, ago(40));
    /* PaymentRefund carries its own tenantId and no `order` relation.
       outcome DISMISSED needs no refundDueId (the shape check constraint
       ties CONFIRMED / APPLIED to one) — financeOverview reads only
       createdAt and amountCents, never the outcome. */
    const refund = (n: number, amountCents: number, createdAt: Date) =>
      prisma.paymentRefund.create({ data: {
        id: `${p}-refund${n}`, tenantId, attemptId: `${p}-attempt${n}`, orderId: `${p}-order1`,
        provider: "standin", providerRefundRef: `${p}-refref${n}`, amountCents, outcome: "DISMISSED", createdAt,
      } });
    await refund(1, 1_000, ago(3));

    /* Payouts: one paid in the window, one waiting on BTG (REQUESTED), one
       waiting on BTG as a FAILED payout with no `waitingOn` recorded. */
    await prisma.payout.create({ data: {
      id: `${p}-payout-paid`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 3_000, state: "PAID", paidAt: ago(2), requestedAt: ago(6),
    } });
    await prisma.payout.create({ data: {
      id: `${p}-payout-requested`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 2_000, state: "REQUESTED", requestedAt: ago(2),
    } });
    await prisma.payout.create({ data: {
      id: `${p}-payout-failed`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 500, state: "FAILED", waitingOn: null, requestedAt: ago(1),
    } });

    /* Two campaign orders (an Earning's `orderId` is unique, so two earnings
       need two of them) behind one campaign, so a PAID and an
       APPROVED_FOR_PAYOUT earning can both be seeded. */
    await prisma.nilJob.create({ data: { id: `${p}-job1`, tenantId, name: `${p} job 1`, baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.nilJob.create({ data: { id: `${p}-job2`, tenantId, name: `${p} job 2`, baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaign.create({ data: { id: `${p}-campaign1`, tenantId, sponsorId: `${p}-sp1`, name: `${p} campaign`, budget: 500_000, startDate: ago(60), endDate: ago(-60) } });
    await prisma.campaignOrder.create({ data: { id: `${p}-corder-paid`, tenantId, campaignId: `${p}-campaign1`, athleteId: `${p}-ath1`, jobId: `${p}-job1`, compensation: 4_000, sellPrice: 40_000, usageRights: "90 days", dueDate: ago(-10) } });
    await prisma.campaignOrder.create({ data: { id: `${p}-corder-apfp`, tenantId, campaignId: `${p}-campaign1`, athleteId: `${p}-ath1`, jobId: `${p}-job2`, compensation: 1_500, sellPrice: 20_000, usageRights: "90 days", dueDate: ago(-10) } });
    await prisma.earning.create({ data: { id: `${p}-earning-paid`, tenantId, athleteId: `${p}-ath1`, orderId: `${p}-corder-paid`, gross: 4_000, adjustment: 0, state: "PAID", paidAt: ago(3), taxYear: 2004 } });
    await prisma.earning.create({ data: { id: `${p}-earning-apfp`, tenantId, athleteId: `${p}-ath1`, orderId: `${p}-corder-apfp`, gross: 1_500, adjustment: 0, state: "APPROVED_FOR_PAYOUT", taxYear: 2004 } });

    /* The ledger, as ledger.ts posts it. */
    const entry = (id: string, d: { journalId: string; entryType: string; account: string; partyType: string; partyId: string; creditCents?: number; debitCents?: number; status: string; createdAt: Date }) =>
      prisma.ledgerEntry.create({ data: { id: `${p}-ledger-${id}`, tenantId, orderId: `${p}-order1`, partyTenantId: tenantId, ...d, journalId: `${p}-${d.journalId}` } });
    const athleteParty = { partyType: "ATHLETE", partyId: `${p}-ath1` };
    /* The booking: what BTG kept, each payee's share, and a reserve. */
    await entry("platform", { journalId: "j1", entryType: "BOOKING", account: "PLATFORM_REVENUE", partyType: "PLATFORM", partyId: "platform", creditCents: 1_200, status: "AVAILABLE", createdAt: ago(3) });
    await entry("athlete", { journalId: "j1", entryType: "BOOKING", account: "ATHLETE_PAYABLE", ...athleteParty, creditCents: 6_000, status: "AVAILABLE", createdAt: ago(3) });
    await entry("property", { journalId: "j1", entryType: "BOOKING", account: "PROPERTY_PAYABLE", partyType: "PROPERTY", partyId: `${p}-prop1`, creditCents: 2_000, status: "PENDING", createdAt: ago(3) });
    await entry("reserve", { journalId: "j1", entryType: "BOOKING", account: "RESERVE_HELD", ...athleteParty, creditCents: 400, status: "AVAILABLE", createdAt: ago(3) });
    /* The reserve released into the athlete's payable (releaseReserve). */
    await entry("release-held", { journalId: "j-release", entryType: "RESERVE_RELEASE", account: "RESERVE_HELD", ...athleteParty, debitCents: 400, status: "AVAILABLE", createdAt: ago(1) });
    await entry("release-payable", { journalId: "j-release", entryType: "RESERVE_RELEASE", account: "ATHLETE_PAYABLE", ...athleteParty, creditCents: 400, status: "AVAILABLE", createdAt: ago(1) });
    /* A booked line later reversed (reverseOrder): the original marked
       REVERSED, its mirror posted REVERSED — the pair nets to zero. */
    await entry("athlete-reversed", { journalId: "j4", entryType: "BOOKING", account: "ATHLETE_PAYABLE", ...athleteParty, creditCents: 800, status: "REVERSED", createdAt: ago(3) });
    await entry("athlete-reversal", { journalId: "j4:reversal", entryType: "REVERSAL", account: "ATHLETE_PAYABLE", ...athleteParty, debitCents: 800, status: "REVERSED", createdAt: ago(2) });
    /* The paid payout's PAYOUT journal (postPayout). */
    await entry("payout-payable", { journalId: "payout-paid:order1:payout", entryType: "PAYOUT", account: "ATHLETE_PAYABLE", ...athleteParty, debitCents: 3_000, status: "PAID", createdAt: ago(2) });
    await entry("payout-clearing", { journalId: "payout-paid:order1:payout", entryType: "PAYOUT", account: "PAYOUT_CLEARING", partyType: "PROCESSOR", partyId: "processor", creditCents: 3_000, status: "PAID", createdAt: ago(2) });

    /* Each tenant's oldest row, outside every window but "all": in t1 a
       booking written at contract time (before any payment), in t2 a refund. */
    if (oldest === "booking") {
      await entry("old-booking", { journalId: "j0", entryType: "BOOKING", account: "PLATFORM_REVENUE", partyType: "PLATFORM", partyId: "platform", creditCents: 300, status: "PENDING", createdAt: ago(200) });
    } else {
      await refund(0, 100, ago(200));
    }

    /* What waits on BTG at the other desks: a refund, a dispute, a held event. */
    await prisma.refundDue.create({ data: { id: `${p}-refund-due1`, tenantId, orderId: `${p}-order2`, sponsorId: `${p}-sp1`, amountCents: 700, cause: "SPONSOR_CANCELLED", state: "OPEN", createdAt: ago(1) } });
    await prisma.paymentDispute.create({ data: { id: `${p}-dispute1`, tenantId, orderId: `${p}-order1`, sponsorId: `${p}-sp1`, provider: "standin", providerDisputeRef: `${p}-dp1`, amountCents: 900, state: "OPEN", openedAt: ago(1) } });
    await prisma.paymentEvent.create({ data: { id: `${p}-event1`, tenantId, provider: "standin", providerEventId: `${p}-evt1`, type: "payment.failed", occurredAt: ago(1), payload: {}, status: "HELD", outcome: `${p} held for BTG`, appliedAt: ago(1), resolvedAt: null } });

    /* Two logins for the HTTP test. */
    await prisma.user.create({ data: { id: `${p}-u-fin`, tenantId, clerkId: `${p}-clerk-fin`, email: `${p}-fin@fov-test.invalid`, roles: ["FINANCE"] } });
    await prisma.user.create({ data: { id: `${p}-u-sales`, tenantId, clerkId: `${p}-clerk-sales`, email: `${p}-sales@fov-test.invalid`, roles: ["SALES"] } });
  }

  const T1 = "fov-t1";
  const T2 = "fov-t2";

  async function wipe() {
    const tenantIds = [T1, T2];
    const where = { tenantId: { in: tenantIds } };
    /* Children first — the foreign keys are RESTRICT. */
    await prisma.user.deleteMany({ where });
    await prisma.paymentEvent.deleteMany({ where });
    await prisma.paymentDispute.deleteMany({ where });
    await prisma.refundDue.deleteMany({ where });
    await prisma.ledgerEntry.deleteMany({ where });
    await prisma.earning.deleteMany({ where });
    await prisma.campaignOrder.deleteMany({ where });
    await prisma.campaign.deleteMany({ where });
    await prisma.nilJob.deleteMany({ where });
    await prisma.payout.deleteMany({ where });
    await prisma.paymentRefund.deleteMany({ where });
    await prisma.marketplaceOrder.deleteMany({ where });
    await prisma.reservation.deleteMany({ where });
    await prisma.athlete.deleteMany({ where });
    await prisma.sponsor.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }

  const base = { userId: "fov-u1", athleteId: null, guardianId: null, propertyId: null, wards: [], actingFor: null } as const;
  const finance = { ...base, tenantId: T1, roles: ["FINANCE"], sponsorId: null } as unknown as Actor;
  const financeT2 = { ...finance, tenantId: T2 } as unknown as Actor;
  const btgAdmin = { ...base, tenantId: T1, roles: ["BTG_ADMIN"], sponsorId: null } as unknown as Actor;
  const superAdmin = { ...base, tenantId: T1, roles: ["SUPER_ADMIN"], sponsorId: null } as unknown as Actor;
  const sales = { ...base, tenantId: T1, roles: ["SALES"], sponsorId: null } as unknown as Actor;
  const campaignMgr = { ...base, tenantId: T1, roles: ["CAMPAIGN_MGR"], sponsorId: null } as unknown as Actor;
  const networkMgr = { ...base, tenantId: T1, roles: ["NETWORK_MGR"], sponsorId: null } as unknown as Actor;
  const athlete = { ...base, tenantId: T1, roles: ["ATHLETE"], sponsorId: null, athleteId: "fov-t1-ath1" } as unknown as Actor;
  const sponsorAdmin = { ...base, tenantId: T1, roles: ["SPONSOR_ADMIN"], sponsorId: "fov-t1-sp1" } as unknown as Actor;

  /* One tenant's books over 30 days, by hand. */
  const MONEY_IN = 10_000 + 5_000 - 1_000;
  const PAID_OUT = 3_000 + 4_000; // payout + PAID earning
  /* APPROVED_FOR_PAYOUT earning + athlete payable (booked 6_000, released
     reserve 400, reversed pair 0, less the 3_000 paid out) + property 2_000. */
  const OWED = 1_500 + (6_000 + 400 + 800 - 800 - 3_000) + 2_000;
  const KEPT = 1_200;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base_ = "";
  const get = async (path: string, who: string) => {
    const res = await fetch(`${base_}/api/v1${path}`, { headers: { "x-test-clerk": who } });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };

  beforeAll(async () => {
    await wipe();
    await seedBooks("fov-t1", T1, "booking");
    await seedBooks("fov-t2", T2, "refund");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base_ = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("refuses roles that aren't tenant-wide money readers", async () => {
    for (const a of [sales, campaignMgr, networkMgr, athlete, sponsorAdmin]) {
      await expect(financeOverview(a, { range: "30d" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("FINANCE gets the books of its own tenant, without invoices", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.moneyIn.cents).toBe(MONEY_IN);
    expect(o.paidOut.cents).toBe(PAID_OUT);
    expect(o.owed.cents).toBe(OWED);
    expect(o.kept.cents).toBe(KEPT);
    expect(o.needsYou.payouts).toEqual({ count: 2, cents: 2_500, oldestAt: ago(2).toISOString() });
    expect(o.needsYou.refunds).toEqual({ count: 1, cents: 700, oldestAt: ago(1).toISOString() });
    expect(o.needsYou.disputes).toEqual({ count: 1, cents: 900 });
    expect(o.needsYou.events).toEqual({ count: 1 });
    expect(o).not.toHaveProperty("invoices");
    expect(o.settled).toEqual({ paidCents: PAID_OUT, owedCents: OWED, rate: PAID_OUT / (PAID_OUT + OWED) });
  });

  it("owed drops by what a paid payout's PAYOUT journal debits", async () => {
    /* Without the payout journal the athlete payable alone would be 6_400. */
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.owed.cents).toBe(1_500 + 6_400 - 3_000 + 2_000);
  });

  it("FINANCE sees the lifetime campaign commission (sell price − every earning)", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.kept.campaignCommission).toBe(40_000 + 20_000 - (4_000 + 1_500));
  });

  it("split is the window's sales only — payouts and reserve releases don't move it", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.split).toEqual({ athletes: 6_000, properties: 2_000, platform: 1_200, management: 0, processing: 0, referral: 0, reserve: 400 });
  });

  it("earningsByState counts and nets every state", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.earningsByState).toEqual({
      PENDING: { count: 0, amount: 0 },
      ELIGIBLE: { count: 0, amount: 0 },
      APPROVED_FOR_PAYOUT: { count: 1, amount: 1_500 },
      PAID: { count: 1, amount: 4_000 },
      HELD: { count: 0, amount: 0 },
      DISPUTED: { count: 0, amount: 0 },
    });
  });

  it("BTG admin also gets the invoice totals", async () => {
    const o = await financeOverview(btgAdmin, { range: "30d" }, NOW);
    expect(o.invoices).toEqual({ invoicedCents: 0, collectedCents: 0, rate: null, aging: [0, 0, 0, 0] });
  });

  it("compares with the previous equal window, and not for all time", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.moneyIn.prev).toBe(2_500);
    expect(o.paidOut.prev).toBe(0);
    expect(o.kept.prev).toBe(0);
    expect((await financeOverview(finance, { range: "all" }, NOW)).moneyIn.prev).toBeNull();
  });

  it("7d and 90d windows", async () => {
    const w7 = await financeOverview(finance, { range: "7d" }, NOW);
    expect(w7.range).toEqual({ key: "7d", from: iso(ago(6)), to: iso(ago(-1)), days: 7, bucket: "day" });
    expect(w7.series).toHaveLength(7);
    expect(w7.moneyIn).toEqual({ cents: MONEY_IN, prev: 0 });
    expect(w7.paidOut).toEqual({ cents: PAID_OUT, prev: 0 });

    const w90 = await financeOverview(finance, { range: "90d" }, NOW);
    expect(w90.range).toMatchObject({ key: "90d", days: 90, bucket: "day" });
    expect(w90.series).toHaveLength(90);
    expect(w90.moneyIn).toEqual({ cents: MONEY_IN + 2_500, prev: 0 });
    expect(w90.series.reduce((n, p) => n + p.inCents, 0)).toBe(MONEY_IN + 2_500);
  });

  it("all time starts at the earliest booking or refund, weekly past 120 days", async () => {
    /* t1's oldest row is a BOOKING written at contract time, t2's a refund —
       neither a paid order, payout or earning. */
    for (const [actor, extraIn, extraKept] of [[finance, 0, 300], [financeT2, -100, 0]] as const) {
      const o = await financeOverview(actor, { range: "all" }, NOW);
      expect(o.range).toMatchObject({ key: "all", from: iso(ago(200)), to: iso(ago(-1)), days: 201, bucket: "week" });
      expect(o.series).toHaveLength(Math.ceil(201 / 7));
      expect(o.moneyIn.cents).toBe(MONEY_IN + 2_500 + extraIn);
      expect(o.kept.cents).toBe(KEPT + extraKept);
      expect(o.series.reduce((n, p) => n + p.inCents, 0)).toBe(o.moneyIn.cents);
      expect(o.series.reduce((n, p) => n + p.outCents, 0)).toBe(o.paidOut.cents);
    }
  });

  it("the series is zero-filled and sums to the window's totals", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.series).toHaveLength(30);
    expect(o.series.filter((p) => p.inCents === 0 && p.outCents === 0).length).toBeGreaterThan(20);
    expect(o.series.reduce((n, p) => n + p.inCents, 0)).toBe(o.moneyIn.cents);
    expect(o.series.reduce((n, p) => n + p.outCents, 0)).toBe(o.paidOut.cents);
  });

  it("tenant 2's identical books are never counted into tenant 1's figures", async () => {
    for (const actor of [finance, financeT2]) {
      const o = await financeOverview(actor, { range: "30d" }, NOW);
      expect(o.moneyIn).toEqual({ cents: MONEY_IN, prev: 2_500 });
      expect(o.paidOut.cents).toBe(PAID_OUT);
      expect(o.owed.cents).toBe(OWED);
      expect(o.kept.cents).toBe(KEPT);
      expect(o.needsYou.payouts).toMatchObject({ count: 2, cents: 2_500 });
      expect(o.needsYou.refunds).toMatchObject({ count: 1, cents: 700 });
      expect(o.needsYou.disputes).toEqual({ count: 1, cents: 900 });
      expect(o.needsYou.events).toEqual({ count: 1 });
      expect(o.earningsByState.PAID).toEqual({ count: 1, amount: 4_000 });
    }
  });

  it("SUPER_ADMIN counts both tenants, every figure from the same scope", async () => {
    const o = await financeOverview(superAdmin, { range: "30d" }, NOW);
    /* Windowed figures: only this file's rows sit in 2004 — exactly both tenants. */
    expect(o.moneyIn).toEqual({ cents: 2 * MONEY_IN, prev: 2 * 2_500 });
    expect(o.paidOut.cents).toBe(2 * PAID_OUT);
    expect(o.kept.cents).toBe(2 * KEPT);
    expect(o.split).toEqual({ athletes: 12_000, properties: 4_000, platform: 2_400, management: 0, processing: 0, referral: 0, reserve: 800 });
    /* Lifetime counts read the whole shared database: at least both tenants'. */
    expect(o.needsYou.payouts.count).toBeGreaterThanOrEqual(4);
    expect(o.needsYou.refunds.count).toBeGreaterThanOrEqual(2);
    expect(o.needsYou.disputes.count).toBeGreaterThanOrEqual(2);
    expect(o.needsYou.events.count).toBeGreaterThanOrEqual(2);
    expect(o.earningsByState.PAID.count).toBeGreaterThanOrEqual(2);
  });

  describe("over HTTP", () => {
    it("defaults to 30d, takes 7d / 90d / all, and ignores a bad range", async () => {
      const cases: [string, string, number | null][] = [["", "30d", 30], ["?range=7d", "7d", 7], ["?range=90d", "90d", 90], ["?range=bogus", "30d", 30], ["?range=all", "all", null]];
      for (const [qs, key, days] of cases) {
        const r = await get(`/finance/overview${qs}`, "fov-t1-clerk-fin");
        expect(r.status).toBe(200);
        expect(r.json.overview.range.key).toBe(key);
        if (days !== null) {
          expect(r.json.overview.range.days).toBe(days);
          expect(r.json.overview.series).toHaveLength(days);
        }
        expect(r.json.overview).not.toHaveProperty("invoices");
      }
    });

    it("403 for SALES", async () => {
      expect((await get("/finance/overview", "fov-t1-clerk-sales")).status).toBe(403);
    });
  });
});
