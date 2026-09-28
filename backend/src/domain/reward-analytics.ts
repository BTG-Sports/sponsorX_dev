/**
 * The analytics story's numbers — P6-FE-03 / P7-FE-04, §9 screen 11, §16, §22.
 *
 * READ-ONLY, RECOMPUTED FROM ROWS EVERY TIME (the P7-DATA-02 rule): nothing
 * here is stored, so nothing can drift from the events it summarises.
 *
 * Tenant-wide by definition — this is BTG's analytics desk, like
 * networkMetrics — so `assertTenantWide` refuses a role with only `own` reach
 * instead of quietly returning a total over one athlete's rows.
 *
 * WHAT EACH NUMBER IS, so the screen can label it honestly:
 *   funnel      — RewardEvent rows in the window, four separate kinds (P6-BE-03)
 *   previous    — the same, for the window before it (the "vs last period" delta)
 *   series      — CLAIM / REDEEM per UTC day in the window
 *   locations   — SCAN rows by resolved city/region (the fan IP is never stored)
 *   offers      — redemptions per reward in the window
 *   athletes    — per athlete: their tokens' SCAN/CLAIM/REDEEM, MetricDaily
 *                 views/engagements BY PROVENANCE (§22 — verified never mixed
 *                 with self-reported), tracking-link clicks, reliability
 *                 (deliverables due in the window that were published on or
 *                 before their due day), revision rate (revision requests per
 *                 deliverable that had work submitted), and the latest §14
 *                 score (null when unscored — never zero).
 */
import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide } from "../auth/scope";
import { AUDIT_ACTIONS } from "../db/audit";
import { isVerified, type MetricSource } from "./metric-source";

export type Funnel = { SCAN: number; LANDING: number; CLAIM: number; REDEEM: number };
type EventType = keyof Funnel;

export type AthletePerformance = {
  athleteId: string;
  name: string;
  sport: string;
  school: string | null;
  scans: number;
  claims: number;
  redeemed: number;
  views: { verified: number; selfReported: number; estimated: number };
  engagements: { verified: number; selfReported: number; estimated: number };
  clicks: number;
  /** Due in the window and published on time, of due in the window; null when none were due. */
  reliability: { onTime: number; due: number } | null;
  /** Revision requests in the window per deliverable with submitted work; null with no submissions. */
  revisionRate: { revisions: number; submitted: number } | null;
  score: number | null;
};

export type AnalyticsWindow = {
  days: number;
  from: string;
  to: string;
  funnel: Funnel;
  previous: Funnel;
  series: { day: string; CLAIM: number; REDEEM: number }[];
  locations: { place: string; scans: number }[];
  offers: { rewardId: string; offer: string; sponsor: string; redeemed: number; claims: number }[];
  athletes: AthletePerformance[];
};

const DAY = 86_400_000;
const zero = (): Funnel => ({ SCAN: 0, LANDING: 0, CLAIM: 0, REDEEM: 0 });
const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function bucket(source: string): "verified" | "selfReported" | "estimated" | null {
  if (isVerified(source as MetricSource)) return "verified";
  if (source === "SELF_REPORTED") return "selfReported";
  if (source === "ESTIMATED") return "estimated";
  return null; // ATTRIBUTED is revenue-side, not reach
}

