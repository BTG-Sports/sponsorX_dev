import { describe, expect, it } from "vitest";

import {
  ANOMALY_KINDS,
  KIND,
  OUTCOMES,
  SAMPLE_ANOMALIES,
  anomalyTab,
  dispositionError,
  emptyAnomalyDesk,
  kindParam,
  ruleLabel,
  sampleAnomalies,
} from "../src/lib/anomalies-live";

/* 3S8-FE-01 — the anomaly console's contract and the disposition rule. */

describe("disposition — a note for every outcome", () => {
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
      expect(dispositionError(o.key, "ok")).toMatch(/more/);
    }
  });

  it("caps the note at 2,000 characters", () => {
    expect(dispositionError("false_positive", "x".repeat(2001))).toMatch(/2,000/);
  });

  it("offers exactly the three agreed outcomes", () => {
    expect(OUTCOMES.map((o) => o.key)).toEqual(["confirmed_issue", "false_positive", "excluded_from_reporting"]);
  });
});

describe("kinds and params", () => {
  it("has a label for each kind the rules raise", () => {
    expect(ANOMALY_KINDS).toEqual(["spike", "duplicate", "bot", "redemption", "manual_entry"]);
    for (const k of ANOMALY_KINDS) expect(KIND[k].label).toBeTruthy();
  });

  it("reads ?tab and ?kind strictly", () => {
    expect(anomalyTab("resolved")).toBe("resolved");
    expect(anomalyTab(undefined)).toBe("open");
    expect(kindParam("bot")).toBe("bot");
    expect(kindParam("robot")).toBe("");
  });

  it("prints the rule with its version", () => {
    expect(ruleLabel({ id: "bot-scan-cadence", version: "0.4.2" })).toBe("bot-scan-cadence@0.4.2");
  });
});

describe("the sample — acceptance #10's seeded patterns", () => {
  it("contains a duplicate, a bot and a redemption pattern, each with evidence and a rule version", () => {
    const open = SAMPLE_ANOMALIES.anomalies.filter((a) => !a.disposition);
    for (const k of ["duplicate", "bot", "redemption"] as const) {
      const a = open.find((x) => x.kind === k);
      expect(a, k).toBeDefined();
      expect(a!.evidence.length).toBeGreaterThan(0);
      expect(a!.rule.version).toBeTruthy();
    }
  });

  it("splits open and resolved like the API would", () => {
    const open = sampleAnomalies("open", "");
    const resolved = sampleAnomalies("resolved", "");
    expect(open.anomalies.every((a) => a.disposition === null)).toBe(true);
    expect(resolved.anomalies.every((a) => a.disposition !== null)).toBe(true);
    expect(open.anomalies.length).toBe(SAMPLE_ANOMALIES.counts.open);
    expect(resolved.anomalies.length).toBe(SAMPLE_ANOMALIES.counts.resolved);
  });

  it("the per-kind open counts match the open flags", () => {
    for (const k of ANOMALY_KINDS) {
      expect(SAMPLE_ANOMALIES.counts.openByKind[k], k).toBe(sampleAnomalies("open", k).anomalies.length);
    }
  });

  it("every resolved flag carries outcome, note, reviewer and time", () => {
    for (const a of sampleAnomalies("resolved", "").anomalies) {
      expect(dispositionError(a.disposition!.outcome, a.disposition!.note)).toBeNull();
      expect(a.disposition!.by).toBeTruthy();
    }
  });

  it("the empty desk counts zero everywhere", () => {
    const e = emptyAnomalyDesk();
    expect(e.anomalies).toEqual([]);
    expect(Object.values(e.counts.openByKind).every((n) => n === 0)).toBe(true);
  });
});
