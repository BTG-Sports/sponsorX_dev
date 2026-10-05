import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BRAND_CATEGORIES,
  EMPTY_DRAFT,
  INVENTORY_KINDS,
  centsFromUsd,
  componentOptions,
  draftFromItem,
  explainInventoryRefusal,
  isoFromDate,
  patchFrom,
  refusalMessage,
  teamItemRow,
  toInventoryRow,
  toRestrictionRow,
  toggleCategory,
  usd,
  validateDraft,
  type ApiInventoryItem,
  type InventoryDraft,
} from "../src/lib/inventory-live";

/* --------------------------------------------------------------------------
   2S2-FE-02 — the inventory manager's pure half. The form's checks mirror
   the API's InventoryItemInput + inventoryProblems; these pin that mirror
   so the form never lets through what the API refuses, nor refuses what it
   takes.
   -------------------------------------------------------------------------- */

const item = (over: Partial<ApiInventoryItem> = {}): ApiInventoryItem => ({
  id: "i1",
  athleteId: "a1",
  propertyId: null,
  jobId: null,
  title: "Basketball clinic",
  description: "90 minutes for up to 15 kids.",
  kind: "CAMP",
  priceCents: 50000,
  quantity: 6,
  availableFrom: "2026-10-01T00:00:00.000Z",
  availableUntil: "2026-12-31T00:00:00.000Z",
  categories: ["FITNESS"],
  restrictedCategories: ["ALCOHOL", "GAMBLING"],
  packageRules: {},
  active: true,
  version: 1,
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  components: [],
  ...over,
});

const draft = (over: Partial<InventoryDraft> = {}): InventoryDraft => ({ ...EMPTY_DRAFT, title: "Sponsored post", price: "250", ...over });

describe("the backend's vocabularies", () => {
  const backend = (f: string) => readFileSync(path.resolve(__dirname, "../../backend/src/domain", f), "utf8");
  it("kinds match INVENTORY_KINDS", () => {
    const src = backend("inventory.ts");
    const m = src.match(/INVENTORY_KINDS = \[([^\]]+)\]/);
    expect(m).not.toBeNull();
    expect([...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1])).toEqual([...INVENTORY_KINDS]);
  });
  it("categories match BRAND_CATEGORIES", () => {
    const src = backend("brand-categories.ts");
    const m = src.match(/BRAND_CATEGORIES = \[([^\]]+)\]/);
    expect([...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1])).toEqual([...BRAND_CATEGORIES]);
  });
});

describe("money", () => {
  it("formats cents as dollars with cents", () => {
    expect(usd(50000)).toBe("$500.00");
    expect(usd(12345)).toBe("$123.45");
  });
  it("parses what people type, never rounding", () => {
    expect(centsFromUsd("250")).toBe(25000);
    expect(centsFromUsd("$1,250.5")).toBe(125050);
    expect(centsFromUsd(" 0.99 ")).toBe(99);
    expect(centsFromUsd("12.345")).toBeNull();
    expect(centsFromUsd("-5")).toBeNull();
    expect(centsFromUsd("abc")).toBeNull();
    expect(centsFromUsd("")).toBeNull();
  });
});

