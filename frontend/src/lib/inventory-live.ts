/* --------------------------------------------------------------------------
   2S2-FE-02 — the inventory manager's pure half: what an item row says, what
   a form may send, and how a refusal reads.

   The API is the rule-keeper (backend/src/contracts/marketplace.ts
   InventoryItemInput, domain/inventory.ts inventoryProblems). These checks
   MIRROR it so the form stops a request it knows will be refused — they add
   no rule of their own:

     title        required, ≤ 200 characters
     priceCents   whole cents, $1.00 … $1,000,000.00 (100 … 1e8)
     quantity     blank = open quantity, else a whole number ≥ 0
     window       availableUntil not before availableFrom
     categories   a category is never both offered and restricted
     PACKAGE      1 … 10 components, each item once, ≥ 1 unit — set at
                  creation only; a package can't become an item or back

   Money on the wire is integer cents; the form speaks dollars. Every figure
   a row shows is a field of the item (no "sold" count: the API returns raw
   stock only — a named gap).
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "./brand-categories";

export { BRAND_CATEGORIES, categoryLabel, type BrandCategory };

/** backend/src/domain/inventory.ts INVENTORY_KINDS, in the same order. */
export const INVENTORY_KINDS = ["SOCIAL_POST", "VIDEO", "APPEARANCE", "AUTOGRAPH", "CAMP", "SIGNAGE", "TICKETS", "OTHER", "PACKAGE"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

export const KIND_LABEL: Record<InventoryKind, string> = {
  SOCIAL_POST: "Social post",
  VIDEO: "Video",
  APPEARANCE: "Appearance",
  AUTOGRAPH: "Autograph session",
  CAMP: "Camp or clinic",
  SIGNAGE: "Signage",
  TICKETS: "Tickets",
  OTHER: "Other",
  PACKAGE: "Package",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as InventoryKind] ?? kind.charAt(0) + kind.slice(1).toLowerCase().replace(/_/g, " ");
}

export const PRICE_MIN_CENTS = 100;
export const PRICE_MAX_CENTS = 100_000_000;
export const MAX_COMPONENTS = 10;
export const MAX_TITLE = 200;
export const MAX_DESCRIPTION = 4000;

/* ── the wire ──────────────────────────────────────────────────────────── */

/** GET /inventory · /inventory/:id — the item as the API returns it. */
export type ApiInventoryItem = {
  id: string;
  athleteId: string | null;
  propertyId: string | null;
  jobId: string | null;
  title: string;
  description: string | null;
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  categories: string[];
  restrictedCategories: string[];
  packageRules: Record<string, unknown> | null;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  components: Array<{ quantity: number; component: { id: string; title: string; kind: string; priceCents: number } }>;
};

/** GET /team/inventory — a team page row; `owner` is the roster athlete's
 *  display name, null for the team's own item. */
export type ApiTeamItem = {
  id: string;
  title: string;
  kind: string;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
  version: number;
  owner: string | null;
};

/** GET /restrictions. EXCLUSIVITY rows come from accepted offers. */
export type ApiRestriction = {
  id: string;
  athleteId: string | null;
  propertyId: string | null;
  category: string;
  type: "PROHIBITED" | "LEAGUE_RULE" | "SCHOOL_POLICY" | "EXCLUSIVITY";
  startsOn: string | null;
  endsOn: string | null;
  reason: string | null;
  sourceOfferId: string | null;
  createdAt: string;
};

/* ── money ─────────────────────────────────────────────────────────────── */

/** 50000 → "$500.00". */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 50000 → "500.00" — the price field's text. */
export function usdInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * "1,250.5" / "$1250.50" → 125050. Null for anything that isn't a plain
 * non-negative dollar amount with at most two decimals — never rounds, so
 * the price saved is the price typed.
 */
export function centsFromUsd(text: string): number | null {
  const s = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/* ── dates ─────────────────────────────────────────────────────────────── */

/** ISO → "2026-10-01" for a date input (UTC — windows are whole UTC days). */
export function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** "2026-10-01" → "2026-10-01T00:00:00.000Z", or null when blank/invalid. */
export function isoFromDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date ? null : d.toISOString();
}

