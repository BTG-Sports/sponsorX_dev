/**
 * The sponsor's overview — P1-ART-23 (the Stadium Board dashboard and the
 * campaign results chart).
 *
 * One read for everything a sponsor's home page shows over a chosen window
 * (7 / 30 / 90 days, or all time): reach by day, clicks, the fan funnel, the
 * best athletes and cities, delivery, money and what is waiting on them.
 * Computed in the database over the sponsor's own campaigns — the campaign
 * list comes from whereFor(actor, "campaign", "read") and every later read is
 * keyed by those ids, so nothing outside the scope can be counted.
 *
 * NEVER BLENDED (metric.ts, §22): "people reached" is VERIFIED_API +
 * VERIFIED_MANUAL only; self-reported, estimated and attributed views are
 * returned beside it, by source, and are never added in. The cost per 1,000
 * is the report's own mediaValueFor over ALL-TIME spend (the report's own
 * spend rule, sponsorSpendCents / sponsorSpendFor) and verified views, so the
 * dashboard and the report cannot disagree. No benchmark — Phase 1 holds
 * none (sponsor-report.ts).
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertAllowed, can, scopeOf, whereFor } from "../auth/scope";
import { canReadField } from "../auth/fields";
import { ForbiddenError } from "../auth/errors";
import { mediaValueFor, NOT_LIVE_ORDER_STATES, sponsorSpendFor } from "./sponsor-report";
import { METRIC_SOURCES, type MetricSource } from "./metric-source";
import type { DeliverableState } from "./deliverable-state";

export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];

const DAY = 86_400_000;
const VERIFIED: readonly string[] = ["VERIFIED_API", "VERIFIED_MANUAL"];
/* Mutable element types, not `readonly` — Prisma's generated `notIn` filters
   (EnumDeliverableStateFilter, EnumOrderStateFilter) want DeliverableState[] /
   OrderState[] exactly, and a readonly array is not assignable to that
   (NOT_LIVE_ORDER_STATES, sponsor-report.ts, is typed the same way). */
const DELIVERED: DeliverableState[] = ["PUBLISHED", "VERIFIED"];
const LIVE_ORDER = { state: { notIn: NOT_LIVE_ORDER_STATES } };
/** Scopes that reach every campaign of a tenant BTG runs: the staff side of
 *  the gate below. `operated` is included for parity with other resources'
 *  tenant-wide reach, though `campaign`'s own builder does not use it today. */
const TENANT_WIDE_SCOPES = new Set(["any", "own-tenant", "operated"]);

export type Window = { key: RangeKey; from: Date; to: Date; days: number; bucket: "day" | "week"; prevFrom: Date | null };
export type DailyPoint = { day: string; views: number; clicks: number; redeems: number };

export type SponsorOverview = {
  readAt: string;
  range: { key: RangeKey; from: string; to: string; days: number; bucket: "day" | "week" };
  reach: {
    verifiedViews: number;
    verifiedEngagements: number;
    otherViews: number;
    prev: { verifiedViews: number; verifiedEngagements: number } | null;
    bySource: Record<MetricSource, number>;
  };
  clicks: { total: number; prev: number | null };
  fans: { scan: number; landing: number; claim: number; redeem: number; prevRedeem: number | null };
  daily: DailyPoint[];
  today: { views: number; redeems: number };
  delivery: { due: number; delivered: number; late: number; nextDueAt: string | null };
  topAthletes: { athleteId: string; name: string; sport: string | null; views: number }[];
  topCities: { city: string; region: string | null; redeems: number }[];
  money?: { contractedCents: number; invoicedCents?: number; paidCents?: number };
  costPer1000Cents: number | null;
  /** `ordersToPay` counts the sponsor's marketplace orders waiting on payment.
   *  Marketplace orders are not per-campaign, so it is always 0 when the
   *  overview is read for one campaign (`campaignId`). */
  needsYou: { postsToReview: number; ordersToPay: number; invoicesUnpaid?: number };
  campaigns: { total: number; running: number };
};

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The window a range covers: [from, to), `to` = tomorrow 00:00 UTC so today counts. */
export function windowFor(key: RangeKey, now: Date, earliest: Date | null): Window {
  const to = new Date(startOfDay(now).getTime() + DAY);
  if (key === "all") {
    const from = startOfDay(earliest && earliest < now ? earliest : now);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
    return { key, from, to, days, bucket: days > 120 ? "week" : "day", prevFrom: null };
  }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[key];
  const from = new Date(to.getTime() - days * DAY);
  return { key, from, to, days, bucket: "day", prevFrom: new Date(from.getTime() - days * DAY) };
}

