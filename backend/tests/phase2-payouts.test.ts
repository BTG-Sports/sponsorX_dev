import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { transitionBody } from "./support/order-payment";
import { settleDeliveries } from "./support/delivery";

/* --------------------------------------------------------------------------
   Card payment and payouts, against the real API and database — the
   walkthrough's steps 11–16 with its own figures:

     2S5-INT-01  Sponsor can pay through the provider and the order reflects
                 the result.
     2S5-INT-03  A payee can complete payout onboarding and SponsorX reflects
                 its readiness status.
     2S5-BE-04   Payout cannot be released if payment is unsettled,
                 deliverables are incomplete, onboarding is incomplete (or a
                 dispute/refund is open).
     2S5-BE-05   An approved payout executes through the provider and its
                 status is tracked to completion.

   The provider is the stand-in (staging's); the worker's two jobs are called
   directly, as the worker would after the provider answers.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@po-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
/* 2S4-FE-02 — every order is placed through the contract gate. */
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("card payment and payouts over the API", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment, confirmPayoutPaid, sendPayout, failPayout, latestFailedAttempts } = await import("../src/domain/payouts");

  const T = "po_btg";
  const E = { tenant: "", property: "", riley: "", order: "", listing: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const jobs = (name: string) => prisma.outboxJob.findMany({ where: { name, tenantId: { in: [T, E.tenant] } }, select: { payload: true } });
  const walk = async (id: string, states: string[]) => {
    for (const to of states) {
      if (to === "FULFILLED") await settleDeliveries(prisma, id);
      const r = await call("POST", `/marketplace-orders/${id}/transition`, "po_finance", transitionBody(to));
      expect(r.status, r.text).toBe(200);
    }
  };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'po\\_%@po-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 7; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Payouts BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.create({ data: { id: "po_harbor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] } });
    await prisma.user.createMany({ data: [
      { id: "po_admin", tenantId: T, clerkId: "po_admin", email: "po_admin@po-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "po_finance", tenantId: T, clerkId: "po_finance", email: "po_finance@po-test.invalid", roles: ["FINANCE"] },
      { id: "po_sales", tenantId: T, clerkId: "po_sales", email: "po_sales@po-test.invalid", roles: ["SALES"] },
      { id: "po_buyer", tenantId: T, clerkId: "po_buyer", email: "po_buyer@po-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "po_harbor" },
    ] });
    /* The walkthrough's sample rates: 15% + 5% BTG, 2.9% + 30¢ processing, 2% referral, 10% reserve. */
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `po_${kind}`, tenantId: T, ruleKey: `po_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });
    await prisma.propertyOnboarding.create({ data: {
      id: "po_onb", tenantId: T, orgType: "TEAM", orgName: "Westfield Hawks PO", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: "po_mgr@po-test.invalid", phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: "Westfield Hawks PO LLC", league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "po_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "po_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await call("GET", "/me", "po_mgr");
    const riley = await call("POST", "/team/roster", "po_mgr", { legalName: "Riley Carter", displayName: "RILEY.CARTER", email: "po_riley@po-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    const clinic = await call("POST", "/inventory", "po_riley", { title: "Basketball clinic", kind: "CAMP", priceCents: 50_000, quantity: 4 });
    expect(clinic.status, clinic.text).toBe(201);
    E.listing = (await call("POST", "/listings", "po_mgr", { inventoryItemId: clinic.json.id, title: "Youth basketball clinic with Riley Carter", description: "A 90-minute youth clinic at your venue, for up to 20 kids." })).json.id;
    /* 2S3-BE-06 — a clean submit goes live on its own. */
    expect((await call("POST", `/listings/${E.listing}/submit`, "po_mgr")).json.state).toBe("PUBLISHED");

    await call("POST", "/cart", "po_buyer");
    expect((await call("POST", "/cart/lines", "po_buyer", { listingId: E.listing, quantity: 2, startsOn: at(10), endsOn: at(17) })).status).toBe(201);
    const hold = (await call("POST", "/cart/reserve", "po_buyer")).json;
    const placed = await call("POST", "/marketplace-orders", "po_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    /* 2S4-BE-09 / -10 — within the $5,000 starting limit: approved automatically, and waiting for payment. */
    expect(placed.json).toMatchObject({ state: "AWAITING_PAYMENT", totalCents: 100_000, decidedBy: "system" });
    E.order = placed.json.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S5-INT-01 · the sponsor pays by card on the provider's page", () => {
    it("approved automatically, it is due at once; the sponsor gets a link to the provider (never a card form)", async () => {
      expect((await call("GET", `/marketplace-orders/${E.order}/payment`, "po_buyer")).json).toMatchObject({ due: true, canPay: true, testProvider: true, latest: null, amountCents: 100_000 });
      expect((await call("POST", `/marketplace-orders/${E.order}/decision`, "po_admin", { decision: "APPROVE" })).status).toBe(409); // nothing for BTG to decide
      /* Staff and the provider move payment; nobody else starts it for the sponsor. */
      expect((await call("POST", `/marketplace-orders/${E.order}/pay`, "po_admin")).status).toBe(403);
      expect((await call("POST", `/marketplace-orders/${E.order}/pay`, "po_riley")).status).toBe(403);
    });

    it("a declined card leaves the order unpaid and says so; a second try succeeds after the provider confirms", async () => {
      const first = await call("POST", `/marketplace-orders/${E.order}/pay`, "po_buyer");
      expect(first.status, first.text).toBe(200);
      expect(first.json.url).toMatch(/\/test-provider\/checkout\?t=/);
      expect((await call("GET", `/marketplace-orders/${E.order}`, "po_buyer")).json.state).toBe("AWAITING_PAYMENT");
      const details = await call("GET", `/public/test-provider/details?token=${encodeURIComponent(tokenOf(first.json.url))}`);
      expect(details.json).toMatchObject({ kind: "checkout", amountCents: 100_000, sponsorName: "Harbor Coffee", orderRef: `SX-${E.order.slice(-8).toUpperCase()}` });
      expect((await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(first.json.url), outcome: "DECLINE" })).json.returnPath).toBe(`/sponsor/orders/${E.order}?payment=returned`);
      expect((await call("GET", `/marketplace-orders/${E.order}/payment`, "po_buyer")).json.latest).toMatchObject({ state: "FAILED", failureReason: expect.stringMatching(/declined/) });
      /* 2S7-FE-02 — and it is on BTG's console: who, how much, why. Only BTG admin reads that queue. */
      const queue = await call("GET", "/payments/failed", "po_admin");
      expect(queue.status, queue.text).toBe(200);
      expect(queue.json.payments).toEqual([expect.objectContaining({
        orderId: E.order, orderRef: `SX-${E.order.slice(-8).toUpperCase()}`, orderState: "AWAITING_PAYMENT", sponsorName: "Harbor Coffee",
        amountCents: 100_000, failedTries: 1, failureReason: expect.stringMatching(/declined/),
      })]);
      for (const who of ["po_finance", "po_sales", "po_buyer", "po_riley"]) expect((await call("GET", "/payments/failed", who)).status, who).toBe(403);

      const second = await call("POST", `/marketplace-orders/${E.order}/pay`, "po_buyer");
      await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(second.json.url), outcome: "SUCCEED" });
      const processing = (await call("GET", `/marketplace-orders/${E.order}/payment`, "po_buyer")).json.latest;
      expect(processing.state).toBe("PROCESSING");
      /* A newer try supersedes the failure: off the console. */
      expect((await call("GET", "/payments/failed", "po_admin")).json.payments).toEqual([]);
      expect((await call("POST", `/marketplace-orders/${E.order}/pay`, "po_buyer")).status).toBe(409); // "don't pay again"
      expect((await jobs("payments.confirm")).map((j) => j.payload)).toContainEqual({ attemptId: processing.id });

      expect(await confirmPayment(processing.id)).toEqual({ confirmed: true });
      expect(await confirmPayment(processing.id)).toEqual({ confirmed: false }); // idempotent
      expect((await call("GET", `/marketplace-orders/${E.order}`, "po_buyer")).json.state).toBe("PAID");
      expect((await call("GET", `/marketplace-orders/${E.order}/payment`, "po_buyer")).json.latest.state).toBe("SUCCEEDED");
      const receipt = (await jobs("notify.email")).map((j) => j.payload as { template: string; to: string; data: Record<string, string> }).find((p) => p.template === "payment.received");
      expect(receipt).toMatchObject({ to: "po_buyer@po-test.invalid", data: { amount: "$1,000.00" } });
    });

    it("2S7-FE-02 · the console counts an order once, by its latest try, with every failed try", () => {
      const a = (id: string, orderId: string, state: string, minute: number) => ({
        id, orderId, state, amountCents: 100, failureReason: state === "FAILED" ? "declined" : null,
        createdAt: new Date(Date.UTC(2026, 9, 1, 12, minute)), updatedAt: new Date(Date.UTC(2026, 9, 1, 12, minute)),
      });
      const out = latestFailedAttempts([
        a("x1", "o1", "FAILED", 1), a("x2", "o1", "FAILED", 5), // two declines: listed once, with both
        a("y1", "o2", "FAILED", 1), a("y2", "o2", "PENDING", 9), // a newer try is under way: not listed
        a("z1", "o3", "SUCCEEDED", 3),
      ]);
      expect(out.map((f) => [f.attempt.id, f.failedTries])).toEqual([["x2", 2]]);
    });

    it("a tampered or foreign link is refused", async () => {
      expect((await call("POST", "/public/test-provider/checkout", undefined, { token: "abc.def.ghijklmnop", outcome: "SUCCEED" })).status).toBe(400);
      expect((await call("GET", "/public/test-provider/details?token=nottoken12345")).status).toBe(400);
    });
  });

  describe("2S5-BE-04 · a payout is requestable only when every rule is met", () => {
    it("paid but not delivered, and no payout account: nothing to request, and each reason is named", async () => {
      const me = (await call("GET", "/payouts/me", "po_riley")).json;
      expect(me.totals).toMatchObject({ requestableCents: 0, heldCents: 6_166, notYetReleasableCents: 54_258 });
      expect(Object.fromEntries(me.checks.map((c: { key: string; ok: boolean }) => [c.key, c.ok]))).toEqual({ payment: true, delivered: false, account: false, hold: true });
      expect(me.canRequest).toBe(false);
      expect((await call("POST", "/payouts", "po_riley")).status).toBe(409);
    });

    it("delivered, but the payout account isn't set up: refused until it is (2S5-INT-03)", async () => {
      await walk(E.order, ["IN_DELIVERY", "FULFILLED"]);
      const refused = await call("POST", "/payouts", "po_riley");
      expect(refused.status).toBe(409);
      expect(refused.json.error.message).toMatch(/payout account/);

      expect((await call("GET", "/payouts/account", "po_riley")).json).toMatchObject({ status: "NOT_SET_UP", canSetUp: true });
      const link = await call("POST", "/payouts/account/link", "po_riley", { returnPath: "/athlete/earnings" });
      expect(link.json.url).toMatch(/\/test-provider\/account\?t=/);
      expect((await call("GET", `/public/test-provider/details?token=${encodeURIComponent(tokenOf(link.json.url))}`)).json).toMatchObject({ kind: "account", payeeName: "Riley Carter" });
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.json.url), outcome: "NEEDS_INFO" });
      expect((await call("GET", "/payouts/account", "po_riley")).json.status).toBe("NEEDS_INFO");
      const back = await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.json.url), outcome: "READY" });
      expect(back.json.returnPath).toBe("/athlete/earnings");
      expect((await call("GET", "/payouts/account", "po_riley")).json.status).toBe("READY");
      /* A return path is always on this site. */
      const offsite = await call("POST", "/payouts/account/link", "po_riley", { returnPath: "//evil.example" });
      expect((await call("GET", `/public/test-provider/details?token=${encodeURIComponent(tokenOf(offsite.json.url))}`)).json.returnPath).toBe("/athlete");
    });

    it("Riley requests $542.58 — his available share — and the same money can't be requested twice", async () => {
      const me = (await call("GET", "/payouts/me", "po_riley")).json;
      expect(me.totals).toMatchObject({ requestableCents: 54_258, heldCents: 6_166 });
      expect(me.canRequest).toBe(true);
      expect(me.orders[0]).toMatchObject({ orderId: E.order, shareCents: 60_424, availableCents: 54_258, heldCents: 6_166, requestableCents: 54_258 });
      const made = await call("POST", "/payouts", "po_riley");
      expect(made.status, made.text).toBe(201);
      expect(made.json.payouts).toEqual([expect.objectContaining({ amountCents: 54_258, state: "REQUESTED", payeeType: "ATHLETE", tenantId: T, lines: [expect.objectContaining({ orderId: E.order, amountCents: 54_258 })] })]);
      expect((await call("POST", "/payouts", "po_riley")).status).toBe(409);
      expect((await call("GET", "/payouts/me", "po_riley")).json.totals).toMatchObject({ requestableCents: 0, inFlightCents: 54_258 });
    });

    it("an order can't be refunded under a payout in progress", async () => {
      const r = await call("POST", `/marketplace-orders/${E.order}/transition`, "po_finance", { to: "REFUNDED" });
      expect(r.status).toBe(409);
      expect(r.json.error.message).toMatch(/payout covering this order is in progress/);
    });

    it("each payee sees only its own payouts; only BTG admin and Finance decide", async () => {
      expect((await call("GET", "/payouts/me", "po_mgr")).json.payouts).toEqual([]);
      expect((await call("GET", "/payouts", "po_riley")).status).toBe(403);
      expect((await call("GET", "/payouts", "po_mgr")).status).toBe(403);
      expect((await call("GET", "/payouts", "po_sales")).status).toBe(403);
      expect((await call("GET", "/payouts/me", "po_buyer")).status).toBe(403);
      const [p] = (await call("GET", "/payouts/me", "po_riley")).json.payouts;
      expect((await call("POST", `/payouts/${p.id}/decision`, "po_riley", { decision: "APPROVE" })).status).toBe(403);
      expect((await call("POST", `/payouts/${p.id}/decision`, "po_mgr", { decision: "APPROVE" })).status).toBe(403);
      expect((await call("GET", `/payouts/${p.id}`, "po_mgr")).status).toBe(403);
    });
  });

  describe("2S5-BE-05 · approval, sending and the provider's confirmation", () => {
    it("BTG sees it with every rule ticked, can't send it back without a note, and approves", async () => {
      const list = (await call("GET", "/payouts?state=REQUESTED", "po_admin")).json;
      expect(list.counts).toMatchObject({ REQUESTED: 1 });
      const p = list.payouts.find((x: { payeeName: string }) => x.payeeName === "Riley Carter");
      const detail = (await call("GET", `/payouts/${p.id}`, "po_finance")).json;
      expect(detail.checks.every((c: { ok: boolean }) => c.ok)).toBe(true);
      expect(detail.account.status).toBe("READY");
      expect(detail.orders[0]).toMatchObject({ orderId: E.order, state: "FULFILLED" });
      expect((await call("POST", `/payouts/${p.id}/decision`, "po_admin", { decision: "REJECT" })).status).toBe(422);
      const ok = await call("POST", `/payouts/${p.id}/decision`, "po_admin", { decision: "APPROVE" });
      expect(ok.json.state).toBe("APPROVED");
      expect((await call("POST", `/payouts/${p.id}/decision`, "po_admin", { decision: "APPROVE" })).status).toBe(409);
      expect((await jobs("payouts.send")).map((j) => j.payload)).toContainEqual({ payoutId: p.id });
      const emails = (await jobs("notify.email")).map((j) => j.payload as { template: string; to: string });
      expect(emails).toContainEqual(expect.objectContaining({ template: "payout.approved", to: "po_riley@po-test.invalid" }));
    });

    it("the provider sends it, then confirms: PAID, the PAYOUT journal posted, Riley emailed", async () => {
      const [p] = (await call("GET", "/payouts/me", "po_riley")).json.payouts;
      expect(await sendPayout(p.id)).toEqual({ sent: true });
      expect((await call("GET", "/payouts/me", "po_riley")).json.payouts[0].state).toBe("SENDING");
      expect(await confirmPayoutPaid(p.id)).toEqual({ paid: true });
      expect(await confirmPayoutPaid(p.id)).toEqual({ paid: false });
      const me = (await call("GET", "/payouts/me", "po_riley")).json;
      expect(me.payouts[0]).toMatchObject({ state: "PAID", amountCents: 54_258, providerRef: expect.stringMatching(/^standin_po_/) });
      expect(me.totals).toMatchObject({ paidOutCents: 54_258, requestableCents: 0, heldCents: 6_166, inFlightCents: 0 });
      const journal = await prisma.ledgerEntry.findMany({ where: { orderId: E.order, entryType: "PAYOUT" }, select: { account: true, debitCents: true, creditCents: true, status: true, partyId: true } });
      expect(journal).toEqual(expect.arrayContaining([
        { account: "ATHLETE_PAYABLE", debitCents: 54_258, creditCents: 0, status: "PAID", partyId: E.riley },
        { account: "PAYOUT_CLEARING", debitCents: 0, creditCents: 54_258, status: "PAID", partyId: "processor" },
      ]));
      const emails = (await jobs("notify.email")).map((j) => j.payload as { template: string; to: string; data: Record<string, string> });
      expect(emails).toContainEqual(expect.objectContaining({ template: "payout.paid", to: "po_riley@po-test.invalid", data: expect.objectContaining({ amount: "$542.58" }) }));
    });

    it("closing the order releases the reserve: Riley's $61.66 becomes requestable, for $604.24 paid in all", async () => {
      await walk(E.order, ["CLOSED"]);
      expect((await call("GET", "/payouts/me", "po_riley")).json.totals).toMatchObject({ requestableCents: 6_166, heldCents: 0 });
      const second = (await call("POST", "/payouts", "po_riley")).json.payouts[0];
      await call("POST", `/payouts/${second.id}/decision`, "po_finance", { decision: "APPROVE" });
      await sendPayout(second.id);
      await confirmPayoutPaid(second.id);
      expect((await call("GET", "/payouts/me", "po_riley")).json.totals).toMatchObject({ paidOutCents: 60_424, requestableCents: 0 });
    });

    it("the team is paid its $151.05 the same way, and its ledger still reconciles", async () => {
      const link = (await call("POST", "/payouts/account/link", "po_mgr", {})).json;
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      const made = (await call("POST", "/payouts", "po_mgr")).json.payouts[0];
      expect(made).toMatchObject({ amountCents: 15_105, payeeType: "PROPERTY" });
      await call("POST", `/payouts/${made.id}/decision`, "po_admin", { decision: "APPROVE" });
      await sendPayout(made.id);
      await confirmPayoutPaid(made.id);
      const ledger = (await call("GET", "/team/ledger", "po_mgr")).json;
      expect(ledger).toMatchObject({ bookedRevenueCents: 15_105, paidEarningsCents: 15_105, ledgerBalanceCents: 0, reconciles: true });
    });

    it("a payout the provider couldn't send is shown as a problem, and can be retried", async () => {
      /* A fresh order, paid and delivered, so there is something new to pay out. */
      await call("POST", "/cart", "po_buyer");
      await call("POST", "/cart/lines", "po_buyer", { listingId: E.listing, quantity: 1, startsOn: at(20), endsOn: at(21) });
      const hold = (await call("POST", "/cart/reserve", "po_buyer")).json;
      const o = (await call("POST", "/marketplace-orders", "po_buyer", placeOrderBody(hold.id, `${T}_order_terms`))).json;
      expect(o.state).toBe("AWAITING_PAYMENT");
      await walk(o.id, ["PAID", "IN_DELIVERY", "FULFILLED"]);
      const p = (await call("POST", "/payouts", "po_riley")).json.payouts[0];
      await call("POST", `/payouts/${p.id}/decision`, "po_admin", { decision: "APPROVE" });
      await sendPayout(p.id);
      expect(await failPayout(p.id, "The payout account needs attention.")).toEqual({ failed: true });
      expect((await call("GET", "/payouts?state=FAILED", "po_admin")).json.payouts[0]).toMatchObject({ id: p.id, failureReason: "The payout account needs attention." });
      /* A failed payout no longer claims the money. */
      expect((await call("GET", "/payouts/me", "po_riley")).json.totals.inFlightCents).toBe(0);
      expect((await call("POST", `/payouts/${p.id}/retry`, "po_riley")).status).toBe(403);
      expect((await call("POST", `/payouts/${p.id}/retry`, "po_admin")).json.state).toBe("APPROVED");
    });
  });

  describe("with no payment provider connected (production until one is chosen)", () => {
    it("nothing can be paid or set up, the stand-in's pages are off, and an approved payout waits", async () => {
      const was = env.PAYMENT_PROVIDER;
      (env as { PAYMENT_PROVIDER?: string }).PAYMENT_PROVIDER = "none";
      try {
        expect((await call("GET", "/payouts/account", "po_riley")).json).toMatchObject({ canSetUp: false, provider: "none" });
        const link = await call("POST", "/payouts/account/link", "po_riley", {});
        expect(link.status).toBe(409);
        expect(link.json.error.message).toMatch(/payment provider is connected/);
        expect((await call("GET", "/public/test-provider/details?token=a.b")).status).toBe(400);
        const waiting = (await call("GET", "/payouts?state=APPROVED", "po_admin")).json.payouts[0];
        expect(await sendPayout(waiting.id)).toEqual({ sent: false });
        expect((await call("GET", `/payouts/${waiting.id}`, "po_admin")).json).toMatchObject({ state: "APPROVED", provider: "none" });
      } finally {
        (env as { PAYMENT_PROVIDER?: string }).PAYMENT_PROVIDER = was;
      }
    });
  });
});
