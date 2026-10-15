import type { ModelStamp } from "@/lib/intelligence";
import { apiListQuery, apiListQueryFor, nextQuery, textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { MATCHABLE_STATES, type ApiBrief } from "@/lib/matching-live";

/* --------------------------------------------------------------------------
   3S3-FE-01 — the sponsor match explorer's contract and pure helpers.

   THE CONTRACT — the match engine landed 2026-10-14 (3S3-BE-01/02/03,
   backend/src/domain/match-engine.ts; documentation/SponsorX-Match-Engine.md):

   GET  /intelligence/briefs/:briefId/matches?kind=athlete|property|inventory&page&size
        → ApiMatchPage — one page of ONE kind, ranked best first, plus every
          kind's count, what the eligibility filter removed for this kind,
          and the brief's saved shortlist (or null). A ranking is reused for
          ten minutes so its pages agree, then made again.
   POST /intelligence/briefs/:briefId/shortlist { entryIds: string[] }
        → ApiShortlist — replaces the brief's shortlist with exactly these
          match ids (an empty list clears it). Roles (`briefMatch`, RBAC
          matrix §29): everyone on the page READS; BTG admins, campaign
          managers and network managers SAVE — Sales reads a shortlist and
          the API answers its save with 403, so the screen never offers it
          (SHORTLIST_SAVE_ROLES). Tenant scoped like every brief read.

   THE SCORE. A match's score is 0..100 and is the sum of its factors'
   contributions; each factor has a weight (its share of the 100) and a
   contribution (the points it earned, 0..weight×100). So a factor's "fit"
   is contribution ÷ (weight × 100) — how much of its share it earned. The
   reasons are the engine's own sentences, in words a salesperson can repeat;
   the screen never writes a reason of its own.

   NEVER UNAVAILABLE. Acceptance #3: the engine filters out unavailable,
   category-conflicted and brand-unsafe candidates before ranking. The screen
   shows only the counts it reports (`filteredOut`), never the rows. A
   ranked row is AVAILABLE or LIMITED (some capacity left — the engine says
   what).

   The brief picker is real data: GET /briefs, matchable states in desk
   order, the same read the Matching Studio uses — with its own URL keys
   (?bq ?bpage ?bsize) so the ranked list keeps ?page ?size.

   Pure: no fetch, no "use client" — the server page, the client island and
   the tests all import it.
   -------------------------------------------------------------------------- */

export const MATCH_KINDS = ["athlete", "property", "inventory"] as const;
export type MatchKind = (typeof MATCH_KINDS)[number];

export const KIND_LABEL: Record<MatchKind, { one: string; many: string }> = {
  athlete: { one: "Athlete", many: "Athletes" },
  property: { one: "Property", many: "Properties" },
  inventory: { one: "Inventory item", many: "Inventory" },
};

export const FACTOR_KEYS = ["audience", "geography", "format", "category", "history", "budget", "sponsorHistory", "quality"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

/** Fallback labels — the engine sends its own `label`; these cover a blank one. */
export const FACTOR_LABEL: Record<FactorKey, string> = {
  audience: "Audience fit",
  geography: "Geography",
  format: "Format",
  category: "Category affinity",
  history: "Historical performance",
  budget: "Budget fit",
  sponsorHistory: "Sponsor history",
  quality: "Inventory quality",
};

export type MatchFactor = {
  key: FactorKey;
  label: string;
  /** 0..1 — this factor's share of the 100-point score. */
  weight: number;
  /** Points this factor added, 0..weight×100. */
  contribution: number;
  /** One sentence, the engine's words. */
  reason: string;
};

export type MatchAvailability = { state: "AVAILABLE" | "LIMITED"; note?: string };

export type ApiMatch = {
  /** Stable per brief, e.g. "athlete:ath_123" — what a shortlist stores. */
  id: string;
  kind: MatchKind;
  /** The athlete / property / inventory item's own id. */
  refId: string;
  name: string;
  /** Sport · state, a property's venue, an item's owner. */
  sub: string;
  /** 1-based, across the whole ranked list (not this page). */
  rank: number;
  /** 0..100. */
  score: number;
  factors: MatchFactor[];
  /** Salesperson sentences, most important first. */
  reasons: string[];
  availability: MatchAvailability;
  stamp: ModelStamp;
};

export type FilteredOut = { unavailable: number; categoryConflict: number; brandSafety: number };

export type ShortlistEntry = { matchId: string; kind: MatchKind; name: string; score: number };

export type ApiShortlist = {
  id: string;
  briefId: string;
  entries: ShortlistEntry[];
  savedAt: string;
  /** The saver's display name. */
  savedBy: string;
};

export type ApiMatchPage = {
  briefId: string;
  kind: MatchKind;
  /** Ranked (eligible) candidates per kind — the tabs' counts. */
  counts: Record<MatchKind, number>;
  /** What the eligibility filter removed for THIS kind. */
  filteredOut: FilteredOut;
  matches: ApiMatch[];
  page: PageInfo;
  shortlist: ApiShortlist | null;
  /** The ranking run this page comes from. */
  run: { modelVersion: string; computedAt: string };
};

export type ApiBriefList = { briefs: ApiBrief[]; page: PageInfo };

/* ------------------------------------------------------------------ URLs */

export const EXPLORER_PATH = "/admin/intelligence/matching";

/** The brief picker's own page keys — the ranked list owns ?page ?size. */
export const BRIEF_KEYS = { page: "bpage", size: "bsize" } as const;

export function matchKindOf(sp: SearchParams): MatchKind {
  return (textParam(sp, "kind", MATCH_KINDS) || "athlete") as MatchKind;
}

/** GET /briefs for the picker: matchable states, desk order, ?bq search. */
export function explorerBriefsQuery(sp: SearchParams): string {
  return apiListQueryFor(sp, BRIEF_KEYS, { state: MATCHABLE_STATES.join(","), sort: "desk", q: textParam(sp, "bq") });
}

/** GET /intelligence/briefs/:id/matches — one page of one kind. */
export function matchesPath(briefId: string, sp: SearchParams, kind: MatchKind): string {
  return `/intelligence/briefs/${encodeURIComponent(briefId)}/matches${apiListQuery(sp, { kind })}`;
}

/** Choosing another brief keeps the picker's place (?bq ?bpage ?bsize) and
 *  the kind, and drops the ranked list's page — it was the other brief's. */
export function explorerBriefHref(current: string, id: string): string {
  const from = new URLSearchParams(current);
  const u = new URLSearchParams();
  for (const k of ["bq", BRIEF_KEYS.page, BRIEF_KEYS.size, "kind", "size", "demo"]) {
    const v = from.get(k);
    if (v) u.set(k, v);
  }
  u.set("brief", id);
  return `${EXPLORER_PATH}?${u}`;
}

/** A kind tab: same brief, page 1 of that kind. */
export function kindHref(current: string, kind: MatchKind): string {
  return `${EXPLORER_PATH}${nextQuery(current, { kind: kind === "athlete" ? null : kind })}`;
}

/* --------------------------------------------------------------- reading */

/** "2026-10-13 09:00 UTC" — the same on server and client (no locale, no
 *  timezone, so a client island hydrates without a mismatch). */
export function utcMinute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

/** A run's day, short enough for a KPI tile on a phone: "Oct 13" (UTC). */
export function shortDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Factors, biggest push on the score first. */
export function byImpact(factors: readonly MatchFactor[]): MatchFactor[] {
  return [...factors].sort((a, b) => b.contribution - a.contribution);
}

/** 0..1 — how much of its share a factor earned (contribution ÷ weight×100). */
export function factorFit(f: Pick<MatchFactor, "weight" | "contribution">): number {
  if (!(f.weight > 0)) return 0;
  return Math.min(1, Math.max(0, f.contribution / (f.weight * 100)));
}

export function factorLabel(f: Pick<MatchFactor, "key" | "label">): string {
  return f.label?.trim() || FACTOR_LABEL[f.key] || f.key;
}

/** The row's headline reasons — the engine's first n. */
export function topReasons(m: Pick<ApiMatch, "reasons">, n = 2): string[] {
  return m.reasons.filter((r) => r.trim()).slice(0, n);
}

export type MatchBand = "strong" | "good" | "weak";

/** ≥ 75 strong, ≥ 50 good, below that weak. */
export function matchBand(score: number): MatchBand {
  if (score >= 75) return "strong";
  if (score >= 50) return "good";
  return "weak";
}

export function filteredOutTotal(f: FilteredOut): number {
  return f.unavailable + f.categoryConflict + f.brandSafety;
}

/** "3 filtered out — 2 unavailable · 1 category conflict", or null. */
export function filteredOutLine(f: FilteredOut): string | null {
  const total = filteredOutTotal(f);
  if (total === 0) return null;
  const parts = [
    f.unavailable ? `${f.unavailable} unavailable` : "",
    f.categoryConflict ? `${f.categoryConflict} category conflict${f.categoryConflict === 1 ? "" : "s"}` : "",
    f.brandSafety ? `${f.brandSafety} brand safety` : "",
  ].filter(Boolean);
  return `${total} filtered out — ${parts.join(" · ")}`;
}

/* -------------------------------------------------------------- shortlist */

/** Who the API lets save a shortlist (`briefMatch` write — policy.ts). The
 *  page's other role, Sales, reads one. Mirrors the policy as admin-access.ts
 *  does; the API stays the enforcement. */
export const SHORTLIST_SAVE_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "NETWORK_MGR"] as const;

export function canSaveShortlist(roles: readonly string[]): boolean {
  return roles.some((r) => (SHORTLIST_SAVE_ROLES as readonly string[]).includes(r));
}

export function toEntry(m: Pick<ApiMatch, "id" | "kind" | "name" | "score">): ShortlistEntry {
  return { matchId: m.id, kind: m.kind, name: m.name, score: m.score };
}

/** The saved shortlist as the island's selection (id → entry). */
export function selectionFrom(s: ApiShortlist | null): Record<string, ShortlistEntry> {
  const out: Record<string, ShortlistEntry> = {};
  for (const e of s?.entries ?? []) out[e.matchId] = e;
  return out;
}

/** Add it if absent, drop it if present — a new object, never a mutation. */
export function toggleEntry(sel: Record<string, ShortlistEntry>, e: ShortlistEntry): Record<string, ShortlistEntry> {
  const next = { ...sel };
  if (next[e.matchId]) delete next[e.matchId];
  else next[e.matchId] = e;
  return next;
}

/** Does the selection differ from what was saved? Order doesn't matter. */
export function shortlistChanged(saved: ApiShortlist | null, selectedIds: readonly string[]): boolean {
  const before = new Set((saved?.entries ?? []).map((e) => e.matchId));
  const after = new Set(selectedIds);
  if (before.size !== after.size) return true;
  for (const id of after) if (!before.has(id)) return true;
  return false;
}

/** The selection grouped by kind, best score first — the shortlist panel. */
export function groupEntries(sel: Record<string, ShortlistEntry>): { kind: MatchKind; entries: ShortlistEntry[] }[] {
  return MATCH_KINDS.map((kind) => ({
    kind,
    entries: Object.values(sel)
      .filter((e) => e.kind === kind)
      .sort((a, b) => b.score - a.score),
  })).filter((g) => g.entries.length > 0);
}

/* ------------------------------------------------------------------ SAMPLE */

/* `?demo=sample` only (development preview + tests). Never a live figure. */

const STAMP = (confidence: number): ModelStamp => ({ modelVersion: "match-sample@0.0.0", confidence, computedAt: "2026-10-13T09:00:00.000Z" });

const f = (key: FactorKey, weight: number, contribution: number, reason: string): MatchFactor => ({
  key,
  label: FACTOR_LABEL[key],
  weight,
  contribution,
  reason,
});

export const SAMPLE_BRIEFS: ApiBrief[] = [
  {
    id: "mx_brief_1",
    objective: "Back-to-school energy drink push across Texas high-school football",
    state: "APPROVED",
    budget: 40_000,
    startDate: "2026-11-01",
    endDate: "2026-12-15",
    sports: ["Football"],
    stateCodes: ["TX"],
    categories: ["Beverage"],
    createdAt: "2026-10-01T12:00:00.000Z",
    sponsorName: "Sample Beverage Co.",
    package: null,
    campaign: null,
  },
  {
    id: "mx_brief_2",
    objective: "Regional bank awareness at college basketball venues",
    state: "QUALIFIED",
    budget: 25_000,
    startDate: "2026-12-01",
    endDate: "2027-02-28",
    sports: ["Basketball"],
    stateCodes: ["OK", "KS"],
    categories: ["Financial services"],
    createdAt: "2026-10-05T12:00:00.000Z",
    sponsorName: "Sample Bank",
    package: null,
    campaign: null,
  },
];

const SAMPLE_ATHLETES: ApiMatch[] = [
  {
    id: "athlete:mx_ath_1",
    kind: "athlete",
    refId: "mx_ath_1",
    name: "Jordan Sample",
    sub: "Football · TX",
    rank: 1,
    score: 86,
    factors: [
      f("audience", 0.25, 23, "Followers skew 16–24, the brief's core audience."),
      f("geography", 0.15, 15, "Based in Texas, where the brief runs."),
      f("category", 0.15, 13, "Has posted energy-drink content before with no conflicts."),
      f("history", 0.15, 12, "Past sponsored posts beat the network median."),
      f("format", 0.1, 9, "Short video is this athlete's strongest format."),
      f("budget", 0.1, 8, "Rate fits comfortably inside the per-athlete budget."),
      f("sponsorHistory", 0.05, 3, "No prior work with this sponsor."),
      f("quality", 0.05, 3, "Profile verified; delivery record clean."),
    ],
    reasons: ["Texas-based with a 16–24 following", "Strong past sponsored posts", "Rate well inside budget"],
    availability: { state: "AVAILABLE" },
    stamp: STAMP(0.82),
  },
  {
    id: "athlete:mx_ath_2",
    kind: "athlete",
    refId: "mx_ath_2",
    name: "Riley Example",
    sub: "Football · TX",
    rank: 2,
    score: 71,
    factors: [
      f("audience", 0.25, 18, "Audience is mostly local, slightly older than the brief's."),
      f("geography", 0.15, 15, "Based in Texas, where the brief runs."),
      f("category", 0.15, 10, "No beverage work yet; no conflicts."),
      f("history", 0.15, 9, "Few past campaigns to judge from."),
      f("format", 0.1, 8, "Posts photos more than video."),
      f("budget", 0.1, 7, "Rate fits the budget."),
      f("sponsorHistory", 0.05, 2, "No prior work with this sponsor."),
      f("quality", 0.05, 2, "Profile verified."),
    ],
    reasons: ["Texas-based", "Rate fits the budget"],
    availability: { state: "LIMITED", note: "Two posting slots left this season" },
    stamp: STAMP(0.64),
  },
  {
    id: "athlete:mx_ath_3",
    kind: "athlete",
    refId: "mx_ath_3",
    name: "Casey Placeholder",
    sub: "Football · OK",
    rank: 3,
    score: 48,
    factors: [
      f("audience", 0.25, 14, "Audience overlaps the brief's in part."),
      f("geography", 0.15, 4, "Based in Oklahoma, next to the brief's market."),
      f("category", 0.15, 10, "No beverage conflicts."),
      f("history", 0.15, 8, "Average past performance."),
      f("format", 0.1, 5, "Some video."),
      f("budget", 0.1, 5, "Rate near the top of the budget."),
      f("sponsorHistory", 0.05, 1, "No prior work with this sponsor."),
      f("quality", 0.05, 1, "Profile not fully verified."),
    ],
    reasons: ["Neighbouring market", "No category conflicts"],
    availability: { state: "AVAILABLE" },
    stamp: STAMP(0.47),
  },
];

const SAMPLE_PROPERTIES: ApiMatch[] = [
  {
    id: "property:mx_prop_1",
    kind: "property",
    refId: "mx_prop_1",
    name: "Sample ISD Stadium",
    sub: "High-school football venue · TX",
    rank: 1,
    score: 79,
    factors: [
      f("audience", 0.25, 20, "Friday-night crowds match the brief's age band."),
      f("geography", 0.15, 15, "In the brief's state."),
      f("category", 0.15, 12, "Beverage category open — no exclusive pourer."),
      f("history", 0.15, 10, "Past signage campaigns delivered in full."),
      f("format", 0.1, 8, "Signage and PA reads available."),
      f("budget", 0.1, 8, "Season package fits the budget."),
      f("sponsorHistory", 0.05, 3, "New to this sponsor."),
      f("quality", 0.05, 3, "Inventory photos and specs complete."),
    ],
    reasons: ["Beverage category is open here", "Crowds match the brief's audience"],
    availability: { state: "AVAILABLE" },
    stamp: STAMP(0.76),
  },
  {
    id: "property:mx_prop_2",
    kind: "property",
    refId: "mx_prop_2",
    name: "Example Field House",
    sub: "Multi-sport venue · TX",
    rank: 2,
    score: 58,
    factors: [
      f("audience", 0.25, 14, "Mixed audience across sports."),
      f("geography", 0.15, 15, "In the brief's state."),
      f("category", 0.15, 9, "Beverage open; a snack sponsor is adjacent."),
      f("history", 0.15, 7, "Limited campaign history."),
      f("format", 0.1, 5, "Signage only."),
      f("budget", 0.1, 5, "Package is near the budget's top."),
      f("sponsorHistory", 0.05, 2, "New to this sponsor."),
      f("quality", 0.05, 1, "Specs incomplete."),
    ],
    reasons: ["In-state venue", "Beverage category open"],
    availability: { state: "LIMITED", note: "Scoreboard panel taken; banners left" },
    stamp: STAMP(0.58),
  },
];

const SAMPLE_INVENTORY: ApiMatch[] = [
  {
    id: "inventory:mx_inv_1",
    kind: "inventory",
    refId: "mx_inv_1",
    name: "End-zone banner, home games",
    sub: "Sample ISD Stadium · Signage",
    rank: 1,
    score: 74,
    factors: [
      f("audience", 0.25, 19, "Seen by every home crowd."),
      f("geography", 0.15, 15, "In the brief's state."),
      f("category", 0.15, 12, "No competing beverage on the same sightline."),
      f("history", 0.15, 9, "Sold out last season."),
      f("format", 0.1, 7, "Signage is in the brief's format list."),
      f("budget", 0.1, 7, "Priced inside the budget."),
      f("sponsorHistory", 0.05, 2, "New to this sponsor."),
      f("quality", 0.05, 3, "Photos and dimensions on file."),
    ],
    reasons: ["Sold out last season", "No competing beverage in view"],
    availability: { state: "AVAILABLE" },
    stamp: STAMP(0.71),
  },
];

const SAMPLE_SHORTLIST: ApiShortlist = {
  id: "mx_short_1",
  briefId: "mx_brief_1",
  entries: [toEntry(SAMPLE_ATHLETES[0]), toEntry(SAMPLE_PROPERTIES[0])],
  savedAt: "2026-10-12T15:30:00.000Z",
  savedBy: "Sample Salesperson",
};

const SAMPLE_ROWS: Record<MatchKind, ApiMatch[]> = { athlete: SAMPLE_ATHLETES, property: SAMPLE_PROPERTIES, inventory: SAMPLE_INVENTORY };
const SAMPLE_FILTERED: Record<MatchKind, FilteredOut> = {
  athlete: { unavailable: 2, categoryConflict: 1, brandSafety: 0 },
  property: { unavailable: 1, categoryConflict: 1, brandSafety: 0 },
  inventory: { unavailable: 3, categoryConflict: 0, brandSafety: 1 },
};

/** The sample answer for one kind — the shape GET …/matches returns. */
export function sampleMatchPage(kind: MatchKind, briefId = SAMPLE_BRIEFS[0].id): ApiMatchPage {
  const rows = SAMPLE_ROWS[kind];
  return {
    briefId,
    kind,
    counts: { athlete: SAMPLE_ATHLETES.length, property: SAMPLE_PROPERTIES.length, inventory: SAMPLE_INVENTORY.length },
    filteredOut: SAMPLE_FILTERED[kind],
    matches: rows,
    page: { page: 1, size: 12, total: rows.length, pages: 1 },
    shortlist: briefId === SAMPLE_SHORTLIST.briefId ? SAMPLE_SHORTLIST : null,
    run: { modelVersion: "match-sample@0.0.0", computedAt: "2026-10-13T09:00:00.000Z" },
  };
}

export const SAMPLE_BRIEF_LIST: ApiBriefList = {
  briefs: SAMPLE_BRIEFS,
  page: { page: 1, size: 12, total: SAMPLE_BRIEFS.length, pages: 1 },
};
