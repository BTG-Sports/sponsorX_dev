import { describe, expect, it } from "vitest";

import * as attribution from "../src/lib/attribution-live";
import {
  ATTRIBUTION_TABS,
  CLASS_NOUN,
  SAMPLE_ATTRIBUTION,
  attributionTab,
  classParam,
  classTiles,
  displayClass,
  methodLine,
  sampleAttribution,
} from "../src/lib/attribution-live";
import { ATTRIBUTION_ORDER } from "../src/lib/intelligence";

/* 3S6-FE-01 — the attribution dashboard's contract and its guard (acceptance #8). */

describe("the four classes are never blended", () => {
  it("gives exactly four tiles, one per class, in the agreed order — no total", () => {
    const tiles = classTiles(SAMPLE_ATTRIBUTION.totals);
    expect(tiles.map((t) => t.cls)).toEqual(ATTRIBUTION_ORDER);
    for (const t of tiles) expect(Object.keys(t)).not.toContain("total");
  });

  it("exports no summing helper", () => {
    const names = Object.keys(attribution).map((n) => n.toLowerCase());
    expect(names.filter((n) => /total|sum|blend|combined/.test(n))).toEqual([]);
  });

  it("each tile shows its own class's figure, not another's", () => {
    const tiles = classTiles(SAMPLE_ATTRIBUTION.totals);
    const by = Object.fromEntries(tiles.map((t) => [t.cls, t]));
    expect(by.VERIFIED_REDEMPTION.value).toBe("412");
    expect(by.VERIFIED_TRANSACTION.value).toBe("$18,435");
    expect(by.MODELLED.value).toBe("$29,600");
    expect(by.ESTIMATED_MEDIA_VALUE.value).toBe("$41,200");
  });

  it("modelled and estimated never call themselves verified; estimated never calls itself revenue", () => {
    expect(CLASS_NOUN.MODELLED.noun).toMatch(/not verified/);
    expect(CLASS_NOUN.MODELLED.noun.replace("not verified", "")).not.toMatch(/verified/i);
    expect(CLASS_NOUN.ESTIMATED_MEDIA_VALUE.noun).not.toMatch(/verified|revenue/i);
  });

  it("the three looks are distinct: verified, modelled, estimated", () => {
    const tones = new Set(classTiles(SAMPLE_ATTRIBUTION.totals).map((t) => t.tone));
    expect(tones).toEqual(new Set(["verified", "modelled", "estimated"]));
  });
});

describe("displayClass — the method decides, not the label", () => {
  it("keeps an exact match on a named key verified", () => {
    expect(displayClass({ class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: "order_id" })).toEqual({ cls: "VERIFIED_TRANSACTION", demoted: false });
    expect(displayClass({ class: "VERIFIED_REDEMPTION", method: "deterministic", matchKey: "token" })).toEqual({ cls: "VERIFIED_REDEMPTION", demoted: false });
  });

  it("never renders a probabilistic event as verified", () => {
    expect(displayClass({ class: "VERIFIED_TRANSACTION", method: "probabilistic", matchKey: null })).toEqual({ cls: "MODELLED", demoted: true });
    expect(displayClass({ class: "VERIFIED_REDEMPTION", method: "probabilistic", matchKey: "token" })).toEqual({ cls: "MODELLED", demoted: true });
  });

  it("never renders a deterministic event with no match key as verified", () => {
    expect(displayClass({ class: "VERIFIED_TRANSACTION", method: "deterministic", matchKey: null })).toEqual({ cls: "MODELLED", demoted: true });
  });

  it("leaves modelled and estimated alone", () => {
    expect(displayClass({ class: "MODELLED", method: "probabilistic", matchKey: null }).cls).toBe("MODELLED");
    expect(displayClass({ class: "ESTIMATED_MEDIA_VALUE", method: "probabilistic", matchKey: null }).cls).toBe("ESTIMATED_MEDIA_VALUE");
  });

  it("the sample's mislabelled event is demoted on screen", () => {
    const ev = SAMPLE_ATTRIBUTION.events!.find((e) => e.id === "attr-s-ev-5")!;
    expect(displayClass(ev)).toEqual({ cls: "MODELLED", demoted: true });
  });
});

describe("method, source and confidence on every event", () => {
  it("names the key for an exact match and the model for a probabilistic one", () => {
    expect(methodLine({ method: "deterministic", matchKey: "click_id", modelVersion: null })).toBe("Exact · click id");
    expect(methodLine({ method: "probabilistic", matchKey: null, modelVersion: "attr-prob@0.3.1" })).toBe("Probabilistic · attr-prob@0.3.1");
    expect(methodLine({ method: "probabilistic", matchKey: null, modelVersion: null })).toMatch(/missing/);
  });

  it("every sample event carries source, method and confidence", () => {
    for (const e of SAMPLE_ATTRIBUTION.events!) {
      expect(e.source.partner).toBeTruthy();
      expect(e.confidence).toBeGreaterThan(0);
      if (e.method === "probabilistic") expect(e.modelVersion).toBeTruthy();
    }
  });
});

describe("URL params and the sample's tabs", () => {
  it("reads ?tab and ?class strictly", () => {
    expect(attributionTab("unmatched")).toBe("unmatched");
    expect(attributionTab("nope")).toBe("events");
    expect(classParam("MODELLED")).toBe("MODELLED");
    expect(classParam("VERIFIED")).toBe("");
    expect(ATTRIBUTION_TABS.map((t) => t.key)).toEqual(["events", "unmatched"]);
  });

  it("filters the sample like the API would, totals untouched by the class filter", () => {
    const d = sampleAttribution("events", "VERIFIED_TRANSACTION");
    expect(d.events!.every((e) => e.class === "VERIFIED_TRANSACTION")).toBe(true);
    expect(d.page.total).toBe(d.events!.length);
    expect(d.totals).toEqual(SAMPLE_ATTRIBUTION.totals);
    const u = sampleAttribution("unmatched", "");
    expect(u.unmatched).toHaveLength(3);
    expect(u.events).toBeUndefined();
  });
});
