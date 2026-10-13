import { describe, expect, it } from "vitest";

import {
  SAMPLE_MAKEGOOD_LIST, SAMPLE_SHORTFALLS, allChecksPass, approvalBlock, approvalError, bestOption, costWords, coverage, decidedOption, equivalencyLabel,
  failedChecks, makeGoodTab, periodWords, sampleMakeGoodList, shortfallShare, signedUsd, type MakeGoodOption,
} from "@/lib/makegood-live";

/* 3S5-FE-01 — the make-good centre's rules: which option is best, which can be approved, the words, and the sample. */

const opt = (o: Partial<MakeGoodOption> & { id: string }): MakeGoodOption => ({
  inventoryName: "Mgt inventory",
  propertyName: "Mgt property",
  format: "Post",
  equivalencyScore: 0.8,
  estimatedDelivery: 1000,
  costImpactCents: 0,
  checks: { available: true, exclusivityClear: true, meetsTarget: true },
  reason: "Mgt reason",
  ...o,
});

describe("tabs", () => {
  it("defaults to open", () => {
    expect(makeGoodTab(undefined).key).toBe("open");
    expect(makeGoodTab("approved").key).toBe("approved");
    expect(makeGoodTab("closed").key).toBe("open");
  });
});

describe("checks", () => {
  it("passes only when all three pass, and names each failure", () => {
    expect(allChecksPass(opt({ id: "mgt-a" }))).toBe(true);
    const bad = opt({ id: "mgt-b", checks: { available: false, exclusivityClear: false, meetsTarget: true } });
    expect(allChecksPass(bad)).toBe(false);
    expect(failedChecks(bad)).toEqual(["Not available on the dates", "Conflicts with the sponsor's exclusivity"]);
  });
});

describe("best option", () => {
  it("picks the highest equivalency among options passing every check", () => {
    const options = [
      opt({ id: "mgt-1", equivalencyScore: 0.95, checks: { available: true, exclusivityClear: false, meetsTarget: true } }),
      opt({ id: "mgt-2", equivalencyScore: 0.85 }),
      opt({ id: "mgt-3", equivalencyScore: 0.9 }),
    ];
    expect(bestOption(options)?.id).toBe("mgt-3");
  });
  it("breaks a tie on the lower cost", () => {
    const options = [opt({ id: "mgt-4", costImpactCents: 5000 }), opt({ id: "mgt-5", costImpactCents: -2000 })];
    expect(bestOption(options)?.id).toBe("mgt-5");
  });
  it("is null when nothing passes", () => {
    expect(bestOption([opt({ id: "mgt-6", checks: { available: false, exclusivityClear: true, meetsTarget: true } })])).toBeNull();
    expect(bestOption([])).toBeNull();
  });
});

describe("approval", () => {
  const ok = opt({ id: "mgt-7" });
  const failing = opt({ id: "mgt-8", checks: { available: true, exclusivityClear: true, meetsTarget: false } });
  it("never lets an option failing a check be approved", () => {
    expect(approvalBlock({ decision: null }, ok)).toBeNull();
    expect(approvalBlock({ decision: null }, failing)).toBe("Can't be approved: misses the sponsor's target.");
  });
  it("is read-only once decided", () => {
    expect(approvalBlock({ decision: { optionId: "mgt-7", by: "Mgt Manager", at: "2026-10-01T00:00:00.000Z", note: "ok" } }, ok)).toBe(
      "This shortfall is already decided.",
    );
  });
  it("needs an option and a note", () => {
    expect(approvalError({ optionId: "", note: "x" })).toBe("Pick the substitute to approve.");
    expect(approvalError({ optionId: "mgt-7", note: "   " })).toContain("Say why this substitute");
    expect(approvalError({ optionId: "mgt-7", note: "ok" })).toContain("at least 8 characters");
    expect(approvalError({ optionId: "mgt-7", note: "  1234567  " })).toContain("at least 8 characters");
    expect(approvalError({ optionId: "mgt-7", note: "12345678" })).toBeNull();
    expect(approvalError({ optionId: "mgt-7", note: "x".repeat(2001) })).toContain("under 2,000");
    expect(approvalError({ optionId: "mgt-7", note: "Sponsor agreed" })).toBeNull();
  });
  it("finds the decided option", () => {
    const s = { options: [ok, failing], decision: { optionId: "mgt-8", by: "a", at: "2026-10-01T00:00:00.000Z", note: "n" } };
    expect(decidedOption(s)?.id).toBe("mgt-8");
    expect(decidedOption({ ...s, decision: null })).toBeNull();
  });
});

describe("words", () => {
  it("says the cost impact plainly", () => {
    expect(costWords(120_000)).toBe("Costs $1,200 more than the shortfall");
    expect(costWords(-30_000)).toBe("$300 under the shortfall");
    expect(costWords(40)).toBe("Even with the shortfall");
    expect(signedUsd(120_000)).toBe("+$1,200");
    expect(signedUsd(-30_000)).toBe("−$300");
    expect(signedUsd(0)).toBe("$0");
  });
  it("labels equivalency with a band", () => {
    expect(equivalencyLabel(0.93)).toBe("93% · close match");
    expect(equivalencyLabel(0.8)).toBe("80% · fair match");
    expect(equivalencyLabel(0.5)).toBe("50% · weak match");
  });
  it("shares and covers the gap", () => {
    expect(shortfallShare({ shortfall: 25, sold: 100 })).toBe(0.25);
    expect(shortfallShare({ shortfall: 25, sold: 0 })).toBe(0);
    expect(coverage({ shortfall: 200 }, { estimatedDelivery: 300 })).toBe(1.5);
  });
  it("names the period", () => {
    expect(periodWords({ from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" })).toBe("Oct 1 – Oct 31");
    expect(periodWords({ from: "", to: "" })).toBe("this period");
  });
});

describe("sample", () => {
  it("counts open and approved from its own shortfalls", () => {
    const c = SAMPLE_MAKEGOOD_LIST.counts;
    expect(c.open + c.approved).toBe(SAMPLE_SHORTFALLS.length);
    expect(c.openValueCents).toBe(SAMPLE_SHORTFALLS.filter((s) => !s.decision).reduce((n, s) => n + s.shortfallValueCents, 0));
  });
  it("filters by status and campaign", () => {
    expect(sampleMakeGoodList("approved").shortfalls.every((s) => s.decision)).toBe(true);
    expect(sampleMakeGoodList("open").shortfalls.every((s) => !s.decision)).toBe(true);
    const one = sampleMakeGoodList("open", "sample-fc-river");
    expect(one.shortfalls.map((s) => s.id)).toEqual(["sample-mg-river"]);
    expect(one.counts.open).toBe(1);
    expect(sampleMakeGoodList("open", "mgt-none").shortfalls).toEqual([]);
  });
  it("shows every check outcome and a decided option that passed them all", () => {
    const options = SAMPLE_SHORTFALLS.flatMap((s) => s.options);
    expect(options.some((o) => !o.checks.available)).toBe(true);
    expect(options.some((o) => !o.checks.exclusivityClear)).toBe(true);
    for (const s of SAMPLE_SHORTFALLS) {
      expect(s.shortfall).toBe(s.sold - s.projected);
      const chosen = decidedOption(s);
      if (s.decision) expect(chosen && allChecksPass(chosen)).toBe(true);
    }
  });
});
