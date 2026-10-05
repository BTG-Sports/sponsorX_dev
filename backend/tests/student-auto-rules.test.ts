import { describe, expect, it } from "vitest";

import {
  emailDomainOf,
  mayAutoActivate,
  normalizeSchoolDomain,
  PROSPECT_HOLD,
  prospectVerdict,
  rosterVerdict,
  STUDENT_HOLD,
  studentAge,
  type ProspectFacts,
  type RosterFacts,
} from "../src/domain/student-auto-rules";
import { norm, sameName } from "../src/domain/name-match";

/* --------------------------------------------------------------------------
   P9-BE-20 / P9-BE-21 — the pure rules: who the roster approves, who waits
   for the advisor and why, when the system may activate, and how a prospect
   is decided. No database.
   -------------------------------------------------------------------------- */

const ON = new Date("2026-10-03T12:00:00Z");
const ADULT = new Date("2006-01-01");
const MINOR = new Date("2011-06-01");

const facts = (over: Partial<RosterFacts> = {}): RosterFacts => ({
  legalName: "Ada Lovelace", gradYear: 2027, birthDate: MINOR, ageBand: null, email: null,
  roster: [{ id: "r1", legalName: "Ada Lovelace", gradYear: 2027 }, { id: "r2", legalName: "Grace Hopper", gradYear: 2026 }],
  existing: [], schoolDomain: null, ...over,
});

describe("the name match (shared with the claim flow)", () => {
  it("folds accents, case and punctuation — and is exact after that", () => {
    expect(norm("José  O'Neil")).toBe("jose o neil");
    expect(sameName("JOSÉ O'NEIL", "jose o neil")).toBe(true);
    expect(sameName("Jose O Neill", "jose o neil")).toBe(false);
  });
  it("a name with no letters matches nothing, not even itself", () => {
    expect(sameName("123", "123")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });
});

describe("P9-BE-20 · rosterVerdict", () => {
  it("an exact match on one entry approves, naming the entry", () => {
    expect(rosterVerdict(facts(), ON)).toEqual({ approve: true, rosterEntryId: "r1" });
    expect(rosterVerdict(facts({ legalName: "ada  LOVELACE" }), ON)).toEqual({ approve: true, rosterEntryId: "r1" });
  });

  it("an empty roster approves nobody", () => {
    expect(rosterVerdict(facts({ roster: [] }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.NO_ROSTER] });
  });

  it("each failure holds with its reason", () => {
    expect(rosterVerdict(facts({ legalName: "Ada Lovelase" }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.NOT_ON_ROSTER] });
    const twins = facts({ roster: [{ id: "a", legalName: "Ada Lovelace", gradYear: 2027 }, { id: "b", legalName: "ADA LOVELACE", gradYear: 2027 }] });
    expect(rosterVerdict(twins, ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.TWO_ENTRIES] });
    expect(rosterVerdict(facts({ gradYear: 2028 }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.GRAD_YEAR] });
    expect(rosterVerdict(facts({ existing: [{ legalName: "Ada Lovelace" }] }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.ALREADY_APPROVED] });
  });

  it("graduation year is compared only when both sides have one", () => {
    expect(rosterVerdict(facts({ gradYear: null }), ON).approve).toBe(true);
    expect(rosterVerdict(facts({ roster: [{ id: "r1", legalName: "Ada Lovelace", gradYear: null }] }), ON).approve).toBe(true);
  });

  it("an adult needs an application email on the school's domain", () => {
    const adult = { birthDate: ADULT, email: "ada@north.k12.us" };
    expect(rosterVerdict(facts({ ...adult, schoolDomain: "north.k12.us" }), ON)).toEqual({ approve: true, rosterEntryId: "r1" });
    expect(rosterVerdict(facts({ ...adult, schoolDomain: "NORTH.k12.us" }), ON).approve).toBe(true);
    expect(rosterVerdict(facts({ ...adult, schoolDomain: null }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.ADULT_NO_DOMAIN] });
    expect(rosterVerdict(facts({ ...adult, email: "ada@gmail.com", schoolDomain: "north.k12.us" }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.ADULT_OFF_DOMAIN] });
    /* A subdomain or a look-alike is not the domain. */
    expect(rosterVerdict(facts({ ...adult, email: "ada@evil.north.k12.us", schoolDomain: "north.k12.us" }), ON).approve).toBe(false);
    expect(rosterVerdict(facts({ ...adult, email: "ada@north.k12.us.evil.com", schoolDomain: "north.k12.us" }), ON).approve).toBe(false);
    expect(rosterVerdict(facts({ ...adult, email: null, schoolDomain: "north.k12.us" }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.ADULT_OFF_DOMAIN] });
    expect(rosterVerdict(facts({ birthDate: null, ageBand: "18_PLUS", email: "x@north.k12.us", schoolDomain: "north.k12.us" }), ON).approve).toBe(true);
  });

  it("a minor needs no school email (the guardian gate protects them)", () => {
    expect(rosterVerdict(facts({ email: "ada@gmail.com", schoolDomain: "north.k12.us" }), ON).approve).toBe(true);
    expect(rosterVerdict(facts({ birthDate: null, ageBand: "16_17" }), ON).approve).toBe(true);
  });

  it("an unknown age never passes as an adult", () => {
    expect(rosterVerdict(facts({ birthDate: null, ageBand: null }), ON)).toEqual({ approve: false, reasons: [STUDENT_HOLD.AGE_UNKNOWN] });
  });

  it("every failing reason is listed together", () => {
    const v = rosterVerdict(facts({ legalName: "Nobody", existing: [{ legalName: "nobody" }], birthDate: ADULT, schoolDomain: null }), ON);
    expect(v).toEqual({ approve: false, reasons: [STUDENT_HOLD.NOT_ON_ROSTER, STUDENT_HOLD.ALREADY_APPROVED, STUDENT_HOLD.ADULT_NO_DOMAIN] });
  });

  it("a name with no letters matches no roster entry, even an equally empty one", () => {
    expect(rosterVerdict(facts({ legalName: "###", roster: [{ id: "x", legalName: "123", gradYear: null }] }), ON).approve).toBe(false);
  });
});

