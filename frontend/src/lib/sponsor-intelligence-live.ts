/* --------------------------------------------------------------------------
   3S7-FE-01 — the sponsor intelligence hub's pure half: the contract the
   engine answers, the plain words the Stadium Board prints, and the sample
   that feeds `?demo=sample` and the tests.

   Reads (mounted 2026-10-15 by 3S7-BE-02 — backend/src/domain/sponsor-intelligence.ts,
          documentation/SponsorX-Hub-Intelligence.md §1)
     GET /intelligence/sponsor?range=7d|30d|90d|all
       Scoped by the API to the caller's sponsor org (Actor.sponsorId); a
       sponsor never names an org in the request, so there is nothing to
       tamper with. Built on the fact ledger's daily summaries (3S1-BE-01),
       REDEEM events, the tenant's benchmark and each campaign's latest
       forecast.

   Decisions
   - The four attribution classes stay four tiles, never one "results"
     figure (3S0-PMO-01). Estimated media value is shown as money and
     labelled an estimate; it is not revenue. With no benchmark on file the
     engine sends `amountCents: null` and the tile shows no figure at all —
     never $0.
   - "Sales matched to you" and "Sales likely from you" come from partner-
     sale attribution rows (3S6-BE-03) and are 0 until a partner store sends
     any; a zero prints as zero with its class claim.
   - Partner scores and renewal advice are model outputs: each carries a
     ModelStamp, and the page prints its confidence.
   - An audience segment is shown only when the engine names where it came
     from (`source`). A segment with no source is dropped, not guessed at —
     no demographics without a retrieval path. Today the engine sends
     `segments: []` (nothing on file names a source), so the panel reads
     "no sourced audience yet".
   - Format enums are inventory kinds plus AD_SLOT (an edition ad); the page
     prints formatWord's words.

   Pure: no fetch (server/engine.ts reads), so tests import it freely.
   -------------------------------------------------------------------------- */

import { ATTRIBUTION_ORDER, type AttributionClass, type ModelStamp } from "./intelligence";
import { kindLabel } from "./inventory-live";
import type { MetricSource, RangeKey } from "./sponsor-overview-live";
import type { WordTone } from "./sponsor-words";

/* --------------------------------------------------------------- contract */

export type SponsorIntelFormat = {
  /** An inventory kind (SOCIAL_POST, VIDEO, …), PACKAGE, AD_SLOT or OTHER. */
  format: string;
  campaigns: number;
  /** Verified impressions (API + manual) for this format. */
  deliveredImpressions: number;
  /** Verified redemptions (VERIFIED_REDEMPTION) for this format. */
  redemptions: number;
  /** Net booked spend ÷ verified redemptions; null when there were none.
   *  0 when fans redeemed but no spend was booked inside the window. */
  costPerResultCents: number | null;
  /** Where the impressions came from: VERIFIED_API or VERIFIED_MANUAL, whichever is larger. */
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
  /** The API types this as a plain string. */
  provenance: string;
};

export type RenewalAdvice = "RENEW" | "ADJUST" | "LET_END";

export type SponsorIntelRenewal = {
  campaignId: string;
  campaignName: string;
  endsAt: string;
  /** Sent by the engine: the campaign's end date is already behind asOf. Optional: derived from endsAt when absent. */
  ended?: boolean;
  /** 0..1 — the share of the promise delivered (or on course to be), capped at 1. */
  renewalScore: number;
  recommendation: RenewalAdvice;
  /** Plain sentences a sponsor can read. */
  reasons: string[];
  stamp: ModelStamp;
};

export type SponsorIntelTotal = { count: number; amountCents: number | null };

export type SponsorIntel = {
  asOf: string;
  range: RangeKey;
  /** count leaves out drafts and cancelled campaigns; active = running now. */
  campaigns: { count: number; active: number };
  /** One entry per class, never summed. amountCents is null where a class has no money
   *  (a redemption) or no way to estimate it (media value with no benchmark). */
  totals: Record<AttributionClass, SponsorIntelTotal>;
  formats: SponsorIntelFormat[];
  partners: SponsorIntelPartner[];
  segments: SponsorIntelSegment[];
  renewals: SponsorIntelRenewal[];
};

/** The engine path for a window (relative to /api/v1). */
export const sponsorIntelPath = (range: RangeKey) => `/intelligence/sponsor?range=${range}`;

/* ----------------------------------------------------------------- words */

/** The standard note at the foot of every sponsor results screen and report —
 *  3S0-LEG-01, approved 2026-10-22 (document 5 §6). The same words as the
 *  rendered report's RESULTS_NOTE (backend report-render.ts). */
