/* --------------------------------------------------------------------------
   3S7-FE-02 — the property intelligence hub's pure half: the contract the
   engine is built against, the derived figures the page prints, and the
   sample that feeds `?demo=sample` and the tests.

   Reads (mounted 2026-10-15 by 3S7-BE-02 — backend/src/domain/property-intelligence.ts,
          documentation/SponsorX-Hub-Intelligence.md §2)
     GET /intelligence/property
       Scoped by the API to the caller's own property (Actor.propertyId);
       no property id in the request. The property's inventory is the
       active items it owns and its roster athletes' items. Rates are the
       3S2-BE-02 CPM engine's latest stored suggestion per item — it prices
       athletes' items, so the suggestions are the roster's; sell-through,
       opportunity and category fit count the last 12 months of sales.

   Decisions
   - Every model output carries a ModelStamp and the page prints its
     confidence: each rate recommendation, the category fit and the quality
     score.
   - Open opportunity is an estimate and says so (provenance ESTIMATED): the
     unsold items at their listed prices.
   - Sell-through counts items, not units: active items per kind, and those
     with a sale in the window. Overall sell-through is worked out here from
     the per-format rows the engine returns — the whole set, never a page.
   - Category fit comes back for every brand category. A category
     restricted for the property, or age-gated for a school, fits 0 and
     its reason says so; the page always prints the reason.
   - A rate with no current CPM has no "change"; the table shows a dash.

   Pure: no fetch (server/engine.ts reads), so tests import it freely.
   -------------------------------------------------------------------------- */

import { confidenceBand, pct, type ModelStamp } from "./intelligence";
import { categoryLabel, type BrandCategory } from "./brand-categories";
import { kindLabel } from "./inventory-live";

/* --------------------------------------------------------------- contract */

export type RateFactor = {
  label: string;
  /** Signed fraction: +0.12 pushed the price up 12%. */
  effect: number;
};

export type PropertyRate = {
  inventoryId: string;
  name: string;
  /** An inventory kind (SOCIAL_POST, SIGNAGE, …). */
  format: string;
  /** null when the item had no CPM when the suggestion was made. */
  currentCpmCents: number | null;
  recommendedCpmCents: number;
  /** The CPM engine's own stamp (modelVersion "cpm-rules@…"). */
  stamp: ModelStamp;
  /** The three largest factors by absolute effect; may be empty. */
  topFactors: RateFactor[];
};

export type SellThroughRow = {
  /** An inventory kind. */
  format: string;
  /** Items of this kind with a sale in the last 12 months. */
  sold: number;
  /** Active items of this kind. */
  listed: number;
  /** sold ÷ listed, 0..1 (two decimals); null when nothing is listed. */
  rate: number | null;
};

export type CategoryFit = {
  /** A brand category (APPAREL, FITNESS, …) — every one comes back. */
  category: string;
  /** 0..1; 0 for a restricted or (for a school) age-gated category. */
  fit: number;
  /** Always present: why the fit is what it is. */
  reason: string;
};

/** The engine's parts: "Listings complete", "On sale" and, once there are paid orders, "Orders fulfilled". */
export type QualityComponent = { label: string; score: number; detail: string };

export type PropertyIntel = {
  asOf: string;
  rates: PropertyRate[];
  /** Active items with nothing sold in 12 months, at their listed prices. */
  opportunity: { openValueCents: number; unsoldItems: number; provenance: "ESTIMATED" };
  sellThrough: SellThroughRow[];
  categoryFit: { stamp: ModelStamp; categories: CategoryFit[] };
  /** score 0..100; 0 with no items. */
  quality: { score: number; components: QualityComponent[]; stamp: ModelStamp };
};

export const PROPERTY_INTEL_PATH = "/intelligence/property";

/* ---------------------------------------------------------------- derived */

/** Recommended against current, as a signed fraction; null when there is no current rate. */
export function rateChange(r: Pick<PropertyRate, "currentCpmCents" | "recommendedCpmCents">): number | null {
  if (r.currentCpmCents === null || r.currentCpmCents <= 0) return null;
  return (r.recommendedCpmCents - r.currentCpmCents) / r.currentCpmCents;
}

/** Biggest move first; items with no current rate (all-new prices) lead, then by size of change. */
export function rankRates(rows: PropertyRate[]): PropertyRate[] {
  return [...rows].sort((a, b) => {
    const ca = rateChange(a);
    const cb = rateChange(b);
    if (ca === null && cb === null) return a.name.localeCompare(b.name);
    if (ca === null) return -1;
    if (cb === null) return 1;
    return Math.abs(cb) - Math.abs(ca) || a.name.localeCompare(b.name);
  });
}

/** Overall sell-through across every format: total sold ÷ total listed; null when nothing is listed. */
export function overallSellThrough(rows: SellThroughRow[]): { sold: number; listed: number; rate: number | null } {
  const sold = rows.reduce((n, r) => n + r.sold, 0);
  const listed = rows.reduce((n, r) => n + r.listed, 0);
  return { sold, listed, rate: listed > 0 ? sold / listed : null };
}

/** Formats with a rate draw as bars; formats with nothing listed have no rate, so
 *  they never get a bar (not even a sliver) and print as plain text instead. */
