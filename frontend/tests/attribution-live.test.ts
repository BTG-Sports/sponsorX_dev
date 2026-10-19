import { describe, expect, it } from "vitest";

import * as attribution from "../src/lib/attribution-live";
import {
  ATTRIBUTION_TABS,
  CLASS_NOUN,
  DISMISS_REASON_MAX,
  DISMISS_REASON_MIN,
  DISMISS_ROLES,
  SAMPLE_ATTRIBUTION,
  amountOf,
  attributionTab,
  canDismiss,
  classParam,
  classTiles,
  dismissError,
  dismissedLine,
  displayClass,
  isRefund,
  keysGivenLine,
  kindLabel,
  methodLine,
  sampleAttribution,
  unmatchedReason,
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

  it("a redemption is a count: the API sends amountCents 0 and the tile never prints '$0 reward value'", () => {
    expect(SAMPLE_ATTRIBUTION.totals.VERIFIED_REDEMPTION.amountCents).toBe(0);
    const tile = classTiles(SAMPLE_ATTRIBUTION.totals).find((t) => t.cls === "VERIFIED_REDEMPTION")!;
    expect(tile.value).toBe("412");
    expect(tile.sub).not.toMatch(/\$/);
    expect(tile.sub).toMatch(/not money/);
  });

  it("the sales tiles say refunds were taken off — the API's totals are sales less refunds", () => {
    expect(CLASS_NOUN.VERIFIED_TRANSACTION.other({ count: 3, amountCents: 100 })).toMatch(/3 matched orders.*refunds/);
    expect(CLASS_NOUN.MODELLED.other({ count: 2, amountCents: 100 })).toMatch(/2 probabilistic matches.*refunds/);
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
    expect(u.unmatched).toHaveLength(4);
    expect(u.events).toBeUndefined();
  });

  it("events are partner sales only: a redemption or media-value filter returns no rows, their tiles stay", () => {
    for (const e of SAMPLE_ATTRIBUTION.events!) expect(["VERIFIED_TRANSACTION", "MODELLED"]).toContain(e.class);
    for (const cls of ["VERIFIED_REDEMPTION", "ESTIMATED_MEDIA_VALUE"] as const) {
      const d = sampleAttribution("events", cls);
      expect(d.events).toEqual([]);
      expect(d.totals[cls].count).toBeGreaterThan(0);
    }
  });
});

describe("refunds — their own row, negative, off the total", () => {
  it("the sample's refund carries kind and a negative amount, and reads as one", () => {
    const refund = SAMPLE_ATTRIBUTION.events!.find((e) => e.id === "attr-s-ev-6")!;
    expect(refund.kind).toBe("refund");
    expect(refund.amountCents).toBeLessThan(0);
    expect(isRefund(refund)).toBe(true);
    expect(kindLabel(refund)).toBe("Refund");
    expect(isRefund(SAMPLE_ATTRIBUTION.events![0])).toBe(false);
    expect(kindLabel(SAMPLE_ATTRIBUTION.events![0])).toBe("Sale");
  });

  it("a row with no kind (an older fixture) is a refund only when its amount is negative", () => {
    expect(isRefund({ amountCents: -100 })).toBe(true);
    expect(isRefund({ amountCents: 100 })).toBe(false);
    expect(isRefund({ amountCents: null })).toBe(false);
  });

  it("prints a refund as −$, never '$-'", () => {
    expect(amountOf(-4_250)).toBe("−$43");
    expect(amountOf(4_250)).toBe("$43");
    expect(amountOf(null)).toBe("—");
    expect(amountOf(-4_250)).not.toMatch(/\$-/);
  });
});

describe("the queue — keys by name, dismissed sales marked", () => {
  it("every queued sale says which keys it carried, by name, never a value", () => {
    for (const u of SAMPLE_ATTRIBUTION.unmatched!) {
      expect(Array.isArray(u.keysGiven)).toBe(true);
      for (const k of u.keysGiven!) expect(["token", "order_id", "click_id"]).toContain(k);
    }
    expect(keysGivenLine(["click_id", "token"])).toBe("Carried click id, reward token");
    expect(keysGivenLine(["sku"])).toBe("Carried sku");
    expect(keysGivenLine([])).toBe("No match key carried");
    expect(keysGivenLine(undefined)).toBe("No match key carried");
  });

  it("the sample's queue is open first, then dismissed — with who, when and why", () => {
    const q = SAMPLE_ATTRIBUTION.unmatched!;
    const firstDismissed = q.findIndex((u) => u.dismissed);
    expect(firstDismissed).toBeGreaterThan(0);
    expect(q.slice(0, firstDismissed).every((u) => !u.dismissed)).toBe(true);
    expect(q.slice(firstDismissed).every((u) => u.dismissed)).toBe(true);
    const d = q[firstDismissed].dismissed!;
    expect(d).toEqual({ by: "atm_BTG_ADMIN", at: "2026-10-09T15:20:00Z", reason: "A test order from the partner's staff" });
    expect(dismissedLine(d, (iso) => iso.slice(0, 10))).toBe("Dismissed by atm_BTG_ADMIN · 2026-10-09");
    expect(dismissedLine({ by: null, at: d.at, reason: null }, () => "day")).toBe("Dismissed by a removed user · day");
  });

  it("a reason this file has no words for yet is shown as sent, not crashed on", () => {
    expect(unmatchedReason("ambiguous").label).toBe("Ambiguous");
    expect(unmatchedReason("partner_duplicate").label).toBe("partner duplicate");
  });
});

describe("dismissing — BTG admins only, with the API's reason bounds", () => {
  it("offers the button to SUPER_ADMIN and BTG_ADMIN and to nobody else who can read the desk", () => {
    expect([...DISMISS_ROLES]).toEqual(["SUPER_ADMIN", "BTG_ADMIN"]);
    expect(canDismiss(["BTG_ADMIN"])).toBe(true);
    expect(canDismiss(["SALES", "SUPER_ADMIN"])).toBe(true);
    expect(canDismiss(["CAMPAIGN_MGR"])).toBe(false);
    expect(canDismiss(["SALES"])).toBe(false);
    expect(canDismiss([])).toBe(false);
  });

  it("mirrors the API's 10..500 characters, trimmed", () => {
    expect(DISMISS_REASON_MIN).toBe(10);
    expect(DISMISS_REASON_MAX).toBe(500);
    expect(dismissError("")).toMatch(/why/i);
    expect(dismissError("   test    ")).toMatch(/at least 10/);
    expect(dismissError("A test order from the partner's staff")).toBeNull();
    expect(dismissError("x".repeat(501))).toMatch(/under 500/);
    expect(dismissError(`  ${"x".repeat(500)}  `)).toBeNull();
  });
});