export const RESULTS_NOTE =
  "Checked figures are counted by SponsorX or taken from the platform. Likely figures come from a model and show " +
  "their confidence; they are not proof that your campaign caused a sale. Estimated media value is what the exposure " +
  "would have cost to buy as ads; it is not revenue or profit. Self-reported figures come from the athlete and are " +
  "not checked. Figures can change as late data, refunds and corrections arrive. Prepared by SponsorX, run by BTG " +
  "Sports Group.";

/** The four classes in a sponsor's words — the hub's tiles. `none` is the caption's tail at zero. */
export const CLASS_WORDS: Record<AttributionClass, { label: string; hint: string; none: string }> = {
  VERIFIED_REDEMPTION: {
    label: "Fans who redeemed",
    hint: "Fans who used your offer. SponsorX recorded every one, so this is a checked figure.",
    none: "none yet",
  },
  VERIFIED_TRANSACTION: {
    label: "Sales matched to you",
    hint: "Orders at a partner store that matched your campaign exactly, by code or link. Checked. Refunds are taken off the amount.",
    none: "none from a partner store yet",
  },
  MODELLED: {
    label: "Sales likely from you",
    hint: "Sales a model links to your campaign without an exact match. A likely figure, never a checked one.",
    none: "none from a partner store yet",
  },
  ESTIMATED_MEDIA_VALUE: {
    label: "Estimated media value",
    hint: "What the exposure your campaigns got would have cost to buy as ads: your checked views at the market price per 1,000. An estimate, not money you earned.",
    none: "no checked views yet",
  },
};

export type ClassTile = {
  cls: AttributionClass;
  label: string;
  hint: string;
  /** null = the engine has no figure for this class (media value with no market rate on file); the tile shows no number. */
  value: number | null;
  format: "int" | "usd0";
  caption: string;
};

const usdWhole = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const int = (n: number) => n.toLocaleString("en-US");

/** The four class tiles, in the fixed order. Media value is money; the rest are
 *  counts with their value as a caption. A zero is a zero with its class claim;
 *  a missing figure (null money on the estimate) is no figure, with the reason. */
export function classTiles(totals: Partial<SponsorIntel["totals"]>): ClassTile[] {
  return ATTRIBUTION_ORDER.map((cls) => {
    const t = totals[cls] ?? { count: 0, amountCents: null };
    const { label, hint, none } = CLASS_WORDS[cls];
    if (cls === "ESTIMATED_MEDIA_VALUE") {
      if (t.amountCents === null) {
        const views = t.count > 0 ? `${int(t.count)} checked views, but no market rate on file yet to price them` : "No checked views yet";
        return { cls, label, hint, value: null, format: "usd0", caption: `${views} · no estimate` };
      }
      const from = t.count > 0 ? ` from ${int(t.count)} checked views` : "";
      return { cls, label, hint, value: t.amountCents, format: "usd0", caption: `An estimate${from} · not revenue` };
    }
    const kind = cls === "MODELLED" ? "Likely" : "Checked";
    if (t.count === 0) return { cls, label, hint, value: 0, format: "int", caption: `${kind} · ${none}` };
    const money = t.amountCents !== null && t.amountCents > 0 ? ` · ${usdWhole(t.amountCents)} in sales` : "";
    return { cls, label, hint, value: t.count, format: "int", caption: `${kind}${money}` };
  });
}

/** Formats the ledger names that are not inventory kinds. */
const FORMAT_WORDS: Record<string, string> = { AD_SLOT: "Edition ad" };

export const formatWord = (format: string) => FORMAT_WORDS[format] ?? kindLabel(format);

export const partnerKindWord = (kind: SponsorIntelPartner["kind"]) => (kind === "athlete" ? "Athlete" : "Team or school");

export const RENEWAL_WORDS: Record<RenewalAdvice, { text: string; tone: WordTone }> = {
  RENEW: { text: "Worth renewing", tone: "live" },
  ADJUST: { text: "Renew with changes", tone: "info" },
  LET_END: { text: "Let it end", tone: "done" },
};

export const renewalWord = (r: string) => RENEWAL_WORDS[r as RenewalAdvice] ?? { text: "No advice yet", tone: "info" as WordTone };

/** Has this campaign already ended? The engine says (`ended`); failing that, its end date against asOf. */
export function renewalEnded(r: Pick<SponsorIntelRenewal, "endsAt" | "ended">, asOf: string): boolean {
  return r.ended ?? new Date(r.endsAt).getTime() < new Date(asOf).getTime();
}

/** A format's cost per redemption worth printing: null when nobody redeemed,
 *  and null for the engine's 0 (fans redeemed, but the spend was booked
 *  outside this window) — $0.00 a fan is not a price. */
