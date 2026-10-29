import { describe, expect, it } from "vitest";

import {
  awaitingBtg, bannerLabel, changeRows, editStatusLabel, formatValue, heldForBtg, isMinorNow, latestForBanner, legalNameNeedsId, pendingLine, sensitiveWhat, withdrawnLine,
  type ApiProfileChange,
} from "../src/lib/profile-changes-live";

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

/* POL-FE-02 / POL-BE-02 — a minor's date of birth or move that would make them an adult waits for BTG, with no ID. */
describe("a held adulthood change", () => {
  const held = change({ id: "h", state: "PENDING", sensitive: true, fields: { birthDate: "2007-06-01" }, checkNotes: ["BTG checks this change before it applies: it would make you an adult, which ends your guardian's control."] });
  const nameWaitingForId = change({ id: "n", state: "PENDING", sensitive: true, fields: { legalName: "Ada Park" } });
  const nameIdIn = change({ ...nameWaitingForId, id: "i", idDocumentUploadedAt: "2026-10-28T10:00:00.000Z" });

  it("is PENDING with no ID in play — BTG's to answer, like a legal name whose ID is in", () => {
    expect(heldForBtg(held)).toBe(true);
    expect(heldForBtg(nameWaitingForId)).toBe(false);
    expect(heldForBtg(nameIdIn)).toBe(false);
    expect(heldForBtg(change({ state: "APPROVED", fields: { birthDate: "2007-06-01" } }))).toBe(false);
    expect(awaitingBtg(held)).toBe(true);
    expect(awaitingBtg(nameIdIn)).toBe(true);
    expect(awaitingBtg(nameWaitingForId)).toBe(false);
    /* BTG's list reads `idDocument` rather than the upload time. */
    expect(heldForBtg({ state: "PENDING", fields: { stateCode: "TX" }, idDocument: null })).toBe(true);
    expect(awaitingBtg({ state: "PENDING", fields: { legalName: "A" }, idDocument: { uploadedAt: "2026-10-28T10:00:00.000Z" } })).toBe(true);
  });
  it("BTG's chip says it's theirs; the athlete's says Waiting for BTG", () => {
    expect(editStatusLabel(held)).toBe("Waiting for you");
    expect(editStatusLabel(nameWaitingForId)).toBe("Waiting for the ID");
    expect(bannerLabel(held)).toBe("Waiting for BTG");
    expect(bannerLabel(nameIdIn)).toBe("Waiting for BTG");
    expect(bannerLabel(nameWaitingForId)).toBe("Waiting for your ID");
    expect(bannerLabel(change({ state: "DECLINED" }))).toBe("Declined");
  });
  it("tells the athlete what each PENDING change waits on, and that a held one can be withdrawn", () => {
    expect(pendingLine(held)).toMatch(/^BTG checks this change before it applies\. .*withdraw/);
    expect(pendingLine(nameIdIn)).toMatch(/^Your ID is in\./);
    expect(pendingLine(nameWaitingForId)).toMatch(/matching ID arrives/);
  });
  it("comes first on the athlete's banner, and names what stays as it is after a withdraw", () => {
    expect(latestForBanner([change({ id: "o" }), held])?.id).toBe("h");
    expect(withdrawnLine(held)).toBe("Withdrawn. Your date of birth stays as it is.");
    expect(withdrawnLine(change({ fields: { birthDate: "2007-06-01", stateCode: "TX" } }))).toBe("Withdrawn. Your date of birth, state stays as it is.");
    expect(withdrawnLine(nameWaitingForId)).toBe("Withdrawn. Your legal name stays as it is.");
  });
});
