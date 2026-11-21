import { describe, expect, it } from "vitest";

import { accessFor, mayUse } from "@/lib/admin-access";
import {
  accountTracker, approveBlock, askedAgo, categoryOptions, decisionChecks, documentLine, emptyTitle, rejectSteps, reinstateSteps,
  requestFacts, requestPill, requestRefusal, requestStanding, requestTab, reviewLine, stateBadge, tabFor, tabLabel, whatHappens, type ApiSponsorRequestDetail,
} from "@/lib/sponsor-requests-live";

/* 2S1-FE-03 — BTG's sponsor-request screens: what they derive from the API. */

const base: ApiSponsorRequestDetail = {
  id: "r1", state: "NEW", businessName: "Harbor Coffee", contactName: "Dana Brooks", email: "dana@harborcoffee.example",
  categoryText: "Coffee shop / café", budget: "$1,000–$2,500", zoho: "LEAD", createdAt: "2026-09-28T10:00:00.000Z",
  decidedAt: null, sponsorId: null, phone: "(301) 555-0142",
  answers: [{ label: "Goal", value: "More weekday foot traffic" }], suggestedCategories: ["RESTAURANT"],
  zohoLeadId: "zl1", decisionNote: null, checks: { emailInUse: false, matches: [] }, progress: null,
  autoApproved: false, reviewReasons: [], documents: [],
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

describe("rejected accounts (found in review: the Closed accounts desk links here to reinstate)", () => {
  it("REJECTED has its own tab — the API counts it — and never breaks the page", () => {
    expect(requestTab("rejected").state).toBe("REJECTED");
    expect(tabFor("REJECTED")).toBe("rejected");
    expect(tabLabel(tabFor("REJECTED"))).toBe("Rejected");
    expect(emptyTitle("REJECTED")).toBe("None rejected");
    /* A state this screen doesn't know yet falls back to Waiting instead of crashing. */
    expect(tabFor("SOMETHING_NEW" as never)).toBe("waiting");
    expect(stateBadge("REJECTED")).toEqual({ label: "✕ Rejected — logins off", tone: "danger" });
  });

  it("the Reject and Reinstate dialogs say what happens: logins off / on, the reason emailed", () => {
    const steps = rejectSteps(base);
    expect(steps[0]).toBe("Every login for Harbor Coffee is switched off — they can’t sign in");
    expect(steps[1]).toBe("Your reason is emailed to dana@harborcoffee.example, exactly as written");
    expect(steps.join(" ")).toMatch(/30 days/);
    const back = reinstateSteps(base);
    expect(back[0]).toMatch(/switched back on — Harbor Coffee can sign in again/);
    expect(back[1]).toBe("dana@harborcoffee.example is emailed that the account is back");
  });

  it("says how a request reached BTG — approved by itself, or why it waited", () => {
    expect(reviewLine({ ...base, state: "APPROVED", autoApproved: true })?.text).toMatch(/^Approved automatically/);
    expect(reviewLine({ ...base, reviewReasons: ["Business type “Other”: a person checks it"] }))
      .toEqual({ text: "Waiting for BTG because:", reasons: ["Business type “Other”: a person checks it"] });
    expect(reviewLine(base)).toBeNull();
  });

  it("names a proof of business by kind, file and size", () => {
    expect(documentLine({ id: "d1", kind: "PROOF_OF_BUSINESS", filename: "licence.pdf", contentType: "application/pdf", bytes: 245_760, uploadedAt: "2026-09-28T10:00:00.000Z" }))
      .toBe("Proof of business · licence.pdf · 240 KB");
    expect(documentLine({ id: "d2", kind: "PROOF_OF_BUSINESS", filename: "scan.png", contentType: "image/png", bytes: 3 * 1024 * 1024, uploadedAt: null }))
      .toBe("Proof of business · scan.png · 3.0 MB");
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

describe("the record page: one pill, the popup's first sentence, four tiles", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const doc = { id: "d1", kind: "PROOF_OF_BUSINESS", filename: "licence.pdf", contentType: "application/pdf", bytes: 1024, uploadedAt: "2026-09-28T10:00:00.000Z" };

  it("one pill per state; only a waiting request pulses", () => {
    expect(requestPill(base)).toEqual({ label: "Waiting for BTG", tone: "amber", act: true });
    expect(requestPill({ state: "APPROVED" })).toEqual({ label: "Account open", tone: "green", act: false });
    expect(requestPill({ state: "DECLINED" }).tone).toBe("muted");
    expect(requestPill({ state: "REJECTED" })).toEqual({ label: "Rejected · logins off", tone: "red", act: false });
  });

  it("the popup opens on where it stands; an email in use says it can't be approved", () => {
    expect(requestStanding(base)).toMatch(/^Approve to open their account/);
    expect(requestStanding({ ...base, checks: { ...base.checks, emailInUse: true } })).toMatch(/already has a SponsorX login/);
    expect(requestStanding({ ...base, state: "REJECTED" })).toMatch(/^Their logins are off/);
  });

  it("a waiting request: a failing check and a missing proof are orange; the last tile is how long it has waited", () => {
    const f = requestFacts(twin, now);
    expect(f.map((x) => x.key)).toEqual(["checks", "proof", "contact", "when"]);
    expect(f[0]).toMatchObject({ value: "2 of 3 passed", tone: "amber", note: "A sponsor named “Harbor Coffee” already exists (from Zoho)" });
    expect(f[1]).toMatchObject({ value: "Missing", tone: "amber" });
    expect(f[2]).toMatchObject({ value: "Dana Brooks", note: "dana@harborcoffee.example" });
    expect(f[3]).toMatchObject({ label: "Asked", note: "Waiting since 2 days ago", tone: "amber" });
    const clean = requestFacts({ ...base, documents: [doc] }, now);
    expect(clean[0]).toMatchObject({ value: "3 of 3 passed", tone: "green" });
    expect(clean[1]).toMatchObject({ value: "Uploaded", note: "licence.pdf", tone: "blue" });
  });

  it("a sent-back proof doesn't count; a flagged one is said", () => {
    expect(requestFacts({ ...base, documents: [{ ...doc, returned: { at: "2026-09-29T10:00:00.000Z", reason: "blurry" } }] }, now)[1]!.value).toBe("Missing");
    expect(requestFacts({ ...base, documents: [{ ...doc, check: { state: "FLAGGED", findings: [], checkedAt: null } }] }, now)[1]).toMatchObject({ note: "Reading it flagged something", tone: "amber" });
  });

  it("an open account's last tile is whether they signed in, as recorded", () => {
    const open: ApiSponsorRequestDetail = {
      ...base, state: "APPROVED", decidedAt: "2026-09-30T10:05:00.000Z", documents: [doc],
      progress: { categories: ["RESTAURANT"], decidedBy: null, emailSentAt: null, signedIn: false },
    };
    expect(requestFacts(open, now)[3]).toMatchObject({ label: "Signed in", value: "Not yet", note: "Sign-in email is queued" });
    expect(requestFacts({ ...open, progress: { ...open.progress!, emailSentAt: "2026-09-30T10:06:00.000Z" } }, now)[3]!.note).toBe("Sign-in email sent Sep 30");
    expect(requestFacts({ ...open, progress: { ...open.progress!, signedIn: true } }, now)[3])
      .toMatchObject({ value: "Yes", tone: "green", note: "They’re using the sponsor portal" });
    /* once decided, the approval checks give way to the business type: "already has a login" would be the account's own */
    const used = { ...open, checks: { ...open.checks, emailInUse: true } };
    expect(requestFacts(used, now)[0]).toMatchObject({ key: "type", label: "Business type", value: "Restaurant", tone: "blue" });
    expect(requestFacts({ ...used, progress: { ...open.progress!, categories: [] } }, now)[0]).toMatchObject({ value: "None recorded", tone: "muted" });
    /* decided: a gap is a fact, not BTG's move */
    expect(requestFacts({ ...base, state: "DECLINED", decidedAt: "2026-09-30T10:05:00.000Z" }, now)[1]!.tone).toBe("muted");
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
