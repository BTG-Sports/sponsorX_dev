/* --------------------------------------------------------------------------
   3S7-FE-02 — the property intelligence hub's pure half: the contract the
   engine is built against, the derived figures the page prints, and the
   sample that feeds `?demo=sample` and the tests.

   Reads (proposed, not mounted yet — lib/intelligence.ts ENGINES.propertyHub)
     GET /intelligence/property
       Scoped by the API to the caller's own property (Actor.propertyId);
       no property id in the request. Rates come from the 3S2-BE-02 CPM
       engine; sell-through and opportunity from the property's inventory
       and sold lines.

   Decisions
   - Every model output carries a ModelStamp and the page prints its
     confidence: each rate recommendation, the category fit and the quality
     score (the last two add a stamp to the brief's proposed shape).
   - Open opportunity is an estimate and says so (provenance ESTIMATED).
   - Overall sell-through is worked out here from the per-format rows the
     engine returns — the whole set, never a page of it.
   - A rate with no current CPM has no "change"; the table shows a dash.

   Pure: no fetch (server/engine.ts reads), so tests import it freely.
   -------------------------------------------------------------------------- */

import type { ModelStamp } from "./intelligence";
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
  /** null when the item has no CPM set yet. */
  currentCpmCents: number | null;
  recommendedCpmCents: number;
  stamp: ModelStamp;
  topFactors: RateFactor[];
};

export type SellThroughRow = {
  format: string;
  sold: number;
  listed: number;
  /** sold ÷ listed, 0..1; null when nothing is listed. */
  rate: number | null;
};

export type CategoryFit = {
  /** A brand category (APPAREL, FITNESS, …). */
  category: string;
  /** 0..1 */
  fit: number;
  reason: string;
};

export type QualityComponent = { label: string; score: number; detail: string };

export type PropertyIntel = {
  asOf: string;
  rates: PropertyRate[];
  opportunity: { openValueCents: number; unsoldItems: number; provenance: "ESTIMATED" };
  sellThrough: SellThroughRow[];
  categoryFit: { stamp: ModelStamp; categories: CategoryFit[] };
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

/** Best fit first. */
export function rankFit(rows: CategoryFit[]): CategoryFit[] {
  return [...rows].sort((a, b) => b.fit - a.fit || a.category.localeCompare(b.category));
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

/** `?demo=sample` and the tests — never shown in production (server/engine.ts wantsSample). */
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
    stamp: STAMP("category-fit@0.2.0", 0.7),
    categories: [
      { category: "FITNESS", fit: 0.88, reason: "Your audience follows training and wellness content" },
      { category: "APPAREL", fit: 0.81, reason: "Gameday apparel sold through quickly last season" },
      { category: "LOCAL_RETAIL", fit: 0.66, reason: "Most of your fans live within 20 miles" },
    ],
  },
  quality: {
    score: 72,
    stamp: STAMP("inventory-quality@0.1.0", 0.68),
    components: [
      { label: "Delivery record", score: 91, detail: "Everything sold was delivered on time" },
      { label: "Listing detail", score: 64, detail: "Four items have no photo" },
      { label: "Audience proof", score: 58, detail: "Half your reach figures are checked by a platform" },
    ],
  },
};
