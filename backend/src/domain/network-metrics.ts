/**
 * Network and marketplace-learning metrics — P7-DATA-05, §22.
 *
 * The numbers BTG runs the business on, as opposed to the ones a sponsor
 * reads: how many athletes are actually working, what the network pays out,
 * what a job sells for, where the margin is.
 *
 * EVERY FIGURE IS COMPUTED FROM ROWS, NEVER STORED. Same rule as the metric
 * rollup (P7-DATA-02): a stored business metric drifts from the records
 * behind it the first time anything is backdated, and then nobody can say
 * which is right. These are a handful of aggregates over indexed columns, so
 * there is no performance argument for caching them either.
 *
 * NO REACH FIGURES LIVE HERE. Everything below is money and counts —
 * earnings, prices, margins, participation. Those come from our own records
 * and are facts. Audience numbers are mostly self-reported (§22), so they
 * belong with the provenance-labelled metrics in `metric.ts` and not mixed
 * into a dashboard of things we actually know.
 */

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";

export type NetworkMetrics = {
  /** Athletes in ACTIVE state — the roster that can be sold. */
  activeAthletes: number;
  /** Of those, how many hold at least one non-cancelled order. */
  participatingAthletes: number;
  /** participating / active, to four places. 0 when there are no athletes. */
  participationRate: number;
  /**
   * Athletes with work in progress right now, as a share of active. The
   * difference from participation is time: participation counts anyone ever
   * engaged, utilisation counts who is engaged today.
   */
  utilisationRate: number;
  /** cents — gross earnings raised, at every state including PENDING. */
  totalEarnings: number;
  /** cents — earnings actually recorded as PAID. */
  totalPaid: number;
  /** cents — mean athlete compensation per non-cancelled order. */
  averageJobPay: number;
  /** cents — mean sponsor price per non-cancelled order. */
  averageSellPrice: number;
};

export type JobEconomics = {
  jobId: string;
  orders: number;
  /** cents */
  averageSellPrice: number;
  /** cents */
  averageCompensation: number;
  /** cents — sell minus compensation, summed */
  totalMargin: number;
  /** Margin as a share of sell price, to four places. */
  marginRate: number;
};

const LIVE_ORDER = { state: { not: "CANCELLED" as const } };

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10000) / 10000;
}

/**
 * The network-level figures.
 *
 * Tenant-wide by definition — these are BTG's own numbers, and §15 gives no
 * sponsor or athlete a network view. `assertTenantWide` rather than
 * `assertAllowed`, so a role with only `own` reach is refused outright
 * instead of quietly receiving a total computed over one row.
 */
export async function networkMetrics(actor: Actor): Promise<NetworkMetrics> {
  assertTenantWide(actor, "metricAggregate", "read");
  const tenant = { tenantId: actor.tenantId };

  const [activeAthletes, participating, utilised, earnings, paid, orderAgg] =
    await Promise.all([
      prisma.athlete.count({ where: { ...tenant, state: "ACTIVE" } }),
      prisma.athlete.count({
        where: { ...tenant, state: "ACTIVE", orders: { some: LIVE_ORDER } },
      }),
      prisma.athlete.count({
        where: {
          ...tenant, state: "ACTIVE",
          orders: { some: { state: { in: ["ACCEPTED", "ACTIVE"] } } },
        },
      }),
      prisma.earning.aggregate({ where: tenant, _sum: { gross: true, adjustment: true } }),
      prisma.earning.aggregate({
        where: { ...tenant, state: "PAID" },
        _sum: { gross: true, adjustment: true },
      }),
      prisma.campaignOrder.aggregate({
        where: { ...tenant, ...LIVE_ORDER },
        _avg: { compensation: true, sellPrice: true },
        _count: { _all: true },
      }),
    ]);

  /* Earnings are gross plus adjustment — the adjustment is part of what the
     athlete is owed, and a total that ignored it would understate payouts by
     exactly the corrections BTG made. */
  const totalEarnings = (earnings._sum.gross ?? 0) + (earnings._sum.adjustment ?? 0);
  const totalPaid = (paid._sum.gross ?? 0) + (paid._sum.adjustment ?? 0);

  return {
    activeAthletes,
    participatingAthletes: participating,
    participationRate: rate(participating, activeAthletes),
    utilisationRate: rate(utilised, activeAthletes),
    totalEarnings,
    totalPaid,
    averageJobPay: Math.round(orderAgg._avg.compensation ?? 0),
    averageSellPrice: Math.round(orderAgg._avg.sellPrice ?? 0),
  };
}

/**
 * Margin by job — "average sell price by job and margin by package".
 *
 * Grouped by `jobId` rather than by package: a package is a bundle a sponsor
 * buys, but the margin is earned per line, and a package's margin is just the
 * sum of its lines'. Reporting it per job is the finer grain and the package
 * figure can be summed from it, where the reverse is not true.
 */
export async function jobEconomics(actor: Actor): Promise<JobEconomics[]> {
  assertTenantWide(actor, "metricAggregate", "read");

  const grouped = await prisma.campaignOrder.groupBy({
    by: ["jobId"],
    where: { ...whereFor(actor, "campaignOrder", "read"), ...LIVE_ORDER },
    _avg: { sellPrice: true, compensation: true },
    _sum: { sellPrice: true, compensation: true },
    _count: { _all: true },
  });

  return grouped
    .map((g) => {
      const sell = g._sum.sellPrice ?? 0;
      const cost = g._sum.compensation ?? 0;
      return {
        jobId: g.jobId,
        orders: g._count._all,
        averageSellPrice: Math.round(g._avg.sellPrice ?? 0),
        averageCompensation: Math.round(g._avg.compensation ?? 0),
        totalMargin: sell - cost,
        marginRate: rate(sell - cost, sell),
      };
    })
    .sort((a, b) => b.totalMargin - a.totalMargin);
}
