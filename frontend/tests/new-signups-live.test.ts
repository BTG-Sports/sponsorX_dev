import { describe, expect, it } from "vitest";

import {
  SIGNUP_BACKEND, SIGNUP_TABS, firstName, inTab, orgHref, orgState, signupBadge, signupTab, sponsorRows, streamApiQuery, streamParams, streamRowView, tabCount, tabShows,
  type ApiSponsorSignup, type ApiStreamRow, type Signup,
} from "../src/lib/new-signups-live";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the New sign-ups desk's tabs, words and live sponsor rows.
   -------------------------------------------------------------------------- */

const sponsor = (over: Partial<ApiSponsorSignup>): ApiSponsorSignup => ({
  id: "inq_1", state: "APPROVED", businessName: "Harbor Coffee", contactName: "Dana Brooks", email: "dana@harbor.example",
  categoryText: null, budget: null, zoho: "LEAD", createdAt: "2026-09-29T10:00:00.000Z", decidedAt: "2026-09-30T10:00:00.000Z",
  sponsorId: "sp_1", autoApproved: true, reviewReasons: [], ...over,
});

describe("tabs", () => {
  const rows: Signup[] = [
    { id: "o1", kind: "ORGANIZATION", name: "Westfield Hawks", sub: "Team · MD", signedUpAt: "2026-09-20T14:00:00Z", state: "AUTO_APPROVED", reasons: [] },
    { id: "o2", kind: "ORGANIZATION", name: "Bay FC", sub: "Team", signedUpAt: "2026-09-28T12:00:00Z", state: "NEEDS_REVIEW", reasons: ["Name already registered"] },
    { id: "a1", kind: "ATHLETE", name: "Riley", sub: "Soccer", signedUpAt: "2026-09-28T12:00:00Z", state: "AUTO_APPROVED", reasons: [] },
  ];
  it("falls back to All and counts rows per tab", () => {
    expect(signupTab("nope").key).toBe("all");
    expect(signupTab(["review"]).key).toBe("review");
    expect(signupTab("spo").label).toBe("Sponsors");
    expect(tabCount(SIGNUP_TABS.find((t) => t.key === "review")!, rows)).toBe(1);
    expect(rows.filter((s) => inTab(SIGNUP_TABS.find((t) => t.key === "org")!, s))).toHaveLength(2);
  });
  it("each section shows under All, Needs review and its own tab only", () => {
    expect(tabShows(signupTab("all"), "ATHLETE")).toBe(true);
    expect(tabShows(signupTab("review"), "SPONSOR")).toBe(true);
    expect(tabShows(signupTab("ath"), "ATHLETE")).toBe(true);
    expect(tabShows(signupTab("ath"), "ORGANIZATION")).toBe(false);
    expect(tabShows(signupTab("spo"), "GUARDIAN")).toBe(false);
  });
});

describe("words", () => {
  it("badges and first names", () => {
    expect(signupBadge({ state: "AUTO_APPROVED" }, "2026-09-23T10:02:00Z").label).toBe("Approved automatically · Sep 23");
    expect(signupBadge({ state: "NEEDS_REVIEW" }).tone).toBe("warn");
    expect(firstName("Carmen Reyes")).toBe("Carmen");
    expect(firstName("[Athlete name]")).toBe("[Athlete name]");
    expect(signupBadge({ state: "APPROVED" }).label).toBe("Approved by BTG");
  });
  it("each section names its own backend task", () => {
    expect(SIGNUP_BACKEND.ORGANIZATION).toMatch(/^2S1-BE-06 /);
    expect(SIGNUP_BACKEND.ATHLETE).toMatch(/^2S1-BE-09 /);
    expect(SIGNUP_BACKEND.GUARDIAN).toMatch(/^2S1-BE-10 /);
  });
});

describe("organization rows (GET /onboarding/signups)", () => {
  it("open Group A's profile, and an approval BTG made by hand reads Approved by BTG", () => {
    expect(orgHref("onb 1")).toBe("/admin/onboarding/onb%201");
    expect(orgState({ state: "AUTO_APPROVED", autoApproved: true })).toBe("AUTO_APPROVED");
    expect(orgState({ state: "AUTO_APPROVED", autoApproved: false })).toBe("APPROVED");
    expect(signupBadge({ state: orgState({ state: "AUTO_APPROVED", autoApproved: false }) }).label).toBe("Approved by BTG");
    expect(orgState({ state: "NEEDS_REVIEW", autoApproved: false })).toBe("NEEDS_REVIEW");
    expect(orgState({ state: "REJECTED", autoApproved: true })).toBe("REJECTED");
  });
});

