import { describe, expect, it } from "vitest";

import {
  ANOMALY_KINDS,
  KIND,
  NOTE_MAX,
  NOTE_MIN,
  NOTE_RULE,
  OUTCOMES,
  SAMPLE_ANOMALIES,
  anomalyTab,
  dispositionError,
  emptyAnomalyDesk,
  kindParam,
  reviewState,
  ruleLabel,
  rulesRan,
  sampleAnomalies,
} from "../src/lib/anomalies-live";

/* 3S8-FE-01 — the anomaly console's contract and the disposition rule,
   reconciled with the engine (3S8-DATA-01, backend/src/domain/anomaly-engine.ts). */

describe("disposition — a note for every outcome, in the API's own words", () => {
  it("accepts each outcome with a real note", () => {
    for (const o of OUTCOMES) expect(dispositionError(o.key, "Checked the venue logs.")).toBeNull();
  });

  it("refuses a missing outcome", () => {
    expect(dispositionError("", "Checked the venue logs.")).toMatch(/outcome/);
    expect(dispositionError(null, "Checked the venue logs.")).toMatch(/outcome/);
  });

  it("refuses a blank or token note for every outcome — false positive included", () => {
    for (const o of OUTCOMES) {
      expect(dispositionError(o.key, "   ")).toMatch(/note/);
      expect(dispositionError(o.key, "ok")).toBe(NOTE_RULE);
    }
  });

  it("matches the engine's bounds and 422 wording (AnomalyNoteError)", () => {
    expect(NOTE_MIN).toBe(8);
    expect(NOTE_MAX).toBe(2000);
    expect(NOTE_RULE).toBe("Every outcome needs a note of 8 to 2,000 characters.");
    expect(dispositionError("false_positive", "x".repeat(7))).toBe(NOTE_RULE);
    expect(dispositionError("false_positive", "x".repeat(8))).toBeNull();
    expect(dispositionError("false_positive", "x".repeat(2000))).toBeNull();
    expect(dispositionError("false_positive", "x".repeat(2001))).toBe(NOTE_RULE);
  });

  it("trims before measuring, as the engine does", () => {
    expect(dispositionError("confirmed_issue", "   abcdefg   ")).toBe(NOTE_RULE);
    expect(dispositionError("confirmed_issue", "   abcdefgh   ")).toBeNull();
  });

  it("offers exactly the three agreed outcomes, spelled as the API's enum", () => {
    expect(OUTCOMES.map((o) => o.key)).toEqual(["confirmed_issue", "false_positive", "excluded_from_reporting"]);
  });
});

describe("who decided — open, automatic (replaceable), final", () => {
  const d = { outcome: "excluded_from_reporting" as const, note: "n".repeat(8), by: "x", at: "2026-10-10T00:00:00.000Z" };

  it("reads the disposition's `automatic` flag", () => {
    expect(reviewState({ disposition: null })).toBe("open");
    expect(reviewState({ disposition: { ...d, automatic: true } })).toBe("automatic");
    expect(reviewState({ disposition: { ...d, automatic: false } })).toBe("final");
  });

  it("the sample holds SponsorX's own duplicate-post exclusion and a person's final decision", () => {
    const auto = SAMPLE_ANOMALIES.anomalies.filter((a) => reviewState(a) === "automatic");
    const final = SAMPLE_ANOMALIES.anomalies.filter((a) => reviewState(a) === "final");
    expect(auto.map((a) => [a.kind, a.rule.id, a.disposition!.outcome, a.disposition!.by])).toEqual([
      ["duplicate", "duplicate.post", "excluded_from_reporting", "SponsorX (automatic)"],
    ]);
    expect(final).toHaveLength(1);
    expect(final[0]!.disposition!.automatic).toBe(false);
  });
});

