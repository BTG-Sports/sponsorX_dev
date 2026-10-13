import type { PageInfo, SearchParams } from "./list-query";
import { confidenceBand, cpm, type ModelStamp } from "./intelligence";

/* --------------------------------------------------------------------------
   3S2-FE-01 — the pricing intelligence panel's contract and its pure rules.

   PROPOSED CONTRACT — the CPM engine (3S2-BE-02) and its recommendation and
   override records (3S2-BE-03) are not built yet; this is what the screen
   is built against, and what they are asked to answer. All money is in
   cents; a CPM is the price of a thousand impressions.

   Reads (BTG admins, campaign managers, Sales — admin-access.ts):
     GET /intelligence/pricing?page&size&q&view=all|above|below|low
       → PricingDesk { items: PricingRow[], page, summary }
         `summary` is counted by the engine over EVERY priced item in scope,
         never over the page on screen (the KPI tiles read it).
     GET /intelligence/pricing/:inventoryId
       → PricingDetail { inventory, recommendation, overrides, canOverride }
   Write (canOverride — proposed BTG admins only; the API decides):
     POST /intelligence/pricing/recommendations/:recommendationId/overrides
       { cpmCents, reason } → 201 { override: PricingOverride }
       403 without the permission; 422 below the sell floor or with no
       reason. The recommendation is IMMUTABLE: an override is its own
       record (pricing_overrides) and also an audit row.

   Rules the engine owes (Phase 3 acceptance #1, #2; Warehouse Schema §11):
   every recommendation carries model version, confidence and its factor
   breakdown; base + Σ factor impacts = the recommended CPM; it never sits
   below the floor `domain/pricing.ts` computes. The panel checks the sum
   and SAYS when it doesn't add up, rather than hiding it.

   Pure: no fetch (server/engine.ts reads), so pages, the override island
   and tests import it freely.
   -------------------------------------------------------------------------- */

export type SellerKind = "ATHLETE" | "PROPERTY";

export type PricingRow = {
  inventoryId: string;
  title: string;
  /** InventoryItem.kind — SOCIAL_POST, VIDEO, APPEARANCE, SIGNAGE, … */
  kind: string;
  seller: { kind: SellerKind; id: string; name: string };
  recommendationId: string;
  /** The listed price's implied CPM (domain/pricing-learning.ts); null when
   *  the item has no delivery history to imply one from. */
  currentCpmCents: number | null;
  recommendedCpmCents: number;
  /** The latest override in force, if any — the recommendation is unchanged. */
  override: { cpmCents: number; at: string } | null;
  stamp: ModelStamp;
};

export type PricingSummary = {
  /** Items with a recommendation. */
  priced: number;
  /** Recommended above / below / at the current rate. */
  above: number;
  below: number;
  atRate: number;
  /** Recommendations under the medium-confidence band (< 0.5). */
  lowConfidence: number;
};

export type PricingDesk = { items: PricingRow[]; page: PageInfo; summary: PricingSummary };

export type PricingFactor = {
  /** Stable id — audience, engagement, delivery, demand, seasonality, geography, scarcity, floor. */
  key: string;
  label: string;
  /** Signed fraction of the base CPM: +0.12 pushed the price up 12%. */
  effect: number;
  /** The same push in cents of CPM, so the factors sum to the recommendation. */
  impactCents: number;
  /** One sentence a salesperson can repeat. */
  explanation: string;
};

export type PricingRange = {
  p25Cents: number;
  medianCents: number;
  p75Cents: number;
  /** Comparable sold lines the range is drawn from. */
  sampleSize: number;
  /** What "comparable" meant, in words: "Signage, Texas, last 12 months". */
  basis: string;
};

export type PricingOverride = {
  id: string;
  cpmCents: number;
  reason: string;
  by: { name: string };
  at: string;
};

export type PricingDetail = {
  inventory: { id: string; title: string; kind: string; seller: { kind: SellerKind; id: string; name: string }; priceCents: number };
  recommendation: {
    id: string;
    currentCpmCents: number | null;
    recommendedCpmCents: number;
    /** Where the factors start from — the market's implied CPM for this kind. */
    baseCpmCents: number;
    /** The sell floor as a CPM (domain/pricing.ts); null when none applies. */
    floorCpmCents: number | null;
    factors: PricingFactor[];
    /** Null when there is no comparable history at all. */
    range: PricingRange | null;
    stamp: ModelStamp;
  };
  /** Newest first. */
  overrides: PricingOverride[];
  canOverride: boolean;
};

/* ------------------------------------------------------------------ views */

export const PRICING_VIEWS = [
  { value: "above", label: "Recommended above current" },
  { value: "below", label: "Recommended below current" },
  { value: "low", label: "Low confidence" },
] as const;
export type PricingView = (typeof PRICING_VIEWS)[number]["value"] | "";