export const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/* ── rows ──────────────────────────────────────────────────────────────── */

export type InventoryRow = {
  id: string;
  title: string;
  kind: string;
  price: string;
  qty: string;
  window: string | null;
  active: boolean;
  status: "Active" | "Paused";
  /** Whose item — shown on the team view; null on the athlete's own. */
  owner: string | null;
  /** May the viewer change it (the API decides; this only hides buttons). */
  writable: boolean;
  isPackage: boolean;
};

export function qtyLabel(quantity: number | null): string {
  return quantity === null ? "Open quantity" : quantity === 1 ? "1 in stock" : `${quantity} in stock`;
}

export function windowLabel(from: string | null, until: string | null): string | null {
  if (from && until) return `${fmtDay(from)} – ${fmtDay(until)}`;
  if (from) return `From ${fmtDay(from)}`;
  if (until) return `Until ${fmtDay(until)}`;
  return null;
}

export function toInventoryRow(
  i: Pick<ApiInventoryItem, "id" | "title" | "kind" | "priceCents" | "quantity" | "availableFrom" | "availableUntil" | "active">,
  opts: { owner?: string | null; writable?: boolean } = {},
): InventoryRow {
  return {
    id: i.id,
    title: i.title,
    kind: kindLabel(i.kind),
    price: usd(i.priceCents),
    qty: qtyLabel(i.quantity),
    window: windowLabel(i.availableFrom, i.availableUntil),
    active: i.active,
    status: i.active ? "Active" : "Paused",
    owner: opts.owner ?? null,
    writable: opts.writable ?? true,
    isPackage: i.kind === "PACKAGE",
  };
}

/** A team page row: the team's own items are the manager's to change; a
 *  roster athlete's are readable only (inventoryItem write is "own"). */
export function teamItemRow(i: ApiTeamItem): InventoryRow {
  return toInventoryRow(i, { owner: i.owner ?? "Team", writable: i.owner === null });
}

/** What a package may bundle: the owner's own non-package items. */
export function componentOptions(items: ApiInventoryItem[], excludeId?: string): Array<{ id: string; label: string }> {
  return items
    .filter((i) => i.kind !== "PACKAGE" && i.id !== excludeId)
    .map((i) => ({ id: i.id, label: `${i.title} · ${usd(i.priceCents)}` }));
}

/* ── the form ──────────────────────────────────────────────────────────── */

export type InventoryDraft = {
  title: string;
  description: string;
  kind: InventoryKind;
  /** dollars, as typed */
  price: string;
  /** blank = open quantity */
  quantity: string;
  availableFrom: string;
  availableUntil: string;
  categories: string[];
  restrictedCategories: string[];
  components: Array<{ itemId: string; quantity: number }>;
};

export const EMPTY_DRAFT: InventoryDraft = {
  title: "",
  description: "",
  kind: "SOCIAL_POST",
  price: "",
  quantity: "",
  availableFrom: "",
  availableUntil: "",
  categories: [],
  restrictedCategories: [],
  components: [],
};

export function draftFromItem(i: ApiInventoryItem): InventoryDraft {
  return {
    title: i.title,
    description: i.description ?? "",
    kind: (INVENTORY_KINDS as readonly string[]).includes(i.kind) ? (i.kind as InventoryKind) : "OTHER",
    price: usdInput(i.priceCents),
    quantity: i.quantity === null ? "" : String(i.quantity),
    availableFrom: dateInput(i.availableFrom),
    availableUntil: dateInput(i.availableUntil),
    categories: [...i.categories],
    restrictedCategories: [...i.restrictedCategories],
    components: i.components.map((c) => ({ itemId: c.component.id, quantity: c.quantity })),
  };
}

export type DraftField = "title" | "description" | "kind" | "price" | "quantity" | "availableUntil" | "availableFrom" | "categories" | "components";
export type DraftErrors = Partial<Record<DraftField, string>>;

