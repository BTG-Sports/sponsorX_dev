/* --------------------------------------------------------------------------
   3S6-FE-01 · Attribution dashboard — the desk's contract and its words.

   Reads  GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size
          → AttributionDesk (below). Engine "attribution" (lib/intelligence.ts);
          waits on 3S6-BE-02 (event model), -03 (matching), -04 (queue).
   Writes nothing — the reconciliation queue is read-only here.
   BTG admins, campaign managers and Sales (lib/admin-access.ts).

   The one rule this file exists to keep (3S0-PMO-01, Spec §17.4,
   acceptance #8): verified redemptions, verified transactions, modelled
   attribution and estimated media value are four different claims. So:

   - The totals are a record keyed by class and nothing here adds them up.
     `classTiles` hands back four separate tiles in ATTRIBUTION_ORDER; there
     is no total, no "all attribution" figure, no sum helper.
   - `displayClass` is the only way a row's class reaches the screen. An
     event can show as VERIFIED only when its method is deterministic AND it
     names the exact key it matched on (token, order id, click id). A
     probabilistic event the API labelled verified is shown as MODELLED and
     flagged — the guard never trusts the label over the method.
   - Every modelled row carries the model version that matched it and its
     confidence; estimated media value is never called revenue.

   Pure: no fetch (server/engine.ts reads), so the page, its client islands
   and tests import it freely.
   -------------------------------------------------------------------------- */

import { ATTRIBUTION_CLASSES, ATTRIBUTION_ORDER, usd, type AttributionClass } from "@/lib/intelligence";
import type { PageInfo } from "@/lib/list-query";

export type AttributionMethod = "deterministic" | "probabilistic";
/** What an exact match matched on (3S6-BE-03 tries these first). */
export type MatchKey = "token" | "order_id" | "click_id";

export type AttributionEvent = {
  id: string;
  /** The partner the event came from, and the adapter that read it (3S6-BE-01). */
  source: { partner: string; adapter: string };
  /** The class the engine assigned. Rendered only through `displayClass`. */
  class: AttributionClass;
  method: AttributionMethod;
  /** Required for a deterministic match; null for probabilistic. */
  matchKey: MatchKey | null;
  /** The adapter's lookback window, in days. */
  windowDays: number;
  /** 0..1 — an exact match answers 1. */
  confidence: number;
  /** The model that made a probabilistic match (e.g. "attr-prob@0.3.1"); null for exact. */
  modelVersion: string | null;
  /** Order value, redemption value or estimated media value, by class. Null when the partner sent none. */
  amountCents: number | null;
  occurredAt: string;
  campaign: { id: string; name: string } | null;
  athlete: { id: string; name: string } | null;
};

export type UnmatchedReason = "no_match" | "ambiguous" | "outside_window" | "unknown_token";

export type UnmatchedEvent = {
  id: string;
  source: { partner: string; adapter: string };
  /** The partner's own reference for the event (order number, click id …). */
  reference: string;
  reason: UnmatchedReason;
  /** For an ambiguous event: how many campaigns it could belong to. */
  candidates: number | null;
  amountCents: number | null;
  receivedAt: string;
};

export type ClassTotal = { count: number; amountCents: number };

export type AttributionTab = "events" | "unmatched";

export type AttributionDesk = {
  /** When the engine last computed these. */
  asOf: string;
  /** The campaign the desk is narrowed to (?campaign), echoed back with its name. */
  scope: { campaign: { id: string; name: string } | null };
  /** Per class, NEVER summed (see the header). Scoped to the campaign, not to the class filter. */
  totals: Record<AttributionClass, ClassTotal>;
  counts: { events: number; unmatched: number };
  /** The open tab's page; the other tab's list is absent. */
  events?: AttributionEvent[];
  unmatched?: UnmatchedEvent[];
  page: PageInfo;
};

/* ------------------------------------------------------------------ tabs */

export const ATTRIBUTION_TABS: { key: AttributionTab; label: string }[] = [
  { key: "events", label: "Attributed events" },
  { key: "unmatched", label: "Unmatched & ambiguous" },
];

export function attributionTab(v: string | string[] | undefined): AttributionTab {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "unmatched" ? "unmatched" : "events";
}

/** ?class — one of the four, or "" (all). */
export function classParam(v: string | string[] | undefined): AttributionClass | "" {
  const s = Array.isArray(v) ? v[0] : v;
  return (ATTRIBUTION_ORDER as string[]).includes(s ?? "") ? (s as AttributionClass) : "";
}

export const CLASS_OPTIONS = ATTRIBUTION_ORDER.map((c) => ({ value: c, label: ATTRIBUTION_CLASSES[c].label }));

/* ----------------------------------------------------------- the guard */

const VERIFIED: ReadonlySet<AttributionClass> = new Set(["VERIFIED_REDEMPTION", "VERIFIED_TRANSACTION"]);

export function isVerified(c: AttributionClass): boolean {
  return VERIFIED.has(c);
}

/**
 * The class a row is SHOWN as. Verified only when the method earns it:
 * deterministic, on a named key. Anything else the API called verified is
 * shown as modelled, with `demoted` set so the row says why.
 */
