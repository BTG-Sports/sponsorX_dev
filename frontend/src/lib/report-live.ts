/* --------------------------------------------------------------------------
   P7-FE-03 — the sponsor report (§9 screen 12) as GET /campaigns/{id}/report
   answers it (backend/src/domain/sponsor-report.ts), and the small helpers
   the page uses to keep §22's layers apart.

   THE ONE RULE: estimated figures are never presented as verified. Reach is
   shown per provenance, side by side, never summed across labels; media
   value is ESTIMATED and always printed with its stated basis; tracked
   clicks are ATTRIBUTED (our own counter, not a platform number); the fan
   funnel is our own event rows (measured).
   -------------------------------------------------------------------------- */

export type Sourced = {
  VERIFIED_API: number;
  VERIFIED_MANUAL: number;
  SELF_REPORTED: number;
  ESTIMATED: number;
  ATTRIBUTED: number;
};

export type ApiSponsorReport = {
  campaign: { id: string; name: string; state: string; startDate: string; endDate: string; budget: number };
  objective: string | null;
  roster: {
    athleteId: string;
    athleteName: string;
    jobId: string;
    orderState: string;
    deliverablesTotal: number;
    deliverablesVerified: number;
  }[];
  deliveredAssets: {
    deliverableId: string;
    title: string;
    state: string;
    publishedUrl: string | null;
    publishedAt: string | null;
    trackedClicks: number;
  }[];
  performance: { views: Sourced; engagements: Sourced; verifiedViews: number; verifiedEngagements: number };
  funnel: { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
  adPlacements: { slotCode: string; kind: string; editionId: string; soldCents: number }[];
  editionEngagement: {
    print: { QR_SCAN: number };
    digital: { LINK_CLICK: number; PROFILE_VIEW: number; CAMPAIGN_VIEW: number; CTA_CLICK: number };
  } | null;
  redemption: { issued: number; redeemed: number; rate: number };
  mediaValue: { amount: number; basis: string; source: "ESTIMATED" };
  observations: string[];
};

/**
 * The one chip the "Verified" layer may wear. That layer is VERIFIED_API +
 * VERIFIED_MANUAL summed by the backend, so under the taxonomy's §4.2 a single
 * badge shows the WEAKEST part: any staff-checked row makes the whole layer
 * "verified · manual" (P7-QA-02 — it used to say "verified · platform" over
 * figures BTG typed in). Platform-verified only when every row came from one.
 */
export function verifiedChip(p: Pick<ApiSponsorReport["performance"], "views" | "engagements">): "VERIFIED_API" | "VERIFIED_MANUAL" | null {
  /* No verified rows at all → no chip (F-12, QA pass 5): "verified ·
     platform" over a zero claims a source for figures nobody recorded. */
  if (
    p.views.VERIFIED_API + p.views.VERIFIED_MANUAL +
      p.engagements.VERIFIED_API + p.engagements.VERIFIED_MANUAL === 0
  ) return null;
  return p.views.VERIFIED_MANUAL > 0 || p.engagements.VERIFIED_MANUAL > 0 ? "VERIFIED_MANUAL" : "VERIFIED_API";
}

/** The reach layers a sponsor may see, in trust order — each on its own. */
export function reachLayers(p: ApiSponsorReport["performance"]): {
  key: "verified" | "self" | "estimated";
  label: string;
  views: number;
  engagements: number;
  /** null = the layer has no rows to label. */
  chip: "VERIFIED_API" | "VERIFIED_MANUAL" | "SELF_REPORTED" | "ESTIMATED" | null;
}[] {
  return [
    {
      key: "verified" as const,
      label: "Verified",
      views: p.verifiedViews,
      engagements: p.verifiedEngagements,
      chip: verifiedChip(p),
    },
    {
      key: "self" as const,
      label: "Self-reported",
      views: p.views.SELF_REPORTED,
      engagements: p.engagements.SELF_REPORTED,
      chip: "SELF_REPORTED" as const,
    },
    {
      key: "estimated" as const,
      label: "Estimated",
      views: p.views.ESTIMATED,
      engagements: p.engagements.ESTIMATED,
      chip: "ESTIMATED" as const,
    },
  ].filter((l, i) => i === 0 || l.views > 0 || l.engagements > 0);
}

/** Engagement rate within ONE layer, whole-tenth percent; null with no views. */
export function engagementRate(views: number, engagements: number): number | null {
  return views > 0 ? Math.round((1000 * engagements) / views) / 10 : null;
}

export function deliveredShare(r: ApiSponsorReport["roster"]): { verified: number; total: number } {
  return r.reduce(
    (a, l) => ({ verified: a.verified + l.deliverablesVerified, total: a.total + l.deliverablesTotal }),
    { verified: 0, total: 0 },
  );
}
