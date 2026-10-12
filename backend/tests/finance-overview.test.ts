import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   P1-ART-25 Task 2 — GET /finance/overview, the Treasury's one read.

   Against a real, seeded database (unlike sponsor-overview.test.ts's mocked
   Prisma): the arithmetic here crosses MarketplaceOrder, PaymentRefund,
   Payout, Earning, LedgerEntry, RefundDue, PaymentDispute and PaymentEvent at
   once, and a mock would only prove the query shapes, not that the numbers
   add up. SKIPPED, NOT FAILED, WITHOUT A DATABASE (tests/support/seeded-db.ts) —
   CI has one; a developer machine that does not is not taught to ignore red.

   Two tenants (fov-t1, fov-t2) get the identical set of rows the plan
   specifies; every assertion is against fov-t1 only, so a leak across
   tenants would show up as double the expected figure.
   -------------------------------------------------------------------------- */

process.env.DATABASE_URL ??= "postgresql://sponsorx:sponsorx@localhost:5432/sponsorx";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("GET /finance/overview — the Treasury (P1-ART-25)", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { financeOverview } = await import("../src/domain/finance-overview");
  const { ForbiddenError } = await import("../src/auth/errors");
  type Actor = import("../src/auth/actor").Actor;

  const NOW = new Date("2026-10-11T15:00:00Z");
  const DAY = 86_400_000;
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

  /** One tenant's full set of money rows, every id prefixed `p` (`fov-t1-`/`fov-t2-`). */
  async function seedBooks(p: string, tenantId: string) {
    await prisma.tenant.create({ data: { id: tenantId, name: `Finance overview ${p}` } });
    await prisma.sponsor.create({ data: { id: `${p}-sp1`, tenantId, name: `${p} sponsor` } });
    await prisma.athlete.create({
      data: {
        id: `${p}-ath1`, tenantId, slug: `${p}-athlete-1`, legalName: `${p} athlete`, displayName: `${p} athlete`,
        email: `${p}-athlete@fov-test.invalid`, sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
      },
    });

    /* Two marketplace orders paid in the window, and the reservations their
       (required, otherwise-unused) relation needs. */
    await prisma.reservation.create({ data: { id: `${p}-res1`, tenantId, sponsorId: `${p}-sp1`, cartId: `${p}-cart1`, expiresAt: ago(-3650) } });
    await prisma.reservation.create({ data: { id: `${p}-res2`, tenantId, sponsorId: `${p}-sp1`, cartId: `${p}-cart2`, expiresAt: ago(-3650) } });
    await prisma.marketplaceOrder.create({ data: {
      id: `${p}-order1`, tenantId, sponsorId: `${p}-sp1`, reservationId: `${p}-res1`,
      subtotalCents: 10_000, feesCents: 0, totalCents: 10_000, requiresApproval: false, approvalReasons: [], paidAt: ago(5),
    } });
    await prisma.marketplaceOrder.create({ data: {
      id: `${p}-order2`, tenantId, sponsorId: `${p}-sp1`, reservationId: `${p}-res2`,
      subtotalCents: 5_000, feesCents: 0, totalCents: 5_000, requiresApproval: false, approvalReasons: [], paidAt: ago(4),
    } });
    /* PaymentRefund carries its own tenantId and no `order` relation.
       outcome DISMISSED needs no refundDueId (the shape check constraint
       ties CONFIRMED / APPLIED to one) — financeOverview reads only
       createdAt and amountCents, never the outcome. */
    await prisma.paymentRefund.create({ data: {
      id: `${p}-refund1`, tenantId, attemptId: `${p}-attempt1`, orderId: `${p}-order1`,
      provider: "standin", providerRefundRef: `${p}-refref1`, amountCents: 1_000, outcome: "DISMISSED", createdAt: ago(3),
    } });

    /* Payouts: one paid in the window, one waiting on BTG (REQUESTED), one
       waiting on BTG as a FAILED payout with no `waitingOn` recorded. */
    await prisma.payout.create({ data: {
      id: `${p}-payout-paid`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 3_000, state: "PAID", paidAt: ago(2),
    } });
    await prisma.payout.create({ data: {
      id: `${p}-payout-requested`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 2_000, state: "REQUESTED", requestedAt: ago(2),
    } });
    await prisma.payout.create({ data: {
      id: `${p}-payout-failed`, tenantId, payeeType: "ATHLETE", payeeId: `${p}-ath1`, payeeTenantId: tenantId,
      amountCents: 500, state: "FAILED", waitingOn: null,
    } });

    /* Two campaign orders (an Earning's `orderId` is unique, so two earnings
       need two of them) behind one campaign, so a PAID and an
       APPROVED_FOR_PAYOUT earning can both be seeded. */
    await prisma.nilJob.create({ data: { id: `${p}-job1`, tenantId, name: `${p} job 1`, baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.nilJob.create({ data: { id: `${p}-job2`, tenantId, name: `${p} job 2`, baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.campaign.create({ data: { id: `${p}-campaign1`, tenantId, sponsorId: `${p}-sp1`, name: `${p} campaign`, budget: 500_000, startDate: ago(60), endDate: ago(-60) } });
    await prisma.campaignOrder.create({ data: { id: `${p}-corder-paid`, tenantId, campaignId: `${p}-campaign1`, athleteId: `${p}-ath1`, jobId: `${p}-job1`, compensation: 4_000, sellPrice: 40_000, usageRights: "90 days", dueDate: ago(-10) } });
    await prisma.campaignOrder.create({ data: { id: `${p}-corder-apfp`, tenantId, campaignId: `${p}-campaign1`, athleteId: `${p}-ath1`, jobId: `${p}-job2`, compensation: 1_500, sellPrice: 20_000, usageRights: "90 days", dueDate: ago(-10) } });
    await prisma.earning.create({ data: { id: `${p}-earning-paid`, tenantId, athleteId: `${p}-ath1`, orderId: `${p}-corder-paid`, gross: 4_000, adjustment: 0, state: "PAID", paidAt: ago(3), taxYear: 2026 } });
    await prisma.earning.create({ data: { id: `${p}-earning-apfp`, tenantId, athleteId: `${p}-ath1`, orderId: `${p}-corder-apfp`, gross: 1_500, adjustment: 0, state: "APPROVED_FOR_PAYOUT", taxYear: 2026 } });

    /* The ledger: what BTG kept (PLATFORM_REVENUE), and what is owed
       (ATHLETE_PAYABLE / PROPERTY_PAYABLE, PENDING or AVAILABLE both count). */
    await prisma.ledgerEntry.create({ data: { id: `${p}-ledger-platform`, tenantId, journalId: `${p}-j1`, entryType: "BOOKING", account: "PLATFORM_REVENUE", partyType: "PLATFORM", partyId: "platform", partyTenantId: tenantId, creditCents: 1_200, status: "AVAILABLE", createdAt: ago(3) } });
    await prisma.ledgerEntry.create({ data: { id: `${p}-ledger-athlete`, tenantId, journalId: `${p}-j2`, entryType: "BOOKING", account: "ATHLETE_PAYABLE", partyType: "ATHLETE", partyId: `${p}-ath1`, partyTenantId: tenantId, creditCents: 6_000, status: "AVAILABLE", createdAt: ago(3) } });
    await prisma.ledgerEntry.create({ data: { id: `${p}-ledger-property`, tenantId, journalId: `${p}-j3`, entryType: "BOOKING", account: "PROPERTY_PAYABLE", partyType: "PROPERTY", partyId: `${p}-prop1`, partyTenantId: tenantId, creditCents: 2_000, status: "PENDING", createdAt: ago(3) } });

    /* What waits on BTG at the other desks: a refund, a dispute, a held event. */
    await prisma.refundDue.create({ data: { id: `${p}-refund-due1`, tenantId, orderId: `${p}-order2`, sponsorId: `${p}-sp1`, amountCents: 700, cause: "SPONSOR_CANCELLED", state: "OPEN", createdAt: ago(1) } });
    await prisma.paymentDispute.create({ data: { id: `${p}-dispute1`, tenantId, orderId: `${p}-order1`, sponsorId: `${p}-sp1`, provider: "standin", providerDisputeRef: `${p}-dp1`, amountCents: 900, state: "OPEN", openedAt: ago(1) } });
    await prisma.paymentEvent.create({ data: { id: `${p}-event1`, tenantId, provider: "standin", providerEventId: `${p}-evt1`, type: "payment.failed", occurredAt: ago(1), payload: {}, status: "HELD", outcome: `${p} held for BTG`, appliedAt: ago(1), resolvedAt: null } });
  }

  const T1 = "fov-t1";
  const T2 = "fov-t2";

  async function wipe() {
    const tenantIds = [T1, T2];
    const where = { tenantId: { in: tenantIds } };
    /* Children first — the foreign keys are RESTRICT. */
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
  const btgAdmin = { ...base, tenantId: T1, roles: ["BTG_ADMIN"], sponsorId: null } as unknown as Actor;
  const sales = { ...base, tenantId: T1, roles: ["SALES"], sponsorId: null } as unknown as Actor;
  const campaignMgr = { ...base, tenantId: T1, roles: ["CAMPAIGN_MGR"], sponsorId: null } as unknown as Actor;
  const networkMgr = { ...base, tenantId: T1, roles: ["NETWORK_MGR"], sponsorId: null } as unknown as Actor;
  const athlete = { ...base, tenantId: T1, roles: ["ATHLETE"], sponsorId: null, athleteId: "fov-t1-ath1" } as unknown as Actor;
  const sponsorAdmin = { ...base, tenantId: T1, roles: ["SPONSOR_ADMIN"], sponsorId: "fov-t1-sp1" } as unknown as Actor;

  beforeAll(async () => {
    await wipe();
    await seedBooks("fov-t1", T1);
    await seedBooks("fov-t2", T2);
  });

  afterAll(async () => {
    await wipe();
  });

  it("refuses roles that aren't tenant-wide money readers", async () => {
    for (const a of [sales, campaignMgr, networkMgr, athlete, sponsorAdmin]) {
      await expect(financeOverview(a, { range: "30d" }, NOW)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("FINANCE gets the books of its own tenant, without invoices", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.moneyIn.cents).toBe(14_000); // 10_000 + 5_000 − 1_000
    expect(o.paidOut.cents).toBe(7_000); // payout 3_000 + earning 4_000
    expect(o.owed.cents).toBe(1_500 + 6_000 + 2_000); // earning APPROVED_FOR_PAYOUT + payables
    expect(o.kept.cents).toBe(1_200);
    expect(o.needsYou.payouts).toMatchObject({ count: 2, cents: 2_500 });
    expect(o.needsYou.refunds).toMatchObject({ count: 1, cents: 700 });
    expect(o.needsYou.disputes).toEqual({ count: 1, cents: 900 });
    expect(o.needsYou.events).toEqual({ count: 1 });
    expect(o).not.toHaveProperty("invoices");
    expect(o.settled.rate).toBeCloseTo(7_000 / (7_000 + 9_500));
  });

  it("BTG admin also gets the invoice totals", async () => {
    const o = await financeOverview(btgAdmin, { range: "30d" }, NOW);
    expect(o.invoices).toBeDefined();
  });

  it("compares with the previous window, and not for all time", async () => {
    expect((await financeOverview(finance, { range: "30d" }, NOW)).moneyIn.prev).toBe(0);
    expect((await financeOverview(finance, { range: "all" }, NOW)).moneyIn.prev).toBeNull();
  });

  it("the series is zero-filled and sums to the window's totals", async () => {
    const o = await financeOverview(finance, { range: "30d" }, NOW);
    expect(o.series).toHaveLength(30);
    expect(o.series.reduce((n, p) => n + p.inCents, 0)).toBe(o.moneyIn.cents);
    expect(o.series.reduce((n, p) => n + p.outCents, 0)).toBe(o.paidOut.cents);
  });

  it("tenant 2's identical books are never counted into tenant 1's figures", async () => {
    const o1 = await financeOverview(finance, { range: "30d" }, NOW);
    const financeT2 = { ...finance, tenantId: T2 } as unknown as Actor;
    const o2 = await financeOverview(financeT2, { range: "30d" }, NOW);
    expect(o1.moneyIn.cents).toBe(o2.moneyIn.cents);
    expect(o1.paidOut.cents).toBe(o2.paidOut.cents);
  });
});
