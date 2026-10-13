import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S1-BE-02 — every money and delivery action records its fact, in its own
   transaction (documentation/SponsorX-Fact-Ledger.md §4).

   Driven through the REAL app functions — accepting, publishing, verifying,
   sending back, recording views, paying, ingesting a Zoho invoice,
   cancelling — never by calling the fact writers directly, so a writer that
   is not wired into its action fails here.

   Done when: every listed action writes its fact in its own transaction; the
   daily summaries match the app's own totals for a seeded campaign.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-BE-02 · the campaign actions record their facts", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { acceptOrder, transitionOrder } = await import("../src/domain/campaign-order");
  const { markPublished, verifyPublished, requestRevision } = await import("../src/domain/deliverable");
  const { recordMetric } = await import("../src/domain/metric");
  const { transitionEarning } = await import("../src/domain/earning");
  const { ingestZohoInvoice } = await import("../src/domain/invoice");
  const { checkFactSummaries } = await import("../src/domain/facts");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "fw_t";
  const person = (userId: string, roles: string[], extra: Partial<Actor> = {}) =>
    ({ userId, tenantId: T, roles, sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;
  const staff = person("fw_staff", ["BTG_ADMIN"]);
  const finance = person("fw_fin", ["FINANCE"]);
  const athlete = person("fw_ath_user", ["ATHLETE"], { athleteId: "fw_ath" });
  const evidence = { agreementId: "fw_agr", bodyHashShown: "fw-terms-hash", ip: "127.0.0.1", userAgent: "vitest" };
  const due = new Date("2026-11-20T00:00:00Z");

  const facts = (where: Record<string, unknown> = {}) => prisma.fact.findMany({
    where: { tenantId: T, ...where }, orderBy: { recordedAt: "asc" },
    select: { kind: true, channel: true, measures: true, campaignId: true, athleteId: true, inventoryId: true, marketState: true, marketCity: true, occurredOn: true, reversesId: true },
  });
  const sum = async (measure: string) => {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: string | null }>>(
      `SELECT sum(("${measure}")::bigint)::text AS n FROM "CampaignDaySummary" WHERE "tenantId" = $1`, T);
    return Number(rows[0]?.n ?? 0);
  };

  async function clean() {
    for (const t of ["CampaignDaySummary", "Fact", "MetricDaily", "Earning", "Deliverable", "AgreementAcceptance", "CampaignOrder", "CampaignInvoice",
      "Campaign", "Agreement", "NilJob", "User", "Athlete", "Sponsor", "OutboxJob", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
    await prisma.nilJob.deleteMany({ where: { id: { in: createdJobs }, tenantId: T } });
  }
  /* Catalogue jobs are shared rows with fixed ids, and accepting an order needs a job with a
     deliverable template: SX-04 (two social deliverables) and SX-05 (the in-person job,
     APPEARANCE_JOBS). Use them when the database already has them; otherwise create them for
     this test and remove them after. */
  const createdJobs: string[] = [];

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fact wiring" } });
    await prisma.sponsor.create({ data: { id: "fw_sp", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.athlete.create({ data: {
      id: "fw_ath", tenantId: T, slug: "fw-ath", legalName: "Sam Lee", displayName: "Sam", email: "sam@fw.invalid", sport: "Soccer",
      city: "baltimore", stateCode: "md", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.createMany({ data: [
      { id: "fw_ath_user", tenantId: T, clerkId: "fw_ath_user", email: "sam@fw.invalid", roles: ["ATHLETE"], athleteId: "fw_ath" },
      { id: "fw_staff", tenantId: T, clerkId: "fw_staff", email: "staff@fw.invalid", roles: ["BTG_ADMIN"] },
      { id: "fw_fin", tenantId: T, clerkId: "fw_fin", email: "fin@fw.invalid", roles: ["FINANCE"] },
    ] });
    for (const job of NIL_JOBS.filter((j) => j.id === "SX-04" || j.id === "SX-05")) {
      if (await prisma.nilJob.findUnique({ where: { id: job.id }, select: { id: true } })) continue;
      createdJobs.push(job.id);
      await prisma.nilJob.create({ data: { ...job, tenantId: T } });
    }
    await prisma.agreement.create({ data: { id: "fw_agr", tenantId: T, kind: "FW_CAMPAIGN_ORDER", version: 1, bodyHash: "fw-terms-hash", effectiveAt: new Date("2026-01-01") } });
    await prisma.campaign.create({ data: {
      id: "fw_c", tenantId: T, sponsorId: "fw_sp", name: "Fall tacos", budget: 500000, startDate: new Date("2026-09-01"), endDate: new Date("2026-12-31"),
      state: "STAFFING", zohoDealId: "fw-deal-1",
    } });
    for (const [id, sell, comp] of [["fw_o1", 20000, 10000], ["fw_o2", 15000, 8000]] as const) {
      await prisma.campaignOrder.create({ data: {
        id, tenantId: T, campaignId: "fw_c", athleteId: "fw_ath", jobId: id === "fw_o1" ? "SX-04" : "SX-05", compensation: comp, sellPrice: sell,
        usageRights: "90 days", dueDate: due, state: "SENT",
      } });
    }
  });

  afterAll(clean);

  it("accepting an order books it — sell price and pay, on the acceptance day, with the athlete's registered market — and schedules its deliverables", async () => {
    await acceptOrder(athlete, "fw_o1", evidence);
    const booked = await facts({ kind: "ORDER_BOOKED" });
    expect(booked).toEqual([expect.objectContaining({
      channel: "CAMPAIGN", campaignId: "fw_c", athleteId: "fw_ath", inventoryId: "SX-04", marketState: "MD", marketCity: "Baltimore",
      measures: { booked_sell_cents: 20000, booked_compensation_cents: 10000 },
    })]);
    const dueFacts = await facts({ kind: "DELIVERABLE_DUE" });
    expect(dueFacts.length).toBe(await prisma.deliverable.count({ where: { orderId: "fw_o1" } }));
    expect(dueFacts.every((f) => f.channel === "UNPUBLISHED")).toBe(true);
  });

  it("publishing files the deliverable under its platform; verifying and sending back are each recorded", async () => {
    const [d1, d2] = await prisma.deliverable.findMany({ where: { orderId: "fw_o1" }, orderBy: { id: "asc" }, select: { id: true } });
    expect(d1).toBeDefined();
    await prisma.deliverable.update({ where: { id: d1!.id }, data: { state: "APPROVED" }, select: { id: true } });
    await markPublished(athlete, d1!.id, "https://www.instagram.com/p/abc");
    await verifyPublished(staff, d1!.id);
    /* Facts written in one transaction share its timestamp, so compared as a set. */
    const d1facts = await facts({ sourceId: d1!.id });
    expect(d1facts.map((f) => `${f.kind} ${f.channel}`).sort()).toEqual([
      "DELIVERABLE_DUE SOCIAL_INSTAGRAM",
      "DELIVERABLE_DUE UNPUBLISHED",
      "DELIVERABLE_PUBLISHED SOCIAL_INSTAGRAM",
      "DELIVERABLE_VERIFIED SOCIAL_INSTAGRAM",
      "REVERSAL UNPUBLISHED",
    ]);
    if (d2) {
      await prisma.deliverable.update({ where: { id: d2.id }, data: { state: "BTG_REVIEW" }, select: { id: true } });
      await requestRevision(staff, d2.id, "The logo is cropped");
      expect(await facts({ sourceId: d2.id, kind: "REVISION_REQUESTED" })).toHaveLength(1);
    }
  });

  it("views are recorded by label on their own day; a correction reverses the old figure and counts once", async () => {
    const [d1] = await prisma.deliverable.findMany({ where: { orderId: "fw_o1" }, orderBy: { id: "asc" }, select: { id: true } });
    const day = new Date("2026-09-21T00:00:00Z");
    await recordMetric(staff, { deliverableId: d1!.id, day, views: 1000, engagements: 50, source: "VERIFIED_MANUAL" });
    await recordMetric(staff, { deliverableId: d1!.id, day, views: 1000, engagements: 50, source: "VERIFIED_MANUAL" });
    expect(await facts({ kind: "METRIC_RECORDED" })).toHaveLength(1);
    await recordMetric(staff, { deliverableId: d1!.id, day, views: 1200, engagements: 60, source: "VERIFIED_MANUAL" });
    expect(await sum("viewsVerifiedManual")).toBe(1200);
    expect(await sum("engagementsVerifiedManual")).toBe(60);
    expect(await sum("metricCorrections")).toBe(1);
  });

  it("paying an earning records it on the paid day", async () => {
    const earning = await prisma.earning.findFirst({ where: { orderId: "fw_o1" }, select: { id: true, gross: true, adjustment: true } });
    expect(earning, "accepting the order created its earning").toBeTruthy();
    await prisma.earning.update({ where: { id: earning!.id }, data: { state: "APPROVED_FOR_PAYOUT" }, select: { id: true } });
    await transitionEarning(finance, earning!.id, "PAID", { reference: "PAY-1" });
    expect(await sum("earningsPaidCents")).toBe(earning!.gross + (earning!.adjustment ?? 0));
  });

  it("a Zoho invoice is recorded as issued and paid, each once however often Zoho resends it", async () => {
    const payload = { invoiceId: "fw-inv-1", dealId: "fw-deal-1", status: "paid", amount: 75000, currency: "USD", issuedAt: "2026-09-02", paidAt: "2026-09-15" };
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, payload));
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, payload));
    expect(await sum("invoicedCents")).toBe(75000);
    expect(await sum("invoicePaidCents")).toBe(75000);
  });

  it("cancelling an accepted order records the cancellation; the booking is never edited", async () => {
    await acceptOrder(athlete, "fw_o2", evidence);
    await transitionOrder(staff, "fw_o2", "CANCELLED");
    expect(await facts({ kind: "ORDER_CANCELLED" })).toEqual([expect.objectContaining({
      inventoryId: "SX-05", measures: { cancelled_sell_cents: 15000, cancelled_compensation_cents: 8000 },
    })]);
    expect(await facts({ kind: "ORDER_BOOKED" })).toHaveLength(2);
    /* Its deliverables are no longer due: each due fact is reversed. */
    const o2deliverables = await prisma.deliverable.findMany({ where: { orderId: "fw_o2" }, select: { id: true } });
    const o2due = await facts({ sourceId: { in: o2deliverables.map((d) => d.id) }, kind: "DELIVERABLE_DUE" });
    expect(o2due.length).toBe(o2deliverables.length);
    expect(await facts({ sourceId: { in: o2deliverables.map((d) => d.id) }, kind: "REVERSAL" })).toHaveLength(o2due.length);
  });

  it("a retried action adds nothing: cancelling again is refused, and re-recording the same views changes nothing", async () => {
    const before = await prisma.fact.count({ where: { tenantId: T } });
    await expect(transitionOrder(staff, "fw_o2", "CANCELLED")).rejects.toThrow();
    const [d1] = await prisma.deliverable.findMany({ where: { orderId: "fw_o1" }, orderBy: { id: "asc" }, select: { id: true } });
    await recordMetric(staff, { deliverableId: d1!.id, day: new Date("2026-09-21T00:00:00Z"), views: 1200, engagements: 60, source: "VERIFIED_MANUAL" });
    expect(await prisma.fact.count({ where: { tenantId: T } })).toBe(before);
  });

  it("Zoho changing an open invoice's amount, then voiding it, reverses what it recorded", async () => {
    const inv = { invoiceId: "fw-inv-2", dealId: "fw-deal-1", currency: "USD", issuedAt: "2026-09-03" };
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, { ...inv, status: "sent", amount: 30000 }));
    expect(await sum("invoicedCents")).toBe(75000 + 30000);
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, { ...inv, status: "sent", amount: 32000 }));
    expect(await sum("invoicedCents")).toBe(75000 + 32000);
    await prisma.$transaction((tx) => ingestZohoInvoice(tx, { ...inv, status: "void", amount: 32000 }));
    expect(await sum("invoicedCents")).toBe(75000);
    expect(await sum("invoicePaidCents")).toBe(75000);
  });

  it("the summaries match the app's own totals, and equal the sum of the facts", async () => {
    const orders = await prisma.campaignOrder.aggregate({ where: { tenantId: T, acceptedAt: { not: null } }, _sum: { sellPrice: true, compensation: true } });
    expect(await sum("bookedSellCents")).toBe(orders._sum.sellPrice);
    expect(await sum("bookedCompensationCents")).toBe(orders._sum.compensation);
    /* What is due is what the app counts as due: deliverables on orders that are not cancelled (sponsor overview, campaign list). */
    expect(await sum("deliverablesDue")).toBe(await prisma.deliverable.count({ where: { tenantId: T, order: { state: { notIn: ["CANCELLED", "REJECTED"] } } } }));
    expect(await sum("deliverablesPublished")).toBe(await prisma.deliverable.count({ where: { tenantId: T, publishedAt: { not: null } } }));
    expect(await checkFactSummaries(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
  });
});
