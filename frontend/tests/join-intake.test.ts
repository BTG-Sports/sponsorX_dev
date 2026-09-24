import { describe, expect, it } from "vitest";

import {
  draftToApplication,
  emptyDraft,
  levelToEnum,
  validateSection,
  SECTIONS,
  type JoinDraft,
} from "../src/lib/join-flow";

/* --------------------------------------------------------------------------
   P3-FE-01 — the wizard-to-contract mapping is pure, so what the API receives
   is testable without a browser or a server. The reference truth is
   backend/src/contracts/athlete.ts (AthleteApplicationInput); these tests
   transcribe its rules independently, the same both-hands pattern the
   catalogue tests use.
   -------------------------------------------------------------------------- */

function draftWith(answers: Record<string, string>): JoinDraft {
  return { ...emptyDraft(), answers };
}

const FULL = {
  firstName: "Maya",
  lastName: "Okonkwo",
  dob: "2009-03-14",
  email: "maya@example.com",
  phone: "(555) 000-0000",
  sport: "Basketball",
  position: "Forward",
  level: "High school",
  team: "Riverside High",
  city: "Silver Spring",
  region: "md",
  country: "USA",
  instagram: "@maya.hoops",
  tiktok: "@mayahoops",
  followers: "12000",
};

describe("draftToApplication (P3-FE-01)", () => {
  it("maps a full draft onto the contract's fields", () => {
    const p = draftToApplication(draftWith(FULL));
    expect(p.legalName).toBe("Maya Okonkwo");
    expect(p.displayName).toBe("Maya Okonkwo"); // no brand-name field on /join
    expect(p.email).toBe("maya@example.com");
    expect(p.birthDate).toBe("2009-03-14"); // satisfies the one-of refinement
    expect(p.stateCode).toBe("MD"); // uppercased, two letters
    expect(p.school).toBe("Riverside High");
    expect(p.level).toBe("HIGH_SCHOOL");
    expect(p.socials).toEqual([
      { platform: "INSTAGRAM", handle: "@maya.hoops" },
      { platform: "TIKTOK", handle: "@mayahoops" },
    ]);
  });

  it("never fabricates per-account follower counts from the wizard's total", () => {
    const p = draftToApplication(draftWith(FULL));
    for (const s of p.socials) {
      expect(s).not.toHaveProperty("followers");
    }
  });

  it("omits optional fields rather than sending empty strings", () => {
    const p = draftToApplication(
      draftWith({ ...FULL, phone: " ", position: "", city: "" }),
    );
    expect(p.phone).toBeUndefined();
    expect(p.position).toBeUndefined();
    expect(p.city).toBeUndefined();
  });

  it("maps free-text levels to the contract enum, or omits", () => {
    expect(levelToEnum("NCAA D2")).toBe("COLLEGE");
    expect(levelToEnum("semi-pro")).toBe("SEMI_PRO");
    expect(levelToEnum("Pro")).toBe("PRO");
    expect(levelToEnum("Club team")).toBe("AMATEUR");
    expect(levelToEnum("varsity")).toBeUndefined(); // guessing is worse
  });

  it("the identity step refuses impossible birth dates the API would accept", () => {
    const section = SECTIONS.find((s) => s.id === "identity")!;
    const base = {
      firstName: "M",
      lastName: "O",
      email: "m@example.com",
      dob: "2009-03-14",
    };
    expect(validateSection(section, base)).toEqual({});
    // future DOB would file as a minor and summon the guardian branch
    expect(validateSection(section, { ...base, dob: "2040-01-01" }).dob).toMatch(/real/i);
    expect(validateSection(section, { ...base, dob: "1902-01-01" }).dob).toMatch(/real/i);
  });

  it("the location step refuses a non-two-letter state before the API has to", () => {
    const section = SECTIONS.find((s) => s.id === "location")!;
    const errs = validateSection(section, {
      city: "Silver Spring",
      region: "Maryland",
      country: "USA",
    });
    expect(errs.region).toMatch(/two-letter/i);
    expect(
      validateSection(section, { city: "x", region: "MD", country: "USA" }),
    ).toEqual({});
  });
});
