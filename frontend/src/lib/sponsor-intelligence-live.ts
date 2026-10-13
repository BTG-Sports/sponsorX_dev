/* --------------------------------------------------------------------------
   3S7-FE-01 — the sponsor intelligence hub's pure half: the contract the
   engine is built against, the plain words the Stadium Board prints, and
   the sample that feeds `?demo=sample` and the tests.

   Reads (proposed, not mounted yet — lib/intelligence.ts ENGINES.sponsorHub)
     GET /intelligence/sponsor?range=7d|30d|90d|all
       Scoped by the API to the caller's sponsor org (Actor.sponsorId); a
       sponsor never names an org in the request, so there is nothing to
       tamper with. Built on 3S1-DATA-02's daily campaign facts.

   Decisions
   - The four attribution classes stay four tiles, never one "results"
     figure (3S0-PMO-01). Estimated media value is shown as money and
     labelled an estimate; it is not revenue.
   - Partner scores and renewal advice are model outputs: each carries a
     ModelStamp, and the page prints its confidence.
   - An audience segment is shown only when the engine names where it came
     from (`source`). A segment with no source is dropped, not guessed at —
     no demographics without a retrieval path.
   - Format enums are inventory kinds; the page prints kindLabel's words.

   Pure: no fetch (server/engine.ts reads), so tests import it freely.
   -------------------------------------------------------------------------- */

import { ATTRIBUTION_ORDER, type AttributionClass, type ModelStamp } from "./intelligence";
import { kindLabel } from "./inventory-live";
import type { MetricSource, RangeKey } from "./sponsor-overview-live";
import type { WordTone } from "./sponsor-words";

/* --------------------------------------------------------------- contract */

export type SponsorIntelFormat = {
  /** An inventory kind (SOCIAL_POST, VIDEO, …). */
  format: string;
  campaigns: number;
  deliveredImpressions: number;
  /** Verified redemptions (VERIFIED_REDEMPTION) for this format. */
  redemptions: number;
  /** Contracted spend ÷ verified redemptions; null when there were none. */
  costPerResultCents: number | null;
  /** Where the impressions came from. */
  provenance: MetricSource;
};

export type SponsorIntelPartner = {
  kind: "athlete" | "property";
  id: string;
  name: string;
  campaigns: number;
  /** 0..1 — how well this partner performed for you, across campaigns. */
  score: number;
  provenance: MetricSource;
  stamp: ModelStamp;
};

export type SponsorIntelSegment = {
  label: string;
  /** 0..1 of the audience reached. */
  share: number;
  /** The named origin of the figure ("Instagram audience insights"); empty = not shown. */
  source: string;
  provenance: MetricSource;
};

export type RenewalAdvice = "RENEW" | "ADJUST" | "LET_END";

export type SponsorIntelRenewal = {
  campaignId: string;
  campaignName: string;
  endsAt: string;
  /** 0..1 */
  renewalScore: number;
  recommendation: RenewalAdvice;
  /** Plain sentences a sponsor can read. */
  reasons: string[];
  stamp: ModelStamp;
};

export type SponsorIntel = {
  asOf: string;
  range: RangeKey;
  campaigns: { count: number; active: number };
  /** One entry per class, never summed. amountCents is null where a class has no money (a redemption). */
  totals: Record<AttributionClass, { count: number; amountCents: number | null }>;
  formats: SponsorIntelFormat[];
  partners: SponsorIntelPartner[];
  segments: SponsorIntelSegment[];
  renewals: SponsorIntelRenewal[];
};

/** The engine path for a window (relative to /api/v1). */
export const sponsorIntelPath = (range: RangeKey) => `/intelligence/sponsor?range=${range}`;

/* ----------------------------------------------------------------- words */

/** The four classes in a sponsor's words — the hub's tiles. */
export const CLASS_WORDS: Record<AttributionClass, { label: string; hint: string }> = {
  VERIFIED_REDEMPTION: {
    label: "Fans who redeemed",
    hint: "Fans who used your offer. SponsorX recorded every one, so this is a checked figure.",
  },
  VERIFIED_TRANSACTION: {
    label: "Sales matched to you",
    hint: "Orders at a partner store that matched your campaign exactly, by code or link. Checked.",
  },
  MODELLED: {
    label: "Sales likely from you",
    hint: "Sales a model links to your campaign without an exact match. A likely figure, never a checked one.",
  },
  ESTIMATED_MEDIA_VALUE: {
    label: "Estimated media value",
    hint: "What the exposure your campaigns got would have cost to buy as ads. An estimate, not money you earned.",
  },
};

export type ClassTile = {
  cls: AttributionClass;
  label: string;
  hint: string;
  value: number;
  format: "int" | "usd0";
  caption: string;
};

/** The four class tiles, in the fixed order. Media value is money; the rest are counts with their value as a caption. */
export function classTiles(totals: SponsorIntel["totals"]): ClassTile[] {
  return ATTRIBUTION_ORDER.map((cls) => {
    const t = totals[cls] ?? { count: 0, amountCents: null };
    const w = CLASS_WORDS[cls];
    if (cls === "ESTIMATED_MEDIA_VALUE") {
      return { cls, ...w, value: t.amountCents ?? 0, format: "usd0", caption: "An estimate · not revenue" };
    }
    const money = t.amountCents !== null && t.amountCents > 0 ? ` · ${usdWhole(t.amountCents)} in sales` : "";
    const kind = cls === "MODELLED" ? "Likely" : "Checked";
    return { cls, ...w, value: t.count, format: "int", caption: `${kind}${money}` };
  });
}

const usdWhole = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

