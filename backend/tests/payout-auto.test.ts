import { describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S5-BE-06 / -07 / -08 — the automatic-approval rule and the retry plan,
   as pure functions (domain/payout-auto.ts). The database half — the lock,
   the 7-day total, the moves — is phase2-payout-automation.test.ts.
   -------------------------------------------------------------------------- */

vi.mock("../src/config/env", () => ({ env: {} }));

const {
  autoApprovalReasons, autoApproveSettings, dollars, nextChangedAt, planFailure, waitingOnOf,
  GAVE_UP, WAITING_FOR_PAYEE, ACCOUNT_STILL_FAILING,
} = await import("../src/domain/payout-auto");

const now = new Date("2026-10-08T12:00:00Z");
const days = (n: number) => new Date(now.getTime() - n * 864e5);
const rule = (over: Partial<Parameters<typeof autoApprovalReasons>[0]> = {}) =>
  autoApprovalReasons({ amountCents: 50_000, held: false, accountChangedAt: null, windowCents: 0, now, ...over });

describe("the programme owner's numbers, 2026-10-02", () => {
  it("defaults: under $2,000; account changes reviewed for 7 days; $5,000 over 7 days", () => {
    expect(autoApproveSettings()).toEqual({ limitCents: 200_000, accountChangeReviewDays: 7, windowDays: 7, windowCapCents: 500_000 });
  });
});

describe("2S5-BE-06 · autoApprovalReasons", () => {
  it("passes a first payout with every check met and nothing else to say", () => {
    expect(rule()).toEqual([]);
  });

  it("$1,999.99 passes; exactly $2,000 and above wait for BTG", () => {
    expect(rule({ amountCents: 199_999 })).toEqual([]);
    expect(rule({ amountCents: 200_000 })).toEqual(["At the $2,000 limit"]);
    expect(rule({ amountCents: 200_001 })).toEqual(["Over $2,000"]);
  });

  it("an account changed 6 days ago is reviewed; 8 days ago is not", () => {
    expect(rule({ accountChangedAt: days(6) })).toEqual(["Payout account changed on Oct 2"]);
    expect(rule({ accountChangedAt: days(8) })).toEqual([]);
    /* Phase 1 has no account check at all. */
    expect(rule({ accountChangedAt: undefined })).toEqual([]);
  });

  it("the 7-day cap counts this one: $4,499.99 + $500 passes, $4,500 + $500 does not", () => {
    expect(rule({ windowCents: 449_999 })).toEqual([]);
    expect(rule({ windowCents: 450_000 })).toEqual(["$4,500 approved automatically in the last 7 days"]);
    expect(rule({ windowCents: 420_050, amountCents: 90_000 })).toEqual(["$4,200.50 approved automatically in the last 7 days"]);
  });

  it("on hold, or a check unmet: never automatic; every reason is listed", () => {
    expect(rule({ held: true })).toEqual(["Payouts on hold"]);
    expect(rule({ unmetChecks: ["Holding period passed"], amountCents: 300_000, held: true })).toEqual([
      "Not met: Holding period passed", "Payouts on hold", "Over $2,000",
    ]);
  });

  it("dollars: whole dollars plain, cents when there are any", () => {
    expect([dollars(200_000), dollars(420_050), dollars(5)]).toEqual(["$2,000", "$4,200.50", "$0.05"]);
  });
});

describe("2S5-BE-06 · the payout account's changedAt", () => {
  const ready = { status: "READY", providerAccountId: "acct_1", changedAt: null };
  it("an account set up once (not set up → needs info → ready) never changed", () => {
    expect(nextChangedAt(null, { status: "NEEDS_INFO", providerAccountId: "acct_1" }, now)).toBeNull();
    expect(nextChangedAt({ status: "NEEDS_INFO", providerAccountId: "acct_1", changedAt: null }, { status: "READY", providerAccountId: "acct_1" }, now)).toBeNull();
    /* A status sync that changes nothing leaves it alone. */
    expect(nextChangedAt(ready, { status: "READY", providerAccountId: "acct_1" }, now)).toBeNull();
  });
  it("a new provider account id, or leaving READY and coming back, is a change", () => {
    expect(nextChangedAt(ready, { status: "READY", providerAccountId: "acct_2" }, now)).toEqual(now);
    const left = nextChangedAt(ready, { status: "NEEDS_INFO", providerAccountId: "acct_1" }, days(1));
    expect(left).toEqual(days(1));
    expect(nextChangedAt({ status: "NEEDS_INFO", providerAccountId: "acct_1", changedAt: left }, { status: "READY", providerAccountId: "acct_1" }, now)).toEqual(now);
  });
});

describe("2S5-BE-07 · planFailure", () => {
  const fresh = { retryCount: 0, accountRetryUsed: false };
  it("TEMPORARY: retried about 1, 6 and 24 hours after each failure, then BTG's", () => {
    const at = (h: number) => new Date(now.getTime() + h * 3_600_000);
    expect(planFailure("TEMPORARY", fresh, now)).toMatchObject({ waitingOn: "SYSTEM_RETRY", nextRetryAt: at(1), tellPayee: false });
    expect(planFailure("TEMPORARY", { ...fresh, retryCount: 1 }, now).nextRetryAt).toEqual(at(6));
    expect(planFailure("TEMPORARY", { ...fresh, retryCount: 2 }, now).nextRetryAt).toEqual(at(24));
    expect(planFailure("TEMPORARY", { ...fresh, retryCount: 3 }, now)).toEqual({ waitingOn: "BTG", nextRetryAt: null, reviewReasons: [GAVE_UP], tellPayee: false });
    expect(GAVE_UP).toBe("Couldn't be sent after 3 tries");
  });
  it("ACCOUNT: the payee is told and it waits for their account, once; then BTG's", () => {
    expect(planFailure("ACCOUNT", fresh, now)).toEqual({ waitingOn: "PAYEE_ACCOUNT", nextRetryAt: null, reviewReasons: [WAITING_FOR_PAYEE], tellPayee: true });
    expect(planFailure("ACCOUNT", { ...fresh, accountRetryUsed: true }, now)).toEqual({ waitingOn: "BTG", nextRetryAt: null, reviewReasons: [ACCOUNT_STILL_FAILING], tellPayee: false });
  });
  it("OTHER: straight to BTG", () => {
    expect(planFailure("OTHER", fresh, now)).toEqual({ waitingOn: "BTG", nextRetryAt: null, reviewReasons: [], tellPayee: false });
  });
  it("who a payout waits on: REQUESTED → BTG; FAILED as stored (BTG when older rows have none); otherwise nobody", () => {
    expect(waitingOnOf({ state: "REQUESTED", waitingOn: null })).toBe("BTG");
    expect(waitingOnOf({ state: "FAILED", waitingOn: "SYSTEM_RETRY" })).toBe("SYSTEM_RETRY");
    expect(waitingOnOf({ state: "FAILED", waitingOn: null })).toBe("BTG");
    expect(waitingOnOf({ state: "APPROVED", waitingOn: null })).toBeNull();
  });
});