describe("sponsorRows", () => {
  it("puts held sponsors first with their reasons, skips NEW ones not held, and tells automatic from BTG approval", () => {
    const rows = sponsorRows(
      [sponsor({}), sponsor({ id: "inq_2", businessName: "Bay Gym", autoApproved: false })],
      [sponsor({ id: "inq_3", state: "NEW", businessName: "Vape Hut", reviewReasons: ["Restricted business type: Vaping"] }), sponsor({ id: "inq_4", state: "NEW" })],
    );
    expect(rows.map((r) => r.id)).toEqual(["inq_3", "inq_1", "inq_2"]);
    expect(rows[0]).toMatchObject({ reason: "Restricted business type: Vaping", badge: { label: "Needs review" } });
    expect(rows[1]).toMatchObject({ when: "Sep 30", badge: { label: "Approved automatically" }, reason: "All checks passed" });
    expect(rows[2]!.badge.label).toBe("Approved by BTG");
  });
});

/* P1-ART-15 — the Intake Stream: the URL it reads, and each row's words. */
describe("the stream's URL", () => {
  it("reads kind, Needs review and search, and builds the API query", () => {
    expect(streamParams({ kind: "ATHLETE", review: "1", q: " riley " })).toEqual({ kind: "ATHLETE", review: true, q: "riley" });
    expect(streamParams({})).toEqual({ kind: "", review: false, q: "" });
    expect(streamParams({ kind: "NOPE" }).kind).toBe("");
    expect(streamApiQuery({ kind: "SPONSOR", review: "1", page: "2", size: "24" })).toBe("?page=2&size=24&kind=SPONSOR&review=1");
    expect(streamApiQuery({})).toBe("?page=1&size=12");
  });

  it("keeps the old ?tab= links working — the account-closure email sends ?tab=review", () => {
    expect(streamParams({ tab: "review" })).toEqual({ kind: "", review: true, q: "" });
    expect(streamParams({ tab: "org" }).kind).toBe("ORGANIZATION");
    expect(streamParams({ tab: "spo" }).kind).toBe("SPONSOR");
    expect(streamParams({ tab: "all" })).toEqual({ kind: "", review: false, q: "" });
    /* an explicit filter beats the legacy tab */
    expect(streamParams({ tab: "org", kind: "GUARDIAN" }).kind).toBe("GUARDIAN");
  });
});

describe("a stream row", () => {
  const row = (over: Partial<ApiStreamRow>): ApiStreamRow => ({
    kind: "ATHLETE", id: "a1", name: "Riley Carter", sub: "Basketball · 17", signedUpAt: "2026-09-30T10:00:00.000Z",
    state: "AUTO_APPROVED", reasons: [], flags: [], ...over,
  });

  it("opens where each kind is reviewed", () => {
    expect(streamRowView(row({})).href).toBe("/admin/new-signups/athletes/a1");
    expect(streamRowView(row({ kind: "GUARDIAN", id: "g1" })).href).toBe("/admin/new-signups/guardians/g1");
    expect(streamRowView(row({ kind: "ORGANIZATION", id: "o1" })).href).toBe("/admin/onboarding/o1");
    expect(streamRowView(row({ kind: "SPONSOR", id: "s1" })).href).toBe("/admin/sponsor-requests/s1");
  });

  it("says the desk's words, and holds what needs review", () => {
    const auto = streamRowView(row({}));
    expect(auto).toMatchObject({ mono: "AT", kindWord: "Athlete", when: "Sep 30", held: false, reason: "All checks passed" });
    expect(auto.badge.label).toBe("Approved automatically");
    const held = streamRowView(row({ kind: "SPONSOR", state: "NEEDS_REVIEW", reasons: ["Their email already has a SponsorX login"] }));
    expect(held).toMatchObject({ mono: "SP", held: true, reason: "Their email already has a SponsorX login" });
    expect(held.badge).toMatchObject({ label: "Needs review", tone: "warn" });
    const flagged = streamRowView(row({ flags: ["Place not in the age table"] }));
    expect(flagged).toMatchObject({ held: true, reason: "Place not in the age table" });
    expect(streamRowView(row({ kind: "GUARDIAN", state: "REJECTED" })).badge.label).toBe("Rejected");
    expect(streamRowView(row({ kind: "ORGANIZATION", state: "APPROVED" })).reason).toBe("Reviewed and approved by BTG");
    /* held with no reason given (an organisation waiting on BTG) never reads "All checks passed" */
    expect(streamRowView(row({ kind: "ORGANIZATION", state: "NEEDS_REVIEW" })).reason).toBe("Waiting for BTG’s review");
  });
});