/** InventoryItemInput's fields — what POST /inventory takes. */
export type InventoryBody = {
  title: string;
  description: string | null;
  kind: InventoryKind;
  priceCents: number;
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  categories: string[];
  restrictedCategories: string[];
  components?: Array<{ itemId: string; quantity: number }>;
};

const CATEGORY_SET: ReadonlySet<string> = new Set(BRAND_CATEGORIES);

/**
 * Check a draft the way the API will, and build the body it takes. `create`
 * decides the package rule: components are sent only at creation.
 */
export function validateDraft(
  d: InventoryDraft,
  mode: "create" | "edit",
): { ok: true; body: InventoryBody } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const title = d.title.trim();
  if (!title) errors.title = "Give the item a title.";
  else if (title.length > MAX_TITLE) errors.title = `Keep the title under ${MAX_TITLE} characters.`;
  if (d.description.length > MAX_DESCRIPTION) errors.description = `Keep the description under ${MAX_DESCRIPTION} characters.`;
  if (!(INVENTORY_KINDS as readonly string[]).includes(d.kind)) errors.kind = "Pick what kind of item this is.";

  const priceCents = centsFromUsd(d.price);
  if (priceCents === null) errors.price = "Enter a price in dollars, like 250 or 250.00.";
  else if (priceCents < PRICE_MIN_CENTS) errors.price = "The price is at least $1.00.";
  else if (priceCents > PRICE_MAX_CENTS) errors.price = "The price is at most $1,000,000.00.";

  let quantity: number | null = null;
  if (d.quantity.trim() !== "") {
    const q = Number(d.quantity.trim());
    if (!/^\d+$/.test(d.quantity.trim()) || !Number.isSafeInteger(q)) errors.quantity = "Quantity is a whole number, 0 or more — or leave it blank for open quantity.";
    else quantity = q;
  }

  const availableFrom = d.availableFrom ? isoFromDate(d.availableFrom) : null;
  const availableUntil = d.availableUntil ? isoFromDate(d.availableUntil) : null;
  if (d.availableFrom && !availableFrom) errors.availableFrom = "That isn't a date.";
  if (d.availableUntil && !availableUntil) errors.availableUntil = "That isn't a date.";
  if (availableFrom && availableUntil && availableUntil < availableFrom) errors.availableUntil = "The end date is before the start date.";

  const unknown = [...d.categories, ...d.restrictedCategories].filter((c) => !CATEGORY_SET.has(c));
  const both = d.categories.filter((c) => d.restrictedCategories.includes(c));
  if (unknown.length) errors.categories = `Unknown category: ${unknown.join(", ")}.`;
  else if (both.length)
    errors.categories = `${both.map((c) => categoryLabel(c as BrandCategory)).join(", ")} can't be both a fit and a category you won't sell to.`;

  const isPackage = d.kind === "PACKAGE";
  if (mode === "create" && isPackage) {
    const parts = d.components;
    if (parts.length < 1) errors.components = "A package bundles at least one of your items.";
    else if (parts.length > MAX_COMPONENTS) errors.components = `A package bundles at most ${MAX_COMPONENTS} items.`;
    else if (new Set(parts.map((p) => p.itemId)).size !== parts.length) errors.components = "List each item once — use its quantity instead.";
    else if (parts.some((p) => !p.itemId)) errors.components = "Pick an item for every line.";
    else if (parts.some((p) => !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 100)) errors.components = "Each item takes 1 to 100 units.";
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  const body: InventoryBody = {
    title,
    description: d.description.trim() || null,
    kind: d.kind,
    priceCents: priceCents as number,
    quantity,
    availableFrom,
    availableUntil,
    categories: [...new Set(d.categories)],
    restrictedCategories: [...new Set(d.restrictedCategories)],
  };
  if (mode === "create" && isPackage) body.components = d.components.map((p) => ({ itemId: p.itemId, quantity: p.quantity }));
  return { ok: true, body };
}

/**
 * The PATCH for an edit: only the fields that changed. Kind and components
 * never travel (a package's contents are fixed; the form locks the kind of
 * a package). Sending only what changed keeps an untouched price from
 * tripping the published-listing freeze.
 */
