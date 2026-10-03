import { describe, expect, it } from "vitest";

import {
  contentTrust,
  SENSITIVE_CATEGORIES,
  sensitiveIn,
  skipDecision,
  TRUSTED_DRAFT_COUNT,
  type SkipInput,
} from "../src/domain/content-trust-rules";
import { BRAND_CATEGORIES } from "../src/domain/brand-categories";

/* offer-draft reaches the database client, which reads the env on import. */
process.env.DATABASE_URL ??= "postgresql://test@localhost/test";
process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const { CATEGORY_DISCLOSURES } = await import("../src/domain/offer-draft");

/* P5-BE-10 — the pure half: when a passing draft skips BTG's review. */

const trusted: SkipInput = {
  clean: 3, minor: false, ageKnown: true, sponsorCategories: ["APPAREL"], briefCategories: [],
  btgRevisedBefore: false, sponsorReviewer: true,
};

describe("content trust rules", () => {
  it("the sensitive categories are the age-gated ones the offer draft discloses", () => {
    expect([...SENSITIVE_CATEGORIES].sort()).toEqual(Object.keys(CATEGORY_DISCLOSURES).sort());
    for (const c of SENSITIVE_CATEGORIES) expect(BRAND_CATEGORIES).toContain(c);
  });

  it("trust is 3 clean, capped at 3", () => {
    expect(TRUSTED_DRAFT_COUNT).toBe(3);
    expect(contentTrust(0)).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
    expect(contentTrust(2)).toEqual({ trusted: false, cleanStreak: 2, needed: 3 });
    expect(contentTrust(3)).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
    expect(contentTrust(9)).toEqual({ trusted: true, cleanStreak: 3, needed: 3 });
    expect(contentTrust(-1)).toEqual({ trusted: false, cleanStreak: 0, needed: 3 });
  });

  it("finds sensitive categories, ignoring case and blanks", () => {
    expect(sensitiveIn(["apparel", "Gambling", "", null, "ALCOHOL", "alcohol"])).toEqual(["ALCOHOL", "GAMBLING"]);
    expect(sensitiveIn([])).toEqual([]);
  });

  it("skips only when every condition holds", () => {
    expect(skipDecision(trusted)).toEqual({ skip: true, reason: "Trusted: last 3 drafts approved without changes" });
  });

  it("each failed condition keeps it with BTG, and says why", () => {
    const cases: Array<[Partial<SkipInput>, string]> = [
      [{ clean: 2 }, "Not trusted yet: 2 of 3 clean drafts — reviewed by BTG"],
      [{ minor: true }, "Athlete is a minor — always reviewed by BTG"],
      [{ ageKnown: false }, "Age not on file — reviewed by BTG"],
      [{ sponsorCategories: ["TOBACCO_VAPE"] }, "Sponsor is in a sensitive category (tobacco vape) — always reviewed by BTG"],
      [{ briefCategories: ["FITNESS", "cannabis"] }, "Brief is in a sensitive category (cannabis) — always reviewed by BTG"],
      [{ btgRevisedBefore: true }, "BTG asked for changes on an earlier version — reviewed by BTG"],
      [{ sponsorReviewer: false }, "The sponsor has no one to review it — reviewed by BTG"],
    ];
    for (const [change, reason] of cases) {
      expect(skipDecision({ ...trusted, ...change })).toEqual({ skip: false, reason });
    }
  });

  it("safety comes before trust: a minor with a perfect record still goes to BTG", () => {
    expect(skipDecision({ ...trusted, clean: 50, minor: true }).skip).toBe(false);
    expect(skipDecision({ ...trusted, clean: 50, sponsorCategories: ["GAMBLING"] }).skip).toBe(false);
  });
});
