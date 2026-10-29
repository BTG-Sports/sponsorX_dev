import { describe, expect, it } from "vitest";

import { cascadeWords, comingOfAgeHold, liveBadge, liveChecksWord, needsReview, refusalWords, signupHref, type ApiSignupRow } from "../src/lib/signups-live";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the live athlete and guardian rows on BTG's New sign-ups desk
   (2S1-BE-09 / -10): which tab shows a row, its badge, its one-line reason,
   and the guardian's rejection naming the athletes it takes with it.
   -------------------------------------------------------------------------- */

const row = (over: Partial<ApiSignupRow>): ApiSignupRow => ({
  id: "ath_1", kind: "ATHLETE", name: "Riley Carter", sub: "Basketball · 20", signedUpAt: "2026-10-01T10:00:00.000Z",
  state: "AUTO_APPROVED", reasons: [], flags: [], ...over,
});

describe("rows", () => {
  it("held or flagged rows are under Needs review; approved ones aren't", () => {
    expect(needsReview(row({}))).toBe(false);
    expect(needsReview(row({ state: "NEEDS_REVIEW", reasons: ["Likely duplicate athlete: same email as Riley Carter"] }))).toBe(true);
    expect(needsReview(row({ flags: ["Place not in the age table"] }))).toBe(true);
  });
  it("says in words how each was approved, held or rejected", () => {
    expect(liveBadge(row({}), "2026-10-01T10:00:00.000Z").label).toBe("Approved automatically · Oct 1");
    expect(liveBadge(row({ state: "APPROVED" })).label).toBe("Approved by BTG");
    expect(liveBadge(row({ state: "NEEDS_REVIEW" }))).toMatchObject({ label: "Needs review", tone: "warn" });
    expect(liveBadge(row({ state: "REJECTED" })).label).toBe("Rejected");
    expect(liveBadge(row({ flags: ["x"] })).label).toBe("Approved · flagged");
    expect(liveChecksWord(row({}))).toBe("All checks passed");
    expect(liveChecksWord(row({ state: "NEEDS_REVIEW", reasons: ["A", "B"] }))).toBe("A · B");
  });
  it("opens each on its own profile page — the link BTG's emails carry", () => {
    expect(signupHref("ATHLETE", "ath_1")).toBe("/admin/new-signups/athletes/ath_1");
    expect(signupHref("GUARDIAN", "g 1")).toBe("/admin/new-signups/guardians/g%201");
  });
});

describe("rejecting a guardian", () => {
  it("names the athletes it rejects with them, and not those already rejected", () => {
    const guardianOf = [row({ name: "Jordan Reyes" }), row({ id: "a2", name: "Sam Reyes" }), row({ id: "a3", name: "Kai Reyes", state: "REJECTED" })];
    expect(cascadeWords({ kind: "GUARDIAN", guardianOf })).toBe("This also rejects Jordan Reyes and Sam Reyes.");
    expect(cascadeWords({ kind: "GUARDIAN", guardianOf: guardianOf.slice(0, 1) })).toBe("This also rejects Jordan Reyes.");
    expect(cascadeWords({ kind: "ATHLETE", guardianOf: [] })).toBeNull();
  });
  it("passes on the API's reason, never an internal error", () => {
    expect(refusalWords({ error: { message: "This athlete is already rejected." } }, 409)).toBe("This athlete is already rejected.");
    expect(refusalWords({ error: { message: "stack trace" } }, 500)).toMatch(/our side/);
    expect(refusalWords(null, 403)).toMatch(/role/);
  });
});

/* POL-FE-02 / POL-BE-02 — a coming-of-age takeover the ID check held: BTG reads why, then confirms or sends the ID back. */
describe("a held coming-of-age takeover", () => {
  it("names when and why it was held, and what Confirm takeover or Send back does", () => {
    const h = comingOfAgeHold({ name: "Finn Reyes", comingOfAgeHeld: { at: "2026-10-28T10:00:00.000Z", reasons: ["The date of birth on the ID doesn't match the profile."] } })!;
    expect(h.title).toBe("Coming of age · held since Oct 28");
    expect(h.reasons).toEqual(["The date of birth on the ID doesn't match the profile."]);
    expect(h.confirm).toMatch(/^Confirm takeover moves control to Finn: .*guardian is removed and told\.$/);
    expect(h.refuse).toMatch(/send the ID back from Documents — Finn is emailed/);
  });
  it("still has a reason when the API gave none, and is null when nothing is held", () => {
    expect(comingOfAgeHold({ name: "Finn Reyes", comingOfAgeHeld: { at: "2026-10-28T10:00:00.000Z", reasons: [] } })!.reasons).toEqual(["The ID couldn’t be read."]);
    expect(comingOfAgeHold({ name: "Finn Reyes", comingOfAgeHeld: null })).toBeNull();
    expect(comingOfAgeHold({ name: "Finn Reyes" })).toBeNull();
  });
});
