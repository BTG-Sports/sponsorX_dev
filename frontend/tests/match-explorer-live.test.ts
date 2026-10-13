import { describe, expect, it } from "vitest";

import {
  BRIEF_KEYS,
  MATCH_KINDS,
  SAMPLE_BRIEF_LIST,
  byImpact,
  explorerBriefHref,
  explorerBriefsQuery,
  factorFit,
  factorLabel,
  filteredOutLine,
  filteredOutTotal,
  groupEntries,
  kindHref,
  matchBand,
  matchKindOf,
  matchesPath,
  sampleMatchPage,
  selectionFrom,
  shortDay,
  shortlistChanged,
  toEntry,
  toggleEntry,
  topReasons,
  utcMinute,
  type ApiShortlist,
  type MatchFactor,
} from "@/lib/match-explorer-live";

/* --------------------------------------------------------------------------
   3S3-FE-01 — the match explorer's pure helpers and its sample, pinned.
   Fixture ids are prefixed mxt_ (this file) / mx_ (the lib's SAMPLE).
   -------------------------------------------------------------------------- */

const factor = (over: Partial<MatchFactor> = {}): MatchFactor => ({
  key: "audience",
  label: "Audience fit",
  weight: 0.25,
  contribution: 20,
  reason: "mxt reason",
  ...over,
});

describe("URL ↔ API", () => {
  it("reads ?kind, defaulting to athletes and refusing anything else", () => {
    expect(matchKindOf({})).toBe("athlete");
    expect(matchKindOf({ kind: "inventory" })).toBe("inventory");
    expect(matchKindOf({ kind: "sponsor" })).toBe("athlete");
  });

  it("asks the engine for one page of one kind", () => {
    expect(matchesPath("mxt_brief 1", { page: "2", size: "24" }, "property")).toBe(
      "/intelligence/briefs/mxt_brief%201/matches?page=2&size=24&kind=property",
    );
  });

  it("pages the brief picker on its own keys, so ?page stays the ranked list's", () => {
    const q = new URLSearchParams(explorerBriefsQuery({ bpage: "3", bsize: "24", page: "5", bq: "drink" }).slice(1));
    expect(q.get("page")).toBe("3");
    expect(q.get("size")).toBe("24");
    expect(q.get("state")).toBe("APPROVED,CAMPAIGN_CREATED,QUALIFIED");
    expect(q.get("sort")).toBe("desk");
    expect(q.get("q")).toBe("drink");
    expect(BRIEF_KEYS).toEqual({ page: "bpage", size: "bsize" });
  });

  it("choosing a brief keeps the picker's place and the kind, and drops the list's page", () => {
    const href = explorerBriefHref("bq=x&bpage=2&kind=property&page=4&brief=mxt_old", "mxt_new");
    const u = new URL(href, "http://x");
    expect(u.pathname).toBe("/admin/intelligence/matching");
    expect(u.searchParams.get("brief")).toBe("mxt_new");
    expect(u.searchParams.get("bq")).toBe("x");
    expect(u.searchParams.get("bpage")).toBe("2");
    expect(u.searchParams.get("kind")).toBe("property");
    expect(u.searchParams.get("page")).toBeNull();
  });

  it("a kind tab keeps the brief and resets to page 1; athletes is the bare default", () => {
    expect(kindHref("brief=mxt_b&page=3", "inventory")).toBe("/admin/intelligence/matching?brief=mxt_b&kind=inventory");
    expect(kindHref("brief=mxt_b&kind=inventory", "athlete")).toBe("/admin/intelligence/matching?brief=mxt_b");
  });
});

