import { describe, expect, it } from "vitest";

import {
  activationBlock,
  explainRefusal,
  relativeSince,
  toDeskApp,
  type ApiApplication,
  type DeskApp,
} from "../src/lib/applications-live";
import { stateBucket, waitHours } from "../src/lib/applications-ui";
import { applications } from "../src/lib/fixtures";

/* --------------------------------------------------------------------------
   P3-FE-02 — the live queue's translation rules, provable without a server.

   The mapping is where a wire shape quietly becomes a lie: a guardian status
   collapsed wrong lets a minor read as an adult; an unassessed factor shown
   as 0 punishes a new athlete (§14); a fabricated followers count is §22's
   exact sin. Each rule is pinned here.
   -------------------------------------------------------------------------- */

const NOW = new Date("2026-09-25T12:00:00Z");

function apiRow(over: Partial<ApiApplication> = {}): ApiApplication {
  return {
    id: "ath_1",
    displayName: "SHAMMAH.27",
    legalName: "Shammah Okeke",
    sport: "Basketball",
    stateCode: "MD",
    state: "SUBMITTED",
    guardianStatus: "not-required",
    missingFields: [],
    reviewerNotes: null,
    reviewedAt: null,
    createdAt: "2026-09-25T09:00:00Z",
    score: null,
    ...over,
  };
}

describe("relativeSince speaks the fixtures' vocabulary", () => {
  it("counts hours under two days", () => {
    expect(relativeSince("2026-09-25T09:00:00Z", NOW)).toBe("3 hours ago");
  });

  it("switches to days at 48 hours", () => {
    expect(relativeSince("2026-09-22T09:00:00Z", NOW)).toBe("3 days ago");
  });

  it("never says zero — a just-submitted application reads as 1 hour", () => {
    expect(relativeSince("2026-09-25T11:59:00Z", NOW)).toBe("1 hour ago");
  });

  it("round-trips through waitHours, so the aging badge reads live rows", () => {
    expect(waitHours(relativeSince("2026-09-22T09:00:00Z", NOW))).toBe(72);
  });
});

describe("guardian status maps to the desk's minor semantics", () => {
  it("an adult is not a minor and has no guardian verdict", () => {
    const row = toDeskApp(apiRow({ guardianStatus: "not-required" }), NOW);
    expect(row.isMinor).toBe(false);
    expect(row.guardianVerified).toBeNull();
  });

  it.each(["missing", "unverified"] as const)(
    "a minor with a %s guardian is unverified",
    (status) => {
      const row = toDeskApp(apiRow({ guardianStatus: status }), NOW);
      expect(row.isMinor).toBe(true);
      expect(row.guardianVerified).toBe(false);
      expect(row.guardianStatus).toBe(status);
    },
  );

  it("a minor with a verified guardian is ready", () => {
    const row = toDeskApp(apiRow({ guardianStatus: "ready" }), NOW);
    expect(row.isMinor).toBe(true);
    expect(row.guardianVerified).toBe(true);
  });
});

describe("the §14 snapshot survives the trip", () => {
  const breakdown = {
    score: 62,
    method: "rules-v1",
    factors: [
      { factor: "engagement", value: 70, weight: 25, effectiveWeight: 26.32, contribution: 18.42 },
      { factor: "sportBrandFit", value: 55, weight: 10, effectiveWeight: 10.53, contribution: 5.79 },
      { factor: "sponsorPerformance", value: null, weight: 5, effectiveWeight: 0, contribution: 0 },
      { factor: "novelFactor", value: 40, weight: 5, effectiveWeight: 5, contribution: 2 },
    ],
    assessedGapPercent: 5,
  };
  const scored = apiRow({
    score: { total: 62, method: "rules-v1", scoredAt: "2026-09-20T10:00:00Z", factors: breakdown },
  });

  it("maps factor keys to reviewer labels", () => {
    const factors = toDeskApp(scored, NOW).score?.factors ?? [];
    expect(factors[0]).toEqual({ label: "Engagement", value: 70 });
    expect(factors[1]).toEqual({ label: "Fit", value: 55 });
  });

  it("keeps an unassessed factor as null — absence is not zero", () => {
    const factors = toDeskApp(scored, NOW).score?.factors ?? [];
    expect(factors[2]).toEqual({ label: "Sponsor performance", value: null });
  });

  it("passes an unknown factor key through rather than dropping it", () => {
    const factors = toDeskApp(scored, NOW).score?.factors ?? [];
    expect(factors[3]).toEqual({ label: "novelFactor", value: 40 });
  });

  it("carries the assessed gap so the drawer can say the score is partial", () => {
    expect(toDeskApp(scored, NOW).score?.gapPercent).toBe(5);
  });

  it("an unscored athlete stays null, never zero", () => {
    expect(toDeskApp(apiRow(), NOW).score).toBeNull();
  });

  it("a malformed stored breakdown degrades to an empty factor list, not a crash", () => {
    const odd = apiRow({
      score: {
        total: 50,
        method: "rules-v1",
        scoredAt: "2026-09-20T10:00:00Z",
        factors: { bogus: true } as unknown as typeof breakdown,
      },
    });
    expect(toDeskApp(odd, NOW).score).toEqual({
      total: 50,
      method: "rules-v1",
      factors: [],
      gapPercent: 0,
    });
  });
});