export function pricingView(sp: SearchParams): PricingView {
  const v = sp.view;
  const s = (Array.isArray(v) ? v[0] : v) ?? "";
  return PRICING_VIEWS.some((x) => x.value === s) ? (s as PricingView) : "";
}

/* ------------------------------------------------------------------ delta */

/** Within half a percent reads as "at the current rate". */
const FLAT = 0.005;

export type Delta = { fraction: number | null; direction: "up" | "down" | "flat" | "none"; words: string };

/** The recommendation against the current rate, in numbers and words. */
export function deltaOf(currentCents: number | null, recommendedCents: number): Delta {
  if (currentCents === null || currentCents <= 0) return { fraction: null, direction: "none", words: "No current rate to compare" };
  const fraction = (recommendedCents - currentCents) / currentCents;
  if (Math.abs(fraction) < FLAT) return { fraction, direction: "flat", words: "At the current rate" };
  const p = Math.round(Math.abs(fraction) * 100);
  return fraction > 0
    ? { fraction, direction: "up", words: `${p}% above the current rate` }
    : { fraction, direction: "down", words: `${p}% below the current rate` };
}

/* ---------------------------------------------------------------- factors */

/** Largest push first, either way; ties keep the engine's order. */
export function rankFactors(factors: readonly PricingFactor[]): PricingFactor[] {
  return factors
    .map((f, i) => ({ f, i }))
    .sort((a, b) => Math.abs(b.f.effect) - Math.abs(a.f.effect) || a.i - b.i)
    .map((x) => x.f);
}

/** A factor's bar width, 0–100, against the largest push on the item. */
export function factorWidth(effect: number, factors: readonly PricingFactor[]): number {
  const max = Math.max(0, ...factors.map((f) => Math.abs(f.effect)));
  return max === 0 ? 0 : Math.round((Math.abs(effect) / max) * 100);
}

export type WaterfallStep = { key: string; label: string; fromCents: number; toCents: number; impactCents: number };

/** Base → each factor (largest first) → the recommendation, as running totals. */
export function waterfall(baseCents: number, factors: readonly PricingFactor[]): WaterfallStep[] {
  let at = baseCents;
  return rankFactors(factors).map((f) => {
    const step = { key: f.key, label: f.label, fromCents: at, toCents: at + f.impactCents, impactCents: f.impactCents };
    at = step.toCents;
    return step;
  });
}

/**
 * Do the factors add up to the recommendation? A cent of rounding per
 * factor is allowed; past that the breakdown doesn't explain the price,
 * and the panel says so.
 */
export function reconciles(d: PricingDetail["recommendation"]): { ok: boolean; gapCents: number } {
  const sum = d.factors.reduce((s, f) => s + f.impactCents, d.baseCpmCents);
  const gapCents = d.recommendedCpmCents - sum;
  return { ok: Math.abs(gapCents) <= Math.max(1, d.factors.length), gapCents };
}

/* ------------------------------------------------------------------ range */

/** Under this many comparable sales the range is shown, flagged small. */
export const SMALL_SAMPLE = 10;

export function smallSample(range: PricingRange | null): boolean {
  return range !== null && range.sampleSize < SMALL_SAMPLE;
}

/**
 * The range bar's scale: from a little under the lowest of the quartiles,
 * the current rate and the recommendation, to a little over the highest —
 * so every marker lands inside it. `at(c)` is a 0–100 position.
 */
export function rangeScale(range: PricingRange, marks: readonly (number | null)[]): { lo: number; hi: number; at: (cents: number) => number } {
  const vals = [range.p25Cents, range.medianCents, range.p75Cents, ...marks.filter((m): m is number => m !== null)];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = Math.max(1, Math.round((max - min) * 0.12));
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const span = hi - lo || 1;
  return { lo, hi, at: (c) => Math.min(100, Math.max(0, ((c - lo) / span) * 100)) };
}

/** Where a price sits in the range, in words. */
export function rangeWords(range: PricingRange, cents: number): string {
  if (cents < range.p25Cents) return "below the usual range";
  if (cents > range.p75Cents) return "above the usual range";
  return "inside the usual range";
}

/* --------------------------------------------------------------- override */

export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;
/** A CPM above $10,000 is a typo, not a price. */
export const OVERRIDE_MAX_CENTS = 1_000_000;

/** "12.40" or "$12.40" → 1240; "invalid" for anything else. */
export function parseCpmInput(input: string): number | "invalid" {
  const t = (input ?? "").trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return "invalid";
  const cents = Math.round(Number(t) * 100);
  return cents >= 1 && cents <= OVERRIDE_MAX_CENTS ? cents : "invalid";
}

