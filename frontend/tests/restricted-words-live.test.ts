import { describe, expect, it } from "vitest";

import {
  groupWords, historyLines, testInputs, testWhy, wordRefusal, TEST_LINES_MAX, WHERE_CHECKED, type ApiRestrictedWord,
} from "../src/lib/restricted-words-live";

/* --------------------------------------------------------------------------
   2S1-FE-11 — the restricted-words desk's pure translations.
   -------------------------------------------------------------------------- */

const w = (over: Partial<ApiRestrictedWord>): ApiRestrictedWord => ({
  id: "rw_1", word: "casino", kind: "GAMBLING", active: true, addedBy: "u_1",
  createdAt: "2026-09-28T11:20:00.000Z", updatedAt: "2026-09-28T11:20:00.000Z", ...over,
});
const kinds = [{ kind: "ADULT", label: "Adult" }, { kind: "GAMBLING", label: "Gambling" }];

describe("groupWords", () => {
  it("groups by the API's kind order, active then removed, and counts only active entries", () => {
    const g = groupWords({
      kinds,
      words: [w({ id: "a", word: "poker" }), w({ id: "b", word: "casino" }), w({ id: "c", word: "bookie", active: false }), w({ id: "d", word: "xxx", kind: "ADULT" })],
    });
    expect(g.map((x) => x.label)).toEqual(["Adult", "Gambling"]);
    expect(g[1]!.active.map((x) => x.word)).toEqual(["casino", "poker"]);
    expect(g[1]!.removed.map((x) => x.word)).toEqual(["bookie"]);
    expect(g[1]!.count).toBe("2 entries · 1 removed");
    expect(g[0]!.count).toBe("1 entry");
  });
  it("keeps a kind the API no longer lists rather than dropping its words", () => {
    expect(groupWords({ kinds, words: [w({ kind: "LEGACY" })] }).map((x) => x.kind)).toEqual(["ADULT", "GAMBLING", "LEGACY"]);
  });
});

describe("historyLines", () => {
  it("says who changed what, and ends with the day the starter list began", () => {
    const lines = historyLines(
      [{ change: "removed", word: "sex", by: "ops@btg.example", at: "2026-09-28T11:18:00.000Z" }, { change: "added", word: null, by: null, at: "2026-09-27T09:00:00.000Z" }],
      [w({ addedBy: "starter", createdAt: "2026-09-20T09:00:00.000Z" }), w({ addedBy: "starter", createdAt: "2026-09-21T09:00:00.000Z" })],
    );
    expect(lines.map((l) => l.text)).toEqual([
      "ops@btg.example removed “sex” from the list",
      "A BTG admin added a word to the list",
      "List started with BTG’s starter words",
    ]);
    expect(lines[2]!.when).toBe("Sep 20, 9:00 AM UTC");
  });
});

describe("the test box", () => {
  it("checks each non-empty line, up to the cap", () => {
    expect(testInputs("s3x shop\n\n  Essex Café  \r\n")).toEqual(["s3x shop", "Essex Café"]);
    expect(testInputs(Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n"))).toHaveLength(TEST_LINES_MAX);
  });
  it("names every match and says it goes to review, never rejection", () => {
    const why = testWhy("s3x shop with weed", { restricted: true, matches: [{ word: "sex", kind: "ADULT", label: "Adult" }, { word: "weed", kind: "DRUGS", label: "Drugs" }] }, []);
    expect(why).toBe("Matches “sex” (Adult) and “weed” (Drugs) as a whole word. This would be held for BTG’s review — never rejected by itself.");
  });
  it("explains a near miss inside a longer word", () => {
    expect(testWhy("Essex Café", { restricted: false, matches: [] }, ["sex", "escort service"])).toBe(
      "No match. “sex” sits inside the word “Essex”, and letters inside a longer word don’t count.",
    );
    expect(testWhy("Harbor Coffee", { restricted: false, matches: [] }, ["sex"])).toBe("No match.");
  });
});

describe("wordRefusal", () => {
  it("shows the API's own message, with the first validation issue", () => {
    expect(wordRefusal(409, { error: { message: "“fake id” is already on the list." } }).message).toBe("“fake id” is already on the list.");
    expect(wordRefusal(400, { error: { message: "The submission failed validation.", issues: [{ message: "Too long" }] } }).message).toBe("The submission failed validation. Too long");
    expect(wordRefusal(403, null).message).toBe("Only BTG admins can change the restricted words.");
  });
});

describe("2S3-FE-04 · where the list is checked", () => {
  it("listings are checked now; profiles still follow", () => {
    expect(WHERE_CHECKED).toMatch(/marketplace listings \(their title and description/);
    expect(WHERE_CHECKED).toMatch(/Athlete profiles follow later/);
    expect(WHERE_CHECKED).not.toMatch(/listings follow/);
  });
});
