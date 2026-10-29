import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-11 — closing an account ignored live deals: signed orders and due
   work stayed open with nobody told, a minor could close their own account,
   and earned money waited on a login that had just been switched off.

   Against the real API and database (the payment-world marketplace: Riley,
   a roster athlete of the Hawks, with a READY payout account):
     · a live deal holds the closure for BTG — the account stays open; the
       owner, BTG and the deal's sponsor are told; BTG can't close it until
       the deal is settled, then can, and the earned money is requested;
     · money earned with no payout account holds it too (the team);
     · a minor's own login is refused; the guardian closes it for them, and
       a guardian still acting for a minor is held;
     · what closing would affect is readable first, and a held request can
       be withdrawn or declined.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@cl-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-11 · closing an account leaves no live deal behind", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T: "cl_btg", OTHER_T: "cl_other_btg", prefix: "cl", domain: "cl-test.invalid" });
  const { prisma, E, id } = w;
  const { payOutClosedAccounts } = await import("../src/domain/account-closure");

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  const mailsTo = async (template: string) => (await w.emails()).filter((m) => m.template === template).map((m) => m.to).sort();
  const payoutsOf = (payeeId: string) => prisma.payout.findMany({ where: { payeeId }, select: { requestedBy: true, amountCents: true, state: true } });

  let orderId = "";

  it("a live deal holds Riley's closure for BTG: the account stays open, and Riley, BTG and the sponsor are told", async () => {
    /* Paid, not yet delivered: a live deal. */
    orderId = await w.freshOrder();
    const pay = await w.startPaying(orderId);
    expect(await w.events.standinConfirmPayment(pay.attemptId)).toMatchObject({ confirmed: true });

    const preview = await w.call("GET", "/me/close/preview", id("riley"));
    expect(preview.status, preview.text).toBe(200);
    expect(preview.json).toMatchObject({ account: "ATHLETE", wouldHold: true, heldRequest: null });
    expect(preview.json.liveDeals).toEqual([expect.objectContaining({ kind: "MARKETPLACE_SALE", sponsorId: E.sponsor })]);

    const held = await w.call("POST", "/me/close", id("riley"), { confirm: true, reason: "Moving abroad" });
    expect(held.status, held.text).toBe(202);
    expect(held.json).toMatchObject({ state: "HELD", account: "ATHLETE", holdReasons: [expect.stringMatching(/1 live deal/)] });
    expect((await w.call("GET", "/me", id("riley"))).status).toBe(200);
    expect(await prisma.accountClosure.count({ where: { subjectId: E.riley } })).toBe(0);
    expect(await mailsTo("account.closeHeld")).toEqual([`${id("riley")}@cl-test.invalid`]);
    expect(await mailsTo("account.closeHeldBtg")).toEqual([`${id("admin")}@cl-test.invalid`]);
    expect(await mailsTo("account.closingSponsor")).toEqual([`${id("buyer")}@cl-test.invalid`]);
    /* Asking again: already with BTG. */
    expect((await w.call("POST", "/me/close", id("riley"), { confirm: true })).status).toBe(409);
    expect((await w.call("GET", "/me/close/preview", id("riley"))).json.heldRequest).toMatchObject({ id: held.json.requestId, state: "HELD" });
  });

  it("BTG can't close it while the deal is live; settled, it closes, and Riley's earned money is requested to the account on file", async () => {
    const list = await w.call("GET", "/account-closure-requests", id("admin"));
    expect(list.status, list.text).toBe(200);
    const req = list.json.requests.find((r: { subjectId: string }) => r.subjectId === E.riley);
    expect(req).toMatchObject({ account: "ATHLETE", state: "HELD" });
    expect((await w.call("GET", "/account-closure-requests", id("buyer"))).status).toBe(403);

    const early = await w.call("POST", `/account-closure-requests/${req.id}/close`, id("admin"));
    expect(early.status, early.text).toBe(409);
    expect(early.json.error.message).toMatch(/can't close yet: 1 live deal/);
    expect((await w.call("GET", `/account-closure-requests/${req.id}`, id("admin"))).json).toMatchObject({ canClose: false });

    /* BTG settles it: delivered and confirmed. */
    await w.deliverOrder(orderId);
    expect((await w.call("GET", `/account-closure-requests/${req.id}`, id("admin"))).json).toMatchObject({ canClose: true });
    const closed = await w.call("POST", `/account-closure-requests/${req.id}/close`, id("admin"));
    expect(closed.status, closed.text).toBe(200);
    expect(closed.json).toMatchObject({ state: "CLOSED", closure: { account: "ATHLETE", subjectId: E.riley } });
    expect((await w.call("GET", "/me", id("riley"))).status).toBe(403);
    const paid = await payoutsOf(E.riley);
    expect(paid).toEqual([expect.objectContaining({ requestedBy: "system" })]);
    expect(paid[0]!.amountCents).toBeGreaterThan(0);
    /* Nothing more to request: the hourly sweep makes no second payout. */
    expect(await payOutClosedAccounts(new Date(), { tenantIds: [E.tenant] })).toEqual({ requested: 0 });
  });

  it("the team's earned money with no payout account holds its closure; the owner can withdraw it, or BTG decline it", async () => {
    const preview = await w.call("GET", "/me/close/preview", id("mgr"));
    expect(preview.json).toMatchObject({ account: "PROPERTY", wouldHold: true, money: { accountReady: false } });
    expect(preview.json.money.owedCents).toBeGreaterThan(0);
    const held = await w.call("POST", "/me/close", id("mgr"), { confirm: true });
    expect(held.status, held.text).toBe(202);
    expect(held.json.holdReasons).toEqual([expect.stringMatching(/earned and no payout account/)]);
    expect((await w.call("POST", "/me/close/withdraw", id("mgr"), {})).json).toEqual({ withdrawn: true });
    expect((await w.call("POST", "/me/close/withdraw", id("mgr"), {})).status).toBe(409);

    const again = await w.call("POST", "/me/close", id("mgr"), { confirm: true });
    expect(again.status).toBe(202);
    expect((await w.call("POST", `/account-closure-requests/${again.json.requestId}/decline`, id("admin"), { note: "Let's set up your payout account first — we'll call you." })).json).toMatchObject({ state: "DECLINED" });
    expect(await mailsTo("account.closeDeclined")).toEqual([`${id("mgr")}@cl-test.invalid`]);
    expect((await w.call("GET", "/me", id("mgr"))).status).toBe(200);
  });

  describe("a minor", () => {
    beforeAll(async () => {
      await prisma.guardian.create({ data: { id: id("g"), tenantId: E.tenant, legalName: "Carmen Lopez", email: `${id("guardian")}@cl-test.invalid`, relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
      await prisma.athlete.create({ data: {
        id: id("mia"), tenantId: E.tenant, slug: "cl-mia", legalName: "Mia Lopez", displayName: "Mia", email: `${id("mia")}@cl-test.invalid`, sport: "Soccer",
        birthDate: new Date(Date.UTC(new Date().getUTCFullYear() - 13, 0, 1)), state: "ACTIVE", guardianId: id("g"),
      } });
      /* An open invitation: closing declines it. (The sponsor is in BTG's tenant; the campaign is the athlete's tenant's.) */
      await prisma.sponsor.create({ data: { id: id("deli"), tenantId: E.tenant, name: "Mia's Deli" } });
      await prisma.campaign.create({ data: { id: id("camp"), tenantId: E.tenant, sponsorId: id("deli"), name: "Fall", budget: 1000, startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5) } });
      await prisma.nilJob.create({ data: { id: id("job"), tenantId: E.tenant, name: "Post", baseLow: 50, baseHigh: 100, sellLow: 125, sellHigh: 250, sellFloorEmerging: 140, sellFloorCreator: 175, sellFloorPremium: 210 } });
      await prisma.campaignInvite.create({ data: { id: id("inv"), tenantId: E.tenant, campaignId: id("camp"), athleteId: id("mia"), jobId: id("job"), offered: 10_000, expiresAt: new Date(Date.now() + 10 * 864e5) } });
      await prisma.user.createMany({ data: [
        { id: id("u_mia"), tenantId: E.tenant, clerkId: id("mia"), email: `${id("mia")}@cl-test.invalid`, roles: ["ATHLETE"], athleteId: id("mia") },
        { id: id("u_guardian"), tenantId: E.tenant, clerkId: id("guardian"), email: `${id("guardian")}@cl-test.invalid`, roles: ["GUARDIAN"], guardianId: id("g") },
      ] });
    });

    it("can't close their own account; a guardian still acting for them is held; the guardian closes the minor's, declining their invitation", async () => {
      const own = await w.call("POST", "/me/close", id("mia"), { confirm: true });
      expect(own.status, own.text).toBe(403);
      expect(own.text).toMatch(/guardian_must_act/);

      /* A guardian's login acts for their one minor by default: their own account is named. */
      const guardianOwn = await w.call("POST", "/me/close", id("guardian"), { confirm: true, account: "guardian" });
      expect(guardianOwn.status, guardianOwn.text).toBe(202);
      expect(guardianOwn.json.holdReasons).toEqual([expect.stringMatching(/still the guardian for Mia/)]);
      expect((await w.call("POST", "/me/close/withdraw", id("guardian"), { account: "guardian" })).json).toEqual({ withdrawn: true });

      const forMia = await w.call("POST", "/me/close", id("guardian"), { confirm: true, account: "athlete" }, id("mia"));
      expect(forMia.status, forMia.text).toBe(200);
      expect(forMia.json).toMatchObject({ state: "CLOSED", account: "ATHLETE", subjectId: id("mia"), invitationsDeclined: 1 });
      expect(await prisma.campaignInvite.findUniqueOrThrow({ where: { id: id("inv") }, select: { state: true } })).toEqual({ state: "DECLINED" });
      /* Mia's account closed, nobody is left in Carmen's care: her own closes now. */
      const now = await w.call("POST", "/me/close", id("guardian"), { confirm: true, account: "guardian" });
      expect(now.status, now.text).toBe(200);
      expect(now.json).toMatchObject({ state: "CLOSED", account: "GUARDIAN" });
    });
  });

});
