import { describe, expect, it } from "vitest";

import {
  daysUntil,
  inventoryTotals,
  orderSplits,
  pickEdition,
  rackByKind,
  toFlatplan,
  toInventoryRows,
  type ApiEdition,
  type ApiLedgerSlot,
} from "../src/lib/editions-live";

/* P9-FE-03 / -04 / -05 — the ledger drawn as the page map and the table.
   Pinned: a slot's page comes from its code; pages with nothing to sell are
   editorial; the back cover and presenting position stand apart; a slot is
   SOLD or OPEN (no invented holds); a buyer the caller may not see reads
   "Taken"; totals count sold value, not rack. */

const slot = (o: Partial<ApiLedgerSlot>): ApiLedgerSlot => ({
  id: o.slotCode ?? "x", slotCode: "P02-FULL", kind: "FULL", page: 2, priceCents: 80_000,
  sold: false, soldCents: null, soldAt: null, ...o,
});

const SLOTS = [
  slot({ slotCode: "P02-FULL", sold: true, soldCents: 75_000, buyer: { campaignId: "c", campaign: "Fall push", sponsor: "Northside" } }),
  slot({ slotCode: "P04-QTR-A", kind: "QUARTER", page: 4, priceCents: 25_000 }),
  slot({ slotCode: "P04-QTR-B", kind: "QUARTER", page: 4, priceCents: 25_000, sold: true, soldCents: 25_000 }),
  slot({ slotCode: "BACK", kind: "BACK_COVER", page: null, priceCents: 100_000 }),
  slot({ slotCode: "PRESENT", kind: "PRESENTING", page: null, priceCents: 150_000 }),
];

describe("toFlatplan", () => {
  const plan = toFlatplan(SLOTS, 6);
  it("draws every page up to the page count, editorial where nothing sells", () => {
    expect(plan.pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(plan.pages[0]).toMatchObject({ title: "Cover", editorial: true });
    expect(plan.pages[2]).toMatchObject({ editorial: true });
    expect(plan.pages[3]!.slots.map((s) => s.code)).toEqual(["P04-QTR-A", "P04-QTR-B"]);
  });
  it("keeps the real rack price and only SOLD / OPEN", () => {
    expect(plan.pages[1]!.slots[0]).toMatchObject({ state: "SOLD", rackCents: 80_000, soldCents: 75_000, sponsor: "Northside" });
    expect(plan.pages[3]!.slots[0]).toMatchObject({ state: "OPEN" });
  });
  it("sets the back cover and presenting position apart", () => {
    expect(plan.backCover).toMatchObject({ code: "BACK", kind: "BACK_COVER", state: "OPEN" });
    expect(plan.presenting?.slotCode).toBe("PRESENT");
  });
  it("grows past the page count rather than dropping a slot", () => {
    expect(toFlatplan([slot({ slotCode: "P09-FULL", page: 9 })], 4).pages).toHaveLength(9);
  });
  it("an edition with no back cover says so (null), not a stand-in", () => {
    expect(toFlatplan([], null).backCover).toBeNull();
  });
});

describe("toInventoryRows / inventoryTotals", () => {
  const rows = toInventoryRows(SLOTS);
  it("names the buyer when readable, 'Taken' when not", () => {
    expect(rows[0]).toMatchObject({ buyer: "Northside", holdFor: "Fall push" });
    expect(rows[2]).toMatchObject({ buyer: "Taken" });
    expect(rows[1]).not.toHaveProperty("buyer");
  });
  it("back cover is page 0, presenting is off the page", () => {
    expect(rows[3]).toMatchObject({ page: 0, pageTitle: "Back cover" });
    expect(rows[4]).toMatchObject({ page: -1, pageTitle: "Presenting sponsor" });
  });
  it("committed is sold value; open rack is what is left", () => {
    expect(inventoryTotals(rows)).toEqual({ committed: 100_000, openRack: 275_000, rack: 380_000, soldCount: 2, sellThrough: 40 });
    expect(inventoryTotals([]).sellThrough).toBe(0);
  });
});

describe("helpers", () => {
  const ed = (id: string, state: ApiEdition["state"]) => ({ id, state }) as ApiEdition;
  it("opens on the asked edition, else the selling one, else the latest", () => {
    const list = [ed("a", "PLANNING"), ed("b", "SELLING")];
    expect(pickEdition(list, "a")?.id).toBe("a");
    expect(pickEdition(list, "zz")?.id).toBe("b");
    expect(pickEdition([ed("c", "CLOSED")])?.id).toBe("c");
    expect(pickEdition([])).toBeNull();
  });
  it("rack by kind uses the ledger's prices", () => {
    expect(rackByKind(SLOTS).find((k) => k.kind === "QUARTER")).toEqual({ kind: "QUARTER", min: 25_000, max: 25_000, sold: 1, total: 2 });
  });
  it("days until close never goes negative", () => {
    expect(daysUntil("2026-10-10T00:00:00Z", Date.parse("2026-10-01T00:00:00Z"))).toBe(9);
    expect(daysUntil("2026-09-01T00:00:00Z", Date.parse("2026-10-01T00:00:00Z"))).toBe(0);
  });
  it("splits come in the fixed payee order", () => {
    const s = orderSplits([
      { payeeKind: "EDITORIAL_FUND", bps: 1000, computedAt: "" },
      { payeeKind: "SPONSORX", bps: 4000, computedAt: "" },
    ]);
    expect(s.map((x) => x.payeeKind)).toEqual(["SPONSORX", "EDITORIAL_FUND"]);
  });
});
