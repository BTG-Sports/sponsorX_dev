import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  blendedMargin,
  breachedLines,
  byIds,
  canShortlist,
  CONFLICT_DETAILS,
  DEFAULT_FILTERS,
  DEFAULT_SHORTLIST,
  filterRoster,
  fmtRatio,
  JOBS,
  marginBand,
  marginPct,
  marginRatio,
  MATCH_BRIEF,
  MATCH_ROSTER,
  relaxSuggestions,
  sendSteps,
  sendSummary,
  slotFill,
  sortRoster,
  statusFor,
} from "@/lib/matching";

describe("roster integrity", () => {
  it("every composite score is the rounded mean of its six factors", () => {
    for (const a of MATCH_ROSTER) {
      const mean = a.factors.reduce((s, f) => s + f, 0) / a.factors.length;
      expect(Math.round(mean), a.name).toBe(a.score);
    }
  });

  it("every conflicted athlete has a matching detail record", () => {
    for (const a of MATCH_ROSTER.filter((x) => x.conflict)) {
      expect(CONFLICT_DETAILS[a.id]?.athleteId).toBe(a.id);
    }
  });

  it("every athlete's job exists in the brief", () => {
    const jobIds = new Set(JOBS.map((j) => j.id));
    for (const a of MATCH_ROSTER) expect(jobIds.has(a.jobId), a.name).toBe(true);
  });

  it("the default shortlist resolves and is shortlistable", () => {
    const picks = byIds(DEFAULT_SHORTLIST);
    expect(picks).toHaveLength(DEFAULT_SHORTLIST.length);
    for (const a of picks) expect(canShortlist(a), a.name).toBe(true);
  });
});

describe("margin math (P0-PMO-09 floor)", () => {
  it("bands split exactly at the 1.4× floor and 1.7× thin line", () => {
    expect(marginBand(1.39)).toBe("below");
    expect(marginBand(1.4)).toBe("thin");
    expect(marginBand(1.69)).toBe("thin");
    expect(marginBand(1.7)).toBe("healthy");
  });

  it("Maya breaches the floor; a Premium at the top of the band can too", () => {
    const maya = byIds(["maya"])[0];
    expect(marginBand(marginRatio(maya.cost, maya.sell))).toBe("below");
    const kwame = byIds(["kwame"])[0];
    expect(marginBand(marginRatio(kwame.cost, kwame.sell))).toBe("below");
  });

  it("margin percent is the margin's share of sell", () => {
    expect(marginPct(950_000, 1_190_000)).toBe(20);
    expect(marginPct(0, 0)).toBe(0);
  });

  it("blended margin sums the shortlist, safe on empty", () => {
    const picks = byIds(DEFAULT_SHORTLIST);
    const b = blendedMargin(picks);
    expect(b.cost).toBe(2_155_000);
    expect(b.sell).toBe(3_290_000);
    expect(marginBand(b.ratio)).toBe("thin");
    expect(blendedMargin([]).ratio).toBe(0);
  });

  it("breachedLines finds exactly the below-floor picks", () => {
    const names = breachedLines(byIds(DEFAULT_SHORTLIST)).map((a) => a.id);
    expect(names).toEqual(["maya"]);
  });

  it("fmtRatio renders two decimals, trimming a trailing zero", () => {
    expect(fmtRatio(1.25)).toBe("1.25×");
    expect(fmtRatio(2)).toBe("2.0×");
  });
});

describe("status derivation", () => {
  it("conflict beats everything and carries the readable reason", () => {
    const lena = byIds(["lena"])[0];
    expect(statusFor(lena)).toMatchObject({
      kind: "conflict",
      sub: "Competing deal — racquets",
    });
    expect(canShortlist(lena)).toBe(false);
  });

  it("guardian-pending is a state, not a block", () => {
    const priya = byIds(["priya"])[0];
    expect(statusFor(priya).kind).toBe("guardian");
    expect(canShortlist(priya)).toBe(true);
  });

  it("not-yet-active athletes are visible but not shortlistable", () => {
    const cole = byIds(["cole"])[0];
    expect(statusFor(cole).kind).toBe("inactive");
    expect(canShortlist(cole)).toBe(false);
  });
});