/**
 * An override is a person's price with a reason. The floor is not overridden
 * here (safety never gives — price floors reach a person through pricing
 * policy, not a rate desk), and matching the recommendation isn't an override.
 */
export function checkOverride(
  cpmInput: string,
  reason: string,
  rec: { recommendedCpmCents: number; floorCpmCents: number | null },
): { ok: true; cpmCents: number; reason: string } | { ok: false; message: string } {
  const cents = parseCpmInput(cpmInput);
  if (cents === "invalid") return { ok: false, message: "Enter the CPM in dollars — e.g. 12.40." };
  if (rec.floorCpmCents !== null && cents < rec.floorCpmCents) {
    return { ok: false, message: `That's under the sell floor (${cpm(rec.floorCpmCents)} CPM). The floor isn't overridden here.` };
  }
  if (cents === rec.recommendedCpmCents) return { ok: false, message: "That's the recommendation — no override needed." };
  const r = (reason ?? "").trim();
  if (r.length < OVERRIDE_REASON_MIN) return { ok: false, message: `Give the reason in a sentence — at least ${OVERRIDE_REASON_MIN} characters. It's kept with the override.` };
  if (r.length > OVERRIDE_REASON_MAX) return { ok: false, message: `The reason is ${OVERRIDE_REASON_MAX} characters at most.` };
  return { ok: true, cpmCents: cents, reason: r };
}

/* ------------------------------------------------------------------ words */

export const KIND_LABEL: Record<string, string> = {
  SOCIAL_POST: "Social post",
  VIDEO: "Video",
  APPEARANCE: "Appearance",
  AUTOGRAPH: "Autograph",
  CAMP: "Camp",
  SIGNAGE: "Signage",
  TICKETS: "Tickets",
  OTHER: "Other",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind.charAt(0) + kind.slice(1).toLowerCase().replace(/_/g, " ");
}

/** A recommendation's confidence band, for the table's short column. */
export function bandOf(stamp: ModelStamp): "high" | "medium" | "low" {
  return confidenceBand(stamp.confidence);
}

/* ---------------------------------------------------------------- samples */

const STAMP = (confidence: number): ModelStamp => ({ modelVersion: "cpm-rules@1.0.0", confidence, computedAt: "2026-10-13T06:00:00.000Z" });

/** `?demo=sample` and the tests — never shown in production (server/engine.ts). */
export const SAMPLE_PRICING_DESK: PricingDesk = {
  items: [
    {
      inventoryId: "pr-inv-1",
      title: "Courtside LED board — home games",
      kind: "SIGNAGE",
      seller: { kind: "PROPERTY", id: "pr-prop-1", name: "Austin Arena FC" },
      recommendationId: "pr-rec-1",
      currentCpmCents: 1150,
      recommendedCpmCents: 1300,
      override: null,
      stamp: STAMP(0.82),
    },
    {
      inventoryId: "pr-inv-2",
      title: "Instagram reel — game day",
      kind: "SOCIAL_POST",
      seller: { kind: "ATHLETE", id: "pr-ath-1", name: "Jordan Reyes" },
      recommendationId: "pr-rec-2",
      currentCpmCents: 2400,
      recommendedCpmCents: 2150,
      override: { cpmCents: 2300, at: "2026-10-12T15:20:00.000Z" },
      stamp: STAMP(0.64),
    },
    {
      inventoryId: "pr-inv-3",
      title: "Pre-game camp appearance",
      kind: "APPEARANCE",
      seller: { kind: "ATHLETE", id: "pr-ath-2", name: "Maya Okafor" },
      recommendationId: "pr-rec-3",
      currentCpmCents: null,
      recommendedCpmCents: 3800,
      override: null,
      stamp: STAMP(0.41),
    },
    {
      inventoryId: "pr-inv-4",
      title: "TikTok series — 3 posts",
      kind: "VIDEO",
      seller: { kind: "ATHLETE", id: "pr-ath-3", name: "Sam Whitaker" },
      recommendationId: "pr-rec-4",
      currentCpmCents: 1800,
      recommendedCpmCents: 1805,
      override: null,
      stamp: STAMP(0.77),
    },
  ],
  page: { page: 1, size: 12, total: 4, pages: 1 },
  summary: { priced: 4, above: 1, below: 1, atRate: 1, lowConfidence: 1 },
};

/**
 * The sample desk as the engine would answer `?q=&view=`: rows narrowed by
 * the search (title, seller, kind) and the view, the page counting the
 * matches. The summary stays over every item, as the engine's does.
 */