describe("nothing is invented (§22)", () => {
  it("live rows carry no followers, no flags and no profile slug", () => {
    const row = toDeskApp(apiRow(), NOW);
    expect(row.followers).toBeNull();
    expect(row.flags).toEqual([]);
    expect(row.slug).toBeUndefined();
  });

  it("a missing state code renders as a dash, not a guess", () => {
    expect(toDeskApp(apiRow({ stateCode: null }), NOW).region).toBe("—");
  });
});

describe("§21's states land in the right tabs", () => {
  it.each([
    ["SUBMITTED", "review"],
    ["UNDER_REVIEW", "review"],
    ["CHANGES_REQUESTED", "review"],
    ["APPROVED", "approved"],
    ["ACTIVE", "approved"],
    ["REJECTED", "rejected"],
    ["DRAFT", "other"],
    ["SUSPENDED", "other"],
  ] as const)("%s → %s", (state, bucket) => {
    expect(stateBucket(state)).toBe(bucket);
  });
});

describe("the fixture rows still satisfy the desk's row shape", () => {
  it("every fixture application is a valid DeskApp", () => {
    for (const a of applications) {
      const row: DeskApp = a;
      expect(row.id).toBeTruthy();
      expect(row.score).not.toBeNull();
      expect(stateBucket(row.state)).not.toBe("other");
    }
  });
});

describe("activation — B1's last step, gated for minors (§37)", () => {
  const adult = { isMinor: false, guardianVerified: null, guardianStatus: "not-required" as const };
  it("offers activation for an approved adult", () => {
    expect(activationBlock(adult, "APPROVED")).toBeNull();
  });
  it("offers it for an approved minor whose guardian is verified", () => {
    expect(activationBlock({ isMinor: true, guardianVerified: true, guardianStatus: "ready" }, "APPROVED")).toBeNull();
  });
  it("says why for a minor with no guardian, and for an unverified one — differently", () => {
    const none = activationBlock({ isMinor: true, guardianVerified: false, guardianStatus: "missing" }, "APPROVED");
    const unverified = activationBlock({ isMinor: true, guardianVerified: false, guardianStatus: "unverified" }, "APPROVED");
    expect(none).toMatch(/no guardian is linked/);
    expect(unverified).toMatch(/linked but not verified/);
  });
  it("never offers it outside APPROVED", () => {
    for (const s of ["SUBMITTED", "UNDER_REVIEW", "ACTIVE", "REJECTED"] as const) {
      expect(activationBlock(adult, s)).not.toBeNull();
    }
  });
});

/* --------------------------------------------------------------------------
   QA pass 5 — decision 3 (complete to activate) and F-10 (stale clicks).
   -------------------------------------------------------------------------- */