describe("filtering", () => {
  it("defaults: conflicts split out, inactive hidden by activeOnly", () => {
    const { matched, blocked } = filterRoster(MATCH_ROSTER, DEFAULT_FILTERS);
    expect(matched).toHaveLength(11); // 14 − 2 conflicts − 1 inactive
    expect(blocked.map((a) => a.id).sort()).toEqual(["lena", "sasha"]);
  });

  it("conflicted athletes are never hidden by non-search filters", () => {
    const { blocked } = filterRoster(MATCH_ROSTER, {
      ...DEFAULT_FILTERS,
      tier: "Emerging",
      minScore: 88,
    });
    expect(blocked).toHaveLength(2);
  });

  it("search reaches name, sport, market and tier — and narrows blocked too", () => {
    const bySport = filterRoster(MATCH_ROSTER, { ...DEFAULT_FILTERS, q: "tennis" });
    expect(bySport.matched).toHaveLength(0);
    expect(bySport.blocked.map((a) => a.id)).toEqual(["lena"]);
    const byMarket = filterRoster(MATCH_ROSTER, { ...DEFAULT_FILTERS, q: "austin" });
    expect(byMarket.matched.length).toBeGreaterThan(0);
  });

  it("guardianOnly excludes pending minors", () => {
    const { matched } = filterRoster(MATCH_ROSTER, {
      ...DEFAULT_FILTERS,
      guardianOnly: true,
    });
    expect(matched.some((a) => a.guardian === "pending")).toBe(false);
  });

  it("sorts: margin ascending puts the floor-breakers first", () => {
    const sorted = sortRoster(
      MATCH_ROSTER.filter((a) => !a.conflict),
      "margin",
    );
    expect(sorted[0].id).toBe("maya");
    const costs = sortRoster(MATCH_ROSTER, "cost").map((a) => a.cost);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });

  it("counts active filters against the defaults", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, q: "x", minScore: 70, tier: "Premium" }),
    ).toBe(3);
  });
});

describe("relax suggestions (empty state)", () => {
  const strangling = {
    ...DEFAULT_FILTERS,
    q: "sprint",
    sport: "Track & Field",
    tier: "Emerging",
    minScore: 88,
  };

  it("the strangling filter set really matches nothing", () => {
    expect(filterRoster(MATCH_ROSTER, strangling).matched).toHaveLength(0);
  });

  it("every suggestion's count is a genuine re-run of the filter", () => {
    for (const s of relaxSuggestions(MATCH_ROSTER, strangling)) {
      const rerun = filterRoster(MATCH_ROSTER, { ...strangling, ...s.patch });
      expect(rerun.matched.length, s.label).toBe(s.count);
      expect(s.count).toBeGreaterThan(0);
    }
  });

  it("suggests a computed score target, not a hardcoded one", () => {
    const f = { ...DEFAULT_FILTERS, minScore: 93 };
    const s = relaxSuggestions(MATCH_ROSTER, f).find((x) =>
      x.label.startsWith("Drop minimum score"),
    );
    // top non-conflict score is 92 → nearest multiple of 5 below is 90
    expect(s?.label).toBe("Drop minimum score to 90");
    expect(s?.count).toBeGreaterThan(0);
  });

  it("offers nothing when no filters are active", () => {
    expect(relaxSuggestions(MATCH_ROSTER, DEFAULT_FILTERS)).toHaveLength(0);
  });
});

describe("slot assignment", () => {
  it("fills the brief's six slots by job, in pick order", () => {
    const { slots, overflow } = slotFill(byIds(DEFAULT_SHORTLIST));
    expect(slots).toHaveLength(MATCH_BRIEF.needed);
    expect(slots.filter((s) => s.athlete)).toHaveLength(4);
    expect(overflow).toHaveLength(0);
    // jules (JOB-C07) landed in the single photo-day slot
    expect(slots.find((s) => s.jobId === "JOB-C07")?.athlete?.id).toBe("jules");
  });

  it("over-capacity picks land in overflow, never silently dropped", () => {
    const fourReels = byIds(["maya", "kwame", "dion", "aiden"]); // JOB-A12 has 3 slots
    const { overflow } = slotFill(fourReels);
    expect(overflow.map((a) => a.id)).toEqual(["aiden"]);
  });
});

describe("send summary", () => {
  it("counts guardian consents and margin exceptions from the roster", () => {
    const six = byIds(["maya", "dion", "aiden", "amara", "naomi", "priya"]);
    const s = sendSummary(six);
    expect(s.invitations).toBe(6);
    expect(s.guardianCount).toBe(1);
    expect(s.exceptions.map((a) => a.id)).toEqual(["maya"]);
    expect(s.deadline).toBe(MATCH_BRIEF.responseDeadline);
  });

  it("send steps mention guardians and exceptions only when present", () => {
    const clean = byIds(["dion", "aiden"]);
    const steps = sendSteps(clean);
    expect(steps.join(" ")).not.toMatch(/guardian|exception/i);
    const withBoth = sendSteps(byIds(["maya", "priya"]));
    expect(withBoth.join(" ")).toMatch(/Priya Raman's guardian/);
    expect(withBoth.join(" ")).toMatch(/margin exception on 1 line/);
  });
});
