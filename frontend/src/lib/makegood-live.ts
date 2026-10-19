/* --------------------------------------------------------------------------
   3S5-FE-01 · Make-good recommendation centre — the contract, the rules the
   screen enforces and the words (decided 2026-10-13: "FE only, honest
   empty states").

   The make-good engine (3S5-BE-01) and its approval workflow (3S5-BE-02)
   were mounted 2026-10-15 (backend/src/domain/makegood-engine.ts,
   documentation/SponsorX-Make-Goods.md). The centre reads them through
   server/engine.ts `readEngine("makegood", …)` and renders exactly what is
   typed here. The types below describe what the API actually sends:

   GET  /intelligence/make-goods?status=open|approved&campaign=<id>&page&size
        → MakeGoodList { counts, shortfalls: Shortfall[], page }
        `counts` are the tenant's (or the campaign's, when filtered), never
        the page's. Open shortfalls first by value at risk, largest first;
        approved newest first.
   POST /intelligence/make-goods/:shortfallId/approve   { optionId, note }
        → 200 Shortfall (with its decision). The API refuses (409) an option
        that fails any check now or a shortfall already decided, and (422) a
        note under NOTE_MIN (8) or over NOTE_MAX (2,000) characters once
        trimmed. Approval is recorded, audited and reflected in the campaign
        (3S5-BE-02) — the screen adds no authority of its own.

   Landed beyond the proposed shape (3S5-BE-02, user 2026-10-15): SponsorX
   approves a substitute on its own when every safety check passes. Each
   shortfall carries `status` and `automatic { approved, heldBecause[] }` —
   the reasons it waits for a person — and a decision carries `automatic`,
   `runsFrom` and `runsUntil` (the make-good's days, ISO dates).

   Roles (proposed, lib/admin-access): SUPER_ADMIN, BTG_ADMIN, CAMPAIGN_MGR —
   read and approve. A make-good changes what a sponsor was sold.

   Acceptance #7: every option says whether it is available, clear of the
   sponsor's exclusivity and on the sponsor's target, and how equivalent its
   value is. An option failing any of the three can never be approved here.

   Pure: no fetch, no React — the page, the drawer island, the server
   action and the tests import it freely.
   -------------------------------------------------------------------------- */

import { usd, type ModelStamp } from "@/lib/intelligence";
import { MIN_REASON } from "@/lib/intel-admin";
import type { PageInfo } from "@/lib/list-query";
import type { GuaranteeMetric } from "@/lib/forecast-live";

/* ------------------------------------------------------------------ types */

export type MakeGoodStatus = "open" | "approved";

export type MakeGoodChecks = {
  /** The inventory is free on the dates the make-good would run. */
  available: boolean;
  /** Running it creates no category conflict with the sponsor's exclusivity. */
  exclusivityClear: boolean;
  /** It reaches the sponsor's target (audience, market, sport). */
  meetsTarget: boolean;
};

export type MakeGoodOption = {
  id: string;
  inventoryName: string;
  propertyName: string;
  format: string;
  /** 0..1 — how close the substitute's value is to what fell short. */
  equivalencyScore: number;
  /** Estimated delivery of the substitute, in the shortfall's metric. */
  estimatedDelivery: number;
  /** Substitute value − shortfall value, in cents. Positive: BTG gives more than fell short. */
  costImpactCents: number;
  checks: MakeGoodChecks;
  /** Why the engine suggested it, in a sentence. */
  reason: string;
};

export type MakeGoodDecision = {
  optionId: string;
  /** Who: "SponsorX (automatic)" or "<email> (<role>)" — "a former user" when they are gone. */
  by: string;
  at: string;
  note: string;
  /** True when SponsorX approved it with no person behind it (3S5-BE-02). */
  automatic: boolean;
  /** The make-good's first and last day, ISO dates ("2026-11-28"); null when the engine did not record them. */
  runsFrom: string | null;
  runsUntil: string | null;
};

/** Why SponsorX did or did not approve on its own. */
export type MakeGoodAutomatic = {
  approved: boolean;
  /** The safety checks that failed, in words — empty when approved automatically, or when nothing holds it. */
  heldBecause: string[];
};

