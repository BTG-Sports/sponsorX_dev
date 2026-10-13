import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   3S1-DATA-05 — filling the history of orders and deliverables
   (documentation/SponsorX-Fact-Ledger.md §8).

   History is written here the way it exists in the databases: straight to
   the records, with audit entries, and no facts. Two orders then carry on
   LIVE, through the real actions, after the ledger went in — one is sent back
   for changes, one is cancelled — so their facts are part history, part live.
   The fill must record the rest, on the days things happened, without
   counting anything twice; and a second run must add nothing.

   Done when: after the fill, the check matches these measures for every
   campaign; re-running adds nothing.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-DATA-05 · filling the order and deliverable history", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { AUDIT_ACTIONS } = await import("../src/db/audit");
  const { fillOrderHistory, ORDER_HISTORY_MEASURES } = await import("../src/domain/fact-history");
  const { checkFactsAgainstApp } = await import("../src/domain/fact-check");
  const { checkFactSummaries } = await import("../src/domain/facts");
  const { transitionOrder } = await import("../src/domain/campaign-order");
  const { requestRevision } = await import("../src/domain/deliverable");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const T = "fh_t";
  const staff = { userId: "fh_staff", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null } as unknown as Actor;
  const at = (d: string) => new Date(`${d}T12:00:00Z`);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const factsOf = (sourceId: string) => prisma.fact.findMany({
    where: { tenantId: T, sourceId }, orderBy: [{ occurredOn: "asc" }, { kind: "asc" }],
    select: { kind: true, channel: true, occurredOn: true, measures: true },
  });
  const said = (rows: Array<{ kind: string; channel: string; occurredOn: Date }>) => rows.map((f) => `${day(f.occurredOn)} ${f.kind} ${f.channel}`);
  const auditAt = (action: string, entity: string, entityId: string, when: string) =>
    prisma.auditLog.create({ data: { tenantId: T, action, entity, entityId, at: at(when), after: {} }, select: { id: true } });
  /* Each order on its own campaign (one order per campaign, athlete and job), so the check runs across several campaigns. */
  const order = async (id: string, jobId: string, accepted: string | null, state: string, sell = 20000, comp = 10000) => {
    await prisma.campaign.create({ data: {
      id: `${id}_c`, tenantId: T, sponsorId: "fh_sp", name: `Campaign ${id}`, budget: 500000, startDate: at("2026-09-01"), endDate: at("2026-12-31"), state: "ACTIVE",
    }, select: { id: true } });
    return prisma.campaignOrder.create({ data: {
      id, tenantId: T, campaignId: `${id}_c`, athleteId: "fh_ath", jobId, compensation: comp, sellPrice: sell, usageRights: "90 days",
      dueDate: at("2026-09-30"), state: state as never, acceptedAt: accepted ? at(accepted) : null,
    }, select: { id: true } });
  };
  const deliverable = (id: string, orderId: string, data: Record<string, unknown> = {}) =>
    prisma.deliverable.create({ data: { id, tenantId: T, orderId, title: id, dueDate: at("2026-09-28"), ...data }, select: { id: true } });

  async function clean() {
    for (const t of ["CampaignDaySummary", "Fact", "Deliverable", "Earning", "CampaignOrder", "Campaign", "User", "Athlete", "Sponsor", "OutboxJob", "AuditLog"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fact history" } });
    await prisma.sponsor.create({ data: { id: "fh_sp", tenantId: T, name: "Rosa's Tacos" } });
    await prisma.athlete.create({ data: {
      id: "fh_ath", tenantId: T, slug: "fh-ath", legalName: "Sam Lee", displayName: "Sam", email: "sam@fh.invalid", sport: "Soccer",
      city: "Baltimore", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE",
    } });
    await prisma.user.create({ data: { id: "fh_staff", tenantId: T, clerkId: "fh_staff", email: "staff@fh.invalid", roles: ["BTG_ADMIN"] } });
    /* The catalogue's SX-04 and SX-05: added when missing, never removed (reference data other test files may be using). */
    await prisma.nilJob.createMany({ data: NIL_JOBS.filter((j) => j.id === "SX-04" || j.id === "SX-05").map((j) => ({ ...j, tenantId: T })), skipDuplicates: true });

    /* o1 — accepted; one deliverable published and verified, the other sent back twice (by BTG, then by the checks). */
    await order("fh_o1", "SX-04", "2026-09-05", "ACTIVE");
    await deliverable("fh_d1", "fh_o1", { state: "VERIFIED", platform: "INSTAGRAM", publishedAt: at("2026-09-20"), publishedUrl: "https://instagram.com/p/x" });
    await deliverable("fh_d2", "fh_o1", { state: "DRAFT_SUBMITTED" });
    await auditAt(AUDIT_ACTIONS.deliverable.verify, "Deliverable", "fh_d1", "2026-09-22");
    await auditAt(AUDIT_ACTIONS.deliverable.requestRevision, "Deliverable", "fh_d2", "2026-09-18");
    await auditAt(AUDIT_ACTIONS.deliverable.systemRevision, "Deliverable", "fh_d2", "2026-09-19");
    /* o2 — an in-person job, accepted, its appearance done, then cancelled. */
    await order("fh_o2", "SX-05", "2026-09-06", "CANCELLED", 40000, 20000);
    await deliverable("fh_d3", "fh_o2", { state: "PUBLISHED", platform: "OTHER", publishedAt: at("2026-09-10"), publishedUrl: "https://example.com/x" });
    await deliverable("fh_d4", "fh_o2");
    await auditAt("order.cancel", "CampaignOrder", "fh_o2", "2026-09-25");
    /* o3 — offered and never accepted: nothing was booked. */
    await order("fh_o3", "SX-04", null, "SENT");
    /* o4 — cancelled by a seed script: no audit entry, so its date falls back to the acceptance. */
    await order("fh_o4", "SX-04", "2026-09-07", "CANCELLED", 15000, 8000);
    await deliverable("fh_d5", "fh_o4");

    /* o5 — accepted before the ledger, sent back once then; sent back again LIVE, after the ledger went in. */
    await order("fh_o5", "SX-04", "2026-09-08", "ACTIVE");
    await deliverable("fh_d6", "fh_o5", { state: "BTG_REVIEW" });
    await auditAt(AUDIT_ACTIONS.deliverable.requestRevision, "Deliverable", "fh_d6", "2026-09-15");
    await requestRevision(staff, "fh_d6", "The logo is cropped");
    /* o6 — accepted before the ledger; cancelled LIVE. */
    await order("fh_o6", "SX-04", "2026-09-09", "ACTIVE", 30000, 12000);
    await deliverable("fh_d7", "fh_o6");
    await transitionOrder(staff, "fh_o6", "CANCELLED");
  });

  afterAll(clean);

  it("before the fill, the check names what is missing", async () => {
    const missing = new Set((await checkFactsAgainstApp(prisma, { tenantId: T })).differences.map((d) => d.measure));
    expect([...missing].sort()).toEqual([...ORDER_HISTORY_MEASURES].sort());
  });

  it("after the fill, every figure matches the app, and the summaries equal the facts", async () => {
    const report = await fillOrderHistory(prisma, { tenantId: T });
    expect(report).toMatchObject({ records: 5, fallbackDates: 1 });
    expect(report.factsAdded).toBeGreaterThan(0);
    expect(await checkFactsAgainstApp(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
    expect(await checkFactSummaries(prisma, { tenantId: T })).toEqual({ ok: true, differences: [] });
  });

  it("each event is on the day it happened, filed where the live action would have filed it", async () => {
    expect(said(await factsOf("fh_o1"))).toEqual(["2026-09-05 ORDER_BOOKED CAMPAIGN"]);
    expect(said(await factsOf("fh_d1"))).toEqual([
      "2026-09-20 DELIVERABLE_PUBLISHED SOCIAL_INSTAGRAM", "2026-09-22 DELIVERABLE_VERIFIED SOCIAL_INSTAGRAM", "2026-09-28 DELIVERABLE_DUE SOCIAL_INSTAGRAM",
    ]);
    /* Sent back before it was ever published: filed as unpublished, as the live action does. */
    expect(said(await factsOf("fh_d2"))).toEqual([
      "2026-09-18 REVISION_REQUESTED UNPUBLISHED", "2026-09-19 REVISION_REQUESTED UNPUBLISHED", "2026-09-28 DELIVERABLE_DUE UNPUBLISHED",
    ]);
    /* Cancelled on the audit log's day; its deliverables no longer due (reversed on their due day); the appearance done stays. */
    expect(said(await factsOf("fh_o2"))).toEqual(["2026-09-06 ORDER_BOOKED CAMPAIGN", "2026-09-25 ORDER_CANCELLED CAMPAIGN"]);
    expect(said(await factsOf("fh_d3"))).toEqual(["2026-09-10 DELIVERABLE_PUBLISHED IN_PERSON", "2026-09-28 DELIVERABLE_DUE IN_PERSON", "2026-09-28 REVERSAL IN_PERSON"]);
    /* No audit entry: dated by the acceptance, and counted as a fallback. */
    expect(said(await factsOf("fh_o4"))).toEqual(["2026-09-07 ORDER_BOOKED CAMPAIGN", "2026-09-07 ORDER_CANCELLED CAMPAIGN"]);
    expect(await factsOf("fh_o3")).toEqual([]);
  });

  it("an event already recorded live is not recorded again: two sendings-back stay two; a live cancellation stays one", async () => {
    expect((await factsOf("fh_d6")).filter((f) => f.kind === "REVISION_REQUESTED")).toHaveLength(2);
    expect((await factsOf("fh_o6")).map((f) => f.kind).sort()).toEqual(["ORDER_BOOKED", "ORDER_CANCELLED"]);
  });

  it("running it again adds nothing", async () => {
    const before = await prisma.fact.count({ where: { tenantId: T } });
    expect(await fillOrderHistory(prisma, { tenantId: T })).toEqual({ records: 5, factsAdded: 0, fallbackDates: 1 });
    expect(await prisma.fact.count({ where: { tenantId: T } })).toBe(before);
    expect((await checkFactsAgainstApp(prisma, { tenantId: T })).ok).toBe(true);
  });

  it("fills only the tenant it is given", async () => {
    expect(await fillOrderHistory(prisma, { tenantId: "fh_nobody" })).toEqual({ records: 0, factsAdded: 0, fallbackDates: 0 });
  });
});
