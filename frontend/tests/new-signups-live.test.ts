import { describe, expect, it } from "vitest";
import { mayUse } from "../src/lib/admin-access";

import {
  SIGNUP_BACKEND, SIGNUP_TABS, firstName, inTab, orgHref, orgState, signupBadge, signupTab, sponsorRows, kindBars, streamApiQuery, streamEmpty, streamParams, streamPatch, streamRowView, streamStats, tabCount, tabShows,
  type ApiSponsorSignup, type ApiStreamRow, type ApiStreamSummary, type KindFigures, type Signup, type StreamFilter,
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
    expect(orgHref("onb 1")).toBe("/admin/new-signups/organizations/onb%201");
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

  it("waiting-on-them and declined rows (Onboarding and Sponsor requests folded in, 2026-11-21) are neither BTG's move nor approved", () => {
    const w = streamRowView(row({ kind: "ORGANIZATION", id: "o2", state: "WAITING", reasons: ["Asked for changes"] }));
    expect(w).toMatchObject({ held: false, reason: "Asked for changes", pill: { label: "Waiting on them", tone: "cyan", act: false } });
    expect(streamRowView(row({ kind: "SPONSOR", id: "s2", state: "WAITING" })).reason).toBe("Nothing for BTG yet");
    const d = streamRowView(row({ kind: "SPONSOR", id: "s3", state: "DECLINED" }));
    expect(d).toMatchObject({ held: false, reason: "Declined by BTG", pill: { label: "Declined", tone: "muted", act: false } });
  });

  it("Sales opens New accounts and a sponsor's record, never an athlete's, guardian's or organization's, or the rules", () => {
    expect(mayUse("/admin/new-signups", ["SALES"])).toBe(true);
    expect(mayUse("/admin/new-signups/sponsors/s1", ["SALES"])).toBe(true);
    for (const p of ["/admin/new-signups/athletes/a1", "/admin/new-signups/guardians/g1", "/admin/new-signups/organizations/o1", "/admin/new-signups/rules"]) {
      expect(mayUse(p, ["SALES"]), p).toBe(false);
      expect(mayUse(p, ["BTG_ADMIN"]), p).toBe(true);
    }
  });

  it("opens where each kind is reviewed", () => {
    expect(streamRowView(row({})).href).toBe("/admin/new-signups/athletes/a1");
    expect(streamRowView(row({ kind: "GUARDIAN", id: "g1" })).href).toBe("/admin/new-signups/guardians/g1");
    expect(streamRowView(row({ kind: "ORGANIZATION", id: "o1" })).href).toBe("/admin/new-signups/organizations/o1");
    expect(streamRowView(row({ kind: "SPONSOR", id: "s1" })).href).toBe("/admin/new-signups/sponsors/s1");
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

/* --------------------------------------------------------------------------
   POL-FE-109 — the desk redrawn like the Inventory: the pill, the status
   cards' words, the kind bars, the URL patches and the empty list.
   -------------------------------------------------------------------------- */

describe("the status pill", () => {
  const row = (over: Partial<ApiStreamRow>): ApiStreamRow => ({
    kind: "ATHLETE", id: "a1", name: "Riley Carter", sub: "Basketball", signedUpAt: "2026-09-30T10:00:00.000Z",
    state: "AUTO_APPROVED", reasons: [], flags: [], ...over,
  });
  it("pulses only when it is BTG's move", () => {
    expect(streamRowView(row({})).pill).toEqual({ label: "Approved automatically", tone: "green", act: false });
    expect(streamRowView(row({ state: "APPROVED" })).pill).toEqual({ label: "Approved by BTG", tone: "green", act: false });
    expect(streamRowView(row({ state: "NEEDS_REVIEW" })).pill).toEqual({ label: "Needs review", tone: "amber", act: true });
    expect(streamRowView(row({ flags: ["Place not in the age table"] })).pill).toEqual({ label: "Approved · flagged", tone: "amber", act: true });
    expect(streamRowView(row({ state: "REJECTED" })).pill).toEqual({ label: "Rejected", tone: "red", act: false });
  });
});

describe("the status cards", () => {
  const summary = (all: KindFigures, kinds: ApiStreamSummary["kinds"] = {}): ApiStreamSummary => ({ all, kinds });

  it("turns Needs review orange only when something is held", () => {
    const [held] = streamStats(summary({ total: 40, held: 3, auto: 30 }));
    expect(held).toMatchObject({ key: "review", value: 3, alert: true, sub: "Held for you. Open each one to decide." });
    const [clear] = streamStats(summary({ total: 40, held: 0, auto: 40 }));
    expect(clear).toMatchObject({ value: 0, alert: false, sub: "Nothing is waiting on you." });
  });

  it("never rounds the automatic share up to all, or down to none", () => {
    const auto = (a: KindFigures) => streamStats(summary(a))[1]!;
    expect(auto({ total: 1000, held: 1, auto: 999 }).sub).toBe("99% passed every check on their own");
    expect(auto({ total: 1000, held: 0, auto: 1 }).sub).toBe("1% passed every check on their own");
    expect(auto({ total: 8, held: 0, auto: 8 }).sub).toBe("100% passed every check on their own");
    expect(auto({ total: 8, held: 0, auto: 6 })).toMatchObject({ value: 6, share: 0.75 });
    expect(auto({ total: 0, held: 0, auto: 0 })).toMatchObject({ share: null, sub: "Nothing has signed up yet" });
  });

  it("counts everything under All sign-ups", () => {
    expect(streamStats(summary({ total: 40, held: 3, auto: 30 }))[2]).toMatchObject({ key: "all", label: "All sign-ups", value: 40 });
  });

  it("measures each kind the role reads against the largest, in the desk's order", () => {
    const bars = kindBars(summary({ total: 50, held: 2, auto: 40 }, {
      SPONSOR: { total: 10, held: 2, auto: 8 },
      ATHLETE: { total: 40, held: 0, auto: 32 },
      GUARDIAN: { total: 0, held: 0, auto: 0 },
    }));
    expect(bars.map((b) => b.kind)).toEqual(["ATHLETE", "GUARDIAN", "SPONSOR"]);
    expect(bars.map((b) => b.share)).toEqual([1, 0, 0.25]);
    expect(bars[2]).toMatchObject({ label: "Sponsors", total: 10, held: 2 });
    expect(kindBars(summary({ total: 0, held: 0, auto: 0 }))).toEqual([]);
  });
});

describe("the desk's URL patches", () => {
  it("keeps the other filter and always drops a legacy tab", () => {
    expect(streamPatch({ kind: "ATHLETE", review: false }, { review: true })).toEqual({ kind: "ATHLETE", review: "1", tab: null });
    expect(streamPatch({ kind: "ATHLETE", review: true }, { kind: "" })).toEqual({ kind: null, review: "1", tab: null });
    expect(streamPatch({ kind: "", review: true }, { review: false })).toEqual({ kind: null, review: null, tab: null });
    expect(streamPatch({ kind: "", review: false }, { kind: "SPONSOR" })).toEqual({ kind: "SPONSOR", review: null, tab: null });
  });

  it("turns an old ?tab= link into the explicit filter on the first change", () => {
    /* `?tab=review` (the emails' link) reads as review; picking a kind must keep it. */
    const f = streamParams({ tab: "review" });
    expect(streamPatch(f, { kind: "GUARDIAN" })).toEqual({ kind: "GUARDIAN", review: "1", tab: null });
    /* `?tab=ath` reads as Athletes; "All kinds" must really clear it. */
    expect(streamPatch(streamParams({ tab: "ath" }), { kind: "" })).toEqual({ kind: null, review: null, tab: null });
  });
});

describe("an empty list", () => {
  const f = (over: Partial<StreamFilter>): StreamFilter => ({ kind: "", review: false, q: "", ...over });
  it("says why, most specific first", () => {
    expect(streamEmpty(f({ q: "zed", review: true, kind: "ATHLETE" }))).toMatchObject({ title: "No sign-ups match “zed”", filtered: true });
    expect(streamEmpty(f({ review: true }))).toMatchObject({ title: "Nothing needs review", filtered: false });
    expect(streamEmpty(f({ review: true, kind: "SPONSOR" })).title).toBe("No sponsors need review");
    expect(streamEmpty(f({ kind: "GUARDIAN" }))).toMatchObject({ title: "No guardians have signed up yet", filtered: true });
    expect(streamEmpty(f({}))).toMatchObject({ title: "No sign-ups yet", filtered: false });
  });
});
