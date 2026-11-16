import { describe, expect, it } from "vitest";

import {
  completion,
  sectionStates,
  type ApiMyProfile,
} from "../src/lib/profile-live";
import { SECTIONS } from "../src/lib/profile-sections";

/* --------------------------------------------------------------------------
   P3-FE-03 — the §24 meter's arithmetic, pinned. The rules that matter:
   "payment recipient" has no Phase 1 model and must neither count as done
   nor nag as missing; "no restrictions" is an ANSWER (notes) while an empty
   list with no notes is an unasked question.
   -------------------------------------------------------------------------- */

function profile(over: Partial<ApiMyProfile> = {}): ApiMyProfile {
  return {
    id: "ath_1",
    slug: "shammah",
    displayName: "SHAMMAH.27",
    legalName: "Shammah Okeke",
    city: "Silver Spring",
    stateCode: "MD",
    sport: "Basketball",
    position: "Forward",
    school: "Riverside High",
    level: "HIGH_SCHOOL",
    gradYear: 2027,
    achievements: null,
    state: "ACTIVE",
    tier: null,
    contentCapabilities: ["SX-01"],
    brandInterests: ["APPAREL"],
    restrictedCategories: ["ALCOHOL"],
    restrictionNotes: null,
    socials: [
      { platform: "INSTAGRAM", handle: "@s", followers: 1200, avgViews: null, source: "SELF_REPORTED" },
    ],
    ratesConfirmed: 2,
    agreementsSigned: 1,
    ...over,
  };
}

describe("sectionStates answers §11 from data", () => {
  it("covers every section the editor lists — the two files cannot drift", () => {
    const states = sectionStates(profile());
    expect(Object.keys(states).sort()).toEqual(SECTIONS.map((s) => s.key).sort());
  });

  it("a full profile is done everywhere Phase 1 collects", () => {
    const states = sectionStates(profile());
    for (const s of SECTIONS) {
      /* POL-FE-69 — the rate card is BTG's to set, so like payment it isn't the athlete's to answer. */
      expect(states[s.key], s.key).toBe(s.key === "payment" || s.key === "rates" ? "not-collected" : "done");
    }
  });

  it("payment is not-collected even on a full profile — no Phase 1 model", () => {
    expect(sectionStates(profile()).payment).toBe("not-collected");
  });

  it("'no restrictions' in notes is an answer; an empty list with no notes is not", () => {
    expect(
      sectionStates(profile({ restrictedCategories: [], restrictionNotes: "None." })).restrictions,
    ).toBe("done");
    expect(
      sectionStates(profile({ restrictedCategories: [], restrictionNotes: null })).restrictions,
    ).toBe("missing");
    expect(
      sectionStates(profile({ restrictedCategories: [], restrictionNotes: "  " })).restrictions,
    ).toBe("missing");
  });

  it("identity needs a location, not just names", () => {
    expect(
      sectionStates(profile({ city: null, stateCode: null })).identity,
    ).toBe("missing");
  });

  it("zero agreements read as missing; the rate card never counts (POL-FE-69 — BTG sets it)", () => {
    const states = sectionStates(profile({ ratesConfirmed: 0, agreementsSigned: 0 }));
    expect(states.rates).toBe("not-collected");
    expect(states.agreements).toBe("missing");
  });
});

describe("completion divides by what is answerable", () => {
  it("a full profile is 100%, not 89% — payment does not drag the meter", () => {
    expect(completion(sectionStates(profile()))).toEqual({ percent: 100, missing: [] });
  });

  it("misses reduce the percentage and are named", () => {
    const { percent, missing } = completion(
      sectionStates(profile({ socials: [], agreementsSigned: 0 })),
    );
    expect(percent).toBe(71); // 5 of 7 answerable (POL-FE-69: rates are BTG's)
    expect(missing.sort()).toEqual(["agreements", "socials"]);
  });

  it("never lists payment as missing — the athlete cannot fix it", () => {
    const { missing } = completion(sectionStates(profile({ socials: [] })));
    expect(missing).not.toContain("payment");
  });
});
