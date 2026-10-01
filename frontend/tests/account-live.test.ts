import { describe, expect, it } from "vitest";

import {
  closeLine, comingOfAgeView, daysLeft, payoutLine, reactivateView, sampleClosedAccount, sampleComingOfAge, signInLine,
} from "@/lib/account-live";
import { accountPanel } from "@/lib/payouts-live";

/* 2S1-FE-08 — account settings, closing / reactivating, coming of age: the words they derive. */

const now = new Date("2026-10-01T12:00:00.000Z");
const DAY = 86_400_000;

describe("sign-in and payouts", () => {
  it("says the address and whether it's confirmed", () => {
    expect(signInLine("riley@example.com", true)).toBe("riley@example.com · confirmed");
    expect(signInLine("riley@example.com", false)).toBe("riley@example.com · not confirmed yet");
    expect(signInLine(null, true)).toBe("No email on this login");
  });
  it("says the payout account's status and who manages it — never a bank detail", () => {
    const ready = accountPanel({ status: "READY", provider: "stripe", canSetUp: true, testProvider: false, updatedAt: null }, "you");
    expect(payoutLine(ready)).toBe("Active ✓ · managed by Stripe");
    const none = accountPanel({ status: "NOT_SET_UP", provider: "none", canSetUp: false, testProvider: false, updatedAt: null }, "you");
    expect(payoutLine(none)).toBe("Not set up ● · managed by Stripe");
    /* The Stripe step keeps its button, disabled with the reason, when the provider isn't connected. */
    expect(none.cta.disabled).toBe(true);
    expect(none.cta.disabledNote).toBeTruthy();
  });
});

describe("closing", () => {
  it("a guardian has no listings to end", () => {
    expect(closeLine("athlete")).toMatch(/^Your listings end/);
    expect(closeLine("property")).toMatch(/within 30 days/);
    expect(closeLine("guardian")).not.toMatch(/listings/);
  });
});

describe("reactivating", () => {
  it("counts the 30 days from closing", () => {
    const v = reactivateView(sampleClosedAccount("CLOSED_SELF", "Riley", now), now);
    expect(v?.kind).toBe("self");
    if (v?.kind !== "self") return;
    expect(v.left).toBe("23 days left");
    expect(v.headline).toBe("Riley, your account closed on Sep 24.");
    expect(v.body).toMatch(/^Reactivate by Oct 24/);
    expect(v.canReactivate).toBe(true);
  });
  it("after 30 days there's nothing to reactivate", () => {
    const v = reactivateView({ state: "CLOSED_SELF", greeting: "Riley", closedAt: new Date(now.getTime() - 31 * DAY).toISOString() }, now);
    expect(v?.kind === "self" && v.canReactivate).toBe(false);
  });
  it("an account closed by BTG can't reactivate itself — it asks BTG", () => {
    const v = reactivateView(sampleClosedAccount("CLOSED_BY_BTG", "Riley", now), now);
    expect(v?.kind).toBe("btg");
    if (v?.kind !== "btg") return;
    expect(v.body).toMatch(/can’t reactivate it yourself/);
    expect(v.kept).toBe("Your documents are kept until Oct 24, then deleted.");
  });
  it("an active account has no reactivation page", () => {
    expect(reactivateView({ state: "ACTIVE", greeting: "Riley", closedAt: null }, now)).toBeNull();
  });
});

describe("coming of age", () => {
  it("counts down the 90 days, from either side", () => {
    const c = sampleComingOfAge(now);
    const athlete = comingOfAgeView(c, "athlete", now)!;
    expect(athlete.daysLeft).toBe(72);
    expect(athlete.line).toBe("You turned 18 on Sep 13. Upload a government ID within 90 days to take over your account — 72 days left.");
    expect(athlete.cta).toBe("Upload government ID");
    const guardian = comingOfAgeView(c, "guardian", now)!;
    expect(guardian.title).toBe("Jordan can now take over the account");
    expect(guardian.cta).toBe("Send Jordan the link");
    expect(guardian.pausedDeals).toMatch(/with Jordan/);
  });
  it("uses the place's age of majority, and goes away once the ID is in", () => {
    const c = { ...sampleComingOfAge(now), ageOfMajority: 19 };
    expect(comingOfAgeView(c, "athlete", now)!.title).toBe("You’re 19 — take over your account");
    expect(comingOfAgeView({ ...c, idUploaded: true }, "athlete", now)).toBeNull();
  });
  it("never counts below zero", () => {
    expect(daysLeft(new Date(now.getTime() - DAY), now)).toBe(0);
  });
});
