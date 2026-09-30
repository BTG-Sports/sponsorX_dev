import { describe, expect, it } from "vitest";

import { accessFor, mayUse } from "@/lib/admin-access";
import {
  accountTracker, approveBlock, askedAgo, categoryOptions, decisionChecks, requestRefusal, requestTab, stateBadge, tabFor,
  whatHappens, type ApiSponsorRequestDetail,
} from "@/lib/sponsor-requests-live";

/* 2S1-FE-03 — BTG's sponsor-request screens: what they derive from the API. */

const base: ApiSponsorRequestDetail = {
  id: "r1", state: "NEW", businessName: "Harbor Coffee", contactName: "Dana Brooks", email: "dana@harborcoffee.example",
  categoryText: "Coffee shop / café", budget: "$1,000–$2,500", zoho: "LEAD", createdAt: "2026-09-28T10:00:00.000Z",
  decidedAt: null, sponsorId: null, phone: "(301) 555-0142",
  answers: [{ label: "Goal", value: "More weekday foot traffic" }], suggestedCategories: ["RESTAURANT"],
  zohoLeadId: "zl1", decisionNote: null, checks: { emailInUse: false, matches: [] }, progress: null,
};
const twin = { ...base, checks: { emailInUse: false, matches: [{ id: "s9", name: "Harbor Coffee", fromZoho: true, hasLogin: false }] } };

describe("the queue", () => {
  it("tabs map to API states; an unknown tab is Waiting", () => {
    expect(requestTab("approved").state).toBe("APPROVED");
    expect(requestTab(undefined).state).toBe("NEW");
    expect(requestTab("nope").key).toBe("waiting");
    expect(tabFor("DECLINED")).toBe("declined");
  });
  it("says how long it has waited, in words", () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    expect(askedAgo("2026-09-30T08:00:00.000Z", now)).toBe("today");
    expect(askedAgo("2026-09-29T08:00:00.000Z", now)).toBe("yesterday");
    expect(askedAgo("2026-09-28T08:00:00.000Z", now)).toBe("2 days ago");
  });
  it("every state is in words, not colour alone", () => {
    expect(stateBadge("NEW").label).toMatch(/Waiting for BTG/);
    expect(stateBadge("APPROVED").label).toMatch(/Account opened/);
    expect(stateBadge("DECLINED").label).toBe("Declined");
  });
});

describe("the decision", () => {
  it("offers every category, the suggested one first", () => {
    const opts = categoryOptions(["RESTAURANT"]);
    expect(opts[0]).toEqual({ value: "RESTAURANT", label: "Restaurant", suggested: true });
    expect(opts.filter((o) => o.value === "RESTAURANT")).toHaveLength(1);
    expect(opts.length).toBeGreaterThan(20);
  });

  it("all checks pass on a clean request; Approve is on once a type is picked", () => {
    expect(decisionChecks(base).every((c) => c.ok)).toBe(true);
    expect(approveBlock(base, ["RESTAURANT"], null)).toBeNull();
    expect(approveBlock(base, [], null)).toMatch(/Pick at least one business type/);
  });

  it("SR-7 — an email already in use blocks approval, whatever else is chosen", () => {
    const used = { ...base, checks: { ...base.checks, emailInUse: true } };
    expect(decisionChecks(used)[0]).toMatchObject({ ok: false, label: "dana@harborcoffee.example already has a SponsorX login" });
    expect(approveBlock(used, ["RESTAURANT"], { kind: "new" })).toMatch(/already has a SponsorX login/);
  });

  it("SR-8 — a same-named sponsor must be answered: link to it, or say it's a new one", () => {
    expect(decisionChecks(twin)[1]).toMatchObject({ ok: false, label: "A sponsor named “Harbor Coffee” already exists (from Zoho)" });
    expect(approveBlock(twin, ["RESTAURANT"], null)).toMatch(/link to “Harbor Coffee” or create a new sponsor/);
    expect(approveBlock(twin, ["RESTAURANT"], { kind: "link", sponsorId: "s9" })).toBeNull();
    expect(approveBlock(twin, ["RESTAURANT"], { kind: "new" })).toBeNull();
    const busy = { ...twin, checks: { ...twin.checks, matches: [{ ...twin.checks.matches[0]!, hasLogin: true }] } };
    expect(approveBlock(busy, ["RESTAURANT"], { kind: "link", sponsorId: "s9" })).toMatch(/already has people signing in/);
  });

  it("SR-3 — the confirm says what approving does", () => {
    expect(whatHappens(base, ["RESTAURANT"], null)).toEqual([
      "Harbor Coffee’s account is created with business type Restaurant",
      "A login for dana@harborcoffee.example",
      "A sign-in email is sent",
      "It’s added to Zoho as an account",
    ]);
    expect(whatHappens(twin, ["RESTAURANT", "FAST_FOOD"], { kind: "link", sponsorId: "s9" })[0]).toBe(
      "Harbor Coffee is linked to the existing sponsor “Harbor Coffee”, with business type Restaurant, Fast food",
    );
    expect(whatHappens(twin, ["RESTAURANT"], { kind: "link", sponsorId: "s9" })[3]).toBe("It stays linked to its account in Zoho");
  });

  it("a refusal is the API's own words", () => {
    expect(requestRefusal(409, { error: { message: "This request was already approved." } }).message).toBe("This request was already approved.");
    expect(requestRefusal(403, null).message).toMatch(/can’t decide/);
  });
});

describe("SR-4 — the account's progress, only as recorded", () => {
  const approved: ApiSponsorRequestDetail = {
    ...base, state: "APPROVED", decidedAt: "2026-09-30T10:05:00.000Z", sponsorId: "s1",
    progress: { categories: ["RESTAURANT"], decidedBy: { email: "sam@btg.example", roles: ["SALES"] }, emailSentAt: null, signedIn: false },
  };
  it("an email not yet sent is shown as queued, never as sent", () => {
    const t = accountTracker(approved)!;
    expect(t.map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
    expect(t[2]!.note).toMatch(/Queued/);
  });
  it("sent, then signed in", () => {
    expect(accountTracker({ ...approved, progress: { ...approved.progress!, emailSentAt: "2026-09-30T10:06:00.000Z" } })!.map((s) => s.state)).toEqual(["done", "done", "done", "current"]);
    expect(accountTracker({ ...approved, progress: { ...approved.progress!, emailSentAt: "2026-09-30T10:06:00.000Z", signedIn: true } })!.map((s) => s.state)).toEqual(["done", "done", "done", "done"]);
  });
  it("no tracker for a waiting or declined request", () => {
    expect(accountTracker(base)).toBeNull();
    expect(accountTracker({ ...approved, state: "DECLINED" })).toBeNull();
  });
});

describe("who sees the desk", () => {
  it("BTG admins and Sales — the roles the API lets decide", () => {
    expect(accessFor("/admin/sponsor-requests/r1")?.roles).toEqual(["SUPER_ADMIN", "BTG_ADMIN", "SALES"]);
    expect(mayUse("/admin/sponsor-requests", ["SALES"])).toBe(true);
    expect(mayUse("/admin/sponsor-requests", ["FINANCE"])).toBe(false);
    expect(mayUse("/admin/sponsor-requests", ["CAMPAIGN_MGR"])).toBe(false);
  });
});
