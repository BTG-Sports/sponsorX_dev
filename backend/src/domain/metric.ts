/**
 * Performance metrics — P7-DATA-01 (entry) and P7-DATA-02 (rollup), §22.
 *
 * Daily views and engagements per deliverable, each row labelled with where
 * the figure came from.
 *
 * ONE ROW PER (DELIVERABLE, DAY, SOURCE). The unique index says so, and the
 * schema comment beside it says why: "a manually verified figure never
 * silently overwrites an API one". So recording a self-reported number for a
 * day that already has an API number adds a SECOND row; it does not replace
 * anything. Re-recording the same day from the same source updates that one
 * row, because that is a correction of a figure, not a new observation.
 *
 * NOTHING HERE RETURNS A BLENDED NUMBER. Every read hands back a breakdown by
 * label — see `metric-source.ts` for why the shape is the enforcement.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  emptyTotals,
  METRIC_SOURCES,
  type MetricSource,
  type SourcedTotals,
  verifiedTotal,
} from "./metric-source";

export class FutureMetricError extends Error {
  readonly status = 422;
  constructor() {
    super(
      "A metric cannot be recorded for a day that has not happened. A figure " +
        "dated in the future is either a typo or a projection, and a " +
        "projection is not a measurement.",
    );
    this.name = "FutureMetricError";
  }
}

/** Midnight UTC for a day — the column is `@db.Date`. */
export function dayOf(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}

/* ────────────────────────────────────────────────────────────────────────────
   P7-DATA-01 · Entry
   ──────────────────────────────────────────────────────────────────────────── */

/**
 * Record one day's figures for one deliverable, from one source.
 *
 * `enteredBy` is the actor for every label except `VERIFIED_API` — a number
 * read from a platform API was not entered by a person, and recording a staff
 * id against it would make an automated read look like a human attestation.
 */
export async function recordMetric(
  actor: Actor,
  input: {
    deliverableId: string;
    day: Date;
    views: number;
    engagements: number;
    source: MetricSource;
  },
  now = new Date(),
): Promise<{ id: string; source: MetricSource; day: Date }> {
  assertTenantWide(actor, "metricEvent", "write");

  const day = dayOf(input.day);
  if (day.getTime() > dayOf(now).getTime()) throw new FutureMetricError();

  return prisma.$transaction(async (tx) => {
    const deliverable = await tx.deliverable.findFirst({
      where: { ...whereFor(actor, "deliverable", "read"), id: input.deliverableId },
      select: { id: true, tenantId: true },
    });
    if (!deliverable) throw new ForbiddenError("metricEvent", "write");

    /* Upsert on the (deliverableId, day, source) key. A second reading from
       the SAME source on the same day corrects that row; a reading from a
       DIFFERENT source lands beside it, untouched. */
    const row = await tx.metricDaily.upsert({
      where: {
        deliverableId_day_source: {
          deliverableId: deliverable.id,
          day,
          source: input.source as Prisma.MetricDailyCreateInput["source"],
        },
      },
      create: {
        tenantId: deliverable.tenantId,
        deliverableId: deliverable.id,
        day,
        views: input.views,
        engagements: input.engagements,
        source: input.source as Prisma.MetricDailyCreateInput["source"],
        enteredBy: input.source === "VERIFIED_API" ? null : actor.userId,
      },
      update: {
        views: input.views,
        engagements: input.engagements,
        enteredBy: input.source === "VERIFIED_API" ? null : actor.userId,
      },
      select: { id: true, source: true, day: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.metric.record, "MetricDaily", row.id, {
      after: {
        deliverableId: deliverable.id,
        day: day.toISOString().slice(0, 10),
        source: input.source,
        views: input.views,
        engagements: input.engagements,
      },
    });

    return { id: row.id, source: row.source as MetricSource, day: row.day };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
   Reading — always by label, never blended
   ──────────────────────────────────────────────────────────────────────────── */

export type MetricBreakdown = {
  views: SourcedTotals;
  engagements: SourcedTotals;
  /** The two verified labels only. Stated separately so a caller that wants
   *  "the number we stand behind" does not have to know which labels count. */
  verifiedViews: number;
  verifiedEngagements: number;
};

function foldRows(
  rows: { source: string; views: number; engagements: number }[],
): MetricBreakdown {
  const views = emptyTotals();
  const engagements = emptyTotals();
  for (const r of rows) {
    const s = r.source as MetricSource;
    views[s] += r.views;
    engagements[s] += r.engagements;
  }
  return {
    views,
    engagements,
    verifiedViews: verifiedTotal(views),
    verifiedEngagements: verifiedTotal(engagements),
  };
}

/** One deliverable's figures, by label. */
export async function metricsForDeliverable(
  actor: Actor,
  deliverableId: string,
): Promise<MetricBreakdown> {
  assertAllowed(actor, "metricEvent", "read");

  const deliverable = await prisma.deliverable.findFirst({
    where: { ...whereFor(actor, "deliverable", "read"), id: deliverableId },
    select: { id: true },
  });
  if (!deliverable) throw new ForbiddenError("metricEvent", "read");

  const rows = await prisma.metricDaily.findMany({
    /* tenant-scope: keyed by the deliverable loaded above through whereFor. */
    where: { deliverableId },
    select: { source: true, views: true, engagements: true },
  });
  return foldRows(rows);
}

/**
 * A whole campaign's figures, by label — P7-DATA-02's aggregate.
 *
 * RECOMPUTED FROM THE ROWS, EVERY TIME. There is no aggregate table and no
 * running counter, which is what makes "aggregates are reproducible from
 * events" true by construction rather than by discipline: there is nothing
 * that could drift, because nothing is stored. The rollup job's only purpose
 * is to warm a cache of this, never to become the source of the number.
 */
export async function metricsForCampaign(
  actor: Actor,
  campaignId: string,
): Promise<MetricBreakdown> {
  assertAllowed(actor, "metricAggregate", "read");

  const campaign = await prisma.campaign.findFirst({
    where: { ...whereFor(actor, "campaign", "read"), id: campaignId },
    select: { id: true },
  });
  if (!campaign) throw new ForbiddenError("metricAggregate", "read");

  const rows = await prisma.metricDaily.findMany({
    /* tenant-scope: keyed by the campaign loaded above through whereFor. */
    where: { deliverable: { is: { order: { is: { campaignId } } } } },
    select: { source: true, views: true, engagements: true },
  });
  return foldRows(rows);
}

/** One athlete's figures across everything they have delivered. */
export async function metricsForAthlete(
  actor: Actor,
  athleteId: string,
): Promise<MetricBreakdown> {
  assertAllowed(actor, "metricAggregate", "read");

  const athlete = await prisma.athlete.findFirst({
    where: { ...whereFor(actor, "athlete", "read"), id: athleteId },
    select: { id: true },
  });
  if (!athlete) throw new ForbiddenError("metricAggregate", "read");

  const rows = await prisma.metricDaily.findMany({
    /* tenant-scope: keyed by the athlete loaded above through whereFor. */
    where: { deliverable: { is: { order: { is: { athleteId } } } } },
    select: { source: true, views: true, engagements: true },
  });
  return foldRows(rows);
}

/** Exported for the rollup job and the report assembler. */
export { foldRows, METRIC_SOURCES };
