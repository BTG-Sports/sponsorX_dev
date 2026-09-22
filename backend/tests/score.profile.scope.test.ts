import { describe, expect, it } from "vitest";

import {
  SCORE_FACTORS, SCORE_METHOD, SCORE_WEIGHTS, computeScore,
  FactorOutOfRangeError, NoFactorsAssessedError,
} from "../src/domain/content-value-rules";
import { BRAND_CATEGORIES, CONTENT_CAPABILITIES } from "../src/domain/brand-categories";
import { whereFor, MATCHES_NOTHING } from "../src/auth/scope";
import { ForbiddenError } from "../src/auth/errors";
import type { Actor } from "../src/auth/actor";
import type { Role } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   Score arithmetic, the conflict vocabulary, and sponsor row scoping —
   P3-BE-10, P3-BE-05, P4-BE-01. §14, §11 §4-§6, §18, §20, §26.

   All three are pure: the score is arithmetic, the vocabulary is a list, and
   a scope builder returns a `where` fragment. None needs a database, which is
   the same split athlete-state and guardian-rules use and the reason those
   rules are still tested at all.
   -------------------------------------------------------------------------- */

const actor = (roles: Role[], sponsorId: string | null = null): Actor =>
  ({ userId: "u", tenantId: "t1", roles, sponsorId });

describe("the score is a weighted sum of §14's seven factors", () => {
  it("weights total 100", () => {
    expect(Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("has exactly the seven factors §14 names", () => {
    expect(SCORE_FACTORS).toEqual([
      "engagement", "contentQuality", "audience", "reliability",
      "geography", "sportBrandFit", "sponsorPerformance",
    ]);
  });

  it("scores a fully assessed athlete as the plain weighted sum", () => {
    const all = Object.fromEntries(SCORE_FACTORS.map((f) => [f, 80]));
    expect(computeScore(all).score).toBe(80);
  });

  it("stamps rules-v1, so Phase 3 replaces the method and not the model", () => {
    expect(computeScore({ engagement: 50 }).method).toBe(SCORE_METHOD);
  });
});

describe("a missing factor is not a zero", () => {
  /* The rule most likely to be got wrong, and it changes the answer a lot.
     A new athlete with no sponsor history scored as zero is punished for
     having no history — backwards for a network trying to recruit. */
  it("redistributes an absent factor's weight instead of scoring it zero", () => {
    const withGap = computeScore({
      engagement: 80, contentQuality: 80, audience: 80, reliability: 80,
      geography: 80, sportBrandFit: 80,
      /* sponsorPerformance absent — a new athlete has no history */
    });
    expect(withGap.score).toBe(80);

    const asZero = computeScore({
      engagement: 80, contentQuality: 80, audience: 80, reliability: 80,
      geography: 80, sportBrandFit: 80, sponsorPerformance: 0,
    });
    expect(asZero.score).toBe(76);
  });

  it("says out loud how much of the weight was never assessed", () => {
    const b = computeScore({ engagement: 90 });
    expect(b.assessedGapPercent).toBe(75);
    expect(b.score).toBe(90);
  });

  it("reports zero gap when everything was assessed", () => {
    const all = Object.fromEntries(SCORE_FACTORS.map((f) => [f, 50]));
    expect(computeScore(all).assessedGapPercent).toBe(0);
  });

  it("keeps an absent factor visible as null, not omitted", () => {
    const b = computeScore({ engagement: 60 });
    const sponsor = b.factors.find((f) => f.factor === "sponsorPerformance")!;
    expect(sponsor.value).toBeNull();
    expect(sponsor.weight).toBe(5);
    expect(sponsor.effectiveWeight).toBe(0);
  });

  it("distinguishes an assessed zero from an absence", () => {
    expect(computeScore({ engagement: 0 }).factors[0]!.value).toBe(0);
    expect(computeScore({ contentQuality: 50 }).factors[0]!.value).toBeNull();
  });
});

describe("the score refuses what it cannot defend", () => {
  it("refuses an athlete nobody has assessed", () => {
    expect(() => computeScore({})).toThrow(NoFactorsAssessedError);
  });

  it.each([-1, 101, Number.NaN])("refuses a factor of %s", (value) => {
    expect(() => computeScore({ engagement: value })).toThrow(FactorOutOfRangeError);
  });

  it("carries every factor's contribution, so the number can be explained", () => {
    const b = computeScore({ engagement: 100, contentQuality: 0 });
    const engagement = b.factors.find((f) => f.factor === "engagement")!;
    /* 25 of 45 assessed weight => 55.56% of the score */
    expect(engagement.effectiveWeight).toBeCloseTo(55.56, 1);
    expect(engagement.contribution).toBeCloseTo(55.56, 1);
  });
});

describe("restrictions are a closed vocabulary", () => {
  it("shares one category list between athlete restrictions and sponsor categories", () => {
    /* Free text cannot be conflict-checked: "no booze", "No Alcohol" and
       "alcohol/bars" are three strings and one intention. */
    expect(BRAND_CATEGORIES).toContain("ALCOHOL");
    expect(BRAND_CATEGORIES).toContain("GAMBLING");
    expect(new Set(BRAND_CATEGORIES).size).toBe(BRAND_CATEGORIES.length);
  });

  it("lists capabilities matching can actually ask about", () => {
    expect(CONTENT_CAPABILITIES).toContain("SHORT_FORM_VIDEO");
    expect(CONTENT_CAPABILITIES).toContain("IN_PERSON_APPEARANCE");
  });
});

describe("a sponsor reaches its own records and no other's", () => {
  it("scopes a sponsor admin to their own organisation", () => {
    expect(whereFor(actor(["SPONSOR_ADMIN"], "sp_1"), "sponsor", "read"))
      .toEqual({ tenantId: "t1", id: "sp_1" });
  });

  it("scopes their contacts to that organisation's people", () => {
    expect(whereFor(actor(["SPONSOR_ADMIN"], "sp_1"), "sponsorContact", "read"))
      .toEqual({ tenantId: "t1", sponsorId: "sp_1" });
  });

  it("matches nothing for a sponsor user with no sponsor, never everything", () => {
    /* A broken row must reach nothing. The dangerous failure is `{}`, which
       in Prisma means every row in the table. */
    expect(whereFor(actor(["SPONSOR_ADMIN"], null), "sponsor", "read"))
      .toEqual(MATCHES_NOTHING);
  });

  it("lets BTG staff see the tenant's sponsors", () => {
    expect(whereFor(actor(["SALES"]), "sponsor", "read")).toEqual({ tenantId: "t1" });
  });

  it("lets only SUPER_ADMIN cross the tenant", () => {
    expect(whereFor(actor(["SUPER_ADMIN"]), "sponsor", "read")).toEqual({});
  });

  it.each(["ATHLETE", "GUARDIAN", "PROPERTY_MGR"] as const)(
    "refuses %s outright", (role) => {
      expect(() => whereFor(actor([role]), "sponsor", "read")).toThrow(ForbiddenError);
    });

  it("does not let a sponsor analyst write", () => {
    expect(() => whereFor(actor(["SPONSOR_ANALYST"], "sp_1"), "sponsor", "write"))
      .toThrow(ForbiddenError);
  });
});
