import { describe, expect, it } from "vitest";

import {
  guardianReadiness,
  isMinorOn,
  mayParticipate,
  requiresGuardian,
} from "../src/domain/guardian-rules";

/* --------------------------------------------------------------------------
   Who needs a guardian, and when — P3-BE-03, §4, §26, §37.

   This is the most consequential rule in Phase 1: a large share of the
   network is under 18, and getting it wrong means either a minor
   participating without an authorised adult, or an adult blocked from work
   they are entitled to.

   The three states that get conflated in conversation are asserted apart:
   adult, minor-without-guardian, minor-with-unverified-guardian. Only the
   first and a *verified* third may take part.
   -------------------------------------------------------------------------- */

const ADULT = new Date("1995-01-01");
const MINOR = new Date("2012-06-01");

describe("age", () => {
  it("is evaluated now, not at application time", () => {
    /* Someone who is 17 today and 18 next month is a minor today and an
       adult then. A stored boolean would keep them a minor forever, which is
       why this takes a date rather than a flag. */
    const seventeenth = new Date();
    seventeenth.setFullYear(seventeenth.getFullYear() - 17);
    expect(isMinorOn(seventeenth)).toBe(true);

    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    eighteenYearsAgo.setDate(eighteenYearsAgo.getDate() - 1);
    expect(isMinorOn(eighteenYearsAgo)).toBe(false);
  });

  it("treats the eighteenth birthday itself as adult", () => {
    const today = new Date();
    const exactlyEighteen = new Date(today);
    exactlyEighteen.setFullYear(today.getFullYear() - 18);
    expect(isMinorOn(exactlyEighteen, today)).toBe(false);
  });

  it("accepts an age band where §11 allows one instead of a date", () => {
    expect(requiresGuardian({ ageBand: "UNDER_16" })).toBe(true);
    expect(requiresGuardian({ ageBand: "16_17" })).toBe(true);
    expect(requiresGuardian({ ageBand: "18_PLUS" })).toBe(false);
  });

  it("lets either signal trigger the requirement", () => {
    /* A date saying adult and a band saying minor must not cancel out — the
       safe reading of a contradiction is that supervision is required. */
    expect(requiresGuardian({ birthDate: ADULT, ageBand: "16_17" })).toBe(true);
    expect(requiresGuardian({ birthDate: MINOR, ageBand: "18_PLUS" })).toBe(true);
  });
});

describe("readiness — the three states kept apart", () => {
  it("an adult needs no guardian", () => {
    const r = guardianReadiness({ birthDate: ADULT });
    expect(r.status).toBe("not-required");
    expect(mayParticipate({ birthDate: ADULT })).toBe(true);
  });

  it("a minor with no guardian may not participate", () => {
    const athlete = { birthDate: MINOR, guardianId: null };
    expect(guardianReadiness(athlete).status).toBe("missing");
    expect(mayParticipate(athlete)).toBe(false);
  });

  it("a minor whose guardian is UNVERIFIED may not participate", () => {
    /* The case most likely to be waved through: the record exists, the form
       looks complete, and nobody has actually confirmed the adult. */
    const athlete = { birthDate: MINOR, guardianId: "g1", guardianVerifiedAt: null };
    expect(guardianReadiness(athlete).status).toBe("unverified");
    expect(mayParticipate(athlete)).toBe(false);
  });

  it("a minor with a verified guardian may participate", () => {
    const athlete = {
      birthDate: MINOR,
      guardianId: "g1",
      guardianVerifiedAt: new Date("2026-09-01"),
    };
    expect(guardianReadiness(athlete).status).toBe("ready");
    expect(mayParticipate(athlete)).toBe(true);
  });

  it("gives every refusal a reason a human can act on", () => {
    expect(guardianReadiness({ birthDate: MINOR, guardianId: null })).toHaveProperty(
      "reason",
      "minor has no guardian linked",
    );
    expect(
      guardianReadiness({ birthDate: MINOR, guardianId: "g1", guardianVerifiedAt: null }),
    ).toHaveProperty("reason", "guardian is linked but not verified");
  });

  it("never lets an unverified guardian pass as ready", () => {
    /* Exhaustive over the combinations that matter, so a future edit cannot
       quietly widen one of them. */
    const cases = [
      { guardianId: null, guardianVerifiedAt: null },
      { guardianId: "g1", guardianVerifiedAt: null },
      { guardianId: null, guardianVerifiedAt: new Date() },
    ];
    for (const c of cases) {
      expect(mayParticipate({ birthDate: MINOR, ...c })).toBe(false);
    }
  });
});