/** A shortfall's own state; the list only ever shows open and approved — closed ones left on their own. */
export type ShortfallStatus = "open" | "approved" | "closed";

export type Shortfall = {
  id: string;
  status: ShortfallStatus;
  campaign: { id: string; name: string };
  sponsorName: string;
  metric: GuaranteeMetric;
  /** What was sold (the guarantee). */
  sold: number;
  /** The forecast's projected final (3S4-BE-01). */
  projected: number;
  /** sold − projected, never negative. */
  shortfall: number;
  shortfallValueCents: number;
  endsAt: string;
  stamp: ModelStamp;
  options: MakeGoodOption[];
  decision: MakeGoodDecision | null;
  automatic: MakeGoodAutomatic;
};

export type MakeGoodCounts = {
  open: number;
  approved: number;
  /** Sum of open shortfalls' value. */
  openValueCents: number;
  /** Approvals within `period`. */
  approvedThisPeriod: number;
  period: { from: string; to: string };
};

export type MakeGoodList = { counts: MakeGoodCounts; shortfalls: Shortfall[]; page: PageInfo };

export const EMPTY_MAKEGOOD_LIST: MakeGoodList = {
  counts: { open: 0, approved: 0, openValueCents: 0, approvedThisPeriod: 0, period: { from: "", to: "" } },
  shortfalls: [],
  page: { page: 1, size: 12, total: 0, pages: 1 },
};

/* ------------------------------------------------------------------- tabs */

export const MAKEGOOD_TABS: { key: MakeGoodStatus; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "approved", label: "Approved" },
];

export function makeGoodTab(v: string | string[] | undefined): { key: MakeGoodStatus; label: string } {
  const k = Array.isArray(v) ? v[0] : v;
  return MAKEGOOD_TABS.find((t) => t.key === k) ?? MAKEGOOD_TABS[0]!;
}

/* ------------------------------------------------------------------ rules */

export const CHECKS: { key: keyof MakeGoodChecks; pass: string; fail: string }[] = [
  { key: "available", pass: "Available on the dates", fail: "Not available on the dates" },
  { key: "exclusivityClear", pass: "Clear of the sponsor's exclusivity", fail: "Conflicts with the sponsor's exclusivity" },
  { key: "meetsTarget", pass: "On the sponsor's target", fail: "Misses the sponsor's target" },
];

export function allChecksPass(o: Pick<MakeGoodOption, "checks">): boolean {
  return o.checks.available && o.checks.exclusivityClear && o.checks.meetsTarget;
}

/** The failing checks, in words — empty when the option may be approved. */
export function failedChecks(o: Pick<MakeGoodOption, "checks">): string[] {
  return CHECKS.filter((c) => !o.checks[c.key]).map((c) => c.fail);
}

/**
 * The engine's best substitute: among options passing all three checks,
 * the highest equivalency, then the lowest cost to BTG. Null when none passes.
 */
export function bestOption(options: readonly MakeGoodOption[]): MakeGoodOption | null {
  const ok = options.filter(allChecksPass);
  if (!ok.length) return null;
  return [...ok].sort((a, b) => b.equivalencyScore - a.equivalencyScore || a.costImpactCents - b.costImpactCents)[0]!;
}

/** Why this option cannot be approved now, or null when it can. */
export function approvalBlock(s: Pick<Shortfall, "decision">, o: Pick<MakeGoodOption, "checks">): string | null {
  if (s.decision) return "This shortfall is already decided.";
  const failed = failedChecks(o);
  return failed.length ? `Can't be approved: ${failed.join("; ").toLowerCase()}.` : null;
}

/** The note's bounds, trimmed — the API's NOTE_MIN / NOTE_MAX (makegood-rules.ts); a note outside them is a 422. */
export const NOTE_MIN = MIN_REASON;
export const NOTE_MAX = 2000;

/** The API's own words for a note outside the bounds (MakeGoodNoteError), so the form and the 422 say the same thing. */
export const NOTE_WORDS = `Say why this substitute, in ${NOTE_MIN} to ${NOTE_MAX.toLocaleString("en-US")} characters — the note goes on the audit record and the campaign.`;