/** Every bucket in the window, zero where nothing happened. Weeks start at `from`. */
export function zeroFill(w: Window, rows: { day: Date; views?: number; clicks?: number; redeems?: number }[]): DailyPoint[] {
  const step = w.bucket === "week" ? 7 : 1;
  const n = Math.ceil(w.days / step);
  const out: DailyPoint[] = Array.from({ length: n }, (_, i) => ({
    day: iso(new Date(w.from.getTime() + i * step * DAY)), views: 0, clicks: 0, redeems: 0,
  }));
  for (const r of rows) {
    const i = Math.floor((startOfDay(r.day).getTime() - w.from.getTime()) / (step * DAY));
    if (i < 0 || i >= n) continue;
    out[i]!.views += r.views ?? 0;
    out[i]!.clicks += r.clicks ?? 0;
    out[i]!.redeems += r.redeems ?? 0;
  }
  return out;
}

type DayCount = { day: Date; n: number };
type DayTypeCount = { day: Date; type: string; n: number };

export async function sponsorOverview(
  actor: Actor,
  opts: { range: RangeKey; campaignId?: string },
  now = new Date(),
): Promise<SponsorOverview> {
  assertAllowed(actor, "metricAggregate", "read");

  /* Refused for any caller that is neither a sponsor (reading its own
     campaigns) nor tenant-wide BTG staff. `assertAllowed` above only checks
     metricAggregate; an ATHLETE or PROPERTY_MGR holds a real (if narrow)
     campaign scope — "assigned" / "own-property" — and whereFor would quietly
     hand back MATCHES_NOTHING rather than refuse. This dashboard is the
     sponsor's and BTG's, not every role that can see a campaign at all. */
  const campaignScope = scopeOf(actor, "campaign", "read");
  const isSponsorCaller = campaignScope === "own" && !!actor.sponsorId;
  const isTenantWideStaff = TENANT_WIDE_SCOPES.has(campaignScope);
  if (!isSponsorCaller && !isTenantWideStaff) throw new ForbiddenError("campaign", "read");

  const campaigns = await prisma.campaign.findMany({
    /* tenant-scope: whereFor(actor, "campaign", "read") is the first AND term; campaignId only narrows it. */
    where: { AND: [whereFor(actor, "campaign", "read"), ...(opts.campaignId ? [{ id: opts.campaignId }] : [])] },
    select: { id: true, state: true, startDate: true },
  });
  if (opts.campaignId && campaigns.length === 0) throw new ForbiddenError("campaign", "read");

  const ids = campaigns.map((c) => c.id);
  const earliest = campaigns.reduce<Date | null>((m, c) => (!m || c.startDate < m ? c.startDate : m), null);
  const w = windowFor(opts.range, now, earliest);
  const since = w.prevFrom ?? w.from;
  const today = startOfDay(now);
  const has = ids.length > 0;

  const seeValue = canReadField(actor.roles, "campaign.value") && canReadField(actor.roles, "campaignOrder.sellPrice");
  const seeInvoices = seeValue && can(actor, "invoice", "read");
  const seeOrders = can(actor, "marketplaceOrder", "read");
  const inScope = { order: { campaignId: { in: ids } } };
  const liveScope = { order: { campaignId: { in: ids }, ...LIVE_ORDER } };

  /* Every call below carries this note INSIDE its own parens (immediately
     after the opening brace, or beside its raw SQL) — tests/tenant-scope.static.test.ts
     checks each call's own argument text, not a comment left above it. */
  const [metricRows, prevMetric, allVerified, clickRows, eventRows, athleteRows, cityRows, byState, late, nextDue, contracted, invoices, toReview, toPay] =
    await Promise.all([
      prisma.metricDaily.groupBy({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ by: ["day", "source"], where: { deliverable: inScope, day: { gte: w.from, lt: w.to } }, _sum: { views: true, engagements: true } }),
      w.prevFrom
        ? prisma.metricDaily.groupBy({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ by: ["source"], where: { deliverable: inScope, day: { gte: w.prevFrom, lt: w.from } }, _sum: { views: true, engagements: true } })
        : Promise.resolve(null),
      prisma.metricDaily.aggregate({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ where: { deliverable: inScope, source: { in: VERIFIED as MetricSource[] } }, _sum: { views: true } }),
      has
        ? prisma.$queryRaw<DayCount[]>`
            /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
            SELECT date_trunc('day', e."at") AS day, COUNT(*)::int AS n
            FROM "LinkEvent" e
            JOIN "TrackingLink" l ON l."id" = e."linkId"
            JOIN "Deliverable" d ON d."id" = l."deliverableId"
            JOIN "CampaignOrder" o ON o."id" = d."orderId"
            WHERE o."campaignId" = ANY(${ids}::text[]) AND e."at" >= ${since} AND e."at" < ${w.to}
            GROUP BY 1`
        : Promise.resolve([] as DayCount[]),
      has
        ? prisma.$queryRaw<DayTypeCount[]>`
            /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
            SELECT date_trunc('day', e."at") AS day, e."type"::text AS type, COUNT(*)::int AS n
            FROM "RewardEvent" e
            JOIN "RewardToken" t ON t."id" = e."tokenId"
            JOIN "Reward" r ON r."id" = t."rewardId"
            WHERE r."campaignId" = ANY(${ids}::text[]) AND e."at" >= ${since} AND e."at" < ${w.to}
            GROUP BY 1, 2`
        : Promise.resolve([] as DayTypeCount[]),
      has
        ? prisma.$queryRaw<{ id: string; views: number }[]>`
            /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
            SELECT o."athleteId" AS id, SUM(m."views")::float8 AS views
            FROM "MetricDaily" m
            JOIN "Deliverable" d ON d."id" = m."deliverableId"
            JOIN "CampaignOrder" o ON o."id" = d."orderId"
            WHERE o."campaignId" = ANY(${ids}::text[]) AND m."source"::text IN ('VERIFIED_API', 'VERIFIED_MANUAL')
              AND m."day" >= ${w.from} AND m."day" < ${w.to}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 5`
        : Promise.resolve([] as { id: string; views: number }[]),
      prisma.rewardEvent.groupBy({
        /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */
        by: ["city", "region"],
        where: { type: "REDEEM", city: { not: null }, at: { gte: w.from, lt: w.to }, token: { reward: { campaignId: { in: ids } } } },
        _count: { _all: true },
        /* Only the orderBy needs the escape hatch: it orders by `_count.city`,
           a field outside `by`, which groupBy's generic typing cannot model —
           the where, select and take above all check normally. */
        orderBy: { _count: { city: "desc" } } as never,
        take: 5,
      }),
      prisma.deliverable.groupBy({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ by: ["state"], where: liveScope, _count: { _all: true } }),
      prisma.deliverable.count({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ where: { ...liveScope, state: { notIn: DELIVERED }, dueDate: { lt: now } } }),
      prisma.deliverable.findFirst({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ where: { ...liveScope, state: { notIn: DELIVERED }, dueDate: { gte: now } }, orderBy: { dueDate: "asc" }, select: { dueDate: true } }),
      /* THE spend rule (sponsor-report.ts sponsorSpendCents), summed over the
         whereFor-scoped campaign ids above: live orders + ad placements. */
      seeValue ? sponsorSpendFor(ids) : Promise.resolve(null),
      seeInvoices
        ? prisma.campaignInvoice.groupBy({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ by: ["status"], where: { campaignId: { in: ids } }, _sum: { amount: true }, _count: { _all: true } })
        : Promise.resolve(null),
      /* posts waiting on the sponsor — liveScope, not inScope: a post on a
         cancelled or rejected order should not sit in anyone's review queue. */
      prisma.deliverable.count({ /* tenant-scope: keyed by the whereFor-scoped campaign ids above. */ where: { ...liveScope, state: "SPONSOR_REVIEW" } }),
      /* "Orders to pay" (needsYou.ordersToPay) matches the Orders page's own
         "To pay" tab (marketplace-order.ts's ORDER_TABS): APPROVED and
         AWAITING_PAYMENT both wait on the sponsor's payment. */
      /* Marketplace orders are not per-campaign, so a single-campaign read
         answers 0 rather than the sponsor's whole queue under one campaign. */
      seeOrders && !opts.campaignId
        ? prisma.marketplaceOrder.count({ where: { AND: [whereFor(actor, "marketplaceOrder", "read"), { state: { in: ["APPROVED", "AWAITING_PAYMENT"] } }] } })
        : Promise.resolve(0),
    ]);

  /* reach — by source, verified kept apart */
  const bySource = Object.fromEntries(METRIC_SOURCES.map((s) => [s, 0])) as Record<MetricSource, number>;
  let verifiedViews = 0;
  let verifiedEngagements = 0;
  let otherViews = 0;
  let todayViews = 0;
  for (const r of metricRows) {
    const v = r._sum.views ?? 0;
    bySource[r.source as MetricSource] += v;
    if (VERIFIED.includes(r.source)) {
      verifiedViews += v;
      verifiedEngagements += r._sum.engagements ?? 0;
      if (startOfDay(r.day).getTime() === today.getTime()) todayViews += v;
    } else otherViews += v;
  }
  const prev = prevMetric
    ? prevMetric.filter((r) => VERIFIED.includes(r.source)).reduce(
        (a, r) => ({ verifiedViews: a.verifiedViews + (r._sum.views ?? 0), verifiedEngagements: a.verifiedEngagements + (r._sum.engagements ?? 0) }),
        { verifiedViews: 0, verifiedEngagements: 0 },
      )
    : null;

  /* clicks and the fan funnel — current window vs the one before it */
  const inWindow = (d: Date) => d >= w.from;
  const clicks = clickRows.filter((r) => inWindow(r.day)).reduce((n, r) => n + r.n, 0);
  const prevClicks = w.prevFrom ? clickRows.filter((r) => !inWindow(r.day)).reduce((n, r) => n + r.n, 0) : null;
  const fans = { scan: 0, landing: 0, claim: 0, redeem: 0 };
  let prevRedeem = 0;
  let todayRedeems = 0;
  for (const r of eventRows) {
    const key = r.type.toLowerCase() as keyof typeof fans;
    if (!(key in fans)) continue;
    if (inWindow(r.day)) {
      fans[key] += r.n;
      if (key === "redeem" && startOfDay(r.day).getTime() === today.getTime()) todayRedeems += r.n;
    } else if (key === "redeem") prevRedeem += r.n;
  }

  const daily = zeroFill(w, [
    ...metricRows.filter((r) => VERIFIED.includes(r.source)).map((r) => ({ day: r.day, views: r._sum.views ?? 0 })),
    ...clickRows.filter((r) => inWindow(r.day)).map((r) => ({ day: r.day, clicks: r.n })),
    ...eventRows.filter((r) => inWindow(r.day) && r.type === "REDEEM").map((r) => ({ day: r.day, redeems: r.n })),
  ]);

  /* names for the leaderboard */
  const athletes = athleteRows.length
    ? await prisma.athlete.findMany({
        /* tenant-scope: athletes named on the whereFor-scoped campaigns' own orders. */
        where: { id: { in: athleteRows.map((a) => a.id) } },
        select: { id: true, displayName: true, sport: true },
      })
    : [];
  const name = new Map(athletes.map((a) => [a.id, a]));

  /* delivery */
  const due = byState.reduce((n, r) => n + r._count._all, 0);
  const delivered = byState.filter((r) => DELIVERED.includes(r.state)).reduce((n, r) => n + r._count._all, 0);

  /* money — the /campaigns/summary gate: a figure the role can't read is absent */
  const live = (invoices ?? []).filter((i) => i.status.toLowerCase() !== "void");
  /* contractedCents keeps its meaning — the live orders' sell price alone;
     the cost per 1,000 uses the whole spend (orders + ad placements), the
     same figure the report's media value uses. */
  const contractedCents = contracted?.ordersCents ?? 0;
  const spendCents = contracted?.spendCents ?? 0;
  const allTimeVerified = allVerified._sum.views ?? 0;

  return {
    readAt: now.toISOString(),
    range: { key: w.key, from: iso(w.from), to: iso(new Date(w.to.getTime() - DAY)), days: w.days, bucket: w.bucket },
    reach: { verifiedViews, verifiedEngagements, otherViews, prev, bySource },
    clicks: { total: clicks, prev: prevClicks },
    fans: { ...fans, prevRedeem: w.prevFrom ? prevRedeem : null },
    daily,
    today: { views: todayViews, redeems: todayRedeems },
    delivery: { due, delivered, late, nextDueAt: nextDue?.dueDate.toISOString() ?? null },
    topAthletes: athleteRows.map((a) => ({ athleteId: a.id, name: name.get(a.id)?.displayName ?? "Athlete", sport: name.get(a.id)?.sport ?? null, views: a.views })),
    topCities: cityRows.map((c) => {
      /* The `as never` on rewardEvent.groupBy's orderBy above widens this
         result's inferred type; the shape is still exactly what was asked for. */
      const row = c as unknown as { city: string | null; region: string | null; _count: { _all: number } };
      return { city: row.city!, region: row.region, redeems: row._count._all };
    }),
    /* Money follows the /campaigns/summary gate exactly: `money` (with
       `contractedCents`) only if `seeValue`; `invoicedCents`/`paidCents` only
       if `seeInvoices` too — never a 0 standing in for "can't read this". */
    ...(seeValue
      ? {
          money: {
            contractedCents,
            ...(seeInvoices
              ? {
                  invoicedCents: live.reduce((n, i) => n + (i._sum.amount ?? 0), 0),
                  paidCents: live.filter((i) => i.status.toLowerCase() === "paid").reduce((n, i) => n + (i._sum.amount ?? 0), 0),
                }
              : {}),
          },
        }
      : {}),
    costPer1000Cents: seeValue && allTimeVerified > 0 ? mediaValueFor({ spend: spendCents, verifiedViews: allTimeVerified }).amount : null,
    needsYou: {
      postsToReview: toReview,
      ordersToPay: toPay,
      ...(seeInvoices ? { invoicesUnpaid: live.filter((i) => i.status.toLowerCase() !== "paid").reduce((n, i) => n + i._count._all, 0) } : {}),
    },
    campaigns: { total: campaigns.length, running: campaigns.filter((c) => c.state === "ACTIVE").length },
  };
}