export async function analyticsWindow(actor: Actor, days: number, now = new Date()): Promise<AnalyticsWindow> {
  assertTenantWide(actor, "metricAggregate", "read");
  const tenantId = actor.tenantId;
  const span = Math.max(1, Math.min(366, Math.round(days)));
  const from = new Date(now.getTime() - span * DAY);
  const prevFrom = new Date(from.getTime() - span * DAY);
  const inWindow = { gte: from, lte: now };

  const [cur, prev, dated, geo, perToken] = await Promise.all([
    prisma.rewardEvent.groupBy({ by: ["type"], where: { tenantId, at: inWindow }, _count: { _all: true } }),
    prisma.rewardEvent.groupBy({ by: ["type"], where: { tenantId, at: { gte: prevFrom, lt: from } }, _count: { _all: true } }),
    prisma.rewardEvent.findMany({
      where: { tenantId, at: inWindow, type: { in: ["CLAIM", "REDEEM"] } },
      select: { type: true, at: true },
    }),
    prisma.rewardEvent.groupBy({
      by: ["city", "region"],
      where: { tenantId, at: inWindow, type: "SCAN", city: { not: null } },
      _count: { _all: true },
    }),
    prisma.rewardEvent.groupBy({ by: ["tokenId", "type"], where: { tenantId, at: inWindow }, _count: { _all: true } }),
  ]);

  const funnel = zero();
  for (const g of cur) funnel[g.type as EventType] = g._count._all;
  const previous = zero();
  for (const g of prev) previous[g.type as EventType] = g._count._all;

  /* One row per day in the window, including empty days — a chart that
     skips quiet days draws a false slope. */
  const days_: Record<string, { CLAIM: number; REDEEM: number }> = {};
  for (let t = from.getTime(); t <= now.getTime(); t += DAY) days_[dayKey(new Date(t))] = { CLAIM: 0, REDEEM: 0 };
  for (const e of dated) {
    const k = dayKey(e.at);
    if (days_[k]) days_[k][e.type as "CLAIM" | "REDEEM"] += 1;
  }
  const series = Object.entries(days_).map(([day, v]) => ({ day, ...v }));

  const locations = geo
    .map((g) => ({ place: [g.city, g.region].filter(Boolean).join(", "), scans: g._count._all }))
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 5);

  /* Tokens → rewards and athletes, for the offer and athlete tables. */
  const tokenIds = [...new Set(perToken.map((g) => g.tokenId))];
  const tokens = tokenIds.length
    ? await prisma.rewardToken.findMany({
        where: { tenantId, id: { in: tokenIds } },
        select: {
          id: true, athleteId: true,
          reward: { select: { id: true, offerText: true, campaign: { select: { sponsor: { select: { name: true } } } } } },
        },
      })
    : [];
  const tokenById = new Map(tokens.map((t) => [t.id, t]));

  const offerMap = new Map<string, { rewardId: string; offer: string; sponsor: string; redeemed: number; claims: number }>();
  const athleteEvents = new Map<string, { scans: number; claims: number; redeemed: number }>();
  for (const g of perToken) {
    const t = tokenById.get(g.tokenId);
    if (!t) continue;
    const n = g._count._all;
    const o = offerMap.get(t.reward.id) ?? {
      rewardId: t.reward.id, offer: t.reward.offerText, sponsor: t.reward.campaign.sponsor.name, redeemed: 0, claims: 0,
    };
    if (g.type === "REDEEM") o.redeemed += n;
    if (g.type === "CLAIM") o.claims += n;
    offerMap.set(t.reward.id, o);
    if (t.athleteId) {
      const a = athleteEvents.get(t.athleteId) ?? { scans: 0, claims: 0, redeemed: 0 };
      if (g.type === "SCAN") a.scans += n;
      if (g.type === "CLAIM") a.claims += n;
      if (g.type === "REDEEM") a.redeemed += n;
      athleteEvents.set(t.athleteId, a);
    }
  }
  const offers = [...offerMap.values()].sort((a, b) => b.redeemed - a.redeemed || b.claims - a.claims);

  /* The roster: everyone with work under contract, plus anyone whose token
     drove events — performance is about the people doing the work. */
  const [metrics, clicks, deliverables, revisions] = await Promise.all([
    prisma.metricDaily.findMany({
      where: { tenantId, day: { gte: new Date(dayKey(from)), lte: now } },
      select: { source: true, views: true, engagements: true, deliverable: { select: { order: { select: { athleteId: true } } } } },
    }),
    prisma.linkEvent.findMany({
      where: { tenantId, at: inWindow },
      select: { link: { select: { deliverable: { select: { order: { select: { athleteId: true } } } } } } },
    }),
    prisma.deliverable.findMany({
      where: { tenantId, order: { state: { notIn: ["CANCELLED", "REJECTED", "DRAFT"] } } },
      select: {
        id: true, dueDate: true, publishedAt: true,
        order: { select: { athleteId: true } },
        _count: { select: { assets: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { tenantId, entity: "Deliverable", action: AUDIT_ACTIONS.deliverable.requestRevision, at: inWindow },
      select: { entityId: true },
    }),
  ]);

  const athleteIds = new Set<string>([...athleteEvents.keys(), ...deliverables.map((d) => d.order.athleteId)]);
  const people = athleteIds.size
    ? await prisma.athlete.findMany({
        where: { tenantId, id: { in: [...athleteIds] } },
        select: {
          id: true, displayName: true, sport: true, school: true,
          scores: { select: { score: true }, orderBy: { scoredAt: "desc" }, take: 1 },
        },
      })
    : [];

  const delivOwner = new Map(deliverables.map((d) => [d.id, d.order.athleteId]));
  const perf = new Map<string, AthletePerformance>();
  for (const p of people) {
    const ev = athleteEvents.get(p.id) ?? { scans: 0, claims: 0, redeemed: 0 };
    perf.set(p.id, {
      athleteId: p.id, name: p.displayName, sport: p.sport, school: p.school,
      scans: ev.scans, claims: ev.claims, redeemed: ev.redeemed,
      views: { verified: 0, selfReported: 0, estimated: 0 },
      engagements: { verified: 0, selfReported: 0, estimated: 0 },
      clicks: 0, reliability: null, revisionRate: null,
      score: p.scores[0]?.score ?? null,
    });
  }
  for (const m of metrics) {
    const a = perf.get(m.deliverable.order.athleteId);
    const b = bucket(m.source);
    if (!a || !b) continue;
    a.views[b] += m.views;
    a.engagements[b] += m.engagements;
  }
  for (const c of clicks) {
    const a = perf.get(c.link.deliverable.order.athleteId);
    if (a) a.clicks += 1;
  }
  const endOfDay = (d: Date) => new Date(dayKey(d) + "T23:59:59.999Z").getTime();
  for (const d of deliverables) {
    const a = perf.get(d.order.athleteId);
    if (!a) continue;
    if (d.dueDate >= from && d.dueDate <= now) {
      const r = a.reliability ?? { onTime: 0, due: 0 };
      r.due += 1;
      if (d.publishedAt && d.publishedAt.getTime() <= endOfDay(d.dueDate)) r.onTime += 1;
      a.reliability = r;
    }
    if (d._count.assets > 0) {
      const r = a.revisionRate ?? { revisions: 0, submitted: 0 };
      r.submitted += 1;
      a.revisionRate = r;
    }
  }
  for (const rv of revisions) {
    const owner = delivOwner.get(rv.entityId);
    const a = owner ? perf.get(owner) : undefined;
    if (!a) continue;
    a.revisionRate = { submitted: a.revisionRate?.submitted ?? 0, revisions: (a.revisionRate?.revisions ?? 0) + 1 };
  }

  const athletes = [...perf.values()].sort(
    (a, b) => b.redeemed - a.redeemed || b.claims - a.claims || b.views.verified - a.views.verified,
  );

  return { days: span, from: from.toISOString(), to: now.toISOString(), funnel, previous, series, locations, offers, athletes };
}