export const formatWord = (format: string) => kindLabel(format);

export const partnerKindWord = (kind: SponsorIntelPartner["kind"]) => (kind === "athlete" ? "Athlete" : "Team or school");

export const RENEWAL_WORDS: Record<RenewalAdvice, { text: string; tone: WordTone }> = {
  RENEW: { text: "Worth renewing", tone: "live" },
  ADJUST: { text: "Renew with changes", tone: "info" },
  LET_END: { text: "Let it end", tone: "done" },
};

export const renewalWord = (r: string) => RENEWAL_WORDS[r as RenewalAdvice] ?? { text: "No advice yet", tone: "info" as WordTone };

/* --------------------------------------------------------------- ordering */

/** Best value first: lowest cost per redemption; formats with no redemptions last, by reach. */
export function rankFormats(rows: SponsorIntelFormat[]): SponsorIntelFormat[] {
  return [...rows].sort((a, b) => {
    if (a.costPerResultCents === null && b.costPerResultCents === null) return b.deliveredImpressions - a.deliveredImpressions;
    if (a.costPerResultCents === null) return 1;
    if (b.costPerResultCents === null) return -1;
    return a.costPerResultCents - b.costPerResultCents || b.redemptions - a.redemptions;
  });
}

/** Highest score first; ties by more campaigns together. */
export function rankPartners(rows: SponsorIntelPartner[]): SponsorIntelPartner[] {
  return [...rows].sort((a, b) => b.score - a.score || b.campaigns - a.campaigns);
}

/** Only segments the engine can trace to a named source, largest first. */
export function sourcedSegments(rows: SponsorIntelSegment[]): SponsorIntelSegment[] {
  return rows.filter((s) => s.source.trim() !== "").sort((a, b) => b.share - a.share);
}

/** Soonest ending first — the decisions that are due. */
export function renewalsDue(rows: SponsorIntelRenewal[]): SponsorIntelRenewal[] {
  return [...rows].sort((a, b) => a.endsAt.localeCompare(b.endsAt));
}

/* ----------------------------------------------------------------- sample */

const STAMP = (modelVersion: string, confidence: number): ModelStamp => ({ modelVersion, confidence, computedAt: "2026-10-12T06:00:00.000Z" });

/** `?demo=sample` and the tests — never shown in production (server/engine.ts wantsSample). */
export const SAMPLE_SPONSOR_INTEL: SponsorIntel = {
  asOf: "2026-10-12T06:00:00.000Z",
  range: "30d",
  campaigns: { count: 6, active: 2 },
  totals: {
    VERIFIED_REDEMPTION: { count: 1240, amountCents: null },
    VERIFIED_TRANSACTION: { count: 186, amountCents: 912_000 },
    MODELLED: { count: 402, amountCents: 1_830_000 },
    ESTIMATED_MEDIA_VALUE: { count: 0, amountCents: 4_150_000 },
  },
  formats: [
    { format: "SOCIAL_POST", campaigns: 5, deliveredImpressions: 412_000, redemptions: 820, costPerResultCents: 1_830, provenance: "VERIFIED_API" },
    { format: "APPEARANCE", campaigns: 2, deliveredImpressions: 0, redemptions: 310, costPerResultCents: 3_870, provenance: "VERIFIED_MANUAL" },
    { format: "VIDEO", campaigns: 3, deliveredImpressions: 268_000, redemptions: 110, costPerResultCents: 5_450, provenance: "VERIFIED_API" },
    { format: "SIGNAGE", campaigns: 1, deliveredImpressions: 35_000, redemptions: 0, costPerResultCents: null, provenance: "ESTIMATED" },
  ],
  partners: [
    { kind: "athlete", id: "sxi-sp-ath-1", name: "Maya Torres", campaigns: 3, score: 0.86, provenance: "VERIFIED_API", stamp: STAMP("partner-score@0.3.0", 0.78) },
    { kind: "property", id: "sxi-sp-prop-1", name: "Riverside High Athletics", campaigns: 2, score: 0.74, provenance: "VERIFIED_MANUAL", stamp: STAMP("partner-score@0.3.0", 0.61) },
    { kind: "athlete", id: "sxi-sp-ath-2", name: "Jordan Ellis", campaigns: 2, score: 0.69, provenance: "VERIFIED_API", stamp: STAMP("partner-score@0.3.0", 0.55) },
  ],
  segments: [
    { label: "Ages 18–24", share: 0.46, source: "Instagram audience insights", provenance: "VERIFIED_API" },
    { label: "Ages 25–34", share: 0.29, source: "Instagram audience insights", provenance: "VERIFIED_API" },
    { label: "Local fans at events", share: 0.18, source: "", provenance: "SELF_REPORTED" },
  ],
  renewals: [
    {
      campaignId: "sxi-sp-cmp-2",
      campaignName: "Back to School Kickoff",
      endsAt: "2026-10-31T00:00:00.000Z",
      renewalScore: 0.82,
      recommendation: "RENEW",
      reasons: ["Redemptions came in 31% cheaper than your other campaigns", "Both athletes posted on time"],
      stamp: STAMP("renewal-rules@0.2.0", 0.8),
    },
    {
      campaignId: "sxi-sp-cmp-1",
      campaignName: "Fall Hoops Tour",
      endsAt: "2026-10-20T00:00:00.000Z",
      renewalScore: 0.54,
      recommendation: "ADJUST",
      reasons: ["Videos reached many people but few redeemed", "Social posts did better — consider swapping the format"],
      stamp: STAMP("renewal-rules@0.2.0", 0.58),
    },
  ],
};
