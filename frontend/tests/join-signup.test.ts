import { describe, expect, it } from "vitest";

import { SIGN_IN_HREF, canChangeGuardian, checklist, guardianChangeDraft, guardianEmailLine, needsGuardian, standing, type ApiSignupStatus } from "../src/lib/join-signup";
import { countryToCode, draftToApplication, emptyDraft, relationshipToCode } from "../src/lib/join-flow";
import { agreementFromBody, firstOpenStep, type ApiGuardianSetupLive } from "../src/lib/guardian-live";
import { comingOfAgeView } from "../src/lib/account-live";

/* --------------------------------------------------------------------------
   2S1-FE-06 / -08 — the athlete's checklist after /join, what /join now
   sends (a minor's guardian, the country), the guardian's set-up page and
   the coming-of-age countdown: the words and steps they derive.
   -------------------------------------------------------------------------- */

const status = (over: Partial<ApiSignupStatus>): ApiSignupStatus => ({
  id: "ath_1", state: "SUBMITTED", firstName: "Riley", email: "riley@example.com", emailConfirmed: false, minor: false, majorityAge: 18,
  idKind: "GOVERNMENT_ID", idUploaded: false, documents: [], guardian: null, missing: ["confirm your email", "upload your government ID"],
  approved: false, underReview: false, closed: false, ...over,
});

describe("the athlete's checklist", () => {
  it("an adult confirms their email and uploads a government ID", () => {
    const rows = checklist(status({}));
    expect(rows.map((r) => [r.label, r.done])).toEqual([
      ["Application sent", true], ["Email confirmed", false], ["Government ID uploaded", false], ["Approved", false],
    ]);
    expect(standing(status({})).line).toBe("Still to do: confirm your email; upload your government ID.");
    expect(standing(status({ approved: true, emailConfirmed: true, idUploaded: true, missing: [] })).title).toBe("You’re approved");
    expect(standing(status({ underReview: true, missing: [] })).title).toBe("With BTG");
  });
  it("a minor uploads a school ID and follows their guardian's steps", () => {
    const s = status({ minor: true, idKind: "SCHOOL_ID", majorityAge: 19 });
    expect(needsGuardian(s)).toBe(true);
    expect(checklist(s).find((r) => r.key === "guardian")?.note).toMatch(/Under 19/);
    const named = status({
      minor: true, idKind: "SCHOOL_ID",
      guardian: { name: "Carmen Reyes", email: "c@example.com", relationship: "PARENT", emailConfirmed: true, idUploaded: true, proofUploaded: false, agreementAccepted: false, approved: false },
    });
    expect(needsGuardian(named)).toBe(false);
    expect(checklist(named).filter((r) => r.key.startsWith("g-")).map((r) => [r.label, r.done])).toEqual([
      ["Carmen opened their link", true], ["Their ID and proof of guardianship", false], ["The guardian agreement", false],
    ]);
  });
  /* POL-FE-34 — approved carries the way in. */
  it("'You're approved' carries a Sign in button to the public sign-in; nothing else does", () => {
    const ok = standing(status({ approved: true, emailConfirmed: true, idUploaded: true, missing: [] }));
    expect(ok.cta).toEqual({ label: "Sign in", href: SIGN_IN_HREF });
    expect(SIGN_IN_HREF).toBe("/login");
    expect(standing(status({})).cta).toBeNull();
    expect(standing(status({ underReview: true, missing: [] })).cta).toBeNull();
    expect(standing(status({ closed: true })).cta).toBeNull();
  });
  /* POL-FE-16 — a mistyped guardian email is changed, not resent to. */
  it("the guardian's email can be changed until BTG approves them", () => {
    const g = { name: "Carmen Reyes", email: "c@exmaple.com", relationship: "LEGAL_GUARDIAN", emailConfirmed: false, idUploaded: false, proofUploaded: false, agreementAccepted: false, approved: false };
    const named = status({ minor: true, idKind: "SCHOOL_ID", guardian: g });
    expect(canChangeGuardian(named)).toBe(true);
    expect(canChangeGuardian(status({ minor: true, idKind: "SCHOOL_ID", guardian: { ...g, approved: true } }))).toBe(false);
    expect(canChangeGuardian(status({ minor: true, idKind: "SCHOOL_ID", guardian: null }))).toBe(false);
    expect(canChangeGuardian(status({ minor: true, idKind: "SCHOOL_ID", guardian: g, closed: true }))).toBe(false);
    expect(canChangeGuardian(status({ minor: true, idKind: "SCHOOL_ID", guardian: g, approved: true }))).toBe(false);
    expect(canChangeGuardian(status({ guardian: g }))).toBe(false);
    /* The form starts from the guardian already named — the email blank so the wrong one isn't resent. */
    expect(guardianChangeDraft(named)).toEqual({ legalName: "Carmen Reyes", email: "", relationship: "LEGAL_GUARDIAN" });
    expect(guardianChangeDraft(status({ minor: true, guardian: { ...g, relationship: "Mother" } })).relationship).toBe("PARENT");
    expect(guardianChangeDraft(status({ guardian: null }))).toEqual({ legalName: "", email: "", relationship: "PARENT" });
    expect(guardianEmailLine(named)).toBe("We're emailing c@exmaple.com. Wrong address? Change it and we email the new one.");
    expect(guardianEmailLine(status({}))).toBeNull();
  });
});

