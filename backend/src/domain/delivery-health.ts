/**
 * Is this campaign actually delivering? — P7-DATA-04, §22, §9 screen 9.
 *
 * "Detect when a campaign is delivering less than promised, and surface it
 * before the sponsor notices." The whole value is in the last five words: by
 * the time a sponsor asks why nothing has been posted, the renewal
 * conversation has already gone badly. This is the query the operations
 * dashboard runs so somebody at BTG hears it first.
 *
 * TWO KINDS OF UNDER-DELIVERY, AND THEY ARE NOT THE SAME PROBLEM.
 *
 * WORK not delivered — deliverables past their due date that are not
 * VERIFIED. This is a fact about our own records, it is unambiguous, and it
 * is actionable today: someone chases the athlete.
 *
 * REACH below what was projected — verified impressions falling short of
 * `projectedImpressions`. This is softer: the projection was usually built
 * from self-reported follower counts (P7-DATA-03), so a shortfall may mean
 * the athlete over-stated their audience rather than that anything went
 * wrong. It is reported separately and never dressed up as a breach.
 *
 * Collapsing the two into one "health score" would hide which of them is
 * happening, and they need different phone calls.
 */

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { isVerified, type MetricSource } from "./metric-source";
import { clampPage, pageInfo, readPage, type PageInfo, type PageRequest } from "../lib/paging";

export type DeliveryHealth = {
  campaignId: string;
  campaignName: string;
  endDate: Date;
  deliverablesTotal: number;
  deliverablesVerified: number;
  /** Past their due date and not VERIFIED. The actionable number. */
  deliverablesOverdue: number;
  /** Sum of frozen projections across the campaign's lines; null when no
   *  line carried one. */
  projectedImpressions: number | null;
  /** Verified impressions only — a self-reported figure cannot evidence
   *  delivery against a promise. */
  verifiedImpressions: number;
  /** True where work is overdue. Unambiguous and actionable. */
  underDeliveringWork: boolean;
  /** True where verified reach is below the shortfall threshold. Softer —
   *  see the note at the top of this file. */
  underDeliveringReach: boolean;
};

/**
 * Below this share of the projection, reach counts as short.
 *
 * 0.7 rather than 1.0 because the projection is an estimate built mostly from
 * self-reported figures: flagging every campaign that lands at 99% would make
 * the signal worthless within a week, which is how dashboards get ignored.
 */
export const REACH_SHORTFALL_THRESHOLD = 0.7;

/** Pure, so the rule is testable without a database. */
export function assessDelivery(input: {
  deliverablesTotal: number;
  deliverablesVerified: number;
  deliverablesOverdue: number;
  projectedImpressions: number | null;
  verifiedImpressions: number;
}): { underDeliveringWork: boolean; underDeliveringReach: boolean } {
  return {
    underDeliveringWork: input.deliverablesOverdue > 0,
    /* No projection means no claim to fall short of. Silence is correct. */
    underDeliveringReach:
      input.projectedImpressions !== null &&
      input.projectedImpressions > 0 &&
      input.verifiedImpressions <
        input.projectedImpressions * REACH_SHORTFALL_THRESHOLD,
  };
}

/**
 * Delivery health for every live campaign in the tenant.
 *
 * ACTIVE and REPORTING only: a DRAFT campaign has nothing to deliver and a
 * COMPLETED one is settled, so including either would fill the dashboard with
 * rows nobody can act on.
 */
const HEALTH_SELECT = {
  id: true, name: true, endDate: true,
  orders: {
    select: {
      projectedImpressions: true,
      deliverables: {
        select: {
          state: true, dueDate: true,
          metrics: { select: { source: true, views: true } },
        },
      },
    },
  },
} as const;

type HealthRow = {
  id: string; name: string; endDate: Date;
  orders: {
    projectedImpressions: number | null;
    deliverables: { state: string; dueDate: Date; metrics: { source: string; views: number }[] }[];
  }[];
};