describe("validateDraft mirrors InventoryItemInput", () => {
  it("builds the create body in cents with ISO dates", () => {
    const v = validateDraft(draft({ quantity: "6", availableFrom: "2026-10-01", availableUntil: "2026-10-31", description: "  " }), "create");
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.body).toEqual({
      title: "Sponsored post",
      description: null,
      kind: "SOCIAL_POST",
      priceCents: 25000,
      quantity: 6,
      availableFrom: "2026-10-01T00:00:00.000Z",
      availableUntil: "2026-10-31T00:00:00.000Z",
      categories: [],
      restrictedCategories: [],
    });
  });
  it("blank quantity is open quantity", () => {
    const v = validateDraft(draft(), "create");
    expect(v.ok && v.body.quantity).toBeNull();
  });
  it("requires a title", () => {
    const v = validateDraft(draft({ title: "   " }), "create");
    expect(!v.ok && v.errors.title).toBeTruthy();
  });
  it("prices $1.00 to $1,000,000.00 only", () => {
    expect(validateDraft(draft({ price: "0.99" }), "create").ok).toBe(false);
    expect(validateDraft(draft({ price: "1" }), "create").ok).toBe(true);
    expect(validateDraft(draft({ price: "1000000" }), "create").ok).toBe(true);
    expect(validateDraft(draft({ price: "1000000.01" }), "create").ok).toBe(false);
  });
  it("quantity is a whole number", () => {
    expect(validateDraft(draft({ quantity: "2.5" }), "create").ok).toBe(false);
    expect(validateDraft(draft({ quantity: "-1" }), "create").ok).toBe(false);
    expect(validateDraft(draft({ quantity: "0" }), "create").ok).toBe(true);
  });
  it("the window may not end before it starts (same day is fine, as the API allows)", () => {
    const bad = validateDraft(draft({ availableFrom: "2026-10-10", availableUntil: "2026-10-09" }), "create");
    expect(!bad.ok && bad.errors.availableUntil).toBeTruthy();
    expect(validateDraft(draft({ availableFrom: "2026-10-10", availableUntil: "2026-10-10" }), "create").ok).toBe(true);
    expect(isoFromDate("2026-02-30")).toBeNull();
  });
  it("a category can't be both offered and restricted", () => {
    const v = validateDraft(draft({ categories: ["ALCOHOL"], restrictedCategories: ["ALCOHOL"] }), "create");
    expect(!v.ok && v.errors.categories).toMatch(/Alcohol/);
    expect(validateDraft(draft({ categories: ["NOT_A_CATEGORY"] }), "create").ok).toBe(false);
  });
  it("a PACKAGE needs 1–10 distinct components at creation, sent only then", () => {
    expect(validateDraft(draft({ kind: "PACKAGE" }), "create").ok).toBe(false);
    const dup = validateDraft(draft({ kind: "PACKAGE", components: [{ itemId: "x", quantity: 1 }, { itemId: "x", quantity: 2 }] }), "create");
    expect(dup.ok).toBe(false);
    const zero = validateDraft(draft({ kind: "PACKAGE", components: [{ itemId: "x", quantity: 0 }] }), "create");
    expect(zero.ok).toBe(false);
    const ok = validateDraft(draft({ kind: "PACKAGE", components: [{ itemId: "x", quantity: 2 }] }), "create");
    expect(ok.ok && ok.body.components).toEqual([{ itemId: "x", quantity: 2 }]);
    const edit = validateDraft(draft({ kind: "PACKAGE" }), "edit");
    expect(edit.ok && edit.body.components).toBeUndefined();
    const plain = validateDraft(draft({ components: [{ itemId: "x", quantity: 1 }] }), "create");
    expect(plain.ok && plain.body.components).toBeUndefined();
  });
});

describe("editing sends only what changed", () => {
  it("an untouched draft is an empty patch", () => {
    const i = item();
    const v = validateDraft(draftFromItem(i), "edit");
    expect(v.ok).toBe(true);
    if (v.ok) expect(patchFrom(i, v.body)).toEqual({});
  });
  it("a new title doesn't carry the price (so the listing freeze isn't tripped)", () => {
    const i = item();
    const v = validateDraft({ ...draftFromItem(i), title: "Clinic (2h)" }, "edit");
    if (!v.ok) throw new Error("invalid");
    expect(patchFrom(i, v.body)).toEqual({ title: "Clinic (2h)" });
  });
  it("price, quantity, window and categories travel when changed", () => {
    const i = item();
    const v = validateDraft(
      { ...draftFromItem(i), price: "450", quantity: "", availableUntil: "", restrictedCategories: ["ALCOHOL"] },
      "edit",
    );
    if (!v.ok) throw new Error("invalid");
    expect(patchFrom(i, v.body)).toEqual({ priceCents: 45000, quantity: null, availableUntil: null, restrictedCategories: ["ALCOHOL"] });
  });
  it("never changes a package's kind", () => {
    const i = item({ kind: "PACKAGE" });
    const v = validateDraft({ ...draftFromItem(i), kind: "OTHER" }, "edit");
    if (!v.ok) throw new Error("invalid");
    expect(patchFrom(i, v.body).kind).toBeUndefined();
  });
});