describe("what /join sends", () => {
  const base = { firstName: "Jordan", lastName: "Reyes", dob: "2010-05-01", email: "j@example.com", sport: "Basketball", region: "md", country: "USA" };
  it("a minor's guardian travels, with the API's relationship words", () => {
    const p = draftToApplication({ ...emptyDraft(), answers: { ...base, guardianName: "Carmen Reyes", guardianEmail: "c@example.com", guardianRelation: "Parent" } });
    expect(p.guardian).toEqual({ legalName: "Carmen Reyes", email: "c@example.com", relationship: "PARENT" });
    expect(p.countryCode).toBe("US");
    expect(relationshipToCode("Legal guardian")).toBe("LEGAL_GUARDIAN");
    expect(relationshipToCode("Authorized rep")).toBe("AUTHORIZED_REP");
  });
  it("an adult's application carries no guardian; an unknown country is left to the API", () => {
    const p = draftToApplication({ ...emptyDraft(), answers: { ...base, dob: "1999-01-01", guardianName: "X", guardianEmail: "x@example.com" } });
    expect(p.guardian).toBeUndefined();
    expect(countryToCode("Canada")).toBe("CA");
    expect(countryToCode("Narnia")).toBeUndefined();
  });
});

describe("the guardian's page", () => {
  const live = (over: Partial<ApiGuardianSetupLive>): ApiGuardianSetupLive => ({
    athlete: { name: "Jordan Reyes", firstName: "Jordan" },
    guardian: { name: "Carmen Reyes", relationship: "PARENT", phone: null, email: "c@example.com", emailConfirmed: true },
    returning: false, idUploaded: false, proof: null, agreement: null, agreementAcceptedAt: null, state: "IN_PROGRESS", missing: [], athleteMissing: [], ...over,
  });
  it("opens on the first step still to do", () => {
    expect(firstOpenStep(live({ guardian: { ...live({}).guardian, relationship: null } }))).toBe("details");
    expect(firstOpenStep(live({}))).toBe("id");
    expect(firstOpenStep(live({ idUploaded: true }))).toBe("proof");
    expect(firstOpenStep(live({ idUploaded: true, proof: { kind: "COURT_ORDER", fileName: "x.pdf", uploadedAt: "2026-10-01" } }))).toBe("agreement");
  });
  it("shows the stored agreement, its placeholder lines as placeholders", () => {
    const a = agreementFromBody("SponsorX Guardian Agreement — version 1 (placeholder wording pending counsel)\n\n1. You approve every agreement.\n2. [Remaining terms from counsel]", 1);
    expect(a).toMatchObject({ title: "SponsorX Guardian Agreement", version: "1", versionPending: true });
    expect(a.terms).toEqual([{ text: "You approve every agreement." }, { text: "[Remaining terms from counsel]", placeholder: true }]);
  });
});

describe("coming of age, live", () => {
  it("counts down to when the allowance really ends, not the birthday", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const v = comingOfAgeView({ athleteFirstName: "Casey", ageOfMajority: 18, reachedAt: "2026-06-01T00:00:00.000Z", dueAt: "2026-10-11T12:00:00.000Z", idUploaded: false }, "guardian", now)!;
    expect(v.daysLeft).toBe(10);
    expect(v.cta).toBe("Send Casey the link");
  });
});