describe("kinds, rules and params", () => {
  it("has a label for each kind the rules raise, spelled as the API's enum", () => {
    expect(ANOMALY_KINDS).toEqual(["spike", "duplicate", "bot", "redemption", "manual_entry"]);
    for (const k of ANOMALY_KINDS) expect(KIND[k].label).toBeTruthy();
  });

  it("reads ?tab and ?kind strictly", () => {
    expect(anomalyTab("resolved")).toBe("resolved");
    expect(anomalyTab(undefined)).toBe("open");
    expect(kindParam("bot")).toBe("bot");
    expect(kindParam("robot")).toBe("");
  });

  it("prints the rule with the registry's stamp without doubling the @", () => {
    expect(ruleLabel({ id: "duplicate.post", version: "anomaly-rules@1.0.0" })).toBe("duplicate.post · anomaly-rules@1.0.0");
    expect(ruleLabel({ id: "bot-scan-cadence", version: "0.4.2" })).toBe("bot-scan-cadence@0.4.2");
  });

  it("knows the epoch asOf means the rules never ran", () => {
    expect(rulesRan(new Date(0).toISOString())).toBe(false);
    expect(rulesRan("not a date")).toBe(false);
    expect(rulesRan("2026-10-13T05:30:00.000Z")).toBe(true);
    expect(rulesRan(emptyAnomalyDesk().asOf)).toBe(false);
  });
});

describe("the sample — acceptance #10's seeded patterns, shaped like the engine", () => {
  it("contains a duplicate, a bot and a redemption pattern, each with evidence and the stamp", () => {
    for (const k of ["duplicate", "bot", "redemption"] as const) {
      const a = SAMPLE_ANOMALIES.anomalies.find((x) => x.kind === k);
      expect(a, k).toBeDefined();
      expect(a!.evidence.length).toBeGreaterThan(0);
      expect(a!.rule.version).toBe("anomaly-rules@1.0.0");
    }
  });

  it("uses the rule ids and subject types the engine raises", () => {
    const subjectFor: Record<string, string> = {
      "spike.views": "metric_stream", "duplicate.post": "campaign", "bot.clicks": "campaign",
      "redemption.burst": "reward", "redemption.repeat_fan": "reward",
      "manual.over_measured": "metric_stream", "manual.engagement_over_views": "metric_stream",
    };
    for (const a of SAMPLE_ANOMALIES.anomalies) expect(a.subject.type, a.rule.id).toBe(subjectFor[a.rule.id]);
  });

  it("splits open and resolved like the API would — automatic decisions sit on Resolved", () => {
    const open = sampleAnomalies("open", "");
    const resolved = sampleAnomalies("resolved", "");
    expect(open.anomalies.every((a) => a.disposition === null)).toBe(true);
    expect(resolved.anomalies.every((a) => a.disposition !== null)).toBe(true);
    expect(resolved.anomalies.some((a) => a.disposition!.automatic)).toBe(true);
    expect(open.anomalies.length).toBe(SAMPLE_ANOMALIES.counts.open);
    expect(resolved.anomalies.length).toBe(SAMPLE_ANOMALIES.counts.resolved);
  });

  it("the per-kind open counts match the open flags", () => {
    for (const k of ANOMALY_KINDS) {
      expect(SAMPLE_ANOMALIES.counts.openByKind[k], k).toBe(sampleAnomalies("open", k).anomalies.length);
    }
  });

  it("every resolved flag carries outcome, a valid note, decider, time and the automatic flag", () => {
    for (const a of sampleAnomalies("resolved", "").anomalies) {
      expect(dispositionError(a.disposition!.outcome, a.disposition!.note)).toBeNull();
      expect(a.disposition!.by).toBeTruthy();
      expect(typeof a.disposition!.automatic).toBe("boolean");
      expect(a.disposition!.by === "SponsorX (automatic)").toBe(a.disposition!.automatic);
    }
  });

  it("the empty desk counts zero everywhere", () => {
    const e = emptyAnomalyDesk();
    expect(e.anomalies).toEqual([]);
    expect(Object.values(e.counts.openByKind).every((n) => n === 0)).toBe(true);
  });
});
