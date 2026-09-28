import { describe, expect, it } from "vitest";

import {
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
