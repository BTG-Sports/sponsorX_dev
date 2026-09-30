// frontend/tests/next-about.test.ts
import { describe, expect, it } from "vitest";

import { BAND_ITEMS, editionHref, splitNumeral, usesLogo } from "../src/lib/next-about";

/* --------------------------------------------------------------------------
   /next/about magazine page (design spec 2026-09-30) — the pure bits:
   which editions wear the BTG Sports Talk Magazine logo, where an edition
   card links, and how the band splits "01 Write" into numeral + text.
   -------------------------------------------------------------------------- */

describe("usesLogo — only a Sports Talk publication wears the BTG logo", () => {
  it("matches the client's title in any spacing or case", () => {
    expect(usesLogo("BTG Sports Talk Magazine")).toBe(true);
    expect(usesLogo("sports talk")).toBe(true);
    expect(usesLogo("SportsTalk Weekly")).toBe(true);
  });
  it("leaves any other school's title to a typographic masthead", () => {
    expect(usesLogo("Northside Sideline")).toBe(false);
    expect(usesLogo("")).toBe(false);
  });
});

describe("editionHref — the reader route the old page linked to", () => {
  it("uses the school slug when there is one", () => {
    expect(editionHref({ id: "ed_1", school: { slug: "northside-high" } })).toBe("/next/northside-high/ed_1");
  });
  it("falls back to the regional bucket and URL-encodes both parts", () => {
    expect(editionHref({ id: "ed 2/x", school: null })).toBe("/next/regional/ed%202%2Fx");
  });
});

describe("splitNumeral — a leading two-digit token becomes the yellow numeral", () => {
  it("splits '01 Write'", () => {
    expect(splitNumeral("01 Write")).toEqual({ numeral: "01", text: "Write" });
  });
  it("leaves items without a numeral alone", () => {
    expect(splitNumeral("Your byline")).toEqual({ numeral: null, text: "Your byline" });
    expect(splitNumeral("2026 season")).toEqual({ numeral: null, text: "2026 season" });
  });
  it("the band list starts with the five numbered jobs", () => {
    expect(BAND_ITEMS.slice(0, 5).map((s) => splitNumeral(s).numeral)).toEqual(["01", "02", "03", "04", "05"]);
  });
});
