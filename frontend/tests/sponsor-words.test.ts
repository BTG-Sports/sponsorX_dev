import { describe, expect, it } from "vitest";

import { FIRST_SIGN_IN_WINDOW_MS, briefWord, campaignWord, deliverableWord, orderWord, sourceWord, delta, compactNumber, welcomeWord } from "@/lib/sponsor-words";

describe("sponsor words — plain language, never an enum", () => {
  it("campaign states", () => {
    expect(campaignWord("ACTIVE")).toEqual({ text: "Running", tone: "live" });
    /* POL-FE-20 — APPROVAL is fully staffed and starts by itself: nothing waits on the sponsor. */
    expect(campaignWord("APPROVAL")).toEqual({ text: "Ready to start", tone: "info" });
    expect(campaignWord("APPROVAL").text).not.toMatch(/your OK/i);
    expect(campaignWord("COMPLETED")).toEqual({ text: "Finished", tone: "done" });
    expect(campaignWord("SOMETHING_NEW").text).toBe("Something new");
  });

  it("POL-FE-32 — Welcome on a first sign-in, Welcome back after", () => {
    const created = Date.UTC(2026, 9, 29, 9, 0);
    /* Approved minutes ago, signing in now. */
    expect(welcomeWord({ createdAt: created, lastSignInAt: created + 5 * 60_000 })).toBe("Welcome");
    /* Back after lunch on the first day is still new here. */
    expect(welcomeWord({ createdAt: created, lastSignInAt: created + FIRST_SIGN_IN_WINDOW_MS })).toBe("Welcome");
    /* A sign-in a week later. */
    expect(welcomeWord({ createdAt: created, lastSignInAt: created + 7 * 24 * 3_600_000 })).toBe("Welcome back");
    /* No sign-in on record yet is a first one; no dates at all assumes nothing new. */
    expect(welcomeWord({ createdAt: created, lastSignInAt: null })).toBe("Welcome");
    expect(welcomeWord({})).toBe("Welcome back");
    expect(welcomeWord({ createdAt: null, lastSignInAt: null })).toBe("Welcome back");
  });
  it("orders, briefs, deliverables and sources", () => {
    expect(orderWord("AWAITING_PAYMENT")).toEqual({ text: "Ready to pay", tone: "you" });
    expect(orderWord("IN_DELIVERY").text).toBe("In progress");
    expect(briefWord("QUALIFIED").text).toBe("Being matched by BTG");
    expect(briefWord("DRAFT").text).toBe("Being matched by BTG");
    expect(deliverableWord("SPONSOR_REVIEW")).toEqual({ text: "Waiting for your OK", tone: "you" });
    expect(sourceWord("VERIFIED_API", "Instagram")).toBe("Checked with Instagram");
    expect(sourceWord("SELF_REPORTED")).toBe("Reported by the athlete");
  });
  it("delta: a fraction of the previous figure, null when there is nothing to compare", () => {
    expect(delta(118, 100)).toBeCloseTo(0.18);
    expect(delta(5, 0)).toBeNull();
    expect(delta(5, null)).toBeNull();
  });
  it("compact numbers for tight tiles", () => {
    expect(compactNumber(950)).toBe("950");
    expect(compactNumber(54_100)).toBe("54.1k");
    expect(compactNumber(2_400_000)).toBe("2.4M");
  });
  it("rounds before choosing the unit, so a rollover lands in the next one", () => {
    expect(compactNumber(999_950)).toBe("1M");
    expect(compactNumber(9_999)).toBe("9,999");
    expect(compactNumber(10_000)).toBe("10k");
  });
});
