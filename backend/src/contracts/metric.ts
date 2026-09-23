import { z } from "./zod";

import { METRIC_SOURCES } from "../domain/metric-source";

/* --------------------------------------------------------------------------
   Metrics and the sponsor report on the wire — P7-DATA-01, P7-BE-05, §22.

   THE BREAKDOWN IS THE CONTRACT. `SourcedTotals` has five required keys, so a
   consumer literally cannot receive a blended figure from these endpoints —
   §8's service account and INFINEX read the same published schema as the
   portals and are held to the same distinction. A single `views: number`
   would have made conflation the path of least resistance for every client.
   -------------------------------------------------------------------------- */

export const MetricSource = z.enum(METRIC_SOURCES).meta({
  id: "MetricSource",
  description:
    "Where a figure came from (§22). VERIFIED_API and VERIFIED_MANUAL may be shown plainly; SELF_REPORTED, ESTIMATED and ATTRIBUTED must be labelled wherever they appear. Conflating them is the product's stated credibility risk.",
});

export const SourcedTotals = z
  .object({
    VERIFIED_API: z.int().min(0),
    VERIFIED_MANUAL: z.int().min(0),
    SELF_REPORTED: z.int().min(0),
    ESTIMATED: z.int().min(0),
    ATTRIBUTED: z.int().min(0),
  })
  .meta({
    id: "SourcedTotals",
    description:
      "One figure per provenance label. There is deliberately no combined total: a caller that wants one must add the labels itself and disclose what it added.",
  });

export const MetricBreakdown = z
  .object({
    views: SourcedTotals,
    engagements: SourcedTotals,
    verifiedViews: z.int().min(0),
    verifiedEngagements: z.int().min(0),
  })
  .meta({ id: "MetricBreakdown" });

export const MetricEntryInput = z
  .object({
    /** The day being reported, not the day of entry. */
    day: z.iso.date(),
    views: z.int().min(0),
    engagements: z.int().min(0),
    source: MetricSource,
  })
  .meta({
    id: "MetricEntryInput",
    description:
      "Recording a figure for a day that already has one from a DIFFERENT source adds a second row; the same source updates the existing row. A manually verified figure never silently overwrites an API one.",
  });

export const MediaValue = z
  .object({
    amount: z.int().describe("cents"),
    basis: z
      .string()
      .describe("What the figure was computed from. Always present — a media value with no stated basis is unfalsifiable."),
    source: z.literal("ESTIMATED"),
  })
  .meta({ id: "MediaValue" });

export const SponsorReport = z
  .object({
    campaign: z.object({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      startDate: z.iso.datetime(),
      endDate: z.iso.datetime(),
      budget: z.int().describe("cents"),
    }),
    objective: z.string().nullable(),
    roster: z.array(
      z.object({
        athleteId: z.string(),
        athleteName: z.string(),
        jobId: z.string(),
        orderState: z.string(),
        deliverablesTotal: z.int().min(0),
        deliverablesVerified: z.int().min(0),
      }),
    ),
    deliveredAssets: z.array(
      z.object({
        deliverableId: z.string(),
        title: z.string(),
        state: z.string(),
        publishedUrl: z.string().nullable(),
        publishedAt: z.iso.datetime().nullable(),
        trackedClicks: z.int().min(0).describe("ATTRIBUTED — clicks we recorded ourselves"),
      }),
    ),
    performance: MetricBreakdown,
    funnel: z.object({
      SCAN: z.int().min(0),
      LANDING: z.int().min(0),
      CLAIM: z.int().min(0),
      REDEEM: z.int().min(0),
    }),
    redemption: z.object({
      issued: z.int().min(0),
      redeemed: z.int().min(0),
      rate: z.number().min(0).max(1),
    }),
    mediaValue: MediaValue,
    observations: z
      .array(z.string())
      .describe("Statements that follow mechanically from the counts above — never generated commentary."),
  })
  .meta({ id: "SponsorReport" });
