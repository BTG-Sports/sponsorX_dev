import { describe, expect, it } from "vitest";

import type { ApiOrgProfile } from "../src/lib/org-profile-live";
import { orgFacts, orgNextStep, orgPill, signupFacts, signupNextStep, signupPill } from "../src/lib/record-ui";
import type { ApiSignupDetail, ApiSignupRow } from "../src/lib/signups-live";

/* --------------------------------------------------------------------------
   POL-FE-108 — what a BTG record page leads with: the one status pill, the
   "Your next step" sentence and the four tiles, for an organization
   (/admin/onboarding/:id) and for a sign-up (/admin/new-signups/…/:id).
   -------------------------------------------------------------------------- */

type Standing = Pick<ApiOrgProfile, "onboardingState" | "autoApproved" | "approvedAt" | "flagged">;
const org = (over: Partial<Standing>): Standing => ({ onboardingState: "APPROVED", autoApproved: true, approvedAt: "2026-09-30T10:00:00.000Z", flagged: false, ...over });

describe("an organization's pill", () => {
  it("is green and still when approved, and calls for attention only when it is BTG's move", () => {
    expect(orgPill(org({}))).toEqual({ label: "Approved automatically", tone: "green", act: false });
    expect(orgPill(org({ autoApproved: false }))).toEqual({ label: "Approved by BTG", tone: "green", act: false });
    expect(orgPill(org({ onboardingState: "PENDING_REVIEW", approvedAt: null }))).toEqual({ label: "Needs review", tone: "amber", act: true });
    expect(orgPill(org({ flagged: true }))).toEqual({ label: "Flagged after a document change", tone: "amber", act: true });
  });
  it("is red when stopped, and quiet while it waits on the applicant", () => {
    expect(orgPill(org({ onboardingState: "SUSPENDED" }))).toMatchObject({ label: "Suspended", tone: "red", act: false });
    expect(orgPill(org({ onboardingState: "REJECTED" }))).toMatchObject({ label: "Rejected after approval", tone: "red" });
    expect(orgPill(org({ onboardingState: "REJECTED", approvedAt: null }))).toMatchObject({ label: "Rejected", tone: "red" });
    expect(orgPill(org({ onboardingState: "CHANGES_REQUESTED" }))).toEqual({ label: "Changes requested", tone: "blue", act: false });
    expect(orgPill(org({ onboardingState: "DRAFT" }))).toEqual({ label: "Draft", tone: "muted", act: false });
  });
});

describe("an organization's next step", () => {
  it("says there is nothing to do once approved, and how it was approved", () => {
    expect(orgNextStep(org({}))).toMatchObject({ tone: "green", title: "Nothing for you to do" });
    expect(orgNextStep(org({})).text).toContain("approved automatically");
    expect(orgNextStep(org({ autoApproved: false })).text).toContain("BTG approved it.");
  });
  it("asks for a decision while it waits, and for a look when flagged", () => {
    expect(orgNextStep(org({ onboardingState: "PENDING_REVIEW" }))).toMatchObject({ tone: "amber", title: "Waiting for your decision" });
    expect(orgNextStep(org({ flagged: true }))).toMatchObject({ tone: "amber", title: "Approved, then flagged" });
  });
  it("tells a final rejection from one that can be reinstated", () => {
    expect(orgNextStep(org({ onboardingState: "REJECTED" })).text).toContain("You can reinstate it.");
    expect(orgNextStep(org({ onboardingState: "REJECTED", approvedAt: null }))).toMatchObject({ title: "Rejected at review" });
    expect(orgNextStep(org({ onboardingState: "REJECTED", approvedAt: null })).text).toContain("final");
  });
  it("names who it waits on otherwise", () => {
    expect(orgNextStep(org({ onboardingState: "CHANGES_REQUESTED" }))).toMatchObject({ tone: "blue", title: "Waiting on the applicant" });
    expect(orgNextStep(org({ onboardingState: "DRAFT" }))).toMatchObject({ tone: "muted", title: "Still a draft" });
    expect(orgNextStep(org({ onboardingState: "SUSPENDED" }))).toMatchObject({ tone: "red", title: "Suspended" });
  });
});

