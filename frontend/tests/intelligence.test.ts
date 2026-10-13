import { describe, expect, it } from "vitest";

import { ATTRIBUTION_CLASSES, ATTRIBUTION_ORDER, ENGINES, confidenceBand, confidenceLabel, cpm, routeMissing, signedPct, usd } from "@/lib/intelligence";

/* Phase 3 screens' shared vocabulary — lib/intelligence.ts. */

describe("routeMissing — 'engine not built yet' vs a real failure", () => {
  it("reads the API's catch-all 404 (no message) as a route that isn't mounted", () => {
    expect(routeMissing(404, { error: { code: "not_found" } })).toBe(true);
  });

  it("reads 501 as a mounted engine that is switched off", () => {
    expect(routeMissing(501, null)).toBe(true);
  });

  it("never mistakes a mounted route's own 404 (it says why) for a missing engine", () => {
    expect(routeMissing(404, { error: { code: "not_found", message: "No such inventory item." } })).toBe(false);
    expect(routeMissing(404, null)).toBe(false);
    expect(routeMissing(404, { error: { code: "other" } })).toBe(false);
  });

  it("never turns an outage or a refusal into 'coming soon'", () => {
    for (const status of [400, 401, 403, 409, 500, 502, 503]) {
      expect(routeMissing(status, { error: { code: "not_found" } }), String(status)).toBe(false);
    }
  });
});

describe("confidence", () => {
  it("bands at 0.75 and 0.5", () => {
    expect(confidenceBand(0.75)).toBe("high");
    expect(confidenceBand(0.749)).toBe("medium");
    expect(confidenceBand(0.5)).toBe("medium");
    expect(confidenceBand(0.49)).toBe("low");
  });

  it("labels clamp to 0–100%", () => {
    expect(confidenceLabel(0.82)).toBe("82% · high confidence");
    expect(confidenceLabel(1.4)).toBe("100% · high confidence");
    expect(confidenceLabel(-1)).toBe("0% · low confidence");
  });
});

describe("formatting", () => {
  it("money and CPMs", () => {
    expect(usd(123456)).toBe("$1,235");
    expect(cpm(1240)).toBe("$12.40");
  });

  it("signs a factor's push on the price", () => {
    expect(signedPct(0.124)).toBe("+12%");
    expect(signedPct(-0.08)).toBe("−8%");
    expect(signedPct(0.001)).toBe("0%");
  });
});

describe("the engine registry", () => {
  it("has one engine per Phase 3 screen, each naming what it waits on and what it will show", () => {
    const screens = Object.values(ENGINES).map((e) => e.screen).sort();
    expect(screens).toEqual(["3S2-FE-01", "3S3-FE-01", "3S4-FE-01", "3S5-FE-01", "3S6-FE-01", "3S7-FE-01", "3S7-FE-02", "3S7-FE-03", "3S8-FE-01", "3S8-FE-02"]);
    for (const e of Object.values(ENGINES)) {
      expect(e.waitsOn.length, e.key).toBeGreaterThan(0);
      expect(e.shows.length, e.key).toBeGreaterThan(0);
      /* What a sponsor or property reads carries no task id and no route. */
      expect(e.plain, e.key).not.toMatch(/3S\d|\/intelligence|GET |POST /);
    }
  });

  it("never shows a number where it describes what is coming", () => {
    for (const e of Object.values(ENGINES)) {
      for (const s of [...e.shows, e.plain]) expect(s, e.key).not.toMatch(/\d/);
    }
  });
});

describe("attribution classes", () => {
  it("are four, in the order a report lists them, and only the two verified ones are called verified", () => {
    expect(ATTRIBUTION_ORDER).toEqual(["VERIFIED_REDEMPTION", "VERIFIED_TRANSACTION", "MODELLED", "ESTIMATED_MEDIA_VALUE"]);
    const verified = ATTRIBUTION_ORDER.filter((c) => ATTRIBUTION_CLASSES[c].tone === "verified");
    expect(verified).toEqual(["VERIFIED_REDEMPTION", "VERIFIED_TRANSACTION"]);
    expect(ATTRIBUTION_CLASSES.MODELLED.label).not.toMatch(/verified/i);
    expect(ATTRIBUTION_CLASSES.ESTIMATED_MEDIA_VALUE.label).not.toMatch(/verified/i);
  });
});
