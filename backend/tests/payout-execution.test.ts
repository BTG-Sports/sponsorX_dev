import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S5-BE-05 · Payout approval and execution jobs, against the real API and
   database.

   Done when: "An approved payout executes through the provider and its
   status is tracked to completion."

   Approval is automatic when every check passes (2S5-BE-06), BTG's
   otherwise; the worker hands the payout to the provider through the
   adapter (`payouts.send`, with an idempotency key), and the provider's
   status — paid, failed, returned — arrives as signed webhook events,
   applied by the worker's step.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pex-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

const T = "pex_btg";
const OTHER_T = "pex_other_btg";

describe.skipIf(!hasDatabase)("2S5-BE-05 · an approved payout executes through the provider, tracked to completion", { timeout: 120_000 }, async () => {
  const { paymentWorld } = await import("./support/payment-world");
  const w = await paymentWorld({ T, OTHER_T, prefix: "pex", domain: "pex-test.invalid" });
  const { prisma, events } = w;
  const { processPaymentEvent, retryDeferredPaymentEvents } = events;
  const { sendPayout, sweepPayoutRetries } = await import("../src/domain/payouts");
  const { sendPayoutToProvider } = await import("../src/lib/payment-provider");
  const { summarise } = await import("../src/domain/ledger");

  beforeAll(() => w.setup());
  afterAll(() => w.teardown());

  const H = 3_600_000;
  const row = (id: string) => prisma.payout.findUniqueOrThrow({
    where: { id },
    select: { state: true, providerRef: true, sendAttempts: true, waitingOn: true, retryCount: true, nextRetryAt: true, paidAt: true, returnedAt: true, returnCount: true, failureKind: true, reviewReasons: true, amountCents: true },
  });
  /** The provider's word on a payout: a signed delivery, applied by the worker. */
  async function provider(type: string, data: Record<string, unknown>, now = new Date()) {
    const r = await w.deliver(w.envelope(type, data), { at: now });
    expect(r.status, r.text).toBe(202);
    return { eventId: r.json.events[0].id as string, ...(await processPaymentEvent(r.json.events[0].id, now)) };
  }
  const paidOutOn = async (id: string) => {
    const rows = await prisma.ledgerEntry.findMany({ where: { journalId: { startsWith: `${id}:` }, entryType: "PAYOUT", account: { in: ["ATHLETE_PAYABLE", "PROPERTY_PAYABLE"] } }, select: { debitCents: true, creditCents: true } });
    return rows.reduce((s, e) => s + e.debitCents - e.creditCents, 0);
  };
  async function approvedPayout(units = 1) {
    await w.paidDeliveredOrder(units);
    const r = await w.call("POST", "/payouts", w.id("riley"));
    expect(r.status, r.text).toBe(201);
    return r.json.payouts[0] as { id: string; state: string; amountCents: number };
  }
  const sentTo = async (id: string) => {
    expect(await sendPayout(id)).toEqual({ sent: true });
    return (await row(id)).providerRef!;
  };
  const rileysBooks = async () => summarise(await prisma.ledgerEntry.findMany({
    where: { partyType: "ATHLETE", partyId: w.E.riley, account: { in: ["ATHLETE_PAYABLE", "RESERVE_HELD"] } },
    select: { entryType: true, account: true, status: true, debitCents: true, creditCents: true },
  }));

  it("approved, handed to the provider through the adapter, and PAID on the provider's webhook — once, however often it says so", async () => {
    const p = await approvedPayout();
    expect(p.state).toBe("APPROVED"); // every check passed, under $2,000: approved as the system (2S5-BE-06)
    expect((await w.jobs("payouts.send")).filter((j) => j.payoutId === p.id)).toHaveLength(1);
    const ref = await sentTo(p.id);
    expect(await row(p.id)).toMatchObject({ state: "SENDING", sendAttempts: 1 });
    /* The provider is sent the hand-over's own key: asked again with it, it is the same payout. */
    const again = await sendPayoutToProvider({ payoutId: p.id, amountCents: p.amountCents, currency: "USD", accountId: null, idempotencyKey: `${p.id}:1` });
    expect(again.reference).toBe(ref);

    const paid = await provider("payout.paid", { payoutId: p.id, payoutRef: ref });
    expect(paid).toMatchObject({ status: "APPLIED" });
    expect(await row(p.id)).toMatchObject({ state: "PAID" });
    expect(await paidOutOn(p.id)).toBe(p.amountCents);
    expect((await w.emails()).filter((m) => m.template === "payout.paid" && m.to === `${w.id("riley")}@pex-test.invalid`)).toHaveLength(1);
    /* Tracked: BTG and the payee read it paid. */
    expect((await w.call("GET", `/payouts/${p.id}`, w.id("admin"))).json).toMatchObject({ state: "PAID", providerRef: ref });
    /* The provider repeats itself (a new event id): nothing more. */
    expect(await provider("payout.paid", { payoutRef: ref })).toMatchObject({ status: "IGNORED" });
    expect(await paidOutOn(p.id)).toBe(p.amountCents);
    /* And a failure after it never undoes it. */
    expect(await provider("payout.failed", { payoutId: p.id, payoutRef: ref, kind: "TEMPORARY" })).toMatchObject({ status: "IGNORED" });
    expect((await row(p.id)).state).toBe("PAID");
    await w.assertConsistent();
  });

  it("two send jobs at once hand it over once", async () => {
    const p = await approvedPayout();
    const both = await Promise.all([sendPayout(p.id), sendPayout(p.id)]);
    expect(both.filter((b) => b.sent)).toHaveLength(1);
    expect(await row(p.id)).toMatchObject({ state: "SENDING", sendAttempts: 1 });
    await provider("payout.paid", { payoutId: p.id });
  });

  it("over $2,000 waits for BTG; BTG's approval executes it the same way (the automation replaces BTG approving every payout)", async () => {
    const p = await approvedPayout(8);
    expect(p.state).toBe("REQUESTED");
    expect(await sendPayout(p.id)).toEqual({ sent: false });
    expect((await w.call("POST", `/payouts/${p.id}/decision`, w.id("admin"), { decision: "APPROVE" })).status).toBe(200);
    const ref = await sentTo(p.id);
    expect(await provider("payout.paid", { payoutId: p.id, payoutRef: ref })).toMatchObject({ status: "APPLIED" });
    expect((await row(p.id)).state).toBe("PAID");
  });

  it("a temporary failure by webhook is retried on schedule with a new hand-over; the old hand-over's late word is ignored", async () => {
    const p = await approvedPayout();
    const first = await sentTo(p.id);
    const now = new Date();
    expect(await provider("payout.failed", { payoutId: p.id, payoutRef: first, kind: "TEMPORARY", reason: "bank_timeout" }, now)).toMatchObject({ status: "APPLIED" });
    expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "SYSTEM_RETRY", failureKind: "TEMPORARY" });
    expect(await sweepPayoutRetries(new Date(now.getTime() + H + 1000), { tenantIds: [T] })).toMatchObject({ retried: 1 });
    const second = await sentTo(p.id);
    expect(second).not.toBe(first);
    expect(await row(p.id)).toMatchObject({ state: "SENDING", sendAttempts: 2, retryCount: 1 });
    /* The first hand-over's failure, delivered again late: about an earlier hand-over. */
    expect(await provider("payout.failed", { payoutId: p.id, payoutRef: first, kind: "TEMPORARY" })).toMatchObject({ status: "IGNORED", outcome: expect.stringMatching(/earlier hand-over/) });
    expect(await provider("payout.paid", { payoutId: p.id, payoutRef: second })).toMatchObject({ status: "APPLIED" });
    expect(await paidOutOn(p.id)).toBe(p.amountCents);
  });

  it("a failure left for BTG is surfaced — BTG's list and an email — and BTG's retry executes it", async () => {
    const p = await approvedPayout();
    const ref = await sentTo(p.id);
    expect(await provider("payout.failed", { payoutId: p.id, payoutRef: ref, kind: "OTHER", reason: "account_closed_by_provider" })).toMatchObject({ status: "APPLIED" });
    expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "BTG" });
    const list = (await w.call("GET", "/payouts?waitingOn=BTG", w.id("admin"))).json;
    expect(list.payouts.map((x: { id: string }) => x.id)).toContain(p.id);
    expect((await w.emails()).filter((m) => m.template === "payout.failedForBtg")).toContainEqual(expect.objectContaining({ to: `${w.id("admin")}@pex-test.invalid`, data: expect.objectContaining({ reason: expect.stringMatching(/account_closed_by_provider/) }) }));
    expect((await w.call("POST", `/payouts/${p.id}/retry`, w.id("admin"))).status).toBe(200);
    const again = await sentTo(p.id);
    expect(await provider("payout.paid", { payoutId: p.id, payoutRef: again })).toMatchObject({ status: "APPLIED" });
    expect((await row(p.id)).state).toBe("PAID");
  });

  it("returned by the bank after it was paid: back to FAILED, its journals mirrored, the payee asked to fix the account — and paid again once it is", async () => {
    const p = await approvedPayout();
    const ref = await sentTo(p.id);
    await provider("payout.paid", { payoutId: p.id, payoutRef: ref });
    const paidOutBefore = (await w.me()).totals.paidOutCents as number;
    const returned = await provider("payout.returned", { payoutId: p.id, payoutRef: ref, reason: "account_closed" });
    expect(returned).toMatchObject({ status: "APPLIED", outcome: expect.stringMatching(/returned by the bank/) });
    expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "PAYEE_ACCOUNT", failureKind: "ACCOUNT", paidAt: null, returnCount: 1 });
    expect((await row(p.id)).returnedAt).not.toBeNull();
    /* The books: paid out, then returned — the money is Riley's again, claimed by this payout (never requestable twice). */
    expect(await paidOutOn(p.id)).toBe(0);
    const me = await w.me();
    expect(me.totals.paidOutCents).toBe(paidOutBefore - p.amountCents);
    expect(me.totals.requestableCents).toBe(0);
    expect((await rileysBooks()).reconciles).toBe(true);
    expect((await w.emails()).some((m) => m.template === "payout.accountNeedsFix" && m.to === `${w.id("riley")}@pex-test.invalid`)).toBe(true);
    /* A repeat of the return: nothing more. */
    expect(await provider("payout.returned", { payoutId: p.id, payoutRef: ref })).toMatchObject({ status: "IGNORED" });
    /* Riley fixes the account on the provider's page: sent again, once, and paid. */
    const link = (await w.call("POST", "/payouts/account/link", w.id("riley"), {})).json;
    await w.call("POST", "/public/test-provider/account", undefined, { token: w.tokenOf(link.url), outcome: "READY" });
    expect((await row(p.id)).state).toBe("APPROVED");
    const again = await sentTo(p.id);
    expect(await provider("payout.paid", { payoutId: p.id, payoutRef: again })).toMatchObject({ status: "APPLIED" });
    expect(await paidOutOn(p.id)).toBe(p.amountCents);
    expect((await rileysBooks()).reconciles).toBe(true);
    /* Returned a second time: BTG's, and BTG is told. */
    await provider("payout.returned", { payoutId: p.id, payoutRef: again });
    expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "BTG", returnCount: 2 });
    expect((await w.emails()).some((m) => m.template === "payout.failedForBtg" && m.idempotencyKey.includes(`${p.id}:2:PAID`))).toBe(true);
    await w.assertConsistent();
  });

  describe("out of order", () => {
    it("paid before SponsorX recorded the hand-over waits, then applies", async () => {
      const p = await approvedPayout();
      const now = new Date();
      const early = await provider("payout.paid", { payoutId: p.id }, now);
      expect(early).toMatchObject({ status: "DEFERRED" });
      await sentTo(p.id);
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] })).toMatchObject({ applied: 1 });
      expect((await row(p.id)).state).toBe("PAID");
    });

    it("returned before paid: the return waits for the payment, then applies", async () => {
      const p = await approvedPayout();
      const ref = await sentTo(p.id);
      const now = new Date();
      expect(await provider("payout.returned", { payoutId: p.id, payoutRef: ref }, now)).toMatchObject({ status: "DEFERRED" });
      await provider("payout.paid", { payoutId: p.id, payoutRef: ref }, now);
      expect(await retryDeferredPaymentEvents(new Date(now.getTime() + 60_000), { tenantIds: [T] })).toMatchObject({ applied: 1 });
      expect(await row(p.id)).toMatchObject({ state: "FAILED", returnCount: 1 });
      expect(await paidOutOn(p.id)).toBe(0);
      await w.assertConsistent();
    });

    it("paid after SponsorX recorded it failed: held for BTG, and its automatic retry is stopped — never paid twice", async () => {
      const p = await approvedPayout();
      const ref = await sentTo(p.id);
      await provider("payout.failed", { payoutId: p.id, payoutRef: ref, kind: "TEMPORARY" });
      expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "SYSTEM_RETRY" });
      expect(await provider("payout.paid", { payoutId: p.id, payoutRef: ref })).toMatchObject({ status: "HELD" });
      expect(await row(p.id)).toMatchObject({ state: "FAILED", waitingOn: "BTG", nextRetryAt: null, reviewReasons: [expect.stringMatching(/reported this payout as paid/)] });
      expect(await sweepPayoutRetries(new Date(Date.now() + 25 * H), { tenantIds: [T] })).toMatchObject({ retried: 0 });
    });
  });
});