describe("activation says which fields are missing, as the API would", () => {
  const adult = { isMinor: false, guardianVerified: null, guardianStatus: "not-required" as const };
  it("carries the API's missingFields onto the desk row", () => {
    const row = toDeskApp(apiRow({ missingFields: ["stateCode"] }), NOW);
    expect(row.missingFields).toEqual(["stateCode"]);
  });
  it("blocks an incomplete profile and names the fields in words", () => {
    const why = activationBlock({ ...adult, missingFields: ["stateCode", "birthDateOrAgeBand"] }, "APPROVED");
    expect(why).toMatch(/incomplete/i);
    expect(why).toMatch(/state/);
    expect(why).toMatch(/date of birth or age band/);
    expect(why).not.toMatch(/birthDateOrAgeBand|stateCode/);
  });
  it("an empty list does not block", () => {
    expect(activationBlock({ ...adult, missingFields: [] }, "APPROVED")).toBeNull();
  });
  it("a suspended athlete is told reinstatement is a separate step", () => {
    expect(activationBlock(adult, "SUSPENDED")).toMatch(/reinstat/i);
  });
});

describe("a refused decision reads as product copy, never state-machine text (F-10)", () => {
  it("a stale Activate says it's already active, and hands back the real state", () => {
    const r = explainRefusal("activate", 409, {
      code: "illegal_transition",
      message: "An athlete cannot go from ACTIVE to ACTIVE. Legal moves from ACTIVE: SUSPENDED (§21).",
      from: "ACTIVE", to: "ACTIVE",
    });
    expect(r.message).toBe("Already active — refresh to see the latest.");
    expect(r.state).toBe("ACTIVE");
  });
  it.each(["approve", "changes", "reject", "begin"] as const)(
    "a stale %s says someone got there first, with no §21 text", (kind) => {
      const r = explainRefusal(kind, 409, {
        code: "illegal_transition", message: "An athlete cannot go from REJECTED to APPROVED (§21).",
        from: "REJECTED", to: "APPROVED",
      });
      expect(r.message).not.toMatch(/cannot go from|§21|REJECTED/);
      expect(r.message).toMatch(/refresh/i);
      expect(r.state).toBe("REJECTED");
    });
  it("an illegal transition without details still hides the raw text", () => {
    const r = explainRefusal("approve", 409, { code: "illegal_transition", message: "An athlete cannot go from X to Y" });
    expect(r.message).not.toMatch(/cannot go from/);
    expect(r.state).toBeUndefined();
  });
  it("profile_incomplete names the fields in words", () => {
    const r = explainRefusal("activate", 422, { code: "profile_incomplete", message: "…", missing: ["sport"] });
    expect(r.message).toMatch(/sport/);
    expect(r.message).not.toMatch(/profile_incomplete/);
  });
  it("P6-FE-07 · profile_incomplete hands back the missing fields, so a stale row disables Activate", () => {
    const r = explainRefusal("activate", 422, { code: "profile_incomplete", message: "…", missing: ["sport", "stateCode"] });
    expect(r.missing).toEqual(["sport", "stateCode"]);
    /* adopted into the row, activationBlock now refuses — the button's rule */
    const why = activationBlock({ isMinor: false, guardianVerified: null, guardianStatus: "not-required", missingFields: r.missing! }, "APPROVED");
    expect(why).toMatch(/Missing: /);
    /* no list → no fake one, and nothing to adopt */
    const bare = explainRefusal("activate", 422, { code: "profile_incomplete", message: "…" });
    expect(bare.missing).toBeUndefined();
    expect(bare.message).not.toMatch(/Missing: \./);
  });
  it("reinstatement_required moves the row to SUSPENDED", () => {
    const r = explainRefusal("activate", 409, { code: "reinstatement_required", message: "…" });
    expect(r.message).toMatch(/reinstat/i);
    expect(r.state).toBe("SUSPENDED");
  });
  it("a 5xx never echoes the body, but keeps the reference", () => {
    const r = explainRefusal("approve", 500, { code: "internal_error", message: "boom at x.ts:1", reference: "ref-1" });
    expect(r.message).not.toMatch(/x\.ts/);
    expect(r.message).toMatch(/ref-1/);
  });
  it("other 4xx keep the API's own words, preferring a named issue", () => {
    expect(explainRefusal("reject", 400, {
      code: "validation", message: "The submission failed validation.",
      issues: [{ path: "reviewerNotes", message: "A reason is required." }],
    }).message).toBe("A reason is required.");
    expect(explainRefusal("reject", 422, { code: "bad_request", message: "Notes needed." }).message).toBe("Notes needed.");
  });
});