export function patchFrom(original: ApiInventoryItem, body: InventoryBody): Partial<InventoryBody> {
  const out: Partial<InventoryBody> = {};
  const sameList = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const sameDay = (a: string | null, b: string | null) => (a ? a.slice(0, 10) : null) === (b ? b.slice(0, 10) : null);
  if (body.title !== original.title) out.title = body.title;
  if (body.description !== (original.description ?? null)) out.description = body.description;
  if (body.kind !== original.kind && original.kind !== "PACKAGE" && body.kind !== "PACKAGE") out.kind = body.kind;
  if (body.priceCents !== original.priceCents) out.priceCents = body.priceCents;
  if (body.quantity !== original.quantity) out.quantity = body.quantity;
  if (!sameDay(body.availableFrom, original.availableFrom)) out.availableFrom = body.availableFrom;
  if (!sameDay(body.availableUntil, original.availableUntil)) out.availableUntil = body.availableUntil;
  if (!sameList(body.categories, original.categories)) out.categories = body.categories;
  if (!sameList(body.restrictedCategories, original.restrictedCategories)) out.restrictedCategories = body.restrictedCategories;
  return out;
}

/** Toggle a category in one list, taking it out of the other — the form's
 *  chips never let a category sit in both. */
export function toggleCategory(
  d: Pick<InventoryDraft, "categories" | "restrictedCategories">,
  list: "categories" | "restrictedCategories",
  c: string,
): Pick<InventoryDraft, "categories" | "restrictedCategories"> {
  const other = list === "categories" ? "restrictedCategories" : "categories";
  const on = d[list].includes(c);
  return {
    [list]: on ? d[list].filter((x) => x !== c) : [...d[list], c],
    [other]: d[other].filter((x) => x !== c),
  } as Pick<InventoryDraft, "categories" | "restrictedCategories">;
}

/* ── refusals ──────────────────────────────────────────────────────────── */

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    issues?: Array<{ path?: unknown; message: string }>;
    reasons?: Array<{ message: string }>;
    problems?: string[];
    conflicts?: unknown[];
  };
};

/** The most specific sentence an API error body carries, or null. */
export function refusalMessage(body: unknown): string | null {
  const e = (body as ErrorBody | null)?.error;
  if (!e) return null;
  return e.issues?.[0]?.message ?? e.reasons?.[0]?.message ?? (e.problems?.length ? e.problems.join("; ") : null) ?? e.message ?? null;
}

/** What a create/edit refusal says to the person who made it. */
export function explainInventoryRefusal(op: "create" | "update" | "pause", status: number, body: unknown): string {
  const said = refusalMessage(body);
  if (status === 409 && op === "create") return "Inventory opens once BTG approves your profile.";
  if (status === 409) return said ?? "A published listing shows this price and quantity. Pause the listing first, then change them.";
  if (status === 403 && op === "create") return "This login can't sell inventory — it isn't linked to an athlete profile or a team.";
  if (status === 403) return "This item isn't yours to change.";
  return said ?? `Nothing was saved (HTTP ${status}).`;
}

export const RESTRICTION_TYPE_LABEL: Record<ApiRestriction["type"], string> = {
  PROHIBITED: "You won't promote",
  LEAGUE_RULE: "League rule",
  SCHOOL_POLICY: "School policy",
  EXCLUSIVITY: "Exclusivity",
};

export type RestrictionRow = {
  id: string;
  category: string;
  type: string;
  window: string | null;
  reason: string | null;
  /** EXCLUSIVITY from an accepted offer is contractual — the API refuses its removal. */
  removable: boolean;
};

export function toRestrictionRow(r: ApiRestriction): RestrictionRow {
  return {
    id: r.id,
    category: CATEGORY_SET.has(r.category) ? categoryLabel(r.category as BrandCategory) : r.category,
    type: RESTRICTION_TYPE_LABEL[r.type] ?? r.type,
    window: windowLabel(r.startsOn, r.endsOn),
    reason: r.reason,
    removable: r.type !== "EXCLUSIVITY" && !r.sourceOfferId,
  };
}