describe("an organization's tiles", () => {
  const check = (key: string, ok: boolean) => ({ key, label: key, ok });
  const req = (label: string, done: boolean) => ({ key: label, label, done, documentId: null });
  const doc = (current: boolean) => ({ current }) as ApiOrgProfile["documents"][number];
  const contact = { name: "Dana Brooks", role: "General manager" };

  it("counts the checks and names the first missing document", () => {
    const facts = orgFacts(
      { checks: [check("a", true), check("b", false), check("c", false)], requirements: [req("Government ID", false), req("Proof of rights", false)], documents: [] },
      { listingAccess: true, contact, attention: true },
    );
    expect(facts.map((f) => f.key)).toEqual(["checks", "documents", "contact", "listing"]);
    expect(facts[0]).toMatchObject({ value: "1 of 3", note: "2 checks not passed yet", tone: "amber" });
    expect(facts[1]).toMatchObject({ label: "Required documents", value: "0 of 2", note: "Missing: Government ID and 1 more", tone: "amber" });
    expect(facts[2]).toMatchObject({ value: "Dana Brooks", note: "General manager" });
    expect(facts[3]).toMatchObject({ value: "On", tone: "green" });
  });
  it("goes green when everything is in", () => {
    const facts = orgFacts({ checks: [check("a", true)], requirements: [req("Government ID", true)], documents: [doc(true)] }, { listingAccess: false, contact: null, attention: true });
    expect(facts[0]).toMatchObject({ value: "1 of 1", note: "Every automatic check", tone: "green" });
    expect(facts[1]).toMatchObject({ value: "1 of 1", note: "All of them are in", tone: "green" });
    expect(facts[2]).toMatchObject({ value: "None given", tone: "amber" });
    expect(facts[3]).toMatchObject({ value: "Off", tone: "muted" });
  });
  it("keeps a gap grey once BTG has approved it anyway: a fact, not a task", () => {
    const facts = orgFacts(
      { checks: [check("a", true), check("b", false)], requirements: [req("Government ID", false)], documents: [] },
      { listingAccess: true, contact: null, attention: false },
    );
    expect(facts.slice(0, 3).map((f) => f.tone)).toEqual(["muted", "muted", "muted"]);
    expect(facts[0]).toMatchObject({ value: "1 of 2", note: "1 check not passed yet" });
  });
  it("counts what is on file when nothing is required", () => {
    const facts = orgFacts({ checks: [], requirements: [], documents: [doc(true), doc(false)] }, { listingAccess: false, contact, attention: false });
    expect(facts[0]).toMatchObject({ value: "None run", tone: "muted" });
    expect(facts[1]).toMatchObject({ label: "Documents", value: "1", note: "On file now" });
  });
});

/* ------------------------------------------------------------------ sign-up */

const row = (over: Partial<ApiSignupRow>): ApiSignupRow => ({
  id: "ath_1", kind: "ATHLETE", name: "Riley Carter", sub: "Basketball · 20", signedUpAt: "2026-10-01T10:00:00.000Z",
  state: "AUTO_APPROVED", reasons: [], flags: [], ...over,
});
const detail = (over: Partial<ApiSignupDetail>): ApiSignupDetail => ({
  ...row({}), approvedAt: "2026-10-01T10:05:00.000Z", details: [], checks: ["Email confirmed"], missing: [], documents: [], activity: [],
  guardian: null, guardianOf: [], rejectNote: null, rejectedWithGuardian: false, can: { approve: false, reject: true, reinstate: false }, ...over,
});

describe("a sign-up's pill", () => {
  it("drops the date and pulses only when held or flagged", () => {
    expect(signupPill(detail({}))).toEqual({ label: "Approved automatically", tone: "green", act: false });
    expect(signupPill(detail({ state: "APPROVED" }))).toEqual({ label: "Approved by BTG", tone: "green", act: false });
    expect(signupPill(detail({ state: "NEEDS_REVIEW" }))).toEqual({ label: "Needs review", tone: "amber", act: true });
    expect(signupPill(detail({ flags: ["Place not in the age table"] }))).toEqual({ label: "Approved · flagged", tone: "amber", act: true });
    expect(signupPill(detail({ state: "REJECTED" }))).toEqual({ label: "Rejected", tone: "red", act: false });
  });
});