export function knownCost(r: Pick<SponsorIntelFormat, "costPerResultCents">): number | null {
  return r.costPerResultCents !== null && r.costPerResultCents > 0 ? r.costPerResultCents : null;
}

/* --------------------------------------------------------------- ordering */

/** Best value first: lowest known cost per redemption; formats with no price
 *  (no redemptions, or no spend in the window) last, by redemptions then reach. */
export function rankFormats(rows: SponsorIntelFormat[]): SponsorIntelFormat[] {
  return [...rows].sort((a, b) => {
    const ca = knownCost(a);
    const cb = knownCost(b);
    if (ca === null && cb === null) return b.redemptions - a.redemptions || b.deliveredImpressions - a.deliveredImpressions;
    if (ca === null) return 1;
    if (cb === null) return -1;
    return ca - cb || b.redemptions - a.redemptions;
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

const AS_OF = "2026-10-12T06:00:00.000Z";
const STAMP = (modelVersion: string, confidence: number, computedAt = AS_OF): ModelStamp => ({ modelVersion, confidence, computedAt });

/** `?demo=sample` and the tests — never shown in production (server/engine.ts
 *  wantsSample). Shaped as the engine answers today: model versions are the
 *  engine's, partner sales are 0 (no partner store), and segments are empty. */
export const SAMPLE_SPONSOR_INTEL: SponsorIntel = {
  asOf: AS_OF,
  range: "30d",
  campaigns: { count: 6, active: 2 },
  totals: {
    VERIFIED_REDEMPTION: { count: 1240, amountCents: null },
    VERIFIED_TRANSACTION: { count: 0, amountCents: 0 },
    MODELLED: { count: 0, amountCents: 0 },
    /* 715,000 checked views × $5.80 per 1,000 */
    ESTIMATED_MEDIA_VALUE: { count: 715_000, amountCents: 414_700 },
  },
  formats: [
    { format: "SOCIAL_POST", campaigns: 5, deliveredImpressions: 412_000, redemptions: 820, costPerResultCents: 1_830, provenance: "VERIFIED_API" },
    { format: "APPEARANCE", campaigns: 2, deliveredImpressions: 0, redemptions: 310, costPerResultCents: 3_870, provenance: "VERIFIED_API" },
    { format: "VIDEO", campaigns: 3, deliveredImpressions: 268_000, redemptions: 110, costPerResultCents: 5_450, provenance: "VERIFIED_API" },
    { format: "AD_SLOT", campaigns: 1, deliveredImpressions: 35_000, redemptions: 0, costPerResultCents: null, provenance: "VERIFIED_MANUAL" },
  ],
  partners: [
    { kind: "athlete", id: "sxi-sp-ath-1", name: "Maya Torres", campaigns: 3, score: 0.86, provenance: "VERIFIED_API", stamp: STAMP("sponsor-intel@1.0.0", 1) },
    { kind: "property", id: "sxi-sp-prop-1", name: "Riverside High Athletics", campaigns: 2, score: 0.75, provenance: "VERIFIED_MANUAL", stamp: STAMP("sponsor-intel@1.0.0", 0.8) },
    { kind: "athlete", id: "sxi-sp-ath-2", name: "Jordan Ellis", campaigns: 2, score: 0.69, provenance: "VERIFIED_API", stamp: STAMP("sponsor-intel@1.0.0", 0.6) },
  ],
  /* The engine names no audience source yet, so there is nothing to show — and nothing invented here. */
  segments: [],
  renewals: [
    {
      campaignId: "sxi-sp-cmp-2",
      campaignName: "Back to School Kickoff",
      endsAt: "2026-10-31T00:00:00.000Z",
      ended: false,
      renewalScore: 0.92,
      recommendation: "RENEW",
      reasons: ["On course to deliver 46,000 of the 50,000 impressions promised (92%).", "640 fans redeemed your offer.", "It delivered what was promised, so it is worth booking again."],
      stamp: STAMP("renewal-rules@1.0.0", 0.8, "2026-10-11T19:30:00.000Z"),
    },
    {
      campaignId: "sxi-sp-cmp-1",
      campaignName: "Fall Hoops Tour",
      endsAt: "2026-10-05T00:00:00.000Z",
      ended: true,
      renewalScore: 0.54,
      recommendation: "ADJUST",
      reasons: ["Delivered 27,000 of the 50,000 impressions promised (54%).", "110 fans redeemed your offer.", "It fell short of the promise, so renew with a different format or partner."],
      stamp: STAMP("renewal-rules@1.0.0", 1, "2026-10-05T19:30:00.000Z"),
    },
  ],
};
