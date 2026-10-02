import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-12 — cancelling a paid order line; 2S4-BE-13 — refunds to send
   (programme owner, 2026-10-02), against the real API and database.

     The sponsor cancels for free until 3 days before the line's first date
     (refunded at once); closer than that the seller must agree (accept →
     refunded; decline or no answer → BTG: REFUND or KEEP); on or after the
     first date, no. A seller cancels a line it can't deliver; 2 seller
     cancellations in 90 days and its new listings are held for BTG. None of
     these stops the sponsor's spending limit rising; a problem refund does.
     Every refund of a paid order leaves one RefundDue row — a card refunded
     by the stand-in at once, the rest sent by Finance by hand.

   The cast: Harbor Tea LC buys from Jo Park (an independent athlete) and the
   Bayview Gulls LC (Ari Moss's clinic). Dune Deli LC is a second sponsor
   (its own spending limit); Cedar Books LC a third, never paid. The Marsh
   Herons LC are another team; a second BTG tenant has its own admin. The
   sweep runs on a moved clock for this file's tenant only, and every
   assertion is on this file's own rows.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@lc-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-12 / 2S4-BE-13 · cancelling a paid line, and refunds to send", { timeout: 240_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment } = await import("../src/domain/payouts");
  const { sponsorLimit } = await import("../src/domain/spending-limit");
  const { recordRefund, refundSentProblems } = await import("../src/domain/refunds");
  const { cancellationTerms, cancelCutoff, cancelLine, cancellationFor, sweepDeliveries, refundCentsFor } = await import("../src/domain/delivery");
  const { cancellationReason, standingReasons } = await import("../src/domain/listing-rules");

  const T = "lc_btg";
  const T2 = "lc_btg2";
  const E = { gulls: "", herons: "", ari: "", gullsListing: "", joListing: "", joListing2: "" };
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
  const today = () => new Date().toISOString().slice(0, 10);
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const sweep = (now: Date) => sweepDeliveries(now, { tenantIds: [T] });
  const emails = async () => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const mailsFor = async (template: string, key: string) => (await emails()).filter((e) => e.template === template && e.idempotencyKey.includes(key)).map((e) => e.to).sort();
  const rowOf = (lineId: string) => prisma.orderLineDelivery.findUniqueOrThrow({
    where: { lineId }, select: { orderId: true, state: true, cancelledAt: true, cancelledBy: true, cancelledSellerType: true, cancelledSellerId: true, cancelNote: true, resolution: true },
  });
  const issueOf = (lineId: string) => prisma.deliveryIssue.findFirstOrThrow({
    where: { lineId }, orderBy: { openedAt: "desc" },
    select: { id: true, kind: true, stage: true, sellerDueAt: true, sellerAnswer: true, sellerNote: true, escalationReason: true, outcome: true, closingNote: true },
  });
  const refundsOf = (orderId: string) => prisma.refundDue.findMany({
    where: { orderId }, orderBy: { createdAt: "asc" },
    select: { id: true, lineId: true, amountCents: true, cause: true, paidVia: true, state: true, method: true, reference: true, sentBy: true, provider: true },
  });
  const orderOf = (id: string) => prisma.marketplaceOrder.findUniqueOrThrow({ where: { id }, select: { state: true, refundCause: true, totalCents: true } });
  const adminActor = { userId: "lc_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
  const buyerActor = { userId: "lc_buyer", tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: "lc_harbor", athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1 OR id = $2
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'lc\\_%@lc-test.invalid' AND "tenantId" <> $1`, T, T2,
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
      contacts: [{ name: "Robin Hale", email: `${manager}@lc-test.invalid`, phone: "301-555-0170", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }
  async function listing(seller: string, inventoryItemId: string, title: string) {
    const l = await call("POST", "/listings", seller, { inventoryItemId, title, description: "A 90-minute session at your venue, for up to 20 kids." });
    expect(l.status, l.text).toBe(201);
    const s = await call("POST", `/listings/${l.json.id}/submit`, seller);
    expect(s.status, s.text).toBe(200);
    return { id: l.json.id as string, state: s.json.state as string, hold: s.json.hold as { message: string; accountCheck: boolean } | null };
  }
  async function item(seller: string, title: string, priceCents = 30_000) {
    const r = await call("POST", "/inventory", seller, { title, kind: "CAMP", priceCents, quantity: 40 });
    expect(r.status, r.text).toBe(201);
    return r.json.id as string;
  }
  /** Place and pay an order: by card (the stand-in), by bank transfer (BTG records it), or not at all. */
  async function order(buyer: string, lines: { listingId: string; quantity: number; startsOn: string; endsOn: string }[], pay: "CARD" | "BANK" | "NONE" = "CARD") {
    await call("POST", "/cart", buyer);
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", buyer, l);
      expect(r.status, r.text).toBe(201);
    }
    const hold = (await call("POST", "/cart/reserve", buyer)).json;
    const placed = await call("POST", "/marketplace-orders", buyer, placeOrderBody(hold.id, `${T}_order_terms`));
    expect(placed.status, placed.text).toBe(201);
    if (placed.json.state === "PENDING_APPROVAL") {
      expect((await call("POST", `/marketplace-orders/${placed.json.id}/decision`, "lc_admin", { decision: "APPROVE" })).json.state).toBe("APPROVED");
    }
    if (pay === "CARD") {
      const link = await call("POST", `/marketplace-orders/${placed.json.id}/pay`, buyer);
      expect(link.status, link.text).toBe(200);
      await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(link.json.url), outcome: "SUCCEED" });
      const attempt = (await call("GET", `/marketplace-orders/${placed.json.id}/payment`, buyer)).json.latest;
      expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
    }
    if (pay === "BANK") {
      const paid = await call("POST", `/marketplace-orders/${placed.json.id}/transition`, "lc_finance", {
        to: "PAID", payment: { method: "BANK_TRANSFER", reference: "BT-2026-77", receivedOn: today() },
      });
      expect(paid.status, paid.text).toBe(200);
    }
    const lineIds = ((await call("GET", `/marketplace-orders/${placed.json.id}`, buyer)).json.lines as { id: string; listingId: string }[]);
    return { orderId: placed.json.id as string, lines: lineIds };
  }
  /** One paid line of Jo's, first date `startIn` days ahead. */
  async function joLine(startIn: number, pay: "CARD" | "BANK" = "CARD", buyer = "lc_buyer") {
    const o = await order(buyer, [{ listingId: E.joListing, quantity: 1, startsOn: at(startIn), endsOn: at(startIn + 1) }], pay);
    return { orderId: o.orderId, line: o.lines[0]!.id };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Line cancellation BTG" } });
    await prisma.tenant.create({ data: { id: T2, name: "Line cancellation other BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "lc_harbor", tenantId: T, name: "Harbor Tea LC", categories: ["RESTAURANT"] },
      { id: "lc_dune", tenantId: T, name: "Dune Deli LC", categories: ["RESTAURANT"] },
      { id: "lc_cedar", tenantId: T, name: "Cedar Books LC", categories: ["RESTAURANT"] },
    ] });
    await prisma.athlete.create({ data: {
      id: "lc_ath_jo", tenantId: T, slug: "lc-jo-park", legalName: "Jo Park", displayName: "JO.PARK", email: "lc_jo@lc-test.invalid",
      sport: "Basketball", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "lc_admin", tenantId: T, clerkId: "lc_admin", email: "lc_admin@lc-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lc_finance", tenantId: T, clerkId: "lc_finance", email: "lc_finance@lc-test.invalid", roles: ["FINANCE"] },
      { id: "lc_buyer", tenantId: T, clerkId: "lc_buyer", email: "lc_buyer@lc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "lc_harbor" },
      { id: "lc_analyst", tenantId: T, clerkId: "lc_analyst", email: "lc_analyst@lc-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "lc_harbor" },
      { id: "lc_dune_buyer", tenantId: T, clerkId: "lc_dune_buyer", email: "lc_dune_buyer@lc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "lc_dune" },
      { id: "lc_cedar_buyer", tenantId: T, clerkId: "lc_cedar_buyer", email: "lc_cedar_buyer@lc-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "lc_cedar" },
      { id: "lc_jo", tenantId: T, clerkId: "lc_jo", email: "lc_jo@lc-test.invalid", roles: ["ATHLETE"], athleteId: "lc_ath_jo" },
      { id: "lc_admin2", tenantId: T2, clerkId: "lc_admin2", email: "lc_admin2@lc-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lc_finance2", tenantId: T2, clerkId: "lc_finance2", email: "lc_finance2@lc-test.invalid", roles: ["FINANCE"] },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `lc_${kind}`, tenantId: T, ruleKey: `lc_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });

    const gulls = await approveTeam("lc_onb_gulls", "Bayview Gulls LC", "lc_mgr");
    const herons = await approveTeam("lc_onb_herons", "Marsh Herons LC", "lc_mgr2");
    E.gulls = gulls.id;
    E.herons = herons.id;
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "lc_mgr");
    await call("GET", "/me", "lc_mgr2");
    const ari = await call("POST", "/team/roster", "lc_mgr", { legalName: "Ari Moss", displayName: "ARI.MOSS", email: "lc_ari@lc-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(ari.status, ari.text).toBe(201);
    E.ari = ari.json.id;
    const clinic = await call("POST", "/inventory", "lc_ari", { title: "Footwork clinic", kind: "CAMP", priceCents: 40_000, quantity: 40 });
    expect(clinic.status, clinic.text).toBe(201);
    const g = await listing("lc_mgr", clinic.json.id, "Footwork clinic with Ari Moss");
    expect(g.state).toBe("PUBLISHED");
    E.gullsListing = g.id;
    const jo = await listing("lc_jo", await item("lc_jo", "Passing clinic"), "Passing clinic with Jo Park");
    expect(jo.state).toBe("PUBLISHED");
    E.joListing = jo.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("pure rules: the cut-off, the seller's deadline, the refund, the standing words", () => {
    const startsOn = new Date("2026-10-20T15:00:00Z");
    const { firstDate, firstDateStart, freeUntil } = cancelCutoff(startsOn);
    expect(firstDate).toBe("2026-10-20");
    expect(firstDateStart.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(freeUntil.toISOString()).toBe("2026-10-17T00:00:00.000Z");
    const base = { orderState: "PAID", state: "IN_DELIVERY", startsOn, refundCents: 1000, openIssue: null };
    expect(cancellationTerms(base, new Date("2026-10-16T23:59:00Z"))).toMatchObject({ canCancel: true, free: true, needsSellerAgreement: false, sellerAnswerBy: null });
    const late = cancellationTerms(base, new Date("2026-10-17T00:00:00Z"));
    expect(late).toMatchObject({ canCancel: true, free: false, needsSellerAgreement: true });
    expect(late.sellerAnswerBy!.toISOString()).toBe("2026-10-20T00:00:00.000Z"); // 72 hours would pass the first date's start
    /* The cut-off is 72 hours before the first date starts, so after it the first date always comes first. */
    expect(cancellationTerms(base, new Date("2026-10-19T23:00:00Z")).sellerAnswerBy!.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    const onTheDay = cancellationTerms(base, new Date("2026-10-20T00:00:00Z"));
    expect(onTheDay).toMatchObject({ canCancel: false });
    expect(onTheDay.blockedReason).toMatch(/Report a problem/);
    expect(cancellationTerms({ ...base, state: "DELIVERED" }, new Date("2026-10-01")).blockedReason).toMatch(/Report a problem/);
    expect(cancellationTerms({ ...base, state: "UNPAID", orderState: "AWAITING_PAYMENT" }, new Date("2026-10-01")).blockedReason).toMatch(/isn't paid/);
    expect(refundCentsFor({ lineId: "a", lineTotalCents: 300, orderTotalCents: 1000 }, [{ lineId: "a", state: "IN_DELIVERY" }, { lineId: "b", state: "IN_DELIVERY" }], 0)).toBe(300);
    expect(refundCentsFor({ lineId: "a", lineTotalCents: 300, orderTotalCents: 1000 }, [{ lineId: "a", state: "IN_DELIVERY" }, { lineId: "b", state: "REFUNDED" }], 700)).toBe(300);
    expect(cancellationReason(1)).toBeNull();
    expect(cancellationReason(2)).toBe("Seller cancelled 2 sold sessions in the last 90 days");
    expect(standingReasons({ sellerCancellations: 3 })).toEqual(["Seller cancelled 3 sold sessions in the last 90 days"]);
    expect(refundSentProblems({ method: "BANK_TRANSFER", reference: "4111 1111 1111 1111", sentOn: "2026-10-01" }, new Date("2026-10-02"))).toEqual([expect.stringMatching(/not a card number/)]);
    expect(refundSentProblems({ method: "BANK_TRANSFER", reference: "BT-1", sentOn: "2026-10-03" }, new Date("2026-10-02"))).toEqual([expect.stringMatching(/not in the future/)]);
  });

  describe("the sponsor cancels before the cut-off — free, refunded at once", () => {
    let line = "";
    let orderId = "";
    it("the terms say so; only the sponsor's admin may act; a seller or another sponsor can't read them", async () => {
      ({ line, orderId } = await joLine(10));
      const t = await call("GET", `/deliveries/${line}/cancellation`, "lc_buyer");
      expect(t.status, t.text).toBe(200);
      expect(t.json).toMatchObject({ lineId: line, orderId, canCancel: true, free: true, needsSellerAgreement: false, sellerAnswerBy: null, blockedReason: null, refundCents: 30_000, freeCancelDays: 3 });
      expect(new Date(t.json.freeUntil).getTime()).toBe(cancelCutoff(new Date(at(10))).freeUntil.getTime());
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_analyst")).json).toMatchObject({ canCancel: false, blockedReason: expect.stringMatching(/sponsor's admin/) });
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_admin")).json).toMatchObject({ canCancel: false, free: true });
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_jo")).status).toBe(403);
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_dune_buyer")).status).toBe(404);
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_admin2")).status).toBe(404);
      for (const who of ["lc_analyst", "lc_admin", "lc_finance", "lc_jo", "lc_mgr"]) {
        expect((await call("POST", `/deliveries/${line}/cancel`, who, {})).status, who).toBe(403);
      }
      expect((await call("POST", `/deliveries/${line}/cancel`, "lc_dune_buyer", {})).status).toBe(404);
      expect((await call("POST", `/deliveries/${line}/cancel`, "lc_admin2", {})).status).toBe(403);
      expect((await rowOf(line)).state).toBe("IN_DELIVERY");
    });

    it("cancelling refunds it at once (the last line: the whole order), the card is refunded by the stand-in, both sides are told", async () => {
      const c = await call("POST", `/deliveries/${line}/cancel`, "lc_buyer", {});
      expect(c.status, c.text).toBe(200);
      expect(c.json).toMatchObject({ outcome: "REFUNDED", lineId: line, state: "REFUNDED", refundCents: 30_000, refund: { amountCents: 30_000, state: "SENT" } });
      expect(await rowOf(line)).toMatchObject({ state: "REFUNDED", cancelledBy: "SPONSOR", cancelledSellerType: null, cancelNote: null });
      expect(await orderOf(orderId)).toMatchObject({ state: "REFUNDED", refundCause: "CANCELLATION" });
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({
        lineId: line, amountCents: 30_000, cause: "SPONSOR_CANCELLED", paidVia: "CARD", state: "SENT", method: "CARD", sentBy: "system", provider: "standin",
        reference: expect.stringMatching(/^standin_re_/),
      })]);
      expect(await mailsFor("delivery.cancelConfirmed", line)).toEqual(["lc_buyer@lc-test.invalid"]);
      expect(await mailsFor("sale.lineCancelled", line)).toEqual(["lc_jo@lc-test.invalid"]);
      expect(await mailsFor("refund.sent", c.json.refund.id)).toEqual(["lc_buyer@lc-test.invalid"]);
      /* Again: nothing more happens. */
      const again = await call("POST", `/deliveries/${line}/cancel`, "lc_buyer", {});
      expect(again.status).toBe(409);
      expect(again.json.error.message).toMatch(/already been refunded/);
      expect(await refundsOf(orderId)).toHaveLength(1);
      /* The sponsor's order reads show it, without a method or a reference. */
      const o = await call("GET", `/marketplace-orders/${orderId}`, "lc_buyer");
      expect(o.json.refunds).toEqual([expect.objectContaining({ lineId: line, amountCents: 30_000, state: "SENT", text: expect.stringMatching(/^Refund sent on \d{4}-/) })]);
      expect(o.text).not.toMatch(/standin_re_|"method"|"reference"/);
      const d = await call("GET", `/marketplace-orders/${orderId}/deliveries`, "lc_buyer");
      expect(d.json.lines[0]).toMatchObject({ state: "REFUNDED", cancelled: { by: "SPONSOR" }, refund: { state: "SENT" }, cancellation: { canCancel: false } });
      expect(d.json.lines[0].timeline.map((x: { kind: string }) => x.kind)).toContain("CANCELLED");
      expect(d.text).not.toMatch(/standin_re_/);
    });

    it("two lines: the first is refunded alone (the order carries on), the second takes the rest of the order", async () => {
      const o = await order("lc_buyer", [
        { listingId: E.joListing, quantity: 1, startsOn: at(20), endsOn: at(21) },
        { listingId: E.gullsListing, quantity: 2, startsOn: at(22), endsOn: at(23) },
      ], "BANK");
      const [joL, gullsL] = [o.lines.find((l) => l.listingId === E.joListing)!.id, o.lines.find((l) => l.listingId === E.gullsListing)!.id];
      const terms = (await call("GET", `/deliveries/${joL}/cancellation`, "lc_buyer")).json;
      expect(terms.refundCents).toBe(30_000);
      expect((await call("POST", `/deliveries/${joL}/cancel`, "lc_buyer", { reason: "Event moved indoors" })).json).toMatchObject({ outcome: "REFUNDED", refund: { state: "OPEN", amountCents: 30_000 } });
      expect((await orderOf(o.orderId)).state).toBe("PAID");
      expect((await rowOf(joL)).cancelNote).toBe("Event moved indoors");
      const total = (await orderOf(o.orderId)).totalCents;
      expect((await call("GET", `/deliveries/${gullsL}/cancellation`, "lc_buyer")).json.refundCents).toBe(total - 30_000);
      expect((await call("POST", `/deliveries/${gullsL}/cancel`, "lc_buyer", {})).status).toBe(200);
      expect(await orderOf(o.orderId)).toMatchObject({ state: "REFUNDED", refundCause: "CANCELLATION" });
      const refunds = await refundsOf(o.orderId);
      expect(refunds.map((r) => [r.lineId, r.cause, r.state, r.paidVia])).toEqual([[joL, "SPONSOR_CANCELLED", "OPEN", "BANK_TRANSFER"], [gullsL, "SPONSOR_CANCELLED", "OPEN", "BANK_TRANSFER"]]);
      expect(refunds.reduce((s, r) => s + r.amountCents, 0)).toBe(total);
      expect(await mailsFor("sale.lineCancelled", gullsL)).toEqual(["lc_ari@lc-test.invalid", "lc_mgr@lc-test.invalid"]);
    });

    it("two clicks at once refund once", async () => {
      const { orderId: id, line: l } = await joLine(30, "BANK");
      const [a, b] = await Promise.all([call("POST", `/deliveries/${l}/cancel`, "lc_buyer", {}), call("POST", `/deliveries/${l}/cancel`, "lc_buyer", {})]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await refundsOf(id)).toHaveLength(1);
      expect((await prisma.ledgerEntry.count({ where: { orderId: id, entryType: "REVERSAL" } }))).toBeGreaterThan(0);
    });

    it("the sponsor and the seller cancelling the same line at once: one wins, one refund", async () => {
      const { orderId: id, line: l } = await joLine(31, "BANK");
      const [a, b] = await Promise.all([
        call("POST", `/deliveries/${l}/cancel`, "lc_buyer", {}),
        call("POST", `/sales/${l}/cancel`, "lc_jo", { reason: "Injured" }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await refundsOf(id)).toHaveLength(1);
      /* Whoever won is the one recorded — and a seller's cancellation only if the seller won. */
      const row = await rowOf(l);
      expect(row.cancelledBy).toBe(a.status === 200 ? "SPONSOR" : "SELLER");
      if (row.cancelledBy === "SELLER") {
        /* Not this file's standing test: take it back out of the 90 days. */
        await prisma.orderLineDelivery.update({ where: { lineId: l }, data: { cancelledAt: new Date(Date.now() - 200 * DAY) } });
      }
    });
  });

  describe("after the cut-off the seller is asked", () => {
    let line = "";
    let orderId = "";
    it("a reason is required; the seller has until the first date starts; the seller is emailed the deadline", async () => {
      ({ line, orderId } = await joLine(2));
      const t = (await call("GET", `/deliveries/${line}/cancellation`, "lc_buyer")).json;
      const { firstDateStart } = cancelCutoff(new Date(at(2)));
      expect(t).toMatchObject({ canCancel: true, free: false, needsSellerAgreement: true });
      expect(new Date(t.sellerAnswerBy).getTime()).toBe(firstDateStart.getTime());
      const none = await call("POST", `/deliveries/${line}/cancel`, "lc_buyer", {});
      expect(none.status).toBe(422);
      const asked = await call("POST", `/deliveries/${line}/cancel`, "lc_buyer", { reason: "Our venue flooded" });
      expect(asked.status, asked.text).toBe(200);
      expect(asked.json).toMatchObject({ outcome: "ASKED_SELLER", state: "IN_DELIVERY", stage: "SELLER_TO_ANSWER", refundCents: 30_000 });
      expect(new Date(asked.json.sellerAnswerBy).getTime()).toBe(firstDateStart.getTime());
      expect(await issueOf(line)).toMatchObject({ kind: "CANCELLATION", stage: "SELLER_TO_ANSWER" });
      expect(await mailsFor("sale.cancellationRequested", asked.json.issueId)).toEqual(["lc_jo@lc-test.invalid"]);
      expect(await refundsOf(orderId)).toEqual([]);
      /* Asked once: the terms now say it's waiting. */
      expect((await call("GET", `/deliveries/${line}/cancellation`, "lc_buyer")).json).toMatchObject({ canCancel: false, request: { stage: "SELLER_TO_ANSWER" } });
      expect((await call("POST", `/deliveries/${line}/cancel`, "lc_buyer", { reason: "again" })).status).toBe(409);
    });

    it("the seller's sale shows the request; it can't be marked delivered or cancelled outright meanwhile", async () => {
      const sale = (await call("GET", `/sales/${line}`, "lc_jo")).json;
      expect(sale).toMatchObject({ canAnswerCancellation: true, canMarkDelivered: false, issue: { kind: "CANCELLATION", stage: "SELLER_TO_ANSWER", sellerCanAnswer: true } });
      expect((await call("POST", `/sales/${line}/delivered`, "lc_jo", { note: "Held it" })).status).toBe(409);
      const c = await call("POST", `/sales/${line}/cancel`, "lc_jo", { reason: "x" });
      expect(c.status).toBe(409);
      expect(c.json.error.message).toMatch(/accept their request/);
      for (const who of ["lc_mgr", "lc_mgr2", "lc_buyer", "lc_admin"]) {
        expect((await call("POST", `/sales/${line}/cancellation-answer`, who, { decision: "ACCEPT" })).status, who).toBeGreaterThanOrEqual(403);
      }
      expect((await call("POST", `/sales/${line}/cancellation-answer`, "lc_jo", { decision: "DECLINE" })).status).toBe(400);
    });

    it("ACCEPT: refunded (settled between them), the sponsor is told — a second answer changes nothing", async () => {
      const a = await call("POST", `/sales/${line}/cancellation-answer`, "lc_jo", { decision: "ACCEPT" });
      expect(a.status, a.text).toBe(200);
      expect(a.json).toMatchObject({ decision: "ACCEPT", stage: "SETTLED", state: "REFUNDED", refund: { state: "SENT", amountCents: 30_000 } });
      expect(await issueOf(line)).toMatchObject({ stage: "SETTLED", outcome: "REFUNDED", sellerAnswer: "ACCEPT" });
      expect(await rowOf(line)).toMatchObject({ state: "REFUNDED", cancelledBy: "AGREED", cancelNote: "Our venue flooded" });
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "CANCELLATION_AGREED", state: "SENT" })]);
      expect(await mailsFor("delivery.cancellationAnswered", a.json.issueId)).toEqual(["lc_buyer@lc-test.invalid"]);
      expect((await call("POST", `/sales/${line}/cancellation-answer`, "lc_jo", { decision: "ACCEPT" })).status).toBe(409);
      expect(await refundsOf(orderId)).toHaveLength(1);
      const kinds = (await call("GET", `/deliveries/${line}/exchange`, "lc_buyer")).json.timeline.map((x: { kind: string }) => x.kind);
      expect(kinds).toEqual(["PAID", "CANCELLATION_REQUESTED", "CANCELLATION_ACCEPTED", "SETTLED"]);
      /* BTG's desk lists it with the settled ones, never to decide. */
      const desk = (await call("GET", "/delivery-issues", "lc_admin")).json;
      expect(desk.problems.map((x: { id: string }) => x.id)).not.toContain(line);
      expect(desk.settled.find((x: { id: string }) => x.id === line)).toMatchObject({ settlement: { kind: "CANCELLATION", outcome: "REFUNDED" } });
    });

    it("DECLINE (a reason): BTG decides — REFUND cancels and refunds it; BTG and both sides are told", async () => {
      const { orderId: id, line: l } = await joLine(2, "BANK");
      const asked = (await call("POST", `/deliveries/${l}/cancel`, "lc_buyer", { reason: "Budget cut" })).json;
      const d = await call("POST", `/sales/${l}/cancellation-answer`, "lc_jo", { decision: "DECLINE", reason: "I've already booked the gym" });
      expect(d.status, d.text).toBe(200);
      expect(d.json).toMatchObject({ decision: "DECLINE", stage: "ESCALATED", state: "IN_DELIVERY", refund: null });
      expect(await issueOf(l)).toMatchObject({ stage: "ESCALATED", escalationReason: "SELLER_DECLINED_CANCELLATION", sellerNote: "I've already booked the gym" });
      expect(await mailsFor("delivery.cancellationEscalated", asked.issueId)).toEqual(["lc_admin@lc-test.invalid"]);
      expect(await mailsFor("delivery.cancellationAnswered", asked.issueId)).toEqual(["lc_buyer@lc-test.invalid"]);
      expect(await mailsFor("delivery.withBtg", asked.issueId)).toEqual(["lc_jo@lc-test.invalid"]);
      const desk = (await call("GET", "/delivery-issues", "lc_admin")).json.problems.find((x: { id: string }) => x.id === l);
      expect(desk).toMatchObject({
        state: "IN_DELIVERY", canDecide: true, decisions: ["REFUND", "KEEP"],
        issue: { kind: "CANCELLATION", stage: "ESCALATED" }, escalation: { reason: "SELLER_DECLINED_CANCELLATION", text: "The seller declined the sponsor's request to cancel" },
        sponsorMessage: { text: "Budget cut" }, sellerNote: { text: "I've already booked the gym" },
      });
      expect((await call("POST", `/delivery-issues/${l}/resolve`, "lc_admin", { decision: "CONFIRM", note: "x" })).status).toBe(422);
      for (const who of ["lc_finance", "lc_buyer", "lc_jo", "lc_admin2"]) {
        expect((await call("POST", `/delivery-issues/${l}/resolve`, who, { decision: "REFUND", note: "x" })).status, who).toBe(403);
      }
      const r = await call("POST", `/delivery-issues/${l}/resolve`, "lc_admin", { decision: "REFUND", note: "The sponsor gave notice; refunding." });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ kind: "CANCELLATION", decision: "REFUND", state: "REFUNDED" });
      expect(await rowOf(l)).toMatchObject({ state: "REFUNDED", cancelledBy: "BTG", resolution: "REFUNDED" });
      expect(await issueOf(l)).toMatchObject({ stage: "RESOLVED", outcome: "REFUNDED" });
      expect(await refundsOf(id)).toEqual([expect.objectContaining({ cause: "BTG_DECIDED", state: "OPEN", paidVia: "BANK_TRANSFER" })]);
      expect(await orderOf(id)).toMatchObject({ state: "REFUNDED", refundCause: "CANCELLATION" });
      expect(await mailsFor("delivery.resolved", asked.issueId)).toEqual(["lc_buyer@lc-test.invalid", "lc_jo@lc-test.invalid"]);
      /* Twice: refused, and still one refund. */
      expect((await call("POST", `/delivery-issues/${l}/resolve`, "lc_admin", { decision: "REFUND", note: "again" })).status).toBe(409);
      expect(await refundsOf(id)).toHaveLength(1);
    });

    it("no answer by the deadline: the sweep hands it to BTG; KEEP closes it and the line goes ahead", async () => {
      const { orderId: id, line: l } = await joLine(2, "BANK");
      const asked = (await call("POST", `/deliveries/${l}/cancel`, "lc_buyer", { reason: "Change of plans" })).json;
      const due = new Date(asked.sellerAnswerBy);
      await sweep(new Date(due.getTime() - 60_000));
      expect((await issueOf(l)).stage).toBe("SELLER_TO_ANSWER");
      await sweep(new Date(due.getTime() + 60_000));
      expect(await issueOf(l)).toMatchObject({ stage: "ESCALATED", escalationReason: "SELLER_DIDNT_ANSWER_CANCELLATION" });
      await sweep(new Date(due.getTime() + 120_000));
      expect(await mailsFor("delivery.cancellationEscalated", asked.issueId)).toEqual(["lc_admin@lc-test.invalid"]);
      expect(await mailsFor("delivery.withBtg", asked.issueId)).toEqual(["lc_buyer@lc-test.invalid", "lc_jo@lc-test.invalid"]);
      /* Too late for the seller now. */
      expect((await call("POST", `/sales/${l}/cancellation-answer`, "lc_jo", { decision: "ACCEPT" })).status).toBe(409);
      const k = await call("POST", `/delivery-issues/${l}/resolve`, "lc_admin", { decision: "KEEP", note: "Inside the 3 days and the seller is ready; it goes ahead." });
      expect(k.status, k.text).toBe(200);
      expect(k.json).toMatchObject({ decision: "KEEP", state: "IN_DELIVERY" });
      expect(await issueOf(l)).toMatchObject({ stage: "RESOLVED", outcome: "KEPT", closingNote: "Inside the 3 days and the seller is ready; it goes ahead." });
      expect((await rowOf(l)).state).toBe("IN_DELIVERY");
      expect(await refundsOf(id)).toEqual([]);
      expect(await mailsFor("delivery.resolved", asked.issueId)).toEqual(["lc_buyer@lc-test.invalid", "lc_jo@lc-test.invalid"]);
      const ex = (await call("GET", `/deliveries/${l}/exchange`, "lc_jo")).json;
      /* (The sweep ran on a moved clock, so BTG's real-time decision sorts before it — compare the steps, not their order.) */
      expect(ex.timeline.map((x: { kind: string }) => x.kind).sort()).toEqual(["BTG_DECIDED", "CANCELLATION_REQUESTED", "ESCALATED", "PAID"]);
      /* Kept: the seller delivers it as usual. */
      expect((await call("POST", `/sales/${l}/delivered`, "lc_jo", { note: "Session held." })).status).toBe(200);
    });

    it("the seller's answer racing the sweep: one of them wins, and at most one refund", async () => {
      const { orderId: id, line: l } = await joLine(2, "BANK");
      const asked = (await call("POST", `/deliveries/${l}/cancel`, "lc_buyer", { reason: "Rain" })).json;
      const [answer] = await Promise.all([
        call("POST", `/sales/${l}/cancellation-answer`, "lc_jo", { decision: "ACCEPT" }),
        sweep(new Date(new Date(asked.sellerAnswerBy).getTime() + 60_000)),
      ]);
      const issue = await issueOf(l);
      if (answer.status === 200) {
        expect(issue).toMatchObject({ stage: "SETTLED", outcome: "REFUNDED" });
        expect((await rowOf(l)).state).toBe("REFUNDED");
        expect(await refundsOf(id)).toHaveLength(1);
      } else {
        expect(answer.status).toBe(409);
        expect(issue.stage).toBe("ESCALATED");
        expect((await rowOf(l)).state).toBe("IN_DELIVERY");
        expect(await refundsOf(id)).toEqual([]);
        await call("POST", `/delivery-issues/${l}/resolve`, "lc_admin", { decision: "KEEP", note: "Race test: kept." });
      }
    });

    it("on or after the first date the sponsor can't cancel — 409, Report a problem", async () => {
      const { line: l } = await joLine(6, "BANK");
      const first = cancelCutoff(new Date(at(6))).firstDateStart;
      const onTheDay = new Date(first.getTime() + HOUR);
      const t = await cancellationFor(buyerActor, l, onTheDay);
      expect(t).toMatchObject({ canCancel: false });
      expect(t.blockedReason).toMatch(/has started.*Report a problem/);
      await expect(cancelLine(buyerActor, l, { reason: "Too late?" }, onTheDay)).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/Report a problem/) });
      await expect(cancelLine(buyerActor, l, {}, new Date(first.getTime() + 3 * DAY))).rejects.toMatchObject({ status: 409 });
      expect((await rowOf(l)).state).toBe("IN_DELIVERY");
      /* A delivered line: "Report a problem" too, through the route. */
      expect((await call("POST", `/sales/${l}/delivered`, "lc_jo", { note: "Held." })).status).toBe(200);
      const c = await call("POST", `/deliveries/${l}/cancel`, "lc_buyer", { reason: "x" });
      expect(c.status).toBe(409);
      expect(c.json.error.message).toMatch(/Report a problem/);
    });
  });

  describe("the seller cancels a line it can't deliver", () => {
    it("refunded in full at once, the sponsor emailed, the cancellation recorded against the seller; a reason is required", async () => {
      const { orderId, line } = await joLine(40, "BANK");
      expect((await call("GET", `/sales/${line}`, "lc_jo")).json.cancellation).toMatchObject({ canCancel: true, cancellationsLast90Days: 0, limit: 2, windowDays: 90 });
      expect((await call("POST", `/sales/${line}/cancel`, "lc_jo", {})).status).toBe(400);
      expect((await call("POST", `/sales/${line}/cancel`, "lc_mgr2", { reason: "x" })).status).toBe(404);
      for (const who of ["lc_buyer", "lc_admin", "lc_finance"]) expect((await call("POST", `/sales/${line}/cancel`, who, { reason: "x" })).status, who).toBe(403);
      const c = await call("POST", `/sales/${line}/cancel`, "lc_jo", { reason: "I sprained my ankle" });
      expect(c.status, c.text).toBe(200);
      expect(c.json).toMatchObject({ state: "REFUNDED", refund: { state: "OPEN", amountCents: 30_000 }, cancellationsLast90Days: 1, listingsChecked: false });
      expect(await rowOf(line)).toMatchObject({ state: "REFUNDED", cancelledBy: "SELLER", cancelledSellerType: "ATHLETE", cancelledSellerId: "lc_ath_jo", cancelNote: "I sprained my ankle" });
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "SELLER_CANCELLED", state: "OPEN" })]);
      expect(await orderOf(orderId)).toMatchObject({ state: "REFUNDED", refundCause: "CANCELLATION" });
      expect(await mailsFor("delivery.sellerCancelled", line)).toEqual(["lc_buyer@lc-test.invalid"]);
      expect((await call("POST", `/sales/${line}/cancel`, "lc_jo", { reason: "again" })).status).toBe(409);
    });

    it("after its date, never delivered and handed to BTG as overdue: the seller can still cancel, and BTG's desk clears", async () => {
      const { orderId, line } = await joLine(3, "BANK");
      const ends = (await prisma.marketplaceOrderLine.findUniqueOrThrow({ where: { id: line }, select: { endsOn: true } })).endsOn;
      await sweep(new Date(ends.getTime() + 8 * DAY));
      expect(await issueOf(line)).toMatchObject({ kind: "OVERDUE", stage: "ESCALATED" });
      const c = await call("POST", `/sales/${line}/cancel`, "lc_jo", { reason: "The school closed; I couldn't run it" });
      expect(c.status, c.text).toBe(200);
      expect(await issueOf(line)).toMatchObject({ stage: "CLOSED", outcome: "SELLER_CANCELLED" });
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "SELLER_CANCELLED" })]);
      expect((await call("GET", "/delivery-issues", "lc_admin")).json.problems.map((x: { id: string }) => x.id)).not.toContain(line);
    });

    it("the standing rule: the second cancellation within 90 days holds new listings for BTG; older ones don't count", async () => {
      /* Two cancellations so far, both within 90 days — the earlier one taken back out of the window first. */
      const mine = await prisma.orderLineDelivery.findMany({ where: { cancelledBy: "SELLER", cancelledSellerId: "lc_ath_jo", cancelledAt: { gt: new Date(Date.now() - 90 * DAY) } }, select: { lineId: true }, orderBy: { cancelledAt: "asc" } });
      expect(mine).toHaveLength(2);
      await prisma.orderLineDelivery.update({ where: { lineId: mine[0]!.lineId }, data: { cancelledAt: new Date(Date.now() - 91 * DAY) } });
      /* One in the window: a new listing still goes live on its own. */
      const ok = await listing("lc_jo", await item("lc_jo", "Defense clinic"), "Defense clinic with Jo Park");
      expect(ok.state).toBe("PUBLISHED");
      expect((await call("GET", `/sales/${mine[1]!.lineId}`, "lc_jo")).json.cancellation).toMatchObject({ cancellationsLast90Days: 1, warning: expect.stringMatching(/Cancelling this one means BTG checks your new listings/) });
      /* The second within 90 days. */
      const { line } = await joLine(41, "BANK");
      const c = (await call("POST", `/sales/${line}/cancel`, "lc_jo", { reason: "Double-booked" })).json;
      expect(c).toMatchObject({ cancellationsLast90Days: 2, listingsChecked: true });
      const held = await listing("lc_jo", await item("lc_jo", "Rebounding clinic"), "Rebounding clinic with Jo Park");
      expect(held.state).toBe("PENDING_APPROVAL");
      expect(held.hold).toMatchObject({ accountCheck: true });
      expect(held.hold!.message).toContain("BTG is checking your account");
      expect(held.hold!.message).not.toMatch(/cancelled/i);
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: held.id }, select: { reviewReasons: true } })).reviewReasons).toContain("Seller cancelled 2 sold sessions in the last 90 days");
      /* Live listings are untouched. */
      expect((await prisma.listing.findUniqueOrThrow({ where: { id: E.joListing }, select: { state: true } })).state).toBe("PUBLISHED");
      /* A team's cancellation counts against the team, not its athlete. */
      const o = await order("lc_buyer", [{ listingId: E.gullsListing, quantity: 1, startsOn: at(50), endsOn: at(51) }], "BANK");
      const g = o.lines[0]!.id;
      expect((await call("POST", `/sales/${g}/cancel`, "lc_mgr", { reason: "Coach unavailable" })).json).toMatchObject({ cancellationsLast90Days: 1 });
      expect(await rowOf(g)).toMatchObject({ cancelledSellerType: "PROPERTY", cancelledSellerId: E.gulls });
    });
  });

  describe("the spending limit", () => {
    it("is not frozen by any cancellation refund — the sponsor's, the seller's, agreed, or BTG's", async () => {
      const limit = await sponsorLimit(prisma, T, "lc_harbor");
      expect(await prisma.orderLineDelivery.count({ where: { sponsorId: "lc_harbor", cancelledAt: { not: null } } })).toBeGreaterThanOrEqual(6);
      expect(await prisma.marketplaceOrder.count({ where: { sponsorId: "lc_harbor", state: "REFUNDED", refundCause: "CANCELLATION" } })).toBeGreaterThanOrEqual(4);
      expect(limit.frozen).toBeNull();
      expect(limit.history.filter((h) => h.kind !== "COMPLETED")).toEqual([]);
    });

    it("is still frozen by a problem refund (agreed between them), and by BTG refunding the order", async () => {
      const { orderId, line } = await joLine(60, "BANK", "lc_dune_buyer");
      expect((await call("POST", `/sales/${line}/delivered`, "lc_jo", { note: "Held, 12 kids." })).status).toBe(200);
      expect((await call("POST", `/deliveries/${line}/problem`, "lc_dune_buyer", { note: "Only 20 minutes." })).status).toBe(200);
      expect((await call("POST", `/sales/${line}/problem-answer`, "lc_jo", { answer: "REFUND" })).status).toBe(200);
      expect((await call("POST", `/deliveries/${line}/problem-answer`, "lc_dune_buyer", { decision: "ACCEPT" })).json.state).toBe("REFUNDED");
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "PROBLEM_AGREED", state: "OPEN" })]);
      expect(await orderOf(orderId)).toMatchObject({ state: "REFUNDED", refundCause: "PROBLEM" });
      const limit = await sponsorLimit(prisma, T, "lc_dune");
      expect(limit.frozen).toMatchObject({ orderId });

      /* BTG refunds a whole paid order by transition: one whole-order row. */
      const o = await order("lc_dune_buyer", [{ listingId: E.gullsListing, quantity: 1, startsOn: at(61), endsOn: at(62) }], "CARD");
      const r = await call("POST", `/marketplace-orders/${o.orderId}/transition`, "lc_admin", { to: "REFUNDED" });
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({ state: "REFUNDED", refundCause: "BTG" });
      expect(await refundsOf(o.orderId)).toEqual([expect.objectContaining({ lineId: null, cause: "BTG_REFUNDED_ORDER", amountCents: (await orderOf(o.orderId)).totalCents, state: "SENT", method: "CARD" })]);
    });

    it("BTG's REFUND of an overdue line is a delivery failure: recorded, and it freezes", async () => {
      const { orderId, line } = await joLine(3, "BANK", "lc_dune_buyer");
      const ends = (await prisma.marketplaceOrderLine.findUniqueOrThrow({ where: { id: line }, select: { endsOn: true } })).endsOn;
      await sweep(new Date(ends.getTime() + 8 * DAY));
      expect((await call("POST", `/delivery-issues/${line}/resolve`, "lc_admin", { decision: "REFUND", note: "Never delivered." })).json.state).toBe("REFUNDED");
      expect(await refundsOf(orderId)).toEqual([expect.objectContaining({ cause: "BTG_DECIDED" })]);
      expect(await orderOf(orderId)).toMatchObject({ refundCause: "PROBLEM" });
    });
  });

  describe("refunds to send", () => {
    it("none for an order that was never paid; a retry never makes a second", async () => {
      const o = await order("lc_cedar_buyer", [{ listingId: E.joListing, quantity: 1, startsOn: at(70), endsOn: at(71) }], "NONE");
      expect((await call("GET", `/deliveries/${o.lines[0]!.id}/cancellation`, "lc_cedar_buyer")).json.blockedReason).toMatch(/isn't paid/);
      expect((await call("POST", `/deliveries/${o.lines[0]!.id}/cancel`, "lc_cedar_buyer", {})).status).toBe(409);
      expect((await call("POST", `/marketplace-orders/${o.orderId}/transition`, "lc_cedar_buyer", { to: "CANCELLED" })).json.state).toBe("CANCELLED");
      expect(await refundsOf(o.orderId)).toEqual([]);
      /* Never paid: recordRefund itself writes nothing. */
      await prisma.$transaction((tx) => recordRefund(tx, { userId: null, tenantId: T }, o.orderId, { cause: "BTG_REFUNDED_ORDER", lineId: null, cancellation: false }, { whole: true }));
      expect(await refundsOf(o.orderId)).toEqual([]);

      /* A paid order's refund recorded again (a retried transaction): still one. */
      const { orderId, line } = await joLine(72, "BANK", "lc_cedar_buyer");
      expect((await call("POST", `/deliveries/${line}/cancel`, "lc_cedar_buyer", {})).status).toBe(200);
      const first = await refundsOf(orderId);
      await prisma.$transaction(async (tx) => {
        await recordRefund(tx, { userId: null, tenantId: T }, orderId, { cause: "SPONSOR_CANCELLED", lineId: line, cancellation: true }, { whole: true });
        await recordRefund(tx, { userId: null, tenantId: T }, orderId, { cause: "SPONSOR_CANCELLED", lineId: line, cancellation: true }, { whole: false });
      });
      expect(await refundsOf(orderId)).toEqual(first);
      await expect(prisma.refundDue.create({ data: { tenantId: T, orderId, lineId: line, sponsorId: "lc_cedar", amountCents: 1, cause: "SPONSOR_CANCELLED" } })).rejects.toThrow();
    });

    it("Finance's list: BTG admin and Finance only, tenant-wide, with what each needs — and a Zoho invoice's credit note", async () => {
      for (const who of ["lc_buyer", "lc_analyst", "lc_jo", "lc_mgr"]) expect((await call("GET", "/refunds", who)).status, who).toBe(403);
      const open = await call("GET", "/refunds?state=OPEN", "lc_finance");
      expect(open.status, open.text).toBe(200);
      expect(open.json.refunds.length).toBeGreaterThan(3);
      expect(open.json.refunds.every((r: { state: string }) => r.state === "OPEN")).toBe(true);
      expect(open.json.counts.open).toBe(open.json.refunds.length);
      expect(open.json.openCents).toBe(open.json.refunds.reduce((s: number, r: { amountCents: number }) => s + r.amountCents, 0));
      const seller = open.json.refunds.find((r: { cause: string }) => r.cause === "SELLER_CANCELLED");
      expect(seller).toMatchObject({
        orderRef: expect.stringMatching(/^SX-/), sponsor: { name: "Harbor Tea LC" }, line: { title: "Passing clinic with Jo Park", dates: expect.any(Array) },
        wholeOrder: false, amountCents: 30_000, causeWords: expect.stringMatching(/seller cancelled/i), paidVia: "BANK_TRANSFER", paidViaWords: "Bank transfer", zohoNote: null, sent: null,
      });
      const sent = await call("GET", "/refunds?state=SENT", "lc_admin");
      expect(sent.json.refunds.find((r: { cause: string }) => r.cause === "BTG_REFUNDED_ORDER")).toMatchObject({ line: null, wholeOrder: true, sent: { method: "CARD", by: "SYSTEM", test: true } });
      expect((await call("GET", "/refunds", "lc_finance2")).json.refunds).toEqual([]);
      expect((await call("GET", "/refunds?state=LOST", "lc_finance")).status).toBe(400);

      /* A Zoho-invoiced order's refund also needs a credit note. */
      const z = await joLine(80, "BANK", "lc_cedar_buyer");
      await prisma.marketplaceOrder.update({ where: { id: z.orderId }, data: { paidVia: "ZOHO_INVOICE" } });
      await call("POST", `/deliveries/${z.line}/cancel`, "lc_cedar_buyer", {});
      const zoho = (await call("GET", "/refunds?state=OPEN", "lc_finance")).json.refunds.find((r: { orderId: string }) => r.orderId === z.orderId);
      expect(zoho).toMatchObject({ paidVia: "ZOHO_INVOICE", zohoNote: "Issue a credit note in Zoho Books for this invoice" });
    });

    it("marking one sent: BTG admin and Finance only, with a method, a reference and a date; once; audited; the sponsor emailed", async () => {
      const target = (await call("GET", "/refunds?state=OPEN", "lc_finance")).json.refunds.find((r: { sponsor: { name: string } }) => r.sponsor.name === "Harbor Tea LC");
      const body = { method: "BANK_TRANSFER", reference: "RF-2026-0042", sentOn: today() };
      for (const who of ["lc_buyer", "lc_jo", "lc_mgr", "lc_analyst"]) expect((await call("POST", `/refunds/${target.id}/sent`, who, body)).status, who).toBe(403);
      for (const who of ["lc_admin2", "lc_finance2"]) expect((await call("POST", `/refunds/${target.id}/sent`, who, body)).status, who).toBe(404);
      expect((await call("POST", `/refunds/${target.id}/sent`, "lc_finance", { ...body, reference: "" })).status).toBe(400);
      expect((await call("POST", `/refunds/${target.id}/sent`, "lc_finance", { ...body, reference: "4111-1111-1111-1111" })).status).toBe(422);
      expect((await call("POST", `/refunds/${target.id}/sent`, "lc_finance", { ...body, sentOn: "2099-01-01" })).status).toBe(422);
      expect((await call("POST", `/refunds/${target.id}/sent`, "lc_finance", { ...body, method: "PAYPAL" })).status).toBe(400);
      const ok = await call("POST", `/refunds/${target.id}/sent`, "lc_finance", body);
      expect(ok.status, ok.text).toBe(200);
      expect(ok.json).toMatchObject({ id: target.id, state: "SENT", sent: { on: today(), method: "BANK_TRANSFER", reference: "RF-2026-0042", by: "BTG", test: false } });
      expect((await call("POST", `/refunds/${target.id}/sent`, "lc_admin", body)).status).toBe(409);
      expect(await mailsFor("refund.sent", target.id)).toEqual(["lc_buyer@lc-test.invalid"]);
      expect(await prisma.auditLog.count({ where: { action: "refundDue.sent", actorId: "lc_finance", entityId: target.orderId } })).toBe(1);
      /* The sponsor sees it sent, on the day — never the reference. */
      const o = await call("GET", `/marketplace-orders/${target.orderId}`, "lc_buyer");
      expect(o.json.refunds.find((r: { id: string }) => r.id === target.id)).toMatchObject({ state: "SENT", sentOn: today(), text: `Refund sent on ${today()}` });
      expect(o.text).not.toContain("RF-2026-0042");
      const d = await call("GET", `/marketplace-orders/${target.orderId}/deliveries`, "lc_buyer");
      expect(d.text).not.toContain("RF-2026-0042");
      /* Sellers never see refunds or a sponsor's cancellation terms. */
      const s = await call("GET", "/sales", "lc_jo");
      expect(s.text).not.toMatch(/"refundCents"|"refunds"/);
    });
  });
});