export function splitSellThrough(rows: SellThroughRow[]): { rated: (SellThroughRow & { rate: number })[]; unlisted: SellThroughRow[] } {
  const rated: (SellThroughRow & { rate: number })[] = [];
  const unlisted: SellThroughRow[] = [];
  for (const r of rows) {
    if (r.rate === null) unlisted.push(r);
    else rated.push({ ...r, rate: r.rate });
  }
  return { rated, unlisted };
}

/** The confidence pill's short form ("68% · medium") for places where the word
 *  "confidence" is already on screen (a column header, a prefix); the full
 *  wording stays in the pill's accessible name. */
export function confidenceShort(confidence: number): string {
  const p = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  return `${p}% · ${confidenceBand(confidence)}`;
}

/** Best fit first. */
export function rankFit(rows: CategoryFit[]): CategoryFit[] {
  return [...rows].sort((a, b) => b.fit - a.fit || a.category.localeCompare(b.category));
}

/** A fit's short form: "80% fit", or "Not a fit" at 0 (restricted, or age-gated for a school) — the reason says why. */
export function fitWord(fit: number): string {
  return fit <= 0 ? "Not a fit" : `${pct(fit)} fit`;
}

/** A 0..100 score's band word. */
export function qualityBand(score: number): "Strong" | "Fair" | "Needs work" {
  if (score >= 75) return "Strong";
  if (score >= 50) return "Fair";
  return "Needs work";
}

export const formatWord = (format: string) => kindLabel(format);
/** Same words as categoryLabel; an unknown category still reads as words. */
export const categoryWord = (category: string) => categoryLabel(category as BrandCategory);

/* ----------------------------------------------------------------- sample */

const STAMP = (modelVersion: string, confidence: number): ModelStamp => ({ modelVersion, confidence, computedAt: "2026-10-12T06:00:00.000Z" });

/** `?demo=sample` and the tests — never shown in production (server/engine.ts
 *  wantsSample). Shaped as the engine answers today: a school's hub, with the
 *  engine's model versions, its quality parts, and an age-gated category at 0. */
export const SAMPLE_PROPERTY_INTEL: PropertyIntel = {
  asOf: "2026-10-12T06:00:00.000Z",
  rates: [
    {
      inventoryId: "sxi-pr-inv-1",
      name: "Home game LED ribbon",
      format: "SIGNAGE",
      currentCpmCents: 1_200,
      recommendedCpmCents: 1_480,
      stamp: STAMP("cpm-rules@1.0.0", 0.81),
      topFactors: [
        { label: "Sold out the last three home games", effect: 0.14 },
        { label: "Rivalry week attendance", effect: 0.08 },
        { label: "Weekday kick-off", effect: -0.03 },
      ],
    },
    {
      inventoryId: "sxi-pr-inv-2",
      name: "Team Instagram feature",
      format: "SOCIAL_POST",
      currentCpmCents: 2_400,
      recommendedCpmCents: 2_150,
      stamp: STAMP("cpm-rules@1.0.0", 0.64),
      topFactors: [
        { label: "Engagement down on the last five posts", effect: -0.09 },
        { label: "Follower growth this season", effect: 0.03 },
      ],
    },
    {
      inventoryId: "sxi-pr-inv-3",
      name: "Pre-game appearance",
      format: "APPEARANCE",
      currentCpmCents: null,
      recommendedCpmCents: 3_000,
      stamp: STAMP("cpm-rules@1.0.0", 0.42),
      topFactors: [{ label: "Similar appearances at schools your size", effect: 0 }],
    },
  ],
  opportunity: { openValueCents: 1_860_000, unsoldItems: 7, provenance: "ESTIMATED" },
  sellThrough: [
    { format: "SIGNAGE", sold: 9, listed: 12, rate: 0.75 },
    { format: "SOCIAL_POST", sold: 14, listed: 24, rate: 14 / 24 },
    { format: "APPEARANCE", sold: 1, listed: 6, rate: 1 / 6 },
    { format: "TICKETS", sold: 0, listed: 0, rate: null },
  ],
  categoryFit: {
    stamp: STAMP("property-intel@1.0.0", 0.7),
    categories: [
      { category: "FITNESS", fit: 1, reason: "You list items for it; 4 sale(s) to its brands in the last 12 months." },
      { category: "APPAREL", fit: 0.8, reason: "You list items for it; 1 sale(s) to its brands in the last 12 months." },
      { category: "LOCAL_RETAIL", fit: 0.7, reason: "You list items for it; no sales to its brands yet." },
      { category: "RESTAURANT", fit: 0.4, reason: "Nothing is listed for it yet; no sales to its brands yet." },
      { category: "ALCOHOL", fit: 0, reason: "Age-gated: never offered for a school." },
      { category: "GAMBLING", fit: 0, reason: "Restricted for this property." },
    ],
  },
  quality: {
    score: 72,
    stamp: STAMP("property-intel@1.0.0", 0.8),
    components: [
      { label: "Listings complete", score: 64, detail: "7 of 11 item(s) have a description and a category." },
      { label: "On sale", score: 61, detail: "7 of 11 item(s) have a published listing." },
      { label: "Orders fulfilled", score: 91, detail: "10 of 11 paid order line(s) delivered in the last 12 months." },
    ],
  },
};