describe("reading a match", () => {
  it("orders factors by points earned, without mutating the engine's list", () => {
    const list = [factor({ key: "budget", contribution: 3 }), factor({ key: "audience", contribution: 20 }), factor({ key: "geography", contribution: 9 })];
    expect(byImpact(list).map((f) => f.key)).toEqual(["audience", "geography", "budget"]);
    expect(list[0].key).toBe("budget");
  });

  it("a factor's fit is its points over its share, clamped", () => {
    expect(factorFit(factor({ weight: 0.25, contribution: 20 }))).toBeCloseTo(0.8);
    expect(factorFit(factor({ weight: 0.1, contribution: 15 }))).toBe(1);
    expect(factorFit(factor({ weight: 0, contribution: 5 }))).toBe(0);
  });

  it("falls back to the house label when the engine sends a blank one", () => {
    expect(factorLabel({ key: "sponsorHistory", label: " " })).toBe("Sponsor history");
    expect(factorLabel({ key: "audience", label: "Fans like these" })).toBe("Fans like these");
  });

  it("headlines the engine's first reasons, skipping blanks", () => {
    expect(topReasons({ reasons: ["", "a", "b", "c"] })).toEqual(["a", "b"]);
  });

  it("bands scores at 75 and 50", () => {
    expect([matchBand(75), matchBand(74), matchBand(50), matchBand(49)]).toEqual(["strong", "good", "good", "weak"]);
  });

  it("states filtered-out counts in words, and says nothing when none were removed", () => {
    expect(filteredOutLine({ unavailable: 2, categoryConflict: 1, brandSafety: 0 })).toBe("3 filtered out — 2 unavailable · 1 category conflict");
    expect(filteredOutLine({ unavailable: 0, categoryConflict: 2, brandSafety: 1 })).toBe("3 filtered out — 2 category conflicts · 1 brand safety");
    expect(filteredOutLine({ unavailable: 0, categoryConflict: 0, brandSafety: 0 })).toBeNull();
    expect(filteredOutTotal({ unavailable: 1, categoryConflict: 2, brandSafety: 3 })).toBe(6);
  });

  it("formats a UTC minute the same everywhere", () => {
    expect(utcMinute("2026-10-13T09:05:59.000Z")).toBe("2026-10-13 09:05 UTC");
    expect(utcMinute("not a date")).toBe("—");
  });

  it("shortens a run's day for the KPI tile, in UTC", () => {
    expect(shortDay("2026-10-13T09:05:59.000Z")).toBe("Oct 13");
    expect(shortDay("2026-10-13T23:59:00.000-05:00")).toBe("Oct 14");
    expect(shortDay("not a date")).toBe("—");
  });
});

describe("the shortlist", () => {
  const saved: ApiShortlist = {
    id: "mxt_sl",
    briefId: "mxt_brief",
    entries: [
      { matchId: "athlete:mxt_a", kind: "athlete", name: "A", score: 60 },
      { matchId: "property:mxt_p", kind: "property", name: "P", score: 70 },
    ],
    savedAt: "2026-10-13T00:00:00.000Z",
    savedBy: "mxt saver",
  };

  it("starts from what was saved, and knows when the picks differ from it", () => {
    const sel = selectionFrom(saved);
    expect(Object.keys(sel).sort()).toEqual(["athlete:mxt_a", "property:mxt_p"]);
    expect(shortlistChanged(saved, ["property:mxt_p", "athlete:mxt_a"])).toBe(false);
    expect(shortlistChanged(saved, ["athlete:mxt_a"])).toBe(true);
    expect(shortlistChanged(saved, ["athlete:mxt_a", "inventory:mxt_i"])).toBe(true);
    expect(shortlistChanged(null, [])).toBe(false);
    expect(shortlistChanged(null, ["athlete:mxt_a"])).toBe(true);
  });

  it("toggles without mutating", () => {
    const sel = selectionFrom(saved);
    const e = toEntry({ id: "inventory:mxt_i", kind: "inventory", name: "I", score: 50 });
    const added = toggleEntry(sel, e);
    expect(Object.keys(added)).toHaveLength(3);
    expect(Object.keys(sel)).toHaveLength(2);
    expect(Object.keys(toggleEntry(added, e))).toHaveLength(2);
  });

  it("groups picks by kind in tab order, best score first", () => {
    const sel = toggleEntry(selectionFrom(saved), { matchId: "athlete:mxt_b", kind: "athlete", name: "B", score: 90 });
    const groups = groupEntries(sel);
    expect(groups.map((g) => g.kind)).toEqual(["athlete", "property"]);
    expect(groups[0].entries.map((e) => e.name)).toEqual(["B", "A"]);
  });
});

describe("SAMPLE (dev preview) keeps the contract's promises", () => {
  it("every sample score is the sum of its factors, each within its share; weights sum to 1", () => {
    for (const kind of MATCH_KINDS) {
      for (const m of sampleMatchPage(kind).matches) {
        expect(m.factors.reduce((s, f) => s + f.contribution, 0)).toBe(m.score);
        expect(m.factors.reduce((s, f) => s + f.weight, 0)).toBeCloseTo(1);
        for (const f of m.factors) expect(f.contribution).toBeLessThanOrEqual(f.weight * 100);
        expect(m.kind).toBe(kind);
      }
    }
  });

  it("is ranked best first, never lists an unavailable row, and counts agree", () => {
    for (const kind of MATCH_KINDS) {
      const p = sampleMatchPage(kind);
      const scores = p.matches.map((m) => m.score);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
      expect(p.matches.map((m) => m.rank)).toEqual(p.matches.map((_, i) => i + 1));
      expect(p.matches.every((m) => m.availability.state === "AVAILABLE" || m.availability.state === "LIMITED")).toBe(true);
      expect(p.counts[kind]).toBe(p.page.total);
    }
  });

  it("only the first sample brief has a saved shortlist", () => {
    expect(sampleMatchPage("athlete", SAMPLE_BRIEF_LIST.briefs[0].id).shortlist?.entries.length).toBe(2);
    expect(sampleMatchPage("athlete", SAMPLE_BRIEF_LIST.briefs[1].id).shortlist).toBeNull();
  });
});