export function displayClass(ev: Pick<AttributionEvent, "class" | "method" | "matchKey">): { cls: AttributionClass; demoted: boolean } {
  if (!isVerified(ev.class)) return { cls: ev.class, demoted: false };
  if (ev.method === "deterministic" && ev.matchKey !== null) return { cls: ev.class, demoted: false };
  return { cls: "MODELLED", demoted: true };
}

export const MATCH_KEY_LABEL: Record<MatchKey, string> = {
  token: "reward token",
  order_id: "order id",
  click_id: "click id",
};

/** "Exact · reward token" / "Probabilistic · attr-prob@0.3.1" / "Probabilistic · model version missing". */
export function methodLine(ev: Pick<AttributionEvent, "method" | "matchKey" | "modelVersion">): string {
  if (ev.method === "deterministic") return `Exact · ${ev.matchKey ? MATCH_KEY_LABEL[ev.matchKey] : "match key missing"}`;
  return `Probabilistic · ${ev.modelVersion ?? "model version missing"}`;
}

export function windowLabel(days: number): string {
  return `${days}-day window`;
}

/* --------------------------------------------------------------- tiles */

export type ClassTile = {
  cls: AttributionClass;
  label: string;
  claim: string;
  tone: "verified" | "modelled" | "estimated";
  /** The tile's headline figure and what it counts. */
  value: string;
  noun: string;
  /** The quieter second figure. */
  sub: string;
};

/** What each class's headline counts — modelled and estimated never say "verified", estimated never says "revenue". */
export const CLASS_NOUN: Record<AttributionClass, { headline: "count" | "amount"; noun: string; other: (t: ClassTotal) => string }> = {
  VERIFIED_REDEMPTION: { headline: "count", noun: "redemptions recorded", other: (t) => `${usd(t.amountCents)} reward value` },
  VERIFIED_TRANSACTION: { headline: "amount", noun: "verified partner revenue", other: (t) => `${t.count.toLocaleString("en-US")} matched orders` },
  MODELLED: { headline: "amount", noun: "modelled revenue — not verified", other: (t) => `${t.count.toLocaleString("en-US")} probabilistic matches` },
  ESTIMATED_MEDIA_VALUE: { headline: "amount", noun: "estimated media value", other: (t) => `${t.count.toLocaleString("en-US")} valued exposures` },
};

/**
 * The four tiles, in ATTRIBUTION_ORDER, one per class — the dashboard's
 * whole summary. Deliberately no fifth "total" tile: blending them is the
 * mistake this screen exists to prevent.
 */
export function classTiles(totals: Record<AttributionClass, ClassTotal>): ClassTile[] {
  return ATTRIBUTION_ORDER.map((cls) => {
    const t = totals[cls] ?? { count: 0, amountCents: 0 };
    const n = CLASS_NOUN[cls];
    const def = ATTRIBUTION_CLASSES[cls];
    return {
      cls,
      label: def.label,
      claim: def.claim,
      tone: def.tone,
      value: n.headline === "count" ? t.count.toLocaleString("en-US") : usd(t.amountCents),
      noun: n.noun,
      sub: n.other(t),
    };
  });
}

export const UNMATCHED_REASON: Record<UnmatchedReason, { label: string; hint: string }> = {
  no_match: { label: "No match", hint: "No token, order id or click id matched, and no model match cleared the bar." },
  ambiguous: { label: "Ambiguous", hint: "More than one campaign could claim it — left unattributed rather than guessed." },
  outside_window: { label: "Outside window", hint: "It arrived after the adapter's lookback window closed." },
  unknown_token: { label: "Unknown token", hint: "It carries a reward token SponsorX never issued." },
};

export const ATTRIBUTION_EMPTY: Record<AttributionTab, { title: string; hint: string }> = {
  events: { title: "No attributed events here", hint: "Events appear as partner adapters report them and the engine matches them." },
  unmatched: { title: "Nothing waiting to reconcile", hint: "Events the engine could not match stay here, visible, instead of disappearing." },
};

export function amountOf(cents: number | null): string {
  return cents === null ? "—" : usd(cents);
}

/** A desk with nothing in it — the ?demo=empty state. */
export function emptyAttributionDesk(tab: AttributionTab): AttributionDesk {
  const zero = { count: 0, amountCents: 0 };
  return {
    asOf: new Date(0).toISOString(),
    scope: { campaign: null },
    totals: { VERIFIED_REDEMPTION: zero, VERIFIED_TRANSACTION: zero, MODELLED: zero, ESTIMATED_MEDIA_VALUE: zero },
    counts: { events: 0, unmatched: 0 },
    [tab]: [],
    page: { page: 1, size: 12, total: 0, pages: 1 },
  };
}

/* ------------------------------------------------------------- sample */

/**
 * Dev-only `?demo=sample` preview (server/engine.ts `wantsSample`) and the
 * tests' fixture. Not data: never rendered in production.
 */
