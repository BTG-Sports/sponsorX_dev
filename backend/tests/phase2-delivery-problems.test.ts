import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-11 — delivery problems settled between the seller and the sponsor
   (programme owner, 2026-10-02), against the real API and database.

     The sponsor reports a problem → the SELLER has 72 hours to answer:
       DELIVER_AGAIN (a new date + note), REFUND (the whole line), DISAGREE
       (a note, optional photo or https link).
     → the SPONSOR has 72 hours to ACCEPT (settles it: back into delivery for
       the new date, the line's refund, or confirmed) or REJECT (a note).
     → BTG's desk only when the sponsor rejects, or a side doesn't answer in
       its 72 hours. Why is stored. The desk lists only escalated issues, the
       ones settled between them, and overdue lines.
     Overdue: reminders at 1 and 3 days after the last date; BTG at 7.
     The whole exchange reads as one timeline for both sides and BTG.

   The cast: Pier Coffee DP buys from Sam Ortiz (an independent athlete) and
   from the Northgate Owls DP (Casey Lin's clinic, sold by the team). The
   Riverside Rams DP are another team; Ridge Bakery DP another sponsor; a
   second BTG tenant has its own admin. The worker's sweep is called with a
   moved clock, for this file's tenant only, and every assertion is on this
   file's own rows — never on the sweep's returned counts.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@dp-test.invalid` } : null;
  },
}));
/* The disagreement photo "has arrived" in the private bucket. */
vi.mock("../src/lib/storage", async (original) => ({ ...(await original<typeof import("../src/lib/storage")>()), checkPrivateUpload: async () => ({ ok: true as const, bytes: 2048 }) }));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-11 · delivery problems settled between seller and sponsor", { timeout: 180_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment } = await import("../src/domain/payouts");
  const { sweepDeliveries, deliveryIssues, sellerCanAnswer, sponsorCanAnswer, redeliveryDate, escalationWords, lastDateOf } = await import("../src/domain/delivery");

  const T = "dp_btg";
  const T2 = "dp_btg2";
  const E = { owls: "", rams: "", casey: "", owlsListing: "", samListing: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const sweep = (now: Date) => sweepDeliveries(now, { tenantIds: [T] });
  const emails = async () => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const mailsFor = async (template: string, key: string) => (await emails()).filter((e) => e.template === template && e.idempotencyKey.includes(key)).map((e) => e.to).sort();
  const lineOf = async (orderId: string, listingId: string) =>
    ((await call("GET", `/marketplace-orders/${orderId}`, "dp_buyer")).json.lines as { id: string; listingId: string }[]).find((l) => l.listingId === listingId)!.id;
  const ISSUE = {
    id: true, kind: true, stage: true, markedNote: true, sellerAnswer: true, sellerProofKey: true, sponsorAnswer: true, sponsorNote: true,
    escalatedAt: true, escalationReason: true, escalationNote: true, outcome: true, closingNote: true,
  } as const;
  const issueOf = (lineId: string) => prisma.deliveryIssue.findFirstOrThrow({ where: { lineId }, orderBy: { openedAt: "desc" }, select: ISSUE });
  const rowOf = (lineId: string) => prisma.orderLineDelivery.findUniqueOrThrow({
    where: { lineId },
    select: {
      orderId: true, state: true, deliveredAt: true, confirmDueAt: true, problemNote: true, redeliverOn: true, resolution: true, confirmedHow: true, confirmedBy: true,
      remindedAt: true, secondRemindedAt: true, overdueEscalatedAt: true,
    },
  });
  const adminActor = { userId: "dp_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1 OR id = $2
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'dp\\_%@dp-test.invalid' AND "tenantId" <> $1`, T, T2,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function approveTeam(id: string, name: string, manager: string) {
    await prisma.propertyOnboarding.create({ data: {
      id, tenantId: T, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Robin Hale", email: `${manager}@dp-test.invalid`, phone: "301-555-0170", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }
  async function publish(seller: string, inventoryItemId: string, title: string) {
    const l = await call("POST", "/listings", seller, { inventoryItemId, title, description: "A 90-minute session at your venue, for up to 20 kids." });
    expect(l.status, l.text).toBe(201);
    expect((await call("POST", `/listings/${l.json.id}/submit`, seller)).json.state).toBe("PUBLISHED");
    return l.json.id as string;
  }
  async function order(lines: { listingId: string; quantity: number; startsOn: string; endsOn: string }[]) {
    await call("POST", "/cart", "dp_buyer");
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", "dp_buyer", l);
      expect(r.status, r.text).toBe(201);
    }
    const hold = (await call("POST", "/cart/reserve", "dp_buyer")).json;
    const placed = await call("POST", "/marketplace-orders", "dp_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    expect(placed.status, placed.text).toBe(201);
    if (placed.json.state === "PENDING_APPROVAL") {
      expect((await call("POST", `/marketplace-orders/${placed.json.id}/decision`, "dp_admin", { decision: "APPROVE" })).json.state).toBe("APPROVED");
    }
    const link = await call("POST", `/marketplace-orders/${placed.json.id}/pay`, "dp_buyer");
    expect(link.status, link.text).toBe(200);
    await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(link.json.url), outcome: "SUCCEED" });
    const attempt = (await call("GET", `/marketplace-orders/${placed.json.id}/payment`, "dp_buyer")).json.latest;
    expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
    return placed.json.id as string;
  }
  /** One paid line of Sam's, marked delivered, with a problem reported on it. */
  async function disputedSamLine(startIn: number) {
    const id = await order([{ listingId: E.samListing, quantity: 1, startsOn: at(startIn), endsOn: at(startIn + 1) }]);
    const line = await lineOf(id, E.samListing);
    expect((await call("POST", `/sales/${line}/delivered`, "dp_sam", { note: "Session held, 14 kids." })).status).toBe(200);
    const p = await call("POST", `/deliveries/${line}/problem`, "dp_buyer", { note: "Half the session was cut short." });
    expect(p.status, p.text).toBe(200);
    return { orderId: id, line, report: p.json };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Delivery problems BTG" } });
    await prisma.tenant.create({ data: { id: T2, name: "Delivery problems other BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "dp_pier", tenantId: T, name: "Pier Coffee DP", categories: ["RESTAURANT"] },
      { id: "dp_ridge", tenantId: T, name: "Ridge Bakery DP", categories: ["RESTAURANT"] },
    ] });
    await prisma.athlete.create({ data: {
      id: "dp_ath_sam", tenantId: T, slug: "dp-sam-ortiz", legalName: "Sam Ortiz", displayName: "SAM.ORTIZ", email: "dp_sam@dp-test.invalid",
      sport: "Basketball", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "dp_admin", tenantId: T, clerkId: "dp_admin", email: "dp_admin@dp-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "dp_finance", tenantId: T, clerkId: "dp_finance", email: "dp_finance@dp-test.invalid", roles: ["FINANCE"] },
      { id: "dp_buyer", tenantId: T, clerkId: "dp_buyer", email: "dp_buyer@dp-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dp_pier" },
      { id: "dp_analyst", tenantId: T, clerkId: "dp_analyst", email: "dp_analyst@dp-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "dp_pier" },
      { id: "dp_baker", tenantId: T, clerkId: "dp_baker", email: "dp_baker@dp-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dp_ridge" },
      { id: "dp_sam", tenantId: T, clerkId: "dp_sam", email: "dp_sam@dp-test.invalid", roles: ["ATHLETE"], athleteId: "dp_ath_sam" },
      { id: "dp_admin2", tenantId: T2, clerkId: "dp_admin2", email: "dp_admin2@dp-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `dp_${kind}`, tenantId: T, ruleKey: `dp_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });

    const owls = await approveTeam("dp_onb_owls", "Northgate Owls DP", "dp_mgr");
    const rams = await approveTeam("dp_onb_rams", "Riverside Rams DP", "dp_mgr2");
    E.owls = owls.id;
    E.rams = rams.id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "dp_mgr");
    await call("GET", "/me", "dp_mgr2");
    const casey = await call("POST", "/team/roster", "dp_mgr", { legalName: "Casey Lin", displayName: "CASEY.LIN", email: "dp_casey@dp-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(casey.status, casey.text).toBe(201);
    E.casey = casey.json.id;
    const clinic = await call("POST", "/inventory", "dp_casey", { title: "Ball-handling clinic", kind: "CAMP", priceCents: 40_000, quantity: 40 });
    expect(clinic.status, clinic.text).toBe(201);
    E.owlsListing = await publish("dp_mgr", clinic.json.id, "Ball-handling clinic with Casey Lin");
    const session = await call("POST", "/inventory", "dp_sam", { title: "Shooting clinic", kind: "CAMP", priceCents: 25_000, quantity: 40 });
    expect(session.status, session.text).toBe(201);
    E.samListing = await publish("dp_sam", session.json.id, "Shooting clinic with Sam Ortiz");
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("pure rules: each side's window, the redelivery date, the reasons, the date a line is due by", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    expect(sellerCanAnswer({ stage: "SELLER_TO_ANSWER", sellerDueAt: new Date(now.getTime() + HOUR) }, now)).toBe(true);
    expect(sellerCanAnswer({ stage: "SELLER_TO_ANSWER", sellerDueAt: now }, now)).toBe(false);
    expect(sellerCanAnswer({ stage: "SPONSOR_TO_ANSWER", sellerDueAt: new Date(now.getTime() + HOUR) }, now)).toBe(false);
    expect(sponsorCanAnswer({ stage: "SPONSOR_TO_ANSWER", sponsorDueAt: new Date(now.getTime() + HOUR) }, now)).toBe(true);
    expect(sponsorCanAnswer({ stage: "ESCALATED", sponsorDueAt: new Date(now.getTime() + HOUR) }, now)).toBe(false);
    expect(redeliveryDate("2026-10-02", now).toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(() => redeliveryDate("2026-10-01", now)).toThrow(/past/);
    expect(() => redeliveryDate("2027-02-01", now)).toThrow(/within 90 days/);
    expect(() => redeliveryDate("2026-02-30", now)).toThrow(/YYYY-MM-DD/);
    expect(escalationWords("NOT_DELIVERED", new Date("2026-10-10T18:00:00Z"))).toBe("No delivery marked 7 days after 2026-10-10");
    expect(escalationWords("SELLER_NO_ANSWER")).toMatch(/72 hours/);
    const endsOn = new Date("2026-10-10T00:00:00Z");
    expect(lastDateOf({ redeliverOn: null, line: { endsOn } })).toEqual(endsOn);
    expect(lastDateOf({ redeliverOn: new Date("2026-10-20T00:00:00Z"), line: { endsOn } }).toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  describe("the seller answers first — BTG isn't involved", () => {
    let line = "";
    let issueId = "";
    it("a reported problem gives the seller 72 hours; the seller is emailed, BTG is not; the money is held", async () => {
      const d = await disputedSamLine(10);
      line = d.line;
      issueId = d.report.issueId;
      expect(d.report).toMatchObject({ state: "PROBLEM", stage: "SELLER_TO_ANSWER" });
      const due = new Date(d.report.sellerDueAt).getTime() - Date.now();
      expect(due).toBeGreaterThan(71.9 * HOUR);
      expect(due).toBeLessThanOrEqual(72 * HOUR);
      expect(await mailsFor("delivery.problemToAnswer", issueId)).toEqual(["dp_sam@dp-test.invalid"]);
      expect(await mailsFor("delivery.escalated", issueId)).toEqual([]);
      const sale = (await call("GET", `/sales/${line}`, "dp_sam")).json;
      expect(sale).toMatchObject({ state: "PROBLEM", canAnswerProblem: true, issue: { id: issueId, stage: "SELLER_TO_ANSWER", sellerCanAnswer: true, sellerAnswer: null } });
      const sponsorLine = (await call("GET", `/marketplace-orders/${d.orderId}/deliveries`, "dp_buyer")).json.lines[0];
      expect(sponsorLine).toMatchObject({ canAnswerSellerReply: false, issue: { stage: "SELLER_TO_ANSWER" } });
      expect((await call("GET", "/delivery-issues", "dp_admin")).json.problems.map((p: { id: string }) => p.id)).not.toContain(line);
      const me = (await call("GET", "/payouts/me", "dp_sam")).json;
      expect(me.checks.find((c: { key: string }) => c.key === "problem")?.ok).toBe(false);
    });

    it("only the line's own sellers answer; only the buying sponsor's admin accepts or rejects; and not out of turn", async () => {
      const answer = { answer: "DISAGREE", note: "It was a full session." };
      for (const who of ["dp_mgr", "dp_mgr2", "dp_casey", "dp_buyer", "dp_admin", "dp_finance", "dp_admin2"]) {
        expect((await call("POST", `/sales/${line}/problem-answer`, who, answer)).status, who).toBe(403);
      }
      const early = await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });
      expect(early.status).toBe(409);
      expect(early.json.error.message).toMatch(/hasn't answered yet/);
      /* BTG can't decide it while it's between them. */
      expect((await call("POST", `/delivery-issues/${line}/resolve`, "dp_admin", { decision: "REFUND", note: "No." })).status).toBe(409);
      for (const who of ["dp_analyst", "dp_baker", "dp_sam", "dp_admin", "dp_admin2"]) {
        expect((await call("POST", `/deliveries/${line}/problem-answer`, who, { decision: "ACCEPT" })).status, who).toBe(403);
      }
    });

    it("each answer carries what it needs", async () => {
      const bad = [
        { answer: "DELIVER_AGAIN", note: "Again" },
        { answer: "DELIVER_AGAIN", newDate: dayOf(new Date(Date.now() + 5 * DAY)) },
        { answer: "DISAGREE" },
        { answer: "DISAGREE", note: "Held", proofLink: "http://insecure.example" },
        { answer: "REFUND", note: "x", newDate: "2026-12-01" },
        { answer: "PARTIAL_REFUND", note: "half" },
      ];
      for (const b of bad) expect((await call("POST", `/sales/${line}/problem-answer`, "dp_sam", b)).status, JSON.stringify(b)).toBe(400);
      const past = await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DELIVER_AGAIN", newDate: dayOf(new Date(Date.now() - 2 * DAY)), note: "Again" });
      expect(past.status).toBe(422);
      const far = await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DELIVER_AGAIN", newDate: dayOf(new Date(Date.now() + 120 * DAY)), note: "Again" });
      expect(far.status).toBe(422);
      expect((await issueOf(line)).stage).toBe("SELLER_TO_ANSWER");
    });

    it("DELIVER_AGAIN accepted: the line goes back to in-delivery for the new date, both sides are told", async () => {
      const newDate = dayOf(new Date(Date.now() + 5 * DAY));
      const a = await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DELIVER_AGAIN", newDate, note: "I'll run the full 90 minutes this time." });
      expect(a.status, a.text).toBe(200);
      expect(a.json).toMatchObject({ stage: "SPONSOR_TO_ANSWER", answer: "DELIVER_AGAIN" });
      expect(new Date(a.json.sponsorDueAt).getTime() - Date.now()).toBeGreaterThan(71.9 * HOUR);
      expect(await mailsFor("delivery.sellerAnswered", issueId)).toEqual(["dp_buyer@dp-test.invalid"]);
      expect((await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "REFUND" })).status).toBe(409);
      const sponsorView = (await call("GET", `/marketplace-orders/${(await rowOf(line)).orderId}/deliveries`, "dp_buyer")).json.lines[0];
      expect(sponsorView).toMatchObject({ canAnswerSellerReply: true, issue: { stage: "SPONSOR_TO_ANSWER", sellerAnswer: { answer: "DELIVER_AGAIN", newDate, by: "Sam Ortiz" } } });

      const ok = await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });
      expect(ok.json, ok.text).toMatchObject({ decision: "ACCEPT", stage: "SETTLED", outcome: "REDELIVER", state: "IN_DELIVERY" });
      const row = await rowOf(line);
      expect(row).toMatchObject({ state: "IN_DELIVERY", deliveredAt: null, confirmDueAt: null, problemNote: null });
      expect(dayOf(row.redeliverOn!)).toBe(newDate);
      expect(await issueOf(line)).toMatchObject({ stage: "SETTLED", outcome: "REDELIVER", sponsorAnswer: "ACCEPT", markedNote: "Session held, 14 kids." });
      expect(await mailsFor("delivery.settled", issueId)).toEqual(["dp_buyer@dp-test.invalid", "dp_sam@dp-test.invalid"]);
      expect((await call("GET", `/sales/${line}`, "dp_sam")).json).toMatchObject({ state: "IN_DELIVERY", canMarkDelivered: true, lastDate: newDate, redeliverOn: newDate });
      /* Settled between them — never BTG's resolution. */
      expect(row.resolution).toBeNull();
    });

    it("the redelivery is marked: the sponsor's 24-hour window restarts, a second problem is a new exchange, and the timeline holds both", async () => {
      const m = await call("POST", `/sales/${line}/delivered`, "dp_sam", { note: "Full 90 minutes, 16 kids.", proofLink: "https://video.example/full" });
      expect(m.status, m.text).toBe(200);
      const due = new Date(m.json.confirmDueAt).getTime() - Date.now();
      expect(due).toBeGreaterThan(23.9 * HOUR);
      expect(due).toBeLessThanOrEqual(24 * HOUR);
      expect((await emails()).filter((e) => e.template === "delivery.marked" && e.idempotencyKey.includes(line))).toHaveLength(2);

      const again = await call("POST", `/deliveries/${line}/problem`, "dp_buyer", { note: "Still not the agreed drills." });
      expect(again.json).toMatchObject({ stage: "SELLER_TO_ANSWER" });
      expect(again.json.issueId).not.toBe(issueId);
      expect(await prisma.deliveryIssue.count({ where: { lineId: line } })).toBe(2);
      await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DISAGREE", note: "These were the drills on the listing.", proofLink: "https://video.example/full" });
      await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });

      const kinds = ["PAID", "MARKED_DELIVERED", "PROBLEM_REPORTED", "SELLER_ANSWERED", "SPONSOR_ACCEPTED", "SETTLED", "MARKED_DELIVERED", "PROBLEM_REPORTED", "SELLER_ANSWERED", "SPONSOR_ACCEPTED", "SETTLED"];
      for (const who of ["dp_sam", "dp_buyer", "dp_analyst", "dp_admin", "dp_finance"]) {
        const x = await call("GET", `/deliveries/${line}/exchange`, who);
        expect(x.status, `${who} ${x.text}`).toBe(200);
        expect(x.json.timeline.map((t: { kind: string }) => t.kind), who).toEqual(kinds);
        expect(x.json.issues).toHaveLength(2);
        expect(x.text).not.toMatch(/shareCents|creditCents|platformFee/);
      }
      const x = (await call("GET", `/deliveries/${line}/exchange`, "dp_buyer")).json;
      expect(x.timeline[1]).toMatchObject({ note: "Session held, 14 kids.", by: "SELLER", name: "Sam Ortiz" });
      expect(x.timeline[3]).toMatchObject({ answer: "DELIVER_AGAIN", note: "I'll run the full 90 minutes this time." });
      expect(x.timeline[6]).toMatchObject({ note: "Full 90 minutes, 16 kids.", proof: { link: "https://video.example/full", photoOf: "marked" } });
      expect(x).toMatchObject({ state: "CONFIRMED", issue: { stage: "SETTLED", outcome: { outcome: "CONFIRMED", by: "SELLER_AND_SPONSOR" } } });
      /* The seller's own sale page carries the same timeline. */
      expect((await call("GET", `/sales/${line}`, "dp_sam")).json.timeline.map((t: { kind: string }) => t.kind)).toEqual(kinds);
    });
  });

  it("REFUND accepted: only that line's books are reversed; the other line and the order carry on; BTG's desk lists it as settled", async () => {
    const id = await order([
      { listingId: E.samListing, quantity: 1, startsOn: at(20), endsOn: at(21) },
      { listingId: E.owlsListing, quantity: 1, startsOn: at(20), endsOn: at(21) },
    ]);
    const sam = await lineOf(id, E.samListing);
    const owls = await lineOf(id, E.owlsListing);
    await call("POST", `/sales/${sam}/delivered`, "dp_sam", { note: "Held." });
    await call("POST", `/sales/${owls}/delivered`, "dp_casey", { note: "Clinic held." });
    await call("POST", `/deliveries/${owls}/confirm`, "dp_buyer");
    const p = (await call("POST", `/deliveries/${sam}/problem`, "dp_buyer", { note: "Sam didn't show." })).json;
    const r = await call("POST", `/sales/${sam}/problem-answer`, "dp_sam", { answer: "REFUND", note: "Sorry — I was ill." });
    expect(r.json, r.text).toMatchObject({ stage: "SPONSOR_TO_ANSWER", answer: "REFUND" });
    /* Nothing is refunded until the sponsor accepts. */
    expect(await prisma.ledgerEntry.count({ where: { orderId: id, entryType: "REVERSAL" } })).toBe(0);
    const ok = await call("POST", `/deliveries/${sam}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });
    expect(ok.json, ok.text).toMatchObject({ outcome: "REFUNDED", state: "REFUNDED" });
    const reversed = await prisma.ledgerEntry.findMany({ where: { orderId: id, entryType: "REVERSAL" }, select: { lineId: true } });
    expect(reversed.length).toBeGreaterThan(0);
    expect(new Set(reversed.map((x) => x.lineId))).toEqual(new Set([sam]));
    expect(await prisma.ledgerEntry.count({ where: { lineId: owls, status: "REVERSED" } })).toBe(0);
    expect((await call("GET", `/marketplace-orders/${id}`, "dp_buyer")).json.state).toBe("FULFILLED");
    expect((await call("GET", "/team/ledger", "dp_mgr")).json.reconciles).toBe(true);
    expect((await call("GET", `/sales/${sam}`, "dp_sam")).json).toMatchObject({ state: "REFUNDED", resolution: null, issue: { outcome: { outcome: "REFUNDED" } } });
    const desk = (await call("GET", "/delivery-issues", "dp_admin")).json;
    expect(desk.settled.find((x: { settlement: { issueId: string } }) => x.settlement.issueId === p.issueId)).toMatchObject({ id: sam, settlement: { outcome: "REFUNDED", answer: "REFUND" } });
    expect(desk.problems.map((x: { id: string }) => x.id)).not.toContain(sam);
    /* 2S4-BE-09 — a refund the two sides agreed is a refund all the same: Pier's spending limit stops rising. */
    const limit = (await call("GET", "/sponsors/dp_pier/spending-limit", "dp_admin")).json;
    expect(limit.frozen).toMatchObject({ kind: "PROBLEM_UPHELD", orderId: id });
  });

  it("DISAGREE (with a photo) accepted: the line is confirmed by the sponsor; the photo is readable by both sides and BTG only", async () => {
    const { orderId, line } = await disputedSamLine(30);
    const grant = await call("POST", `/sales/${line}/proof`, "dp_sam", { contentType: "image/jpeg", bytes: 4096 });
    expect(grant.status, grant.text).toBe(201);
    const a = await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DISAGREE", note: "Here are the kids at the end of the session.", proofKey: grant.json.key });
    expect(a.status, a.text).toBe(200);
    const issue = await issueOf(line);
    expect(issue.sellerProofKey).toBe(grant.json.key);
    for (const who of ["dp_sam", "dp_buyer", "dp_admin"]) {
      expect((await call("GET", `/deliveries/${line}/proof?issue=${issue.id}&photo=answer`, who)).status, who).toBe(200);
    }
    for (const who of ["dp_baker", "dp_mgr2", "dp_admin2"]) expect((await call("GET", `/deliveries/${line}/proof?issue=${issue.id}`, who)).status, who).toBe(403);
    expect((await call("GET", `/deliveries/${line}/proof?issue=${issue.id}&photo=marked`, "dp_buyer")).status).toBe(404);
    const ok = await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });
    expect(ok.json).toMatchObject({ outcome: "CONFIRMED", state: "CONFIRMED" });
    expect(await rowOf(line)).toMatchObject({ state: "CONFIRMED", confirmedHow: "SPONSOR", confirmedBy: "dp_buyer" });
    expect((await call("GET", `/sales/${line}`, "dp_sam")).json.confirmedBy).toBe("SPONSOR");
    expect((await call("GET", `/marketplace-orders/${orderId}`, "dp_buyer")).json.state).toBe("FULFILLED");
  });

  it("the sponsor rejects (with a note): it goes to BTG with why; BTG decides, and the timeline shows it all", async () => {
    const { line } = await disputedSamLine(40);
    await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "DISAGREE", note: "It was the full session." });
    expect((await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "REJECT" })).status).toBe(400);
    expect((await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "REJECT", note: "  " })).status).toBe(400);
    const r = await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "REJECT", note: "We have the venue's sign-out sheet." });
    expect(r.json, r.text).toMatchObject({ decision: "REJECT", stage: "ESCALATED", state: "PROBLEM" });
    const issue = await issueOf(line);
    expect(issue).toMatchObject({ stage: "ESCALATED", escalationReason: "SPONSOR_REJECTED", sponsorAnswer: "REJECT", sponsorNote: "We have the venue's sign-out sheet." });
    expect(await mailsFor("delivery.escalated", issue.id)).toEqual(["dp_admin@dp-test.invalid"]);
    expect(await mailsFor("delivery.withBtg", issue.id)).toEqual(["dp_buyer@dp-test.invalid", "dp_sam@dp-test.invalid"]);
    expect((await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "REFUND" })).json.error.message).toMatch(/with BTG/);

    const desk = (await call("GET", "/delivery-issues", "dp_admin")).json;
    expect(desk.problems.find((x: { id: string }) => x.id === line)).toMatchObject({
      escalation: { reason: "SPONSOR_REJECTED", text: "The sponsor rejected the seller's answer" }, canDecide: true, sponsorMessage: { text: "Half the session was cut short." },
    });
    expect((await call("GET", "/delivery-issues", "dp_admin2")).json.problems.map((x: { id: string }) => x.id)).not.toContain(line);
    expect((await call("GET", `/delivery-issues/${line}`, "dp_admin2")).status).toBe(403);

    const d = await call("POST", `/delivery-issues/${line}/resolve`, "dp_admin", { decision: "CONFIRM", note: "The venue confirms a full session." });
    expect(d.json, d.text).toMatchObject({ state: "CONFIRMED", issueId: issue.id });
    expect(await issueOf(line)).toMatchObject({ stage: "RESOLVED", outcome: "CONFIRMED", closingNote: "The venue confirms a full session." });
    expect(await mailsFor("delivery.resolved", issue.id)).toEqual(["dp_buyer@dp-test.invalid", "dp_sam@dp-test.invalid"]);
    const detail = (await call("GET", `/delivery-issues/${line}`, "dp_admin")).json;
    expect(detail.timeline.map((t: { kind: string }) => t.kind)).toEqual(["PAID", "MARKED_DELIVERED", "PROBLEM_REPORTED", "SELLER_ANSWERED", "SPONSOR_REJECTED", "ESCALATED", "BTG_DECIDED"]);
    expect(detail.timeline[5]).toMatchObject({ reason: "SPONSOR_REJECTED" });
    expect(detail.history.map((h: { text: string }) => h.text)).toContain("Delivery confirmed by BTG");
    expect((await call("GET", `/deliveries/${line}/exchange`, "dp_sam")).json.timeline.at(-1)).toMatchObject({ kind: "BTG_DECIDED", note: "The venue confirms a full session." });
  });

  it("the seller doesn't answer in 72 hours: BTG takes it (once), a late answer is refused, and BTG's refund is the order's own", async () => {
    const { orderId, line } = await disputedSamLine(50);
    await sweep(new Date(Date.now() + 71 * HOUR));
    expect((await issueOf(line)).stage).toBe("SELLER_TO_ANSWER");
    const later = new Date(Date.now() + 73 * HOUR);
    await sweep(later);
    const issue = await issueOf(line);
    expect(issue).toMatchObject({ stage: "ESCALATED", escalationReason: "SELLER_NO_ANSWER", escalationNote: "The seller didn't answer within 72 hours" });
    await sweep(new Date(later.getTime() + HOUR));
    expect((await issueOf(line)).escalatedAt).toEqual(issue.escalatedAt);
    expect(await mailsFor("delivery.escalated", issue.id)).toEqual(["dp_admin@dp-test.invalid"]);
    expect((await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "REFUND" })).status).toBe(409);
    expect((await call("POST", `/delivery-issues/${line}/resolve`, "dp_admin", { decision: "REFUND", note: "No answer from the seller; refunding." })).json.state).toBe("REFUNDED");
    expect((await call("GET", `/marketplace-orders/${orderId}`, "dp_buyer")).json.state).toBe("REFUNDED");
    expect(await prisma.ledgerEntry.count({ where: { orderId, entryType: "BOOKING", status: { not: "REVERSED" } } })).toBe(0);
    expect(await issueOf(line)).toMatchObject({ stage: "RESOLVED", outcome: "REFUNDED" });
  });

  it("the sponsor doesn't answer the seller in 72 hours: BTG takes it, and a late accept is refused", async () => {
    const { line } = await disputedSamLine(60);
    await call("POST", `/sales/${line}/problem-answer`, "dp_sam", { answer: "REFUND" });
    await sweep(new Date(Date.now() + 73 * HOUR));
    expect(await issueOf(line)).toMatchObject({ stage: "ESCALATED", escalationReason: "SPONSOR_NO_ANSWER", sellerAnswer: "REFUND", sponsorAnswer: null });
    expect((await rowOf(line)).state).toBe("PROBLEM");
    const late = await call("POST", `/deliveries/${line}/problem-answer`, "dp_buyer", { decision: "ACCEPT" });
    expect(late.status).toBe(409);
    expect(late.json.error.message).toMatch(/with BTG/);
    expect((await call("GET", "/delivery-issues", "dp_admin")).json.problems.find((x: { id: string }) => x.id === line)?.escalation.reason).toBe("SPONSOR_NO_ANSWER");
  });

  describe("overdue sellers — reminders at 1 and 3 days, BTG at 7", () => {
    let line = "";
    let endsOn = new Date();
    it("a day late: the first reminder; three days late: the second — each once", async () => {
      const id = await order([{ listingId: E.owlsListing, quantity: 1, startsOn: at(2), endsOn: at(3) }]);
      line = await lineOf(id, E.owlsListing);
      endsOn = (await prisma.marketplaceOrderLine.findUniqueOrThrow({ where: { id: line }, select: { endsOn: true } })).endsOn;
      const plus = (days: number) => new Date(endsOn.getTime() + days * DAY);
      await sweep(plus(1.5));
      expect(await rowOf(line)).toMatchObject({ remindedAt: plus(1.5), secondRemindedAt: null, overdueEscalatedAt: null });
      await sweep(plus(3.5));
      await sweep(plus(3.6));
      expect(await rowOf(line)).toMatchObject({ remindedAt: plus(1.5), secondRemindedAt: plus(3.5), overdueEscalatedAt: null });
      const second = (await emails()).filter((e) => e.template === "delivery.overdue" && e.idempotencyKey.includes(`${line}:${dayOf(endsOn)}:second`));
      expect(second.map((e) => e.to).sort()).toEqual(["dp_casey@dp-test.invalid", "dp_mgr@dp-test.invalid"]);
      expect(second[0]!.data).toMatchObject({ nth: "second", handOverOn: dayOf(plus(7)) });
      expect((await emails()).filter((e) => e.template === "delivery.overdue" && e.idempotencyKey.includes(line))).toHaveLength(4);
      /* On the desk's overdue list (read at the moved clock), with both reminders. */
      expect((await deliveryIssues(adminActor, plus(3.6))).overdue.find((x) => x.id === line)).toMatchObject({ remindedAt: plus(1.5), secondRemindedAt: plus(3.5) });
    });

    it("seven days late: handed to BTG — \"no delivery marked 7 days after <date>\" — once; BTG refunds it", async () => {
      const plus = (days: number) => new Date(endsOn.getTime() + days * DAY);
      await sweep(plus(6.5));
      expect((await rowOf(line)).overdueEscalatedAt).toBeNull();
      await sweep(plus(7.5));
      await sweep(plus(7.6));
      expect((await rowOf(line)).overdueEscalatedAt).toEqual(plus(7.5));
      const issues = await prisma.deliveryIssue.findMany({ where: { lineId: line }, select: ISSUE });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ kind: "OVERDUE", stage: "ESCALATED", escalationReason: "NOT_DELIVERED", escalationNote: `No delivery marked 7 days after ${dayOf(endsOn)}` });
      expect(await mailsFor("delivery.escalated", issues[0]!.id)).toEqual(["dp_admin@dp-test.invalid"]);
      expect(await mailsFor("delivery.withBtg", issues[0]!.id)).toEqual(["dp_buyer@dp-test.invalid", "dp_casey@dp-test.invalid", "dp_mgr@dp-test.invalid"]);
      const desk = (await call("GET", "/delivery-issues", "dp_admin")).json;
      expect(desk.problems.find((x: { id: string }) => x.id === line)).toMatchObject({ state: "IN_DELIVERY", escalation: { reason: "NOT_DELIVERED" }, canDecide: true });
      expect(desk.overdue.map((x: { id: string }) => x.id)).not.toContain(line);
      expect((await call("POST", `/delivery-issues/${line}/resolve`, "dp_admin", { decision: "REFUND", note: "Never delivered; refunding." })).json.state).toBe("REFUNDED");
      /* (The sweep ran on a moved clock, so BTG's real-time decision sorts before it — compare the steps, not their order.) */
      const kinds = (await call("GET", `/deliveries/${line}/exchange`, "dp_buyer")).json.timeline.map((t: { kind: string }) => t.kind);
      expect([...kinds].sort()).toEqual(["BTG_DECIDED", "ESCALATED", "PAID", "REMINDED", "REMINDED"]);
    });

    it("a line handed over for being overdue, then marked late, comes off BTG's desk and the sponsor's 24 hours decide it", async () => {
      const id = await order([{ listingId: E.samListing, quantity: 1, startsOn: at(2), endsOn: at(3) }]);
      const late = await lineOf(id, E.samListing);
      const ends = (await prisma.marketplaceOrderLine.findUniqueOrThrow({ where: { id: late }, select: { endsOn: true } })).endsOn;
      await sweep(new Date(ends.getTime() + 8 * DAY));
      expect((await issueOf(late)).stage).toBe("ESCALATED");
      expect((await call("POST", `/sales/${late}/delivered`, "dp_sam", { note: "Held late, sorry." })).status).toBe(200);
      expect(await issueOf(late)).toMatchObject({ stage: "CLOSED", outcome: "MARKED_DELIVERED" });
      expect((await call("GET", "/delivery-issues", "dp_admin")).json.problems.map((x: { id: string }) => x.id)).not.toContain(late);
      expect((await call("POST", `/delivery-issues/${late}/resolve`, "dp_admin", { decision: "REFUND", note: "x" })).status).toBe(409);
      expect((await rowOf(late)).state).toBe("DELIVERED");
    });
  });

  it("tenant and party isolation: other sellers, other sponsors and another BTG tenant read none of it", async () => {
    const { line } = await disputedSamLine(70);
    for (const who of ["dp_mgr", "dp_mgr2", "dp_casey", "dp_baker", "dp_admin2"]) {
      expect((await call("GET", `/deliveries/${line}/exchange`, who)).status, who).toBe(403);
    }
    expect((await call("GET", "/sales", "dp_mgr2")).json.sales).toEqual([]);
    for (const who of ["dp_finance", "dp_mgr", "dp_sam", "dp_buyer", "dp_admin2"]) {
      expect((await call("POST", `/delivery-issues/${line}/resolve`, who, { decision: "CONFIRM", note: "x" })).status, who).toBe(403);
    }
  });
});