/** The approval form's check — the API checks it again. */
export function approvalError(input: { optionId: string; note: string }): string | null {
  if (!input.optionId) return "Pick the substitute to approve.";
  const note = input.note.trim();
  if (note.length < NOTE_MIN || note.length > NOTE_MAX) return NOTE_WORDS;
  return null;
}

export function decidedOption(s: Pick<Shortfall, "decision" | "options">): MakeGoodOption | null {
  return s.decision ? s.options.find((o) => o.id === s.decision!.optionId) ?? null : null;
}

/* ------------------------------------------------- automatic approval */

/**
 * Open, and SponsorX did not approve it on its own: the reasons a person
 * must decide (3S5-BE-02). Empty for a decided shortfall, or an open one
 * nothing holds (the engine would have approved it the same night).
 */
export function heldReasons(s: Pick<Shortfall, "status" | "decision" | "automatic">): string[] {
  if (s.decision || s.status !== "open") return [];
  return s.automatic.heldBecause;
}

/** "SponsorX · automatic" or the person as the API named them. */
export function decidedByWords(d: Pick<MakeGoodDecision, "by" | "automatic">): string {
  return d.automatic ? "SponsorX · automatic" : d.by;
}

/** "Approved automatically" / "Approved by a person" — the decision's headline. */
export function decisionWords(d: Pick<MakeGoodDecision, "automatic">): string {
  return d.automatic ? "Approved automatically" : "Approved by a person";
}

/** "Runs Nov 28 – Dec 11", or null when the engine recorded no days. */
export function runWords(d: Pick<MakeGoodDecision, "runsFrom" | "runsUntil">): string | null {
  if (!d.runsFrom || !d.runsUntil) return null;
  const f = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `Runs ${f(d.runsFrom)} – ${f(d.runsUntil)}`;
}

/* ------------------------------------------------------------------ words */

/** "Costs $1,200 more than the shortfall" / "$300 under the shortfall" / "Even with the shortfall". */
export function costWords(cents: number): string {
  if (Math.round(cents / 100) === 0) return "Even with the shortfall";
  return cents > 0 ? `Costs ${usd(cents)} more than the shortfall` : `${usd(-cents)} under the shortfall`;
}

/** "+$1,200" / "−$300" / "$0". */
export function signedUsd(cents: number): string {
  if (Math.round(cents / 100) === 0) return "$0";
  return cents > 0 ? `+${usd(cents)}` : `−${usd(-cents)}`;
}

export function equivalencyBand(score: number): "close" | "fair" | "weak" {
  if (score >= 0.9) return "close";
  if (score >= 0.75) return "fair";
  return "weak";
}

export function equivalencyLabel(score: number): string {
  const p = Math.round(Math.min(1, Math.max(0, score)) * 100);
  return `${p}% · ${equivalencyBand(score)} match`;
}

/** Shortfall ÷ sold. */
export function shortfallShare(s: Pick<Shortfall, "shortfall" | "sold">): number {
  return s.sold > 0 ? s.shortfall / s.sold : 0;
}

/** How much of the shortfall the option's estimated delivery covers (0..1+). */
export function coverage(s: Pick<Shortfall, "shortfall">, o: Pick<MakeGoodOption, "estimatedDelivery">): number {
  return s.shortfall > 0 ? o.estimatedDelivery / s.shortfall : 0;
}

