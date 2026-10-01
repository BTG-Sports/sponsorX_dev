import { describe, expect, it } from "vitest";

import { changeRows, formatValue, isMinorNow, latestForBanner, legalNameNeedsId, sensitiveWhat, type ApiProfileChange } from "../src/lib/profile-changes-live";

/* --------------------------------------------------------------------------
   2S1-BE-14 / 2S1-FE-09 — profile edits without BTG review: the editor's and
   New sign-ups' pure translations.
   -------------------------------------------------------------------------- */

const change = (over: Partial<ApiProfileChange>): ApiProfileChange => ({
  id: "pc_1", athleteId: "ath_1", sections: ["identity"], fields: { displayName: "ADA.28" }, note: null,
  state: "APPROVED", reviewerNotes: null, reviewedAt: null, createdAt: "2026-09-29T08:00:00.000Z", sensitive: false, checkNotes: [], ...over,
});

describe("what an edit changed", () => {
  it("renders in §11 order, humanised, with empties as dashes; a guardian is 'named', never an id", () => {
    const rows = changeRows({ fields: { restrictedCategories: ["ALCOHOL", "GAMBLING"], city: null, level: "COLLEGE", legalName: "Ada Park", guardianId: "g_1" } });
    expect(rows.map((r) => r.field)).toEqual(["legalName", "guardianId", "city", "level", "restrictedCategories"]);
    expect(rows[1]).toEqual({ field: "guardianId", label: "Guardian", value: "Named" });
    expect(rows[2]).toMatchObject({ label: "City", value: "—" });
    expect(rows[4]).toMatchObject({ value: "Alcohol, Gambling" });
    expect(sensitiveWhat({ fields: { birthDate: "2012-01-01" } })).toBe("Date of birth");
  });
  it("keeps an unknown field rather than dropping it", () => {
    expect(changeRows({ fields: { newColumn: 1 } })[0]).toEqual({ field: "newColumn", label: "newColumn", value: "1" });
  });
  it("says when an empty list was chosen on purpose", () => {
    expect(formatValue([])).toBe("— (none)");
  });
});

describe("the athlete's banner", () => {
  it("a legal name waiting for its ID first, else the last sensitive edit's checks; an ordinary edit needs no banner", () => {
    const sensitive = change({ id: "s", sensitive: true, checkNotes: ["Now under the age of majority: a guardian is needed."] });
    const ordinary = change({ id: "o" });
    expect(latestForBanner([ordinary, sensitive])?.id).toBe("s");
    expect(latestForBanner([change({ id: "p", state: "PENDING", sensitive: true }), sensitive])?.id).toBe("p");
    expect(latestForBanner([ordinary, change({ id: "w", state: "WITHDRAWN" })])).toBeNull();
  });
  it("a legal name needs its ID only when it actually changes", () => {
    expect(legalNameNeedsId("Riley Stone", "Riley Stone ")).toBe(false);
    expect(legalNameNeedsId("Riley Stone", "")).toBe(false);
    expect(legalNameNeedsId("Riley Stone", "Riley Morgan Stone")).toBe(true);
  });
});

describe("who needs a guardian", () => {
  const now = new Date("2026-10-01T00:00:00.000Z");
  it("under 18 by date of birth, else by age band; unknown is adult", () => {
    expect(isMinorNow("2010-01-01", null, now)).toBe(true);
    expect(isMinorNow("2008-10-01", null, now)).toBe(false);
    expect(isMinorNow(null, "16_17", now)).toBe(true);
    expect(isMinorNow(null, null, now)).toBe(false);
  });
});