describe("a sign-up's next step", () => {
  it("says there is nothing to do once approved", () => {
    expect(signupNextStep(detail({}))).toMatchObject({ tone: "green", title: "Nothing for you to do" });
    expect(signupNextStep(detail({ state: "APPROVED" })).text).toContain("BTG approved this sign-up.");
  });
  it("asks for a decision when held, and says why Approve is locked", () => {
    expect(signupNextStep(detail({ state: "NEEDS_REVIEW", can: { approve: true, reject: true, reinstate: false } }))).toMatchObject({ tone: "amber", title: "Waiting for your decision" });
    const owed = signupNextStep(detail({ state: "NEEDS_REVIEW", missing: ["a government ID"] }));
    expect(owed.title).toBe("Held, and still waiting on them");
    expect(owed.text).toBe("You can’t approve yet. Riley still owes: a government ID.");
  });
  it("puts a held takeover first", () => {
    const n = signupNextStep(detail({ can: { approve: false, reject: true, reinstate: false, confirmComingOfAge: true } }));
    expect(n).toMatchObject({ tone: "amber", title: "A takeover is waiting for you" });
  });
  it("points a rejected athlete at their guardian when that is the way back", () => {
    expect(signupNextStep(detail({ state: "REJECTED", can: { approve: false, reject: false, reinstate: true } })).text).toBe("Their sign-in is off. You can reinstate them.");
    expect(signupNextStep(detail({ state: "REJECTED", rejectedWithGuardian: true, can: { approve: false, reject: false, reinstate: false } })).text).toContain("Reinstate the guardian");
  });
  it("reads a flag as something to look at, not a hold", () => {
    expect(signupNextStep(detail({ flags: ["Place not in the age table"] }))).toMatchObject({ tone: "amber", title: "Approved, with something flagged" });
  });
});

describe("a sign-up's tiles", () => {
  it("leads a guardian's with who they look after", () => {
    const one = signupFacts(detail({ kind: "GUARDIAN", guardianOf: [row({ name: "Sam Ellis", sub: "Soccer · 16" })] }));
    expect(one[0]).toMatchObject({ label: "Looks after", value: "Sam Ellis", note: "Soccer · 16" });
    const two = signupFacts(detail({ kind: "GUARDIAN", guardianOf: [row({ name: "Sam Ellis" }), row({ id: "a2", name: "Kai Ellis" })] }));
    expect(two[0]).toMatchObject({ value: "2 athletes", note: "Sam Ellis, Kai Ellis" });
    expect(signupFacts(detail({ kind: "GUARDIAN" }))[0]).toMatchObject({ value: "No athletes", tone: "muted" });
  });
  it("leads an athlete's with their guardian", () => {
    expect(signupFacts(detail({}))[0]).toMatchObject({ label: "Guardian", value: "None", tone: "muted" });
    expect(signupFacts(detail({ guardian: { id: "g1", name: "Dana Reed", rejected: false } }))[0]).toMatchObject({ value: "Dana Reed", note: "Looks after this athlete" });
    expect(signupFacts(detail({ guardian: { id: "g1", name: "Dana Reed", rejected: true } }))[0]).toMatchObject({ tone: "red" });
  });
  it("counts checks, or the reasons it is held", () => {
    expect(signupFacts(detail({}))[1]).toMatchObject({ label: "Checks passed", value: "1", note: "When it was approved", tone: "green" });
    expect(signupFacts(detail({ flags: ["x"] }))[1]).toMatchObject({ note: "1 thing flagged", tone: "amber" });
    expect(signupFacts(detail({ state: "NEEDS_REVIEW", reasons: ["A", "B"] }))[1]).toMatchObject({ label: "Held for", value: "2 reasons", tone: "amber" });
    expect(signupFacts(detail({ state: "NEEDS_REVIEW" }))[1]).toMatchObject({ value: "1 reason" });
  });
  it("counts documents and says when they signed up", () => {
    const docs = [{ id: "d1", name: "Government ID", sub: "", viewable: true }, { id: "d2", name: "Proof", sub: "", viewable: false }];
    const facts = signupFacts(detail({ documents: docs }));
    expect(facts[2]).toMatchObject({ value: "2", note: "1 you can open" });
    expect(signupFacts(detail({}))[2]).toMatchObject({ value: "0", note: "None uploaded", tone: "muted" });
    expect(facts[3]).toMatchObject({ label: "Signed up", value: "Oct 1", note: "Approved Oct 1" });
    expect(signupFacts(detail({ state: "NEEDS_REVIEW", approvedAt: null }))[3]).toMatchObject({ note: "Not approved yet" });
  });
});
