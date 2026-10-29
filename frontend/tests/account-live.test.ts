import { describe, expect, it } from "vitest";

import {
  closeLine, comingOfAgeView, daysLeft, payoutLine, sampleComingOfAge, signInLine,
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

/* Reactivating (2S1-BE-13) is tested in account-closure-live.test.ts. */

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
  /* POL-FE-02 / POL-BE-02 — the ID is in but didn't read clear: BTG is checking it; no CTA, the countdown is paused. */
  it("says the ID is received and BTG is checking it, from either side, with no CTA", () => {
    const c = { ...sampleComingOfAge(now), checking: true };
    const athlete = comingOfAgeView(c, "athlete", now)!;
    expect(athlete).toMatchObject({ title: "ID received — BTG is checking it", cta: "", checking: true, heading: "Hi, Jordan" });
    expect(athlete.line).toMatch(/^Your government ID is in\. .*your guardian stays in control, and the 90 days don’t run out\./);
    expect(athlete.pausedItems).toBe("Paused until BTG confirms your ID.");
    const guardian = comingOfAgeView(c, "guardian", now)!;
    expect(guardian).toMatchObject({ title: "ID received — BTG is checking it", cta: "", checking: true, heading: "Jordan’s account" });
    expect(guardian.line).toMatch(/^Jordan’s government ID is in\. .*you stay in control/);
    expect(guardian.pausedDeals).toBe("Sponsors can’t start new deals with Jordan until BTG confirms the ID.");
    /* Not checking: the usual countdown, and `checking` is false. */
    expect(comingOfAgeView(sampleComingOfAge(now), "athlete", now)).toMatchObject({ checking: false, cta: "Upload government ID" });
    /* Once it's in and confirmed, nothing to show. */
    expect(comingOfAgeView({ ...c, idUploaded: true }, "athlete", now)).toBeNull();
  });
});
