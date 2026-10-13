/**
 * The fact ledger's vocabulary — 3S1-BE-01 (documentation/SponsorX-Fact-Ledger.md).
 *
 * Pure: no database, so every rule here is a unit test away. The writer is
 * src/domain/facts.ts.
 *
 * CLOSED LISTS. A fact kind, a channel or a measure that is not listed here is
 * refused, so a typo can never create a figure nobody counts. Adding one is a
 * deliberate change to this file (and, for a measure, a column on
 * CampaignDaySummary).
 */

/** What happened. 3S1-BE-02 wires each into the action that causes it. */
export const FACT_KINDS = [
  "ORDER_BOOKED", "ORDER_CANCELLED", "EARNING_PAID", "INVOICE_ISSUED", "INVOICE_PAID",
  "DELIVERABLE_DUE", "DELIVERABLE_PUBLISHED", "DELIVERABLE_VERIFIED", "REVISION_REQUESTED",
  "METRIC_RECORDED", "AD_SLOT_SOLD", "MARKETPLACE_LINE_CONTRACTED", "MARKETPLACE_REFUND",
  /** A correction: the negated measures of the fact it reverses. */
  "REVERSAL",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

/** Where it happened (the same codes as the reports' channel dimension). */
export const FACT_CHANNELS = [
  "SOCIAL_INSTAGRAM", "SOCIAL_TIKTOK", "SOCIAL_YOUTUBE", "SOCIAL_X", "SOCIAL_FACEBOOK", "SOCIAL_OTHER",
  "UNPUBLISHED", "IN_PERSON", "EDITION_PRINT", "EDITION_DIGITAL", "CAMPAIGN", "MARKETPLACE",
] as const;
export type FactChannel = (typeof FACT_CHANNELS)[number];

export const INVENTORY_KINDS = ["NIL_JOB", "LISTING_ITEM", "AD_SLOT"] as const;
export type InventoryKind = (typeof INVENTORY_KINDS)[number];

/**
 * The measures a fact can move, and the CampaignDaySummary column each lives
 * in. Counts and cents, always whole numbers. Fan scans, landings, claims,
 * redemptions, link clicks and edition views are NOT measures: each is
 * already one row per event (RewardEvent, LinkEvent, EditionEvent), written
 * the moment it happens, and the reads count those rows directly.
 */
export const MEASURE_COLUMNS = {
  deliverables_due: "deliverablesDue",
  deliverables_published: "deliverablesPublished",
  deliverables_verified: "deliverablesVerified",
  revisions_requested: "revisionsRequested",
  views_verified_api: "viewsVerifiedApi",
  views_verified_manual: "viewsVerifiedManual",
  views_self_reported: "viewsSelfReported",
  views_estimated: "viewsEstimated",
  views_attributed: "viewsAttributed",
  engagements_verified_api: "engagementsVerifiedApi",
  engagements_verified_manual: "engagementsVerifiedManual",
  engagements_self_reported: "engagementsSelfReported",
  engagements_estimated: "engagementsEstimated",
  engagements_attributed: "engagementsAttributed",
  metric_corrections: "metricCorrections",
  booked_sell_cents: "bookedSellCents",
  booked_compensation_cents: "bookedCompensationCents",
  cancelled_sell_cents: "cancelledSellCents",
  cancelled_compensation_cents: "cancelledCompensationCents",
  earnings_paid_cents: "earningsPaidCents",
  ad_slot_sold_cents: "adSlotSoldCents",
  invoiced_cents: "invoicedCents",
  invoice_paid_cents: "invoicePaidCents",
  marketplace_gross_cents: "marketplaceGrossCents",
  marketplace_net_cents: "marketplaceNetCents",
  marketplace_refunded_cents: "marketplaceRefundedCents",
} as const;
export type FactMeasure = keyof typeof MEASURE_COLUMNS;
export const FACT_MEASURES = Object.keys(MEASURE_COLUMNS) as FactMeasure[];

/**
 * A market as the summaries key it: the US state upper-cased, the city
 * trimmed and title-cased ('' for state-only). No state means no market:
 * a city alone is not a place.
 */
export function normaliseMarket(state: string | null | undefined, city: string | null | undefined): { state: string; city: string } {
  const st = (state ?? "").trim().toUpperCase();
  if (!st) return { state: "", city: "" };
  const c = (city ?? "").trim().toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());
  return { state: st, city: c };
}

export const marketKey = (m: { state: string; city: string }) => (m.state ? `${m.state}:${m.city}` : "");
export const inventoryKey = (kind: string | null | undefined, id: string | null | undefined) => (kind && id ? `${kind}:${id}` : "");