describe("P9-BE-20 · ages, activation and email domains", () => {
  it("studentAge reads the date first, then the band; neither is unknown", () => {
    expect(studentAge({ birthDate: ADULT, ageBand: "UNDER_16" }, ON)).toBe("adult");
    expect(studentAge({ birthDate: MINOR, ageBand: "18_PLUS" }, ON)).toBe("minor");
    expect(studentAge({ birthDate: null, ageBand: "UNDER_16" }, ON)).toBe("minor");
    expect(studentAge({ birthDate: null, ageBand: "18_PLUS" }, ON)).toBe("adult");
    expect(studentAge({ birthDate: null, ageBand: null }, ON)).toBe("unknown");
  });

  it("mayAutoActivate: only when the gate is met, and never for an unknown age", () => {
    expect(mayAutoActivate({ birthDate: ADULT, ageBand: null }, { status: "not-required" }, ON)).toBe(true);
    expect(mayAutoActivate({ birthDate: MINOR, ageBand: null }, { status: "ready" }, ON)).toBe(true);
    expect(mayAutoActivate({ birthDate: MINOR, ageBand: null }, { status: "unverified" }, ON)).toBe(false);
    expect(mayAutoActivate({ birthDate: MINOR, ageBand: null }, { status: "missing" }, ON)).toBe(false);
    expect(mayAutoActivate({ birthDate: null, ageBand: null }, { status: "not-required" }, ON)).toBe(false);
  });

  it("emailDomainOf", () => {
    expect(emailDomainOf(" Ada@North.K12.us ")).toBe("north.k12.us");
    for (const bad of [null, "", "no-at", "a@b@c", "@north.k12.us", "ada@"]) expect(emailDomainOf(bad)).toBeNull();
  });

  it("normalizeSchoolDomain trims, lowers, drops a leading @, refuses junk and free mail", () => {
    expect(normalizeSchoolDomain(" @North.K12.MD.us ")).toBe("north.k12.md.us");
    expect(normalizeSchoolDomain(null)).toBeNull();
    expect(normalizeSchoolDomain("  ")).toBeNull();
    for (const bad of ["north", "north..us", "nor th.us", "a@b.us", "-"]) expect(() => normalizeSchoolDomain(bad)).toThrow(/isn't an email domain/);
    for (const free of ["gmail.com", "Outlook.com", "@icloud.com"]) expect(() => normalizeSchoolDomain(free)).toThrow(/public email provider/);
  });
});

describe("P9-BE-21 · prospectVerdict", () => {
  const clean = (over: Partial<ProspectFacts> = {}): ProspectFacts => ({
    category: "RESTAURANT", held: new Set(), schoolConflicts: 0, athleteConflicts: 0, alreadySponsor: false, openProspect: false, ...over,
  });

  it("accepts when nothing is in the way", () => {
    expect(prospectVerdict(clean())).toEqual({ decision: "ACCEPT" });
  });

  it("refuses for a category another sponsor holds — before anything else", () => {
    expect(prospectVerdict(clean({ held: new Set(["RESTAURANT"]), alreadySponsor: true }))).toEqual({ decision: "REJECT", reasonCode: "CATEGORY_EXCLUSIVE" });
    expect(prospectVerdict(clean({ held: new Set(["FITNESS"]) }))).toEqual({ decision: "ACCEPT" });
  });

  it("holds for SALES with every reason otherwise", () => {
    expect(prospectVerdict(clean({ schoolConflicts: 1 }))).toEqual({ decision: "HOLD", reasons: [PROSPECT_HOLD.SCHOOL_RESTRICTION] });
    expect(prospectVerdict(clean({ athleteConflicts: 2 }))).toEqual({ decision: "HOLD", reasons: [PROSPECT_HOLD.ATHLETE_RESTRICTION] });
    expect(prospectVerdict(clean({ alreadySponsor: true }))).toEqual({ decision: "HOLD", reasons: [PROSPECT_HOLD.ALREADY_SPONSOR] });
    expect(prospectVerdict(clean({ openProspect: true }))).toEqual({ decision: "HOLD", reasons: [PROSPECT_HOLD.ALREADY_PROSPECT] });
    expect(prospectVerdict(clean({ schoolConflicts: 1, openProspect: true })).decision).toBe("HOLD");
  });

  it("a category the programme never sells (or a sensitive one, or an unknown one) is never accepted", () => {
    for (const category of ["ALCOHOL", "GAMBLING", "ENERGY_DRINK", "NOT_A_CATEGORY"]) {
      expect(prospectVerdict(clean({ category }))).toEqual({ decision: "HOLD", reasons: [PROSPECT_HOLD.NOT_FOR_STUDENTS] });
    }
  });
});