export async function deliveryHealth(
  actor: Actor,
  now = new Date(),
): Promise<DeliveryHealth[]> {
  assertAllowed(actor, "metricAggregate", "read");

  const campaigns = await prisma.campaign.findMany({
    where: {
      ...whereFor(actor, "campaign", "read"),
      state: { in: ["ACTIVE", "REPORTING"] },
    },
    select: HEALTH_SELECT,
  });

  return campaigns.map((c) => healthOf(c, now));
}

/**
 * One PAGE of delivery health (2026-09-29, `?page=` on the endpoint), ending
 * soonest first. `projected` keeps only campaigns carrying a reach
 * projection — "a positive sum of frozen projections", which for
 * non-negative projections is "some line projected above zero", so it is a
 * WHERE and the page is the database's. `under` (the flagged ones) is not a
 * column: the rule reads summed verified views, so it's evaluated over the
 * live set and the result paged; the total is still exact.
 */
export async function deliveryHealthPage(
  actor: Actor,
  req: PageRequest,
  opts: { under?: boolean; projected?: boolean } = {},
  now = new Date(),
): Promise<{ campaigns: DeliveryHealth[]; page: PageInfo }> {
  assertAllowed(actor, "metricAggregate", "read");
  const where = {
    AND: [
      whereFor(actor, "campaign", "read"),
      { state: { in: ["ACTIVE", "REPORTING"] as ("ACTIVE" | "REPORTING")[] } },
      ...(opts.projected ? [{ orders: { some: { projectedImpressions: { gt: 0 } } } }] : []),
    ],
  };
  const orderBy = [{ endDate: "asc" as const }, { id: "asc" as const }];

  if (opts.under) {
    const all = (await prisma.campaign.findMany({
      where /* tenant-scope: AND[whereFor(campaign), …] */,
      select: HEALTH_SELECT,
      orderBy,
    })) as HealthRow[];
    const flagged = all.map((c) => healthOf(c, now)).filter((h) => h.underDeliveringWork || h.underDeliveringReach);
    const at = clampPage(req, flagged.length);
    return { campaigns: flagged.slice(at.skip, at.skip + at.take), page: pageInfo(at, flagged.length) };
  }

  const { rows, page } = await readPage(
    req,
    () => prisma.campaign.count({ where /* tenant-scope: AND[whereFor(campaign), …] */ }),
    (skip, take) =>
      prisma.campaign.findMany({
        where /* tenant-scope: AND[whereFor(campaign), …] */,
        select: HEALTH_SELECT,
        orderBy,
        skip,
        take,
      }) as unknown as Promise<HealthRow[]>,
  );
  return { campaigns: rows.map((c) => healthOf(c, now)), page };
}

function healthOf(c: HealthRow, now: Date): DeliveryHealth {
  let total = 0;
  let verified = 0;
  let overdue = 0;
  let projected: number | null = null;
  let verifiedImpressions = 0;

  for (const order of c.orders) {
    if (order.projectedImpressions !== null) {
      projected = (projected ?? 0) + order.projectedImpressions;
    }
    for (const d of order.deliverables) {
      total += 1;
      if (d.state === "VERIFIED") verified += 1;
      /* Overdue is about the DATE and the STATE together — work that is
         late and still not signed off. */
      else if (d.dueDate.getTime() < now.getTime()) overdue += 1;

      for (const m of d.metrics) {
        if (isVerified(m.source as MetricSource)) verifiedImpressions += m.views;
      }
    }
  }

  return {
    campaignId: c.id,
    campaignName: c.name,
    endDate: c.endDate,
    deliverablesTotal: total,
    deliverablesVerified: verified,
    deliverablesOverdue: overdue,
    projectedImpressions: projected,
    verifiedImpressions,
    ...assessDelivery({
      deliverablesTotal: total,
      deliverablesVerified: verified,
      deliverablesOverdue: overdue,
      projectedImpressions: projected,
      verifiedImpressions,
    }),
  };
}

/** Just the campaigns in trouble — what the dashboard actually shows. */
export async function underDeliveringCampaigns(
  actor: Actor,
  now = new Date(),
): Promise<DeliveryHealth[]> {
  const all = await deliveryHealth(actor, now);
  return all.filter((c) => c.underDeliveringWork || c.underDeliveringReach);
}
