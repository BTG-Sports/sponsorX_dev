import { describe, expect, it } from "vitest";

import { diffRows, formatValue, latestForBanner, touchesRestrictions, waitHours, type ApiProfileChange } from "../src/lib/profile-changes-live";

/* --------------------------------------------------------------------------
   P3-BE-16 — the review desk's and the editor's pure translations.
   -------------------------------------------------------------------------- */

const change = (over: Partial<ApiProfileChange>): ApiProfileChange => ({
  id: "pc_1", athleteId: "ath_1", sections: ["identity"], fields: { displayName: "ADA.28" }, note: null,
  state: "PENDING", reviewerNotes: null, reviewedAt: null, createdAt: "2026-09-29T08:00:00.000Z", ...over,
});

describe("diffRows", () => {
  it("renders now → proposed in §11 order, humanised, with empties as dashes", () => {
    const rows = diffRows(
      { fields: { restrictedCategories: ["ALCOHOL", "GAMBLING"], city: null, level: "COLLEGE", displayName: "ADA.28" } },
      { restrictedCategories: ["ALCOHOL"], city: "Baltimore", level: "HIGH_SCHOOL", displayName: "ADA.27" },
    );
    expect(rows.map((r) => r.field)).toEqual(["displayName", "city", "level", "restrictedCategories"]);
    expect(rows[1]).toMatchObject({ label: "City", before: "Baltimore", after: "—", section: "identity" });
    expect(rows[2]).toMatchObject({ before: "High school", after: "College" });
    expect(rows[3]).toMatchObject({ before: "Alcohol", after: "Alcohol, Gambling", section: "restrictions" });
  });
  it("keeps an unknown field rather than dropping it", () => {
    expect(diffRows({ fields: { newColumn: 1 } }, {})[0]).toMatchObject({ label: "newColumn", before: "—", after: "1", section: null });
  });
  it("says when an empty list was chosen on purpose", () => {
    expect(formatValue([])).toBe("— (none)");
  });
});

describe("the desk's flags and the athlete's banner", () => {
  it("flags a restriction change — the §26 input", () => {
    expect(touchesRestrictions({ fields: { restrictedCategories: [] } })).toBe(true);
    expect(touchesRestrictions({ fields: { restrictionNotes: "x" } })).toBe(false);
  });
  it("the banner shows the open request first, else the last decision, never a withdrawal", () => {
    const decided = change({ id: "d", state: "DECLINED", createdAt: "2026-09-28T08:00:00.000Z" });
    const withdrawn = change({ id: "w", state: "WITHDRAWN" });
    expect(latestForBanner([withdrawn, decided])?.id).toBe("d");
    expect(latestForBanner([change({ id: "p" }), decided])?.id).toBe("p");
    expect(latestForBanner([withdrawn])).toBeNull();
  });
  it("ages in whole hours, never negative", () => {
    const now = new Date("2026-09-29T10:30:00.000Z");
    expect(waitHours("2026-09-29T08:00:00.000Z", now)).toBe(2);
    expect(waitHours("2026-09-29T11:00:00.000Z", now)).toBe(0);
  });
});