export function samplePricingDesk(q: string, view: PricingView, desk: PricingDesk = SAMPLE_PRICING_DESK): PricingDesk {
  const needle = q.trim().toLowerCase();
  const items = desk.items.filter((r) => {
    if (needle && ![r.title, r.seller.name, kindLabel(r.kind)].some((t) => t.toLowerCase().includes(needle))) return false;
    if (view === "above") return deltaOf(r.currentCpmCents, r.recommendedCpmCents).direction === "up";
    if (view === "below") return deltaOf(r.currentCpmCents, r.recommendedCpmCents).direction === "down";
    if (view === "low") return r.stamp.confidence < 0.5;
    return true;
  });
  return { ...desk, items, page: { ...desk.page, page: 1, total: items.length, pages: Math.max(1, Math.ceil(items.length / desk.page.size)) } };
}

const SAMPLE_FACTORS: PricingFactor[] = [
  { key: "seasonality", label: "Seasonality", effect: -0.06, impactCents: -60, explanation: "October is between the football and basketball peaks for this market." },
  { key: "audience", label: "Audience", effect: 0.18, impactCents: 180, explanation: "Home crowds have averaged 14% above comparable venues this season." },
  { key: "engagement", label: "Engagement", effect: 0.12, impactCents: 120, explanation: "Fans scanned this board's QR rewards at twice the network rate." },
  { key: "geography", label: "Geography", effect: -0.03, impactCents: -30, explanation: "Austin signage sells slightly under the Texas median." },
  { key: "scarcity", label: "Scarcity", effect: 0.05, impactCents: 50, explanation: "Six of eight home games are already committed." },
  { key: "demand", label: "Demand", effect: 0.04, impactCents: 40, explanation: "Three open briefs target this sport and state." },
];

export const SAMPLE_PRICING_DETAIL: PricingDetail = {
  inventory: {
    id: "pr-inv-1",
    title: "Courtside LED board — home games",
    kind: "SIGNAGE",
    seller: { kind: "PROPERTY", id: "pr-prop-1", name: "Austin Arena FC" },
    priceCents: 450_000,
  },
  recommendation: {
    id: "pr-rec-1",
    currentCpmCents: 1150,
    recommendedCpmCents: 1300,
    baseCpmCents: 1000,
    floorCpmCents: 900,
    factors: SAMPLE_FACTORS,
    range: { p25Cents: 980, medianCents: 1180, p75Cents: 1420, sampleSize: 38, basis: "Signage, Texas, last 12 months" },
    stamp: STAMP(0.82),
  },
  overrides: [
    {
      id: "pr-ovr-1",
      cpmCents: 1250,
      reason: "Bundled with two playoff games at the sponsor's request; agreed with the property.",
      by: { name: "Dana Ruiz" },
      at: "2026-10-11T18:05:00.000Z",
    },
  ],
  canOverride: true,
};

/** The sample detail for a sample row (its own title and seller), so the
 *  preview's table and panel agree. */
export function sampleDetail(inventoryId: string): PricingDetail {
  const row = SAMPLE_PRICING_DESK.items.find((r) => r.inventoryId === inventoryId);
  if (!row || row.inventoryId === SAMPLE_PRICING_DETAIL.inventory.id) return SAMPLE_PRICING_DETAIL;
  /* Scale the sample factors so they still add up to this row's price. */
  const base = Math.round(row.recommendedCpmCents / 1.3);
  const factors = SAMPLE_FACTORS.map((f) => ({ ...f, impactCents: Math.round(f.effect * base) }));
  const sum = factors.reduce((s, f) => s + f.impactCents, base);
  factors[1] = { ...factors[1], impactCents: factors[1].impactCents + (row.recommendedCpmCents - sum) };
  return {
    inventory: { id: row.inventoryId, title: row.title, kind: row.kind, seller: row.seller, priceCents: 250_000 },
    recommendation: {
      id: row.recommendationId,
      currentCpmCents: row.currentCpmCents,
      recommendedCpmCents: row.recommendedCpmCents,
      baseCpmCents: base,
      floorCpmCents: Math.round(base * 0.9),
      factors,
      range: row.stamp.confidence < 0.5
        ? { p25Cents: Math.round(base * 0.95), medianCents: base, p75Cents: Math.round(base * 1.2), sampleSize: 4, basis: "Appearances, Texas, last 12 months" }
        : { p25Cents: Math.round(base * 0.98), medianCents: Math.round(base * 1.15), p75Cents: Math.round(base * 1.4), sampleSize: 26, basis: `${kindLabel(row.kind)}, last 12 months` },
      stamp: row.stamp,
    },
    overrides: row.override ? [{ id: `pr-ovr-${row.inventoryId}`, cpmCents: row.override.cpmCents, reason: "Matched the sponsor's renewal rate from last season.", by: { name: "Dana Ruiz" }, at: row.override.at }] : [],
    canOverride: true,
  };
}
