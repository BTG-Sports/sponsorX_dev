import { describe, expect, it } from "vitest";

import {
  NOTE_WORDS, SAMPLE_MAKEGOOD_LIST, SAMPLE_SHORTFALLS, allChecksPass, approvalBlock, approvalError, bestOption, costWords, coverage, decidedByWords,
  decidedOption, decisionWords, equivalencyLabel, failedChecks, heldReasons, makeGoodTab, periodWords, runWords, sampleMakeGoodList, shortfallShare, signedUsd,
  type MakeGoodDecision, type MakeGoodOption, type Shortfall,
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

const decision = (d: Partial<MakeGoodDecision> = {}): MakeGoodDecision => ({
  optionId: "mgt-7", by: "mgt@mgt.invalid (Campaign manager)", at: "2026-10-01T00:00:00.000Z", note: "Sponsor agreed on the call",
  automatic: false, runsFrom: "2026-10-02", runsUntil: "2026-10-15",
  ...d,
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
    expect(approvalBlock({ decision: decision() }, ok)).toBe("This shortfall is already decided.");
  });
  it("needs an option and a note of 8 to 2,000 characters, in the API's words (a 422 otherwise)", () => {
    expect(approvalError({ optionId: "", note: "x" })).toBe("Pick the substitute to approve.");
    expect(NOTE_WORDS).toBe("Say why this substitute, in 8 to 2,000 characters — the note goes on the audit record and the campaign.");
    expect(approvalError({ optionId: "mgt-7", note: "   " })).toBe(NOTE_WORDS);
    expect(approvalError({ optionId: "mgt-7", note: "ok" })).toBe(NOTE_WORDS);
    expect(approvalError({ optionId: "mgt-7", note: "  1234567  " })).toBe(NOTE_WORDS);
    expect(approvalError({ optionId: "mgt-7", note: "12345678" })).toBeNull();
    expect(approvalError({ optionId: "mgt-7", note: "x".repeat(2000) })).toBeNull();
    expect(approvalError({ optionId: "mgt-7", note: "x".repeat(2001) })).toBe(NOTE_WORDS);
    expect(approvalError({ optionId: "mgt-7", note: "Sponsor agreed" })).toBeNull();
  });
  it("finds the decided option", () => {
    const s = { options: [ok, failing], decision: decision({ optionId: "mgt-8" }) };
    expect(decidedOption(s)?.id).toBe("mgt-8");
    expect(decidedOption({ ...s, decision: null })).toBeNull();
  });
});

describe("the landed shape (3S5-BE-02): automatic approval, held reasons, the run window", () => {
  /* As backend/tests/makegood.test.ts asserts the API answers — B, approved by SponsorX; E, held for a person. */
  const ava = opt({ id: "mgt-ava", inventoryName: "Ava story set", format: "Social post ×4", estimatedDelivery: 16000, equivalencyScore: 0.9375, costImpactCents: -20000 });
  const liveB: Shortfall = {
    id: "mgt-sf-b", status: "approved", campaign: { id: "mgd_B", name: "Late and short" }, sponsorName: "Fit Co", metric: "impressions",
    sold: 30000, projected: 15000, shortfall: 15000, shortfallValueCents: 300000, endsAt: "2026-11-30T00:00:00.000Z",
    stamp: { modelVersion: "makegood-rules@1.0.0", confidence: 1, computedAt: "2026-11-27T20:00:00.000Z" },
    options: [ava],
    decision: {
      optionId: "mgt-ava", by: "SponsorX (automatic)", at: "2026-11-27T20:00:00.000Z", automatic: true, runsFrom: "2026-11-28", runsUntil: "2026-12-11",
      note: "Approved automatically by SponsorX: Ava story set covers about 16,000 of the 15,000 impressions short.",
    },
    automatic: { approved: true, heldBecause: [] },
  };
  const whyE = "Only 50% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain.";
  const liveE: Shortfall = {
    ...liveB, id: "mgt-sf-e", status: "open", campaign: { id: "mgd_E", name: "Half way" }, decision: null, automatic: { approved: false, heldBecause: [whyE] },
  };

  it("an approved shortfall says SponsorX decided it and the days it runs", () => {
    expect(heldReasons(liveB)).toEqual([]);
    expect(decisionWords(liveB.decision!)).toBe("Approved automatically");
    expect(decidedByWords(liveB.decision!)).toBe("SponsorX · automatic");
    expect(runWords(liveB.decision!)).toBe("Runs Nov 28 – Dec 11");
    expect(approvalBlock(liveB, ava)).toBe("This shortfall is already decided.");
  });
  it("an open shortfall held for a person lists why, and may still be approved by one", () => {
    expect(heldReasons(liveE)).toEqual([whyE]);
    expect(approvalBlock(liveE, ava)).toBeNull();
  });
  it("a person's decision reads as theirs, and a decision without recorded days has no run window", () => {
    const d = decision({ by: "cam@mgd.invalid (Campaign manager)", runsFrom: "2026-11-28", runsUntil: null });
    expect(decisionWords(d)).toBe("Approved by a person");
    expect(decidedByWords(d)).toBe("cam@mgd.invalid (Campaign manager)");
    expect(runWords(d)).toBeNull();
    /* Once decided by a person, the reasons it was held are history, not a hold. */
    expect(heldReasons({ status: "approved", decision: d, automatic: { approved: false, heldBecause: [whyE] } })).toEqual([]);
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
    expect(c.openValueCents).toBe(SAMPLE_SHORTFALLS.filter((s) => s.status === "open").reduce((n, s) => n + s.shortfallValueCents, 0));
  });
  it("filters by status and campaign; open by value at risk, approved newest first", () => {
    const approved = sampleMakeGoodList("approved").shortfalls;
    expect(approved.every((s) => s.status === "approved" && s.decision)).toBe(true);
    expect(approved.map((s) => s.decision!.at)).toEqual([...approved.map((s) => s.decision!.at)].sort().reverse());
    const open = sampleMakeGoodList("open").shortfalls;
    expect(open.every((s) => s.status === "open" && !s.decision)).toBe(true);
    expect(open.map((s) => s.shortfallValueCents)).toEqual([...open.map((s) => s.shortfallValueCents)].sort((a, b) => b - a));
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
  it("shows both decision kinds and every open shortfall's held reasons, consistently with the API's rules", () => {
    const decided = SAMPLE_SHORTFALLS.filter((s) => s.decision);
    expect(decided.some((s) => s.decision!.automatic)).toBe(true);
    expect(decided.some((s) => !s.decision!.automatic)).toBe(true);
    for (const s of SAMPLE_SHORTFALLS) {
      expect(s.status === "approved").toBe(Boolean(s.decision));
      /* `automatic.approved` is SponsorX's own approval, never a person's; and an automatic one holds no reason. */
      expect(s.automatic.approved).toBe(Boolean(s.decision?.automatic));
      if (s.automatic.approved) expect(s.automatic.heldBecause).toEqual([]);
      if (s.decision) expect(s.decision.by === "SponsorX (automatic)").toBe(s.decision.automatic);
      if (s.decision) expect(runWords(s.decision)).toMatch(/^Runs /);
      if (s.status === "open") expect(heldReasons(s).length).toBeGreaterThan(0);
    }
  });
});
