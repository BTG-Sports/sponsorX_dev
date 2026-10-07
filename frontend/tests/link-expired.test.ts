import { describe, expect, it } from "vitest";

import { EXPIRED_LINE, LINK_KINDS, RENEWABLE_KINDS, isRenewable, linkExpiredFrom, renewOutcome } from "../src/lib/link-expired";

/* --------------------------------------------------------------------------
   2S8-FE-01 — reading the API's "this link has expired" (410 link_expired)
   and the words after asking for a fresh one.
   -------------------------------------------------------------------------- */

const expired = (kind?: string, message = "This link has expired — links work for 14 days.") => ({
  error: { code: "link_expired", message, ...(kind ? { kind } : {}), renew: kind ? { method: "POST", path: "/api/v1/public/links/renew", body: { kind } } : null },
});

describe("linkExpiredFrom", () => {
  it("a 410 link_expired is expired, with the kind the API named", () => {
    expect(linkExpiredFrom(410, expired("athlete-email"))).toEqual({ kind: "athlete-email", message: "This link has expired — links work for 14 days." });
  });
  it("falls back to the page's own kind when the body does not name one", () => {
    expect(linkExpiredFrom(410, expired(), "intake")).toEqual({ kind: "intake", message: "This link has expired — links work for 14 days." });
    expect(linkExpiredFrom(410, { error: { code: "link_expired" } }, "onboarding")).toEqual({ kind: "onboarding", message: EXPIRED_LINE });
  });
  it("the API's kind wins over the page's fallback", () => {
    expect(linkExpiredFrom(410, expired("handoff-email"), "handoff")?.kind).toBe("handoff-email");
  });
  it("is null for every other answer", () => {
    expect(linkExpiredFrom(400, expired("intake"))).toBeNull();
    expect(linkExpiredFrom(404, { error: { code: "not_found", message: "No application matches that link." } }, "intake")).toBeNull();
    expect(linkExpiredFrom(410, { error: { code: "gone", message: "Gone." } }, "intake")).toBeNull();
    expect(linkExpiredFrom(410, null, "intake")).toBeNull();
    expect(linkExpiredFrom(410, "not json", "intake")).toBeNull();
    expect(linkExpiredFrom(410, { error: { code: "link_expired" } })).toBeNull();
  });
});

describe("the kinds", () => {
  it("names every link the API expires, and which can be renewed by email", () => {
    expect(LINK_KINDS).toContain("claim-email");
    expect(RENEWABLE_KINDS).not.toContain("account-reactivation");
    expect(RENEWABLE_KINDS).not.toContain("support");
    expect(isRenewable("intake")).toBe(true);
    expect(isRenewable("support")).toBe(false);
    expect(isRenewable("")).toBe(false);
    expect(isRenewable(42)).toBe(false);
  });
});

describe("renewOutcome", () => {
  it("202 is sent; 429 is the hourly limit; anything else is a soft failure", () => {
    expect(renewOutcome(202)).toEqual({ ok: true, text: "Sent — check your email." });
    expect(renewOutcome(429).ok).toBe(false);
    expect(renewOutcome(429).text).toMatch(/hour/);
    expect(renewOutcome(500).ok).toBe(false);
    expect(renewOutcome(0).text).toMatch(/reach SponsorX/);
  });
});
