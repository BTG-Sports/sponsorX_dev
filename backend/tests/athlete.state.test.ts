import { describe, expect, it } from "vitest";

import {
  canTransition,
  legalTransitions,
  IllegalTransitionError,
  type AthleteState,
} from "../src/domain/athlete-state";
import { AthleteApplicationInput } from "../src/contracts/athlete";

/* --------------------------------------------------------------------------
   The athlete application lifecycle — P3-BE-01, §21, §26.

   The transition table is asserted **exhaustively**: all 8 × 8 ordered pairs,
   with the legal ones enumerated from §21 and everything else required to be
   refused. A test that only checks the happy path would pass just as happily
   against a function that permits everything, which is the failure mode that
   matters for a state machine.

   `transitionAthlete()` itself needs a database, so the guard logic is tested
   here and the persistence is proved by the E2E in B1 (`P3-QA-01`).
   -------------------------------------------------------------------------- */

const STATES: AthleteState[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "CHANGES_REQUESTED",
  "REJECTED",
  "ACTIVE",
  "SUSPENDED",
];

/** §21, transcribed independently of the implementation — if this and the
 *  module's table were generated from each other the test would be circular. */
const LEGAL: ReadonlyArray<[AthleteState, AthleteState]> = [
  ["DRAFT", "SUBMITTED"],
  ["SUBMITTED", "UNDER_REVIEW"],
  ["UNDER_REVIEW", "APPROVED"],
  ["UNDER_REVIEW", "CHANGES_REQUESTED"],
  ["UNDER_REVIEW", "REJECTED"],
  ["CHANGES_REQUESTED", "SUBMITTED"],
  ["APPROVED", "ACTIVE"],
  ["ACTIVE", "SUSPENDED"],
  ["SUSPENDED", "ACTIVE"],
];

describe("the §21 transition table", () => {
  it("permits exactly the nine transitions §21 describes, and no others", () => {
    const legal = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));
    const wrong: string[] = [];

    for (const from of STATES) {
      for (const to of STATES) {
        const expected = legal.has(`${from}->${to}`);
        if (canTransition(from, to) !== expected) {
          wrong.push(`${from}->${to} should be ${expected ? "legal" : "refused"}`);
        }
      }
    }

    expect(wrong, `64 pairs checked`).toEqual([]);
  });

  it("treats REJECTED as terminal", () => {
    expect(legalTransitions("REJECTED")).toEqual([]);
    for (const to of STATES) expect(canTransition("REJECTED", to)).toBe(false);
  });

  it("lets a changes-requested application come back", () => {
    /* Without this edge, asking an applicant to fix something is a dead end
       and §23's review checklist is one-way. */
    expect(canTransition("CHANGES_REQUESTED", "SUBMITTED")).toBe(true);
  });

  it("lets a suspension be lifted", () => {
    expect(canTransition("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("never allows a jump straight from application to ACTIVE", () => {
    /* The review states exist to be passed through, not around. */
    expect(canTransition("DRAFT", "ACTIVE")).toBe(false);
    expect(canTransition("SUBMITTED", "ACTIVE")).toBe(false);
    expect(canTransition("UNDER_REVIEW", "ACTIVE")).toBe(false);
  });

  it("names the legal moves in the error, so the caller can act on it", () => {
    const error = new IllegalTransitionError("DRAFT", "ACTIVE");
    expect(error.message).toContain("SUBMITTED");
    expect(error.status).toBe(409);
  });
});

describe("the application contract (§11 sections 1-3)", () => {
  const valid = {
    legalName: "Shammah Kwizera",
    displayName: "Shammah",
    email: "shammah@example.com",
    birthDate: "2007-04-12",
    stateCode: "MD",
    sport: "Basketball",
    socials: [{ platform: "INSTAGRAM" as const, handle: "shammah" }],
  };

  it("accepts a complete application", () => {
    const parsed = AthleteApplicationInput.parse(valid);
    expect(parsed.socials[0]?.source).toBe("SELF_REPORTED");
  });

  it("requires an age signal, because the guardian path depends on it", () => {
    const { birthDate: _omitted, ...noAge } = valid;
    expect(() => AthleteApplicationInput.parse(noAge)).toThrow();
    /* Either form satisfies it — §11 allows an age band instead of a DOB. */
    expect(() =>
      AthleteApplicationInput.parse({ ...noAge, ageBand: "16_17" }),
    ).not.toThrow();
  });

  it("refuses an applicant-supplied lifecycle state or tier", () => {
    /* Zod strips unknown keys rather than throwing, so the assertion is that
       they do not survive — an applicant must not be able to propose their
       own state or commercial tier. */
    const parsed = AthleteApplicationInput.parse({
      ...valid,
      state: "ACTIVE",
      tier: "PREMIUM",
    }) as Record<string, unknown>;
    expect(parsed.state).toBeUndefined();
    expect(parsed.tier).toBeUndefined();
  });

  it("rejects a malformed email and a non-US state code", () => {
    expect(() => AthleteApplicationInput.parse({ ...valid, email: "nope" })).toThrow();
    expect(() =>
      AthleteApplicationInput.parse({ ...valid, stateCode: "Maryland" }),
    ).toThrow();
  });
});