describe("category chips", () => {
  it("moving a category to one list takes it out of the other", () => {
    const next = toggleCategory({ categories: ["ALCOHOL"], restrictedCategories: [] }, "restrictedCategories", "ALCOHOL");
    expect(next).toEqual({ categories: [], restrictedCategories: ["ALCOHOL"] });
    expect(toggleCategory(next, "restrictedCategories", "ALCOHOL")).toEqual({ categories: [], restrictedCategories: [] });
  });
});

describe("rows", () => {
  it("an item row says what the item holds", () => {
    const r = toInventoryRow(item());
    expect(r).toMatchObject({ title: "Basketball clinic", kind: "Camp or clinic", price: "$500.00", qty: "6 in stock", status: "Active", writable: true });
    expect(r.window).toBe("Oct 1, 2026 – Dec 31, 2026");
    expect(toInventoryRow(item({ quantity: null, active: false, availableFrom: null, availableUntil: null }))).toMatchObject({
      qty: "Open quantity",
      status: "Paused",
      window: null,
    });
  });
  it("the team view: own items writable, roster athletes' read-only with their name", () => {
    const base = { id: "t", title: "Banner", kind: "SIGNAGE", priceCents: 10000, quantity: 1, availableFrom: null, availableUntil: null, active: true, version: 1 };
    expect(teamItemRow({ ...base, owner: null })).toMatchObject({ owner: "Team", writable: true });
    expect(teamItemRow({ ...base, owner: "Riley Carter" })).toMatchObject({ owner: "Riley Carter", writable: false });
  });
  it("a package bundles only non-package items, never itself", () => {
    const opts = componentOptions([item({ id: "a" }), item({ id: "b", kind: "PACKAGE" }), item({ id: "c" })], "c");
    expect(opts.map((o) => o.id)).toEqual(["a"]);
  });
  it("an offer's exclusivity can't be removed", () => {
    const r = { id: "r", athleteId: "a1", propertyId: null, category: "ENERGY_DRINK", startsOn: null, endsOn: null, reason: null, sourceOfferId: null, createdAt: "" };
    expect(toRestrictionRow({ ...r, type: "PROHIBITED" })).toMatchObject({ category: "Energy drink", removable: true, window: null });
    expect(toRestrictionRow({ ...r, type: "EXCLUSIVITY", sourceOfferId: "o1" }).removable).toBe(false);
  });
});

describe("refusals", () => {
  it("reads the most specific sentence in an API error body", () => {
    expect(refusalMessage({ error: { message: "m", issues: [{ path: ["title"], message: "Too small" }] } })).toBe("Too small");
    expect(refusalMessage({ error: { message: "m", reasons: [{ message: "Sold out" }] } })).toBe("Sold out");
    expect(refusalMessage({ error: { message: "plain" } })).toBe("plain");
    expect(refusalMessage(null)).toBeNull();
  });
  it("409 on create is the approval gate; on edit it's the live listing", () => {
    expect(explainInventoryRefusal("create", 409, { error: { message: "Only an approved athlete can sell inventory." } })).toBe(
      "Inventory opens once your profile is approved.",
    );
    expect(explainInventoryRefusal("update", 409, { error: { message: "A published listing shows this price and quantity. Pause the listing first, then change them." } })).toMatch(
      /Pause the listing first/,
    );
    expect(explainInventoryRefusal("update", 409, null)).toMatch(/Pause the listing first/);
  });
});