export const SAMPLE_ATTRIBUTION: AttributionDesk = {
  asOf: "2026-10-13T06:00:00Z",
  scope: { campaign: null },
  totals: {
    VERIFIED_REDEMPTION: { count: 412, amountCents: 206_000 },
    VERIFIED_TRANSACTION: { count: 58, amountCents: 1_843_500 },
    MODELLED: { count: 131, amountCents: 2_960_000 },
    ESTIMATED_MEDIA_VALUE: { count: 24, amountCents: 4_120_000 },
  },
  counts: { events: 6, unmatched: 3 },
  events: [
    {
      id: "attr-s-ev-1", source: { partner: "SponsorX QR", adapter: "redemption" }, class: "VERIFIED_REDEMPTION",
      method: "deterministic", matchKey: "token", windowDays: 0, confidence: 1, modelVersion: null, amountCents: 500,
      occurredAt: "2026-10-12T19:04:00Z", campaign: { id: "attr-s-c-1", name: "Harbor Coffee · Fall Kickoff" }, athlete: { id: "attr-s-a-1", name: "Riley Carter" },
    },
    {
      id: "attr-s-ev-2", source: { partner: "Shopify · Harbor Coffee", adapter: "shopify-orders" }, class: "VERIFIED_TRANSACTION",
      method: "deterministic", matchKey: "order_id", windowDays: 14, confidence: 1, modelVersion: null, amountCents: 4_250,
      occurredAt: "2026-10-12T15:30:00Z", campaign: { id: "attr-s-c-1", name: "Harbor Coffee · Fall Kickoff" }, athlete: { id: "attr-s-a-1", name: "Riley Carter" },
    },
    {
      id: "attr-s-ev-3", source: { partner: "Impact · Stride Shoes", adapter: "impact-clicks" }, class: "VERIFIED_TRANSACTION",
      method: "deterministic", matchKey: "click_id", windowDays: 30, confidence: 1, modelVersion: null, amountCents: 12_900,
      occurredAt: "2026-10-11T21:12:00Z", campaign: { id: "attr-s-c-2", name: "Stride · Court Season" }, athlete: { id: "attr-s-a-2", name: "Jordan Lee" },
    },
    {
      id: "attr-s-ev-4", source: { partner: "Shopify · Harbor Coffee", adapter: "shopify-orders" }, class: "MODELLED",
      method: "probabilistic", matchKey: null, windowDays: 7, confidence: 0.64, modelVersion: "attr-prob@0.3.1", amountCents: 3_800,
      occurredAt: "2026-10-11T12:45:00Z", campaign: { id: "attr-s-c-1", name: "Harbor Coffee · Fall Kickoff" }, athlete: null,
    },
    {
      id: "attr-s-ev-5", source: { partner: "Impact · Stride Shoes", adapter: "impact-clicks" }, class: "VERIFIED_TRANSACTION",
      method: "probabilistic", matchKey: null, windowDays: 30, confidence: 0.81, modelVersion: "attr-prob@0.3.1", amountCents: 9_900,
      occurredAt: "2026-10-10T18:20:00Z", campaign: { id: "attr-s-c-2", name: "Stride · Court Season" }, athlete: { id: "attr-s-a-2", name: "Jordan Lee" },
    },
    {
      id: "attr-s-ev-6", source: { partner: "SponsorX media valuation", adapter: "emv" }, class: "ESTIMATED_MEDIA_VALUE",
      method: "probabilistic", matchKey: null, windowDays: 0, confidence: 0.55, modelVersion: "emv@1.0.0", amountCents: 180_000,
      occurredAt: "2026-10-10T09:00:00Z", campaign: { id: "attr-s-c-2", name: "Stride · Court Season" }, athlete: { id: "attr-s-a-2", name: "Jordan Lee" },
    },
  ],
  unmatched: [
    { id: "attr-s-un-1", source: { partner: "Shopify · Harbor Coffee", adapter: "shopify-orders" }, reference: "#H-20931", reason: "ambiguous", candidates: 2, amountCents: 3_100, receivedAt: "2026-10-12T10:02:00Z" },
    { id: "attr-s-un-2", source: { partner: "Impact · Stride Shoes", adapter: "impact-clicks" }, reference: "clk_8f2a91", reason: "outside_window", candidates: null, amountCents: 7_400, receivedAt: "2026-10-11T08:40:00Z" },
    { id: "attr-s-un-3", source: { partner: "SponsorX QR", adapter: "redemption" }, reference: "tok_unissued_44", reason: "unknown_token", candidates: null, amountCents: null, receivedAt: "2026-10-10T20:15:00Z" },
  ],
  page: { page: 1, size: 12, total: 6, pages: 1 },
};

/** The sample as the API would answer one tab (and class filter) — preview only. */
export function sampleAttribution(tab: AttributionTab, cls: AttributionClass | ""): AttributionDesk {
  const s = SAMPLE_ATTRIBUTION;
  const rows = tab === "events" ? (s.events ?? []).filter((e) => !cls || e.class === cls) : (s.unmatched ?? []);
  return {
    ...s,
    events: tab === "events" ? (rows as AttributionEvent[]) : undefined,
    unmatched: tab === "unmatched" ? (rows as UnmatchedEvent[]) : undefined,
    page: { page: 1, size: 12, total: rows.length, pages: 1 },
  };
}
