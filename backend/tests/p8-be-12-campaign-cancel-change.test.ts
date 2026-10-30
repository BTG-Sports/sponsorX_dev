import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P8-BE-12 — cancel and change a campaign, automatically.

   Done when: the impact read lists every affected product with its outcome
   and the money; a safe cancel or change applies at once and settles every
   order, offer, invitation, reward, placement and ad under the campaign; an
   unsafe one is held with its reasons and BTG admins are emailed; BTG can
   approve or decline a held request; a sponsor reaches only their own
   campaigns; tests cover each outcome, roles and tenants.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@p8be12-test.invalid` } : null;
  },
}));

describe("P8-BE-12 · the rules, without a database", async () => {
  const { cancelImpact, changeImpact, orderStage } = await import("../src/domain/campaign-change-rules");
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const order = (over: Record<string, unknown> = {}) => ({
    id: "o", state: "ACCEPTED", sellPrice: 10_000, dueDate: d("2026-12-15"), athleteName: "A", minor: false, deliverables: [], ...over,
  });
  const facts = (over: Record<string, unknown> = {}) => ({
    name: "Spring", state: "STAFFING", startDate: d("2026-12-01"), endDate: d("2027-01-31"), budget: 100_000, committed: 30_000, heldRequest: false,
    orders: [], offers: [], invites: [], rewards: [], windows: [], slots: [], openDisputes: 0, paidCents: 0, refundedCents: 0, ...over,
  });

  it("an order's stage is read from its deliverables", () => {
    expect(orderStage(order({ state: "DRAFT" }))).toBe("unaccepted");
    expect(orderStage(order({ state: "ACCEPTED" }))).toBe("notStarted");
    expect(orderStage(order({ state: "ACTIVE", deliverables: [{ state: "NOT_STARTED", dueDate: d("2026-12-15") }] }))).toBe("notStarted");
    expect(orderStage(order({ state: "ACTIVE", deliverables: [{ state: "BTG_REVIEW", dueDate: d("2026-12-15") }] }))).toBe("inProgress");
    expect(orderStage(order({ state: "ACTIVE", deliverables: [{ state: "VERIFIED", dueDate: d("2026-12-15") }] }))).toBe("delivered");
    expect(orderStage(order({ state: "COMPLETED" }))).toBe("delivered");
    expect(orderStage(order({ state: "CANCELLED" }))).toBe("ended");
  });

  it("a closed edition's ad, a placement and a dispute: each grouped, and the closed ad and the dispute hold it", () => {
    const i = cancelImpact(facts({
      windows: [{ id: "w", name: "Placement 1", startsAt: d("2026-12-02"), endsAt: d("2026-12-09") }],
      slots: [{ id: "s1", slotCode: "Q1", editionLabel: "Fall", open: true, publishTarget: d("2026-12-20"), soldCents: 5_000 },
        { id: "s2", slotCode: "H1", editionLabel: "Winter", open: false, publishTarget: d("2026-12-20"), soldCents: 9_000 }],
      openDisputes: 1,
    }));
    expect(i.affected.groups.map((g) => [g.key, g.count, g.outcome])).toEqual([
      ["placements", 1, "Released"], ["adsReleased", 1, "Released"], ["adsRefunded", 1, "Refund queued"], ["deal", 1, "Closed Lost"],
    ]);
    expect(i.automatic).toBe(false);
    expect(i.holdReasons).toEqual(["A deal dispute is open on 1 order.", "1 ad in an edition that has closed."]);
  });

  it("refusals: a reporting campaign can't be cancelled; a change below committed names the figure", () => {
    expect(cancelImpact(facts({ state: "REPORTING" }))).toMatchObject({ allowed: false, automatic: false, refusals: ["A campaign that is reporting or completed can't be cancelled."] });
    expect(changeImpact(facts(), { budget: 20_000 }).refusals).toEqual(["The budget can't go below $300.00 already committed."]);
    expect(changeImpact(facts(), { endDate: d("2026-11-01") }).refusals).toContain("The end date must be after the start date.");
    expect(changeImpact(facts(), { name: "Spring" }).refusals).toEqual(["Nothing would change."]);
    expect(changeImpact(facts(), { name: "  " }).refusals).toEqual(["A campaign needs a name."]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P8-BE-12 · cancel and change a campaign, on the real database", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "p8be12_tenant";
  const OTHER_T = "p8be12_other";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const mails = async (template: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((o) => o.payload as { template: string; to: string; data: Record<string, string> }).filter((m) => m.template === template);
  const stateOf = {
    campaign: async (id: string) => (await prisma.campaign.findUniqueOrThrow({ where: { id: p(id) }, select: { state: true } })).state,
    order: async (id: string) => (await prisma.campaignOrder.findUniqueOrThrow({ where: { id: p(id) }, select: { state: true } })).state,
    earning: async (id: string) => (await prisma.earning.findUniqueOrThrow({ where: { id: p(id) }, select: { state: true } })).state,
  };
  const SP = p("sp"), ADMIN = p("admin"), CM = p("cm");

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER_T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER_T] } } });
  }

  async function campaign(key: string, state: string, over: Record<string, unknown> = {}) {
    await prisma.nilJob.create({ data: { id: p(`job_${key}`), tenantId: T, name: `Job ${key}`, baseLow: 100, baseHigh: 200, sellLow: 150, sellHigh: 300, sellFloorEmerging: 150, sellFloorCreator: 150, sellFloorPremium: 150 } });
    await prisma.campaign.create({ data: {
      id: p(key), tenantId: T, sponsorId: p("sponsor"), name: `Campaign ${key}`, budget: 100_000,
      startDate: new Date("2026-12-01T00:00:00Z"), endDate: new Date("2027-01-31T00:00:00Z"), state: state as never, ...over,
    } });
  }
  async function order(key: string, c: string, athlete: string, state: string, opts: { deliverables?: string[]; earning?: string; sellPrice?: number; due?: Date } = {}) {
    await prisma.campaignOrder.create({ data: {
      id: p(key), tenantId: T, campaignId: p(c), athleteId: p(athlete), jobId: p(`job_${c}`), compensation: 10_000, sellPrice: opts.sellPrice ?? 20_000,
      usageRights: "90 days", dueDate: opts.due ?? new Date("2027-01-15T00:00:00Z"), state: state as never,
    } });
    for (const [i, s] of (opts.deliverables ?? []).entries()) {
      await prisma.deliverable.create({ data: { id: p(`${key}_d${i}`), tenantId: T, orderId: p(key), title: "Post", dueDate: new Date("2027-01-10T00:00:00Z"), state: s as never } });
    }
    if (opts.earning) await prisma.earning.create({ data: { id: p(`earn_${key}`), tenantId: T, athleteId: p(athlete), orderId: p(key), gross: 10_000, taxYear: 2026, state: opts.earning as never } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.createMany({ data: [{ id: T, name: "P8BE12" }, { id: OTHER_T, name: "P8BE12 other" }] });
    await prisma.sponsor.createMany({ data: [
      { id: p("sponsor"), tenantId: T, name: "Northwind Drinks" }, { id: p("rival"), tenantId: T, name: "Rival Co" },
      { id: `${OTHER_T}_sponsor`, tenantId: OTHER_T, name: "Elsewhere" },
    ] });
    const athletes: Array<[string, string]> = [["a1", "18_PLUS"], ["a2", "18_PLUS"], ["a3", "18_PLUS"], ["a4", "18_PLUS"], ["a5", "18_PLUS"], ["m1", "UNDER_16"]];
    for (const [id, ageBand] of athletes) {
      await prisma.athlete.create({ data: {
        id: p(id), tenantId: T, slug: p(id), legalName: `Athlete ${id}`, displayName: `Athlete ${id.toUpperCase()}`, email: `${p(id)}@x.invalid`,
        sport: "Soccer", ageBand: ageBand as never, state: "ACTIVE",
      } });
    }
    const users: Array<[string, string, string, string?]> = [
      [SP, "SPONSOR_ADMIN", T, p("sponsor")], [p("analyst"), "SPONSOR_ANALYST", T, p("sponsor")], [p("rival_admin"), "SPONSOR_ADMIN", T, p("rival")],
      [ADMIN, "BTG_ADMIN", T], [CM, "CAMPAIGN_MGR", T], [p("sales"), "SALES", T],
      [`${OTHER_T}_admin`, "BTG_ADMIN", OTHER_T], [`${OTHER_T}_sp`, "SPONSOR_ADMIN", OTHER_T, `${OTHER_T}_sponsor`],
    ];
    for (const [id, role, tenantId, sponsorId] of users) {
      await prisma.user.create({ data: { id, tenantId, clerkId: id, email: `${id}@x.invalid`, roles: [role as never], ...(sponsorId ? { sponsorId } : {}) } });
    }

    /* safe — nothing in progress: an offer, an invitation, an accepted order not started, a live reward, an ad in a selling edition. */
    await campaign("safe", "STAFFING");
    await prisma.offer.create({ data: {
      id: p("offer1"), tenantId: T, campaignId: p("safe"), athleteId: p("a1"), jobId: p("job_safe"), brief: "Post once",
      compensation: 10_000, sellPrice: 20_000, deliverables: [], usageRights: "90 days", expiresAt: inDays(5), state: "SENT", sentAt: new Date(),
    } });
    await prisma.campaignInvite.create({ data: { id: p("invite1"), tenantId: T, campaignId: p("safe"), athleteId: p("a2"), jobId: p("job_safe"), offered: 10_000, expiresAt: inDays(5) } });
    await order("safe_o1", "safe", "a3", "ACCEPTED", { earning: "PENDING" });
    await prisma.reward.create({ data: { id: p("reward1"), tenantId: T, campaignId: p("safe"), offerText: "Free drink", expiresAt: inDays(60), terms: "One per fan", state: "ACTIVE" } });
    await prisma.publication.create({ data: { id: p("pub"), tenantId: T, name: "P8BE12 Masthead" } });
    await prisma.edition.create({ data: { id: p("ed"), tenantId: T, publicationId: p("pub"), label: "Fall", closeDate: inDays(20), publishTarget: inDays(40), thresholdCents: 100_000, state: "SELLING" } });
    await prisma.adSlot.create({ data: { id: p("slot1"), tenantId: T, editionId: p("ed"), slotCode: "Q1", kind: "QUARTER", priceCents: 5_000, campaignId: p("safe"), soldCents: 5_000, soldAt: new Date() } });

    /* busy — work under way, work delivered, a minor's order, and money paid. */
    await campaign("busy", "ACTIVE");
    await order("busy_prog", "busy", "a1", "ACTIVE", { deliverables: ["BTG_REVIEW"], earning: "PENDING" });
    await order("busy_done", "busy", "a2", "COMPLETED", { deliverables: ["VERIFIED"], earning: "ELIGIBLE" });
    await order("busy_minor", "busy", "m1", "ACCEPTED");
    await prisma.campaignInvoice.create({ data: { id: p("inv1"), tenantId: T, campaignId: p("busy"), zohoInvoiceId: p("zinv1"), status: "paid", amount: 100_000, paidAt: new Date() } });

    /* disp — an open deal dispute. */
    await campaign("disp", "STAFFING");
    await order("disp_o1", "disp", "a4", "ACCEPTED");
    await prisma.dealDispute.create({ data: { id: p("dd1"), tenantId: T, orderId: p("disp_o1"), athleteId: p("a4"), source: "SCHOOL", reason: "School rule", documentsRequested: "Policy", openedBy: ADMIN, state: "OPEN" } });

    /* chg — to change: $300 committed on an order due Jan 15. */
    await campaign("chg", "STAFFING");
    await order("chg_o1", "chg", "a5", "ACCEPTED", { sellPrice: 30_000 });

    /* done — reporting: can't be cancelled. */
    await campaign("rep", "REPORTING");

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("the cancel impact lists every affected product, its outcome, and the money — and a safe one is automatic", async () => {
    const r = await call("GET", `/campaigns/${p("safe")}/cancel-impact`, SP);
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ allowed: true, automatic: true, holdReasons: [], refusals: [], money: { refundCents: 0, owedCents: 0 } });
    expect(r.json.affected.groups.map((g: { key: string; count: number; outcome: string }) => [g.key, g.count, g.outcome])).toEqual([
      ["withdrawn", 2, "Withdrawn — no cost"],
      ["cancelled", 1, "Cancelled — the athlete is emailed"],
      ["rewards", 1, "Paused"],
      ["adsReleased", 1, "Released"],
      ["deal", 1, "Closed Lost"],
    ]);
    expect(r.json.affected.total).toBe(6);
  });

  it("a safe cancel applies at once and settles everything under the campaign", async () => {
    const r = await call("POST", `/campaigns/${p("safe")}/cancel`, SP, { reason: "Budget moved to spring" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.outcome).toBe("CANCELLED");
    expect(await stateOf.campaign("safe")).toBe("CANCELLED");
    expect((await prisma.offer.findUniqueOrThrow({ where: { id: p("offer1") }, select: { state: true } })).state).toBe("WITHDRAWN");
    expect((await prisma.campaignInvite.findUniqueOrThrow({ where: { id: p("invite1") }, select: { state: true } })).state).toBe("EXPIRED");
    expect(await stateOf.order("safe_o1")).toBe("CANCELLED");
    expect(await stateOf.earning("earn_safe_o1")).toBe("VOIDED");
    expect((await prisma.reward.findUniqueOrThrow({ where: { id: p("reward1") }, select: { state: true } })).state).toBe("PAUSED");
    expect(await prisma.adSlot.findUniqueOrThrow({ where: { id: p("slot1") }, select: { campaignId: true, soldCents: true } })).toEqual({ campaignId: null, soldCents: null });
    expect((await mails("campaign.orderCancelled")).map((m) => m.to)).toEqual([`${p("a3")}@x.invalid`]);
    const deal = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.pushDeal" }, select: { payload: true } });
    expect(deal.map((j) => (j.payload as { campaignId: string }).campaignId)).toContain(p("safe"));
  });

  it("an unsafe cancel is held with its reasons, BTG admins are emailed, and nothing moves", async () => {
    const r = await call("POST", `/campaigns/${p("busy")}/cancel`, SP, { reason: "We are pulling out" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.outcome).toBe("HELD_FOR_BTG");
    expect(r.json.reasons).toEqual([
      "Work has started on 1 order.",
      "1 order already delivered — still paid.",
      "The sponsor has paid $1,000.00; $600.00 would be refunded.",
      "1 order with an athlete under 18.",
    ]);
    expect(r.json.impact.money).toEqual({ owedCents: 40_000, refundCents: 60_000 });
    expect(await stateOf.campaign("busy")).toBe("ACTIVE");
    expect(await stateOf.order("busy_prog")).toBe("ACTIVE");
    const held = await mails("campaign.changeHeld");
    expect(held.map((m) => m.to)).toEqual([`${ADMIN}@x.invalid`]);
    expect(held[0]!.data.reasons).toContain("Work has started on 1 order.");
    /* A second ask while one is with BTG is refused. */
    expect((await call("POST", `/campaigns/${p("busy")}/cancel`, SP, { reason: "Again" })).status).toBe(409);
  });

  it("BTG's queue lists it, and the board counts it", async () => {
    const q = await call("GET", "/campaign-requests", ADMIN);
    expect(q.status, q.text).toBe(200);
    expect(q.json.requests[0]).toMatchObject({ kind: "CANCEL", state: "HELD", campaign: { id: p("busy"), sponsorName: "Northwind Drinks" }, requestedBy: { email: `${SP}@x.invalid` }, decision: null });
    expect(q.json.counts.held).toBe(1);
    const board = await call("GET", "/operations/board", ADMIN);
    expect(board.json.queues.campaignRequests).toMatchObject({ waiting: 1, oldestSince: expect.any(String) });
    expect((await call("GET", "/campaign-requests", SP)).status).toBe(403);
  });

  it("BTG approves: work under way is cancelled and held for Finance, delivered work is untouched, the refund is queued, the requester is told", async () => {
    const id = (await call("GET", "/campaign-requests", ADMIN)).json.requests[0].id;
    const r = await call("POST", `/campaign-requests/${id}/decision`, CM, { decision: "APPROVE" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.request).toMatchObject({ state: "APPLIED", decision: { decision: "APPROVE" } });
    expect(await stateOf.campaign("busy")).toBe("CANCELLED");
    expect(await stateOf.order("busy_prog")).toBe("CANCELLED");
    expect(await stateOf.earning("earn_busy_prog")).toBe("HELD");
    expect(await stateOf.order("busy_done")).toBe("COMPLETED");
    expect(await stateOf.earning("earn_busy_done")).toBe("ELIGIBLE");
    expect(await stateOf.order("busy_minor")).toBe("CANCELLED");
    const refund = await prisma.refundDue.findFirstOrThrow({ where: { tenantId: T, campaignId: p("busy") }, select: { cause: true, amountCents: true, paidVia: true, state: true } });
    expect(refund).toEqual({ cause: "CAMPAIGN_CANCELLED", amountCents: 60_000, paidVia: "ZOHO_INVOICE", state: "OPEN" });
    expect((await mails("campaign.changeDecided")).map((m) => [m.to, m.data.decision])).toEqual([[`${SP}@x.invalid`, "approved — it has been applied"]]);
    expect((await call("POST", `/campaign-requests/${id}/decision`, CM, { decision: "APPROVE" })).status).toBe(409);
  });

  it("BTG declines with a note: nothing moves, and the requester reads the note", async () => {
    const held = await call("POST", `/campaigns/${p("disp")}/cancel`, SP, { reason: "Changed our mind" });
    expect(held.json).toMatchObject({ outcome: "HELD_FOR_BTG", reasons: ["A deal dispute is open on 1 order."] });
    expect((await call("POST", `/campaign-requests/${held.json.requestId}/decision`, ADMIN, { decision: "DECLINE" })).status).toBe(400);
    const r = await call("POST", `/campaign-requests/${held.json.requestId}/decision`, ADMIN, { decision: "DECLINE", note: "Wait for the dispute to settle" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.request).toMatchObject({ state: "DECLINED", decision: { decision: "DECLINE", note: "Wait for the dispute to settle" } });
    expect(await stateOf.campaign("disp")).toBe("STAFFING");
    expect(await stateOf.order("disp_o1")).toBe("ACCEPTED");
    expect((await mails("campaign.changeDecided")).some((m) => m.data.note === "Wait for the dispute to settle")).toBe(true);
  });

  it("change: a rename applies at once; a budget below committed or an end before start is refused with why", async () => {
    const renamed = await call("POST", `/campaigns/${p("chg")}/change`, SP, { name: "Winter push" });
    expect(renamed.json.outcome, renamed.text).toBe("CHANGED");
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: p("chg") }, select: { name: true } })).name).toBe("Winter push");
    const low = await call("POST", `/campaigns/${p("chg")}/change`, SP, { budget: 20_000 });
    expect(low.status).toBe(422);
    expect(low.text).toContain("The budget can't go below $300.00 already committed.");
    expect((await call("POST", `/campaigns/${p("chg")}/change`, SP, { endDate: "2026-11-01" })).status).toBe(422);
    const up = await call("POST", `/campaigns/${p("chg")}/change`, CM, { budget: 150_000 });
    expect(up.json.outcome).toBe("CHANGED");
  });

  it("change: new dates that leave an order outside them are held, and applied when BTG approves", async () => {
    const impact = await call("POST", `/campaigns/${p("chg")}/change-impact`, SP, { endDate: "2027-01-01" });
    expect(impact.json).toMatchObject({ allowed: true, automatic: false, holdReasons: ["1 item would fall outside the new dates."] });
    const held = await call("POST", `/campaigns/${p("chg")}/change`, SP, { endDate: "2027-01-01", reason: "Shorter run" });
    expect(held.json.outcome).toBe("HELD_FOR_BTG");
    expect((await call("POST", `/campaign-requests/${held.json.requestId}/decision`, ADMIN, { decision: "APPROVE" })).status).toBe(200);
    expect((await prisma.campaign.findUniqueOrThrow({ where: { id: p("chg") }, select: { endDate: true } })).endDate.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("refused: a reporting campaign can't be cancelled", async () => {
    const r = await call("POST", `/campaigns/${p("rep")}/cancel`, ADMIN, { reason: "Too late" });
    expect(r.status).toBe(409);
    expect(r.text).toContain("can't be cancelled");
  });

  it("roles and tenants: a sponsor reaches only their own; analysts, sales, another sponsor and another tenant are refused", async () => {
    for (const who of [p("analyst"), p("sales"), p("rival_admin"), `${OTHER_T}_admin`, `${OTHER_T}_sp`]) {
      expect((await call("GET", `/campaigns/${p("chg")}/cancel-impact`, who)).status, who).toBe(403);
      expect((await call("POST", `/campaigns/${p("chg")}/cancel`, who, { reason: "Not mine" })).status, who).toBe(403);
    }
    expect((await call("GET", "/campaign-requests", `${OTHER_T}_admin`)).json.requests).toEqual([]);
    expect(await stateOf.campaign("chg")).toBe("STAFFING");
  });
});