export function periodWords(p: MakeGoodCounts["period"]): string {
  if (!p.from || !p.to) return "this period";
  const f = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${f(p.from)} – ${f(p.to)}`;
}

/* ----------------------------------------------------------------- sample */

/* `?demo=sample` only (server/engine.ts wantsSample) and the tests. Every
   id is prefixed `sample-mg-`; nothing here is a real campaign. */

const STAMP: ModelStamp = { modelVersion: "makegood-rules@0.1.0", confidence: 0.74, computedAt: "2026-10-13T06:00:00.000Z" };

export const SAMPLE_SHORTFALLS: Shortfall[] = [
  {
    id: "sample-mg-river",
    status: "open",
    campaign: { id: "sample-fc-river", name: "Riverside Fall Kickoff" },
    sponsorName: "Northwind Outfitters",
    metric: "impressions",
    sold: 500_000,
    projected: 341_000,
    shortfall: 159_000,
    shortfallValueCents: 1_908_000,
    endsAt: "2026-10-31T00:00:00.000Z",
    stamp: STAMP,
    decision: null,
    automatic: { approved: false, heldBecause: ["Only 62% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain."] },
    options: [
      {
        id: "sample-mg-river-o1", inventoryName: "Homecoming week story set", propertyName: "Riverside Athletics", format: "Instagram stories ×3",
        equivalencyScore: 0.93, estimatedDelivery: 165_000, costImpactCents: 72_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "Same property and audience; the homecoming week reaches the sponsor's 18–34 target.",
      },
      {
        id: "sample-mg-river-o2", inventoryName: "Stadium LED rotation", propertyName: "Riverside Athletics", format: "LED board · 4 home games",
        equivalencyScore: 0.81, estimatedDelivery: 140_000, costImpactCents: -168_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "Cheaper and on target, but covers less of the gap.",
      },
      {
        id: "sample-mg-river-o3", inventoryName: "Varsity podcast mid-roll", propertyName: "Eastfield Sports Network", format: "Podcast · 6 episodes",
        equivalencyScore: 0.88, estimatedDelivery: 170_000, costImpactCents: 24_000,
        checks: { available: true, exclusivityClear: false, meetsTarget: true },
        reason: "Close in value, but a competing outdoor brand holds the category on this show.",
      },
    ],
  },
  {
    id: "sample-mg-court",
    status: "open",
    campaign: { id: "sample-fc-court", name: "Courtside Hydration" },
    sponsorName: "Bluepeak Drinks",
    metric: "engagements",
    sold: 120_000,
    projected: 104_500,
    shortfall: 15_500,
    shortfallValueCents: 418_500,
    endsAt: "2026-10-30T00:00:00.000Z",
    stamp: { ...STAMP, confidence: 0.58 },
    decision: null,
    automatic: {
      approved: false,
      heldBecause: [
        "Only 71% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain.",
        "The closest substitute is a minor's — anything involving a minor reaches a person.",
      ],
    },
    options: [
      {
        id: "sample-mg-court-o1", inventoryName: "Post-game TikTok", propertyName: "Lakeside Hoops", format: "TikTok video ×2",
        equivalencyScore: 0.72, estimatedDelivery: 18_000, costImpactCents: 61_000,
        checks: { available: false, exclusivityClear: true, meetsTarget: true },
        reason: "Strong engagement history, but booked until after the campaign ends.",
      },
      {
        id: "sample-mg-court-o2", inventoryName: "Practice-day reel", propertyName: "Lakeside Hoops", format: "Instagram reel",
        equivalencyScore: 0.86, estimatedDelivery: 16_000, costImpactCents: 8_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "Same athletes and audience as the campaign's best post.",
      },
    ],
  },
  {
    id: "sample-mg-trail",
    status: "approved",
    campaign: { id: "sample-fc-trail", name: "Trail Season Launch" },
    sponsorName: "Summit Gear Co.",
    metric: "impressions",
    sold: 800_000,
    projected: 742_000,
    shortfall: 58_000,
    shortfallValueCents: 696_000,
    endsAt: "2026-11-03T00:00:00.000Z",
    stamp: STAMP,
    decision: {
      optionId: "sample-mg-trail-o1", by: "dana@summitvalley.example (Campaign manager)", at: "2026-10-09T15:20:00.000Z",
      note: "Sponsor agreed on the call; same property, next home series.", automatic: false, runsFrom: "2026-10-10", runsUntil: "2026-10-23",
    },
    /* Held for a person the night it opened; Dana decided it the next day. */
    automatic: { approved: false, heldBecause: ["Only 64% of the flight has gone; SponsorX approves on its own from 80%, when the shortfall is near-certain."] },
    options: [
      {
        id: "sample-mg-trail-o1", inventoryName: "Cross-country meet banner", propertyName: "Summit Valley XC", format: "Banner · 2 meets",
        equivalencyScore: 0.91, estimatedDelivery: 61_000, costImpactCents: 36_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "Same property, same audience, the next two home meets.",
      },
    ],
  },
  {
    id: "sample-mg-harbor",
    status: "approved",
    campaign: { id: "sample-fc-harbor", name: "Harbor Regatta Series" },
    sponsorName: "Tidewater Marine",
    metric: "impressions",
    sold: 300_000,
    projected: 255_000,
    shortfall: 45_000,
    shortfallValueCents: 540_000,
    endsAt: "2026-10-18T00:00:00.000Z",
    stamp: STAMP,
    /* Every safety check passed, so SponsorX approved it the night it opened (3S5-BE-02). */
    decision: {
      optionId: "sample-mg-harbor-o1", by: "SponsorX (automatic)", at: "2026-10-12T06:00:00.000Z",
      note: "Approved automatically by SponsorX: Regatta finals story set covers about 48,000 of the 45,000 impressions short (107%), $60 under the shortfall's value; every safety check passed.",
      automatic: true, runsFrom: "2026-10-13", runsUntil: "2026-10-26",
    },
    automatic: { approved: true, heldBecause: [] },
    options: [
      {
        id: "sample-mg-harbor-o1", inventoryName: "Regatta finals story set", propertyName: "Harbor Sailing Club", format: "Instagram stories ×4",
        equivalencyScore: 0.94, estimatedDelivery: 48_000, costImpactCents: -6_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "Their verified average of 12,000 impressions a story: about 48,000 impressions, 107% of the shortfall, $60 under the shortfall's value.",
      },
      {
        id: "sample-mg-harbor-o2", inventoryName: "Dockside banner", propertyName: "Harbor Sailing Club", format: "Banner · finals weekend",
        equivalencyScore: 0.67, estimatedDelivery: 30_000, costImpactCents: -180_000,
        checks: { available: true, exclusivityClear: true, meetsTarget: true },
        reason: "On target and cheap, but covers only two thirds of the gap.",
      },
    ],
  },
];

export const SAMPLE_MAKEGOOD_LIST: MakeGoodList = {
  counts: {
    open: SAMPLE_SHORTFALLS.filter((s) => s.status === "open").length,
    approved: SAMPLE_SHORTFALLS.filter((s) => s.status === "approved").length,
    openValueCents: SAMPLE_SHORTFALLS.filter((s) => s.status === "open").reduce((n, s) => n + s.shortfallValueCents, 0),
    approvedThisPeriod: SAMPLE_SHORTFALLS.filter((s) => s.status === "approved").length,
    period: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T00:00:00.000Z" },
  },
  shortfalls: SAMPLE_SHORTFALLS,
  page: { page: 1, size: 12, total: SAMPLE_SHORTFALLS.length, pages: 1 },
};

/** The sample list as the API would answer one tab (and campaign) of it: open by value at risk, approved newest first. */
export function sampleMakeGoodList(status: MakeGoodStatus, campaignId = ""): MakeGoodList {
  const inCampaign = SAMPLE_SHORTFALLS.filter((s) => !campaignId || s.campaign.id === campaignId);
  const shortfalls = inCampaign
    .filter((s) => s.status === status)
    .sort((a, b) => (status === "approved" ? (b.decision?.at ?? "").localeCompare(a.decision?.at ?? "") : b.shortfallValueCents - a.shortfallValueCents));
  const open = inCampaign.filter((s) => s.status === "open");
  return {
    counts: {
      ...SAMPLE_MAKEGOOD_LIST.counts,
      open: open.length,
      approved: inCampaign.length - open.length,
      openValueCents: open.reduce((n, s) => n + s.shortfallValueCents, 0),
      approvedThisPeriod: inCampaign.length - open.length,
    },
    shortfalls,
    page: { page: 1, size: 12, total: shortfalls.length, pages: 1 },
  };
}
