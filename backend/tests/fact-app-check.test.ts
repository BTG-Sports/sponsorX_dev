import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { COMPARED_MEASURES, NOT_COMPARED } from "../src/domain/fact-check";
import { FACT_MEASURES } from "../src/domain/fact-rules";

/* --------------------------------------------------------------------------
   3S1-QA-03 — "match the app": the daily summaries compared with the app's
   own records, campaign by campaign and measure by measure
   (documentation/SponsorX-Fact-Ledger.md §7).

   Here, a campaign's records are written straight to the database, the way
   everything before the ledger was: an accepted order, its deliverables, a
   day's views, a paid earning, a Zoho invoice, a draft sent back. The check
   must name every figure the facts are missing. Once the facts are recorded
   with the same writers the live actions use (as the history fill will), it
   must pass. A summary changed by hand must be caught.

   Done when: after a campaign is run through the real actions the check
   passes (fact-wiring.test.ts, and the marketplace in
   phase2-line-cancellation.test.ts); a missing fact or a changed summary is
   reported by campaign and measure; a script runs it read-only
   (scripts/check-facts.mts).
   -------------------------------------------------------------------------- */

describe("3S1-QA-03 · the check, without a database", () => {
  it("compares every measure, except the one it says it cannot, with the reason", () => {
    expect([...COMPARED_MEASURES, ...Object.keys(NOT_COMPARED)].sort()).toEqual([...FACT_MEASURES].sort());
    expect(COMPARED_MEASURES).not.toContain("metric_corrections");
    for (const why of Object.values(NOT_COMPARED)) expect(why!.length).toBeGreaterThan(10);
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-QA-03 · the check against Postgres", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { audit, AUDIT_ACTIONS } = await import("../src/db/audit");
  const { checkFactsAgainstApp } = await import("../src/domain/fact-check");
  const { checkFactSummaries } = await import("../src/domain/facts");
  const W = await import("../src/domain/fact-writers");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "fc_t";
  const at = (d: string) => new Date(`${d}T12:00:00Z`);

  async function clean() {
    for (const t of ["CampaignDaySummary", "Fact", "MetricDaily", "Earning", "Deliverable", "CampaignOrder", "CampaignInvoice", "Campaign", "Athlete", "Sponsor", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fact check" } });
    await prisma.sponsor.create({ data: { id: "fc_sp", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.athlete.create({ data: {
      id: "fc_ath", tenantId: T, slug: "fc-ath", legalName: "Sam Lee", displayName: "Sam", email: "sam@fc.invalid", sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    /* The catalogue's SX-04: added when missing, never removed (reference data other test files may be using). */
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });
    await prisma.campaign.create({ data: {
      id: "fc_c", tenantId: T, sponsorId: "fc_sp", name: "Fall tacos", budget: 500000, startDate: at("2026-09-01"), endDate: at("2026-12-31"), state: "ACTIVE",
    } });
    /* History, written the way it was before the ledger: straight to the records, no facts. */
    await prisma.campaignOrder.create({ data: {
      id: "fc_o1", tenantId: T, campaignId: "fc_c", athleteId: "fc_ath", jobId: "SX-04", compensation: 10000, sellPrice: 20000,
      usageRights: "90 days", dueDate: at("2026-09-30"), state: "ACTIVE", acceptedAt: at("2026-09-05"),
    } });
    await prisma.deliverable.createMany({ data: [
      { id: "fc_d1", tenantId: T, orderId: "fc_o1", title: "Unboxing story", dueDate: at("2026-09-23"), state: "VERIFIED", platform: "INSTAGRAM", publishedAt: at("2026-09-20"), publishedUrl: "https://instagram.com/p/x" },
      { id: "fc_d2", tenantId: T, orderId: "fc_o1", title: "Experience post", dueDate: at("2026-09-30"), state: "DRAFT_SUBMITTED" },
    ] });
    await prisma.$transaction((tx) => audit(tx, { userId: null, tenantId: T }, AUDIT_ACTIONS.deliverable.requestRevision, "Deliverable", "fc_d2", { after: { reason: "Logo cropped" } }));
    await prisma.metricDaily.create({ data: { id: "fc_m1", tenantId: T, deliverableId: "fc_d1", day: new Date("2026-09-21T00:00:00Z"), views: 500, engagements: 20, source: "VERIFIED_MANUAL" } });
    await prisma.earning.create({ data: { id: "fc_e1", tenantId: T, athleteId: "fc_ath", orderId: "fc_o1", gross: 10000, adjustment: 500, taxYear: 2026, state: "PAID", paidAt: at("2026-10-01") } });
    await prisma.campaignInvoice.create({ data: {
      id: "fc_i1", tenantId: T, campaignId: "fc_c", zohoInvoiceId: "fc-inv-1", status: "paid", amount: 30000, issuedAt: at("2026-09-02"), paidAt: at("2026-09-15"),
    } });
  });

  afterAll(clean);

  it("names every figure the facts are missing, by campaign and measure", async () => {
    const check = await checkFactsAgainstApp(prisma, { tenantId: T });
    expect(check.ok).toBe(false);
    expect(check.differences).toEqual([
      ["booked_compensation_cents", 10000], ["booked_sell_cents", 20000],
      ["deliverables_due", 2], ["deliverables_published", 1], ["deliverables_verified", 1],
      ["earnings_paid_cents", 10500],
      ["engagements_verified_manual", 20],
      ["invoice_paid_cents", 30000], ["invoiced_cents", 30000],
      ["revisions_requested", 1],
      ["views_verified_manual", 500],
    ].map(([measure, app]) => ({ tenantId: T, campaignId: "fc_c", measure, app, facts: 0 })));
  });

  it("passes once the facts are recorded with the live actions' own writers — as the history fill will", async () => {
    await prisma.$transaction(async (tx) => {
      await W.factOrderBooked(tx, "fc_o1");
      await W.factDeliverablePublished(tx, "fc_d1", at("2026-09-20"));
      await W.factDeliverableVerified(tx, "fc_d1", at("2026-09-22"));
      await W.factRevisionRequested(tx, "fc_d2", at("2026-09-24"));
      await W.factMetricRecorded(tx, "fc_m1");
      await W.factEarningPaid(tx, "fc_e1");
      await W.factInvoice(tx, "fc_i1");
    });
    expect(await checkFactsAgainstApp(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    expect(await checkFactSummaries(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
  });

  it("catches a summary changed by hand", async () => {
    await prisma.$executeRawUnsafe(`UPDATE "CampaignDaySummary" SET "bookedSellCents" = "bookedSellCents" + 1 WHERE "tenantId" = $1 AND "bookedSellCents" > 0`, T);
    expect((await checkFactsAgainstApp(prisma, { tenantId: T })).differences).toEqual([
      { tenantId: T, campaignId: "fc_c", measure: "booked_sell_cents", app: 20000, facts: 20001 },
    ]);
    await prisma.$executeRawUnsafe(`UPDATE "CampaignDaySummary" SET "bookedSellCents" = "bookedSellCents" - 1 WHERE "tenantId" = $1 AND "bookedSellCents" > 0`, T);
  });

  it("catches a record changed without its action — an order cancelled straight in the database", async () => {
    await prisma.campaignOrder.update({ where: { id: "fc_o1" }, data: { state: "CANCELLED" }, select: { id: true } });
    expect((await checkFactsAgainstApp(prisma, { tenantId: T })).differences.map((d) => [d.measure, d.app, d.facts])).toEqual([
      ["cancelled_compensation_cents", 10000, 0], ["cancelled_sell_cents", 20000, 0], ["deliverables_due", 0, 2],
    ]);
    await prisma.$transaction((tx) => W.factOrderCancelled(tx, "fc_o1", at("2026-10-05")));
    expect((await checkFactsAgainstApp(prisma, { tenantId: T })).ok).toBe(true);
  });

  it("checks one tenant at a time, or every tenant", async () => {
    expect(await checkFactsAgainstApp(prisma, { tenantId: "fc_nobody" })).toEqual({ ok: true, differences: [] });
    const all = await checkFactsAgainstApp(prisma);
    expect(all.differences.filter((d) => d.tenantId === T)).toEqual([]);
  });
});
