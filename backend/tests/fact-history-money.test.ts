import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S1-DATA-06 — filling the history of views, payments and invoices
   (documentation/SponsorX-Fact-Ledger.md §8).

   History is written here the way it exists in the databases: straight to
   the records, with the audit entries the app wrote, and no facts. Then three
   things happen LIVE, through the real actions, after the ledger went in: a
   figure from before the ledger is corrected, an earning is paid, and Zoho
   sends an invoice. The fill must record the rest — each figure on its own
   day, each correction counted once — and a second run must add nothing.

   Done when: after the fill, the check matches these measures for every
   campaign; re-running adds nothing.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-DATA-06 · filling the views, payments and invoices history", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { AUDIT_ACTIONS } = await import("../src/db/audit");
  const H = await import("../src/domain/fact-history");
  const { checkFactsAgainstApp } = await import("../src/domain/fact-check");
  const { checkFactSummaries } = await import("../src/domain/facts");
  const { recordMetric } = await import("../src/domain/metric");
  const { transitionEarning } = await import("../src/domain/earning");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "fm_t";
  const actor = (userId: string, roles: string[]) =>
    ({ userId, tenantId: T, roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const staff = actor("fm_staff", ["BTG_ADMIN"]);
  const finance = actor("fm_fin", ["FINANCE"]);
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  const midnight = (d: string) => new Date(`${d}T00:00:00Z`);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const sum = async (measure: string) => Number((await prisma.$queryRawUnsafe<Array<{ n: string | null }>>(
    `SELECT sum(("${measure}")::bigint)::text AS n FROM "CampaignDaySummary" WHERE "tenantId" = $1`, T))[0]?.n ?? 0);
  const factsOf = (sourceId: string) => prisma.fact.findMany({
    where: { tenantId: T, sourceId }, orderBy: [{ occurredOn: "asc" }, { kind: "asc" }], select: { kind: true, occurredOn: true, measures: true },
  });
  /* What recordMetric's audit entry holds — written here with the date it was entered. */
  const entered = (metricId: string, when: string, views: number, engagements: number) => prisma.auditLog.create({
    data: { tenantId: T, action: AUDIT_ACTIONS.metric.record, entity: "MetricDaily", entityId: metricId, at: at(when), after: { views, engagements } },
    select: { id: true },
  });
  const metric = (id: string, d: string, source: string, views: number, engagements: number) => prisma.metricDaily.create({
    data: { id, tenantId: T, deliverableId: "fm_d1", day: midnight(d), source: source as never, views, engagements }, select: { id: true },
  });

  async function clean() {
    for (const t of ["CampaignDaySummary", "Fact", "MetricDaily", "Earning", "Deliverable", "CampaignOrder", "CampaignInvoice", "Campaign", "User", "Athlete", "Sponsor", "OutboxJob", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fact history, money" } });
    await prisma.sponsor.create({ data: { id: "fm_sp", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.athlete.create({ data: {
      id: "fm_ath", tenantId: T, slug: "fm-ath", legalName: "Sam Lee", displayName: "Sam", email: "sam@fm.invalid", sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.createMany({ data: [
      { id: "fm_staff", tenantId: T, clerkId: "fm_staff", email: "staff@fm.invalid", roles: ["BTG_ADMIN"] },
      { id: "fm_fin", tenantId: T, clerkId: "fm_fin", email: "fin@fm.invalid", roles: ["FINANCE"] },
    ] });
    /* The catalogue's SX-04 and SX-05: added when missing, never removed (reference data other test files may be using). */
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04" || j.id === "SX-05").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.campaign.create({ data: {
      id: "fm_c", tenantId: T, sponsorId: "fm_sp", name: "Fall tacos", budget: 500000, startDate: at("2026-09-01"), endDate: at("2026-12-31"), state: "ACTIVE", zohoDealId: "fm-deal",
    } });
    await prisma.campaignOrder.createMany({ data: [
      { id: "fm_o1", tenantId: T, campaignId: "fm_c", athleteId: "fm_ath", jobId: "SX-04", compensation: 10000, sellPrice: 20000, usageRights: "90 days", dueDate: at("2026-09-30"), state: "ACTIVE", acceptedAt: at("2026-09-05") },
      { id: "fm_o2", tenantId: T, campaignId: "fm_c", athleteId: "fm_ath", jobId: "SX-05", compensation: 7000, sellPrice: 14000, usageRights: "90 days", dueDate: at("2026-09-30"), state: "ACTIVE", acceptedAt: at("2026-09-06") },
    ] });
    await prisma.deliverable.create({ data: { id: "fm_d1", tenantId: T, orderId: "fm_o1", title: "Reel", dueDate: at("2026-09-20"), state: "VERIFIED", platform: "INSTAGRAM", publishedAt: at("2026-09-19"), publishedUrl: "https://instagram.com/p/y" } });

    /* Views. m1: entered, entered again unchanged, then corrected — one correction. */
    await metric("fm_m1", "2026-09-21", "VERIFIED_MANUAL", 1200, 60);
    await entered("fm_m1", "2026-09-21", 1000, 50);
    await entered("fm_m1", "2026-09-22", 1000, 50);
    await entered("fm_m1", "2026-09-23", 1200, 60);
    /* m2: seeded straight in, never through the app — no audit entry, no correction. */
    await metric("fm_m2", "2026-09-22", "SELF_REPORTED", 300, 9);
    /* m3: entered before the ledger, then corrected LIVE. The live action cannot count that correction (the old figure had no fact). */
    await metric("fm_m3", "2026-09-23", "VERIFIED_API", 100, 5);
    await entered("fm_m3", "2026-09-23", 100, 5);
    await recordMetric(staff, { deliverableId: "fm_d1", day: midnight("2026-09-23"), views: 150, engagements: 8, source: "VERIFIED_API" });

    /* Earnings. One paid before the ledger; one waiting; one paid LIVE. */
    await prisma.earning.create({ data: { id: "fm_e1", tenantId: T, athleteId: "fm_ath", orderId: "fm_o1", gross: 10000, adjustment: 500, taxYear: 2026, state: "PAID", paidAt: at("2026-10-01") } });
    await prisma.earning.create({ data: { id: "fm_e2", tenantId: T, athleteId: "fm_ath", orderId: "fm_o2", gross: 7000, adjustment: 0, taxYear: 2026, state: "APPROVED_FOR_PAYOUT" } });
    await transitionEarning(finance, "fm_e2", "PAID", { reference: "PAY-LIVE" });

    /* Invoices. Paid; sent; void — before the ledger. And one Zoho sends LIVE. */
    await prisma.campaignInvoice.createMany({ data: [
      { id: "fm_i1", tenantId: T, campaignId: "fm_c", zohoInvoiceId: "fm-inv-1", status: "paid", amount: 30000, issuedAt: at("2026-09-02"), paidAt: at("2026-09-15") },
      { id: "fm_i2", tenantId: T, campaignId: "fm_c", zohoInvoiceId: "fm-inv-2", status: "sent", amount: 12000, issuedAt: at("2026-09-03") },
      { id: "fm_i3", tenantId: T, campaignId: "fm_c", zohoInvoiceId: "fm-inv-3", status: "void", amount: 99000, issuedAt: at("2026-09-04") },
    ] });
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, { invoiceId: "fm-inv-4", dealId: "fm-deal", status: "sent", amount: 5000, currency: "USD", issuedAt: "2026-10-02" }));
  });

  afterAll(clean);

  const MEASURES = [...H.VIEW_HISTORY_MEASURES, ...H.PAYMENT_HISTORY_MEASURES, ...H.INVOICE_HISTORY_MEASURES];
  const differences = async () => (await checkFactsAgainstApp(prisma, { tenantId: T })).differences.filter((d) => MEASURES.includes(d.measure));

  it("before the fill, the check names the figures still missing", async () => {
    expect((await differences()).map((d) => d.measure).sort()).toEqual([
      "earnings_paid_cents", "engagements_self_reported", "engagements_verified_manual", "invoice_paid_cents", "invoiced_cents",
      "views_self_reported", "views_verified_manual",
    ]);
  });

  it("after the fill, every figure matches the app and the summaries equal the facts", async () => {
    expect(await H.fillViewHistory(prisma, { tenantId: T })).toMatchObject({ records: 3 });
    expect(await H.fillPaymentHistory(prisma, { tenantId: T })).toMatchObject({ records: 2 });
    expect(await H.fillInvoiceHistory(prisma, { tenantId: T })).toMatchObject({ records: 4 });
    expect(await differences()).toEqual([]);
    expect(await checkFactSummaries(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    expect(await sum("viewsVerifiedManual")).toBe(1200);
    expect(await sum("viewsSelfReported")).toBe(300);
    expect(await sum("viewsVerifiedApi")).toBe(150);
    expect(await sum("earningsPaidCents")).toBe(10500 + 7000);
    expect(await sum("invoicedCents")).toBe(30000 + 12000 + 5000);
    expect(await sum("invoicePaidCents")).toBe(30000);
  });

  it("each figure is on its own day; each payment and invoice on the day it happened", async () => {
    /* The figure, and — on the same day — the one correction the audit log shows. */
    const m1 = await factsOf("fm_m1");
    expect(m1).toHaveLength(2);
    expect(m1.map((f) => [day(f.occurredOn), f.measures])).toEqual(expect.arrayContaining([
      ["2026-09-21", { views_verified_manual: 1200, engagements_verified_manual: 60 }], ["2026-09-21", { metric_corrections: 1 }],
    ]));
    expect((await factsOf("fm_e1")).map((f) => [day(f.occurredOn), f.measures])).toEqual([["2026-10-01", { earnings_paid_cents: 10500 }]]);
    expect((await factsOf("fm_i1")).map((f) => [f.kind, day(f.occurredOn)])).toEqual([["INVOICE_ISSUED", "2026-09-02"], ["INVOICE_PAID", "2026-09-15"]]);
    expect(await factsOf("fm_i3")).toEqual([]);
  });

  it("corrections are counted from what was entered — once each, including one made live to a figure from before the ledger", async () => {
    expect(await sum("metricCorrections")).toBe(2);
    const m3 = await factsOf("fm_m3");
    expect(m3.reduce((n, f) => n + ((f.measures as Record<string, number>).metric_corrections ?? 0), 0)).toBe(1);
  });

  it("what was recorded live is not recorded again; running it again adds nothing", async () => {
    expect(await factsOf("fm_e2")).toHaveLength(1);
    const before = await prisma.fact.count({ where: { tenantId: T } });
    for (const fill of [H.fillViewHistory, H.fillPaymentHistory, H.fillInvoiceHistory]) {
      expect((await fill(prisma, { tenantId: T })).factsAdded).toBe(0);
    }
    expect(await prisma.fact.count({ where: { tenantId: T } })).toBe(before);
    expect(await sum("metricCorrections")).toBe(2);
  });
});
