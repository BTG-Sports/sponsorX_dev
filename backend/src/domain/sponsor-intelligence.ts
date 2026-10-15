/**
 * The sponsor's intelligence hub — 3S7-BE-02 (documentation/SponsorX-Hub-Intelligence.md),
 * read by 3S7-FE-01 (/sponsor/intelligence; contract: frontend/src/lib/sponsor-intelligence-live.ts).
 *
 * SCOPE. Only the caller's own sponsor org, in its tenant: the org comes from
 * the actor (Actor.sponsorId), never the request, so there is nothing to
 * tamper with (`sponsorIntelligence`, RBAC matrix §32).
 *
 * SOURCES. Delivery and money from the fact ledger's daily summaries
 * (3S1-BE-01), never the warehouse; redemptions from REDEEM events; the
 * market price per 1,000 views from the tenant's benchmark (3S1-DATA-03);
 * renewal advice from each campaign's latest forecast (3S4-BE-01).
 *
 * THE FOUR ATTRIBUTION CLASSES ARE NEVER ADDED TOGETHER (user, 2026-10-15):
 *   VERIFIED_REDEMPTION    fans who redeemed — counted by SponsorX, no money;
 *   VERIFIED_TRANSACTION   0 until partner-store data exists (Sprint 3S6);
 *   MODELLED               0 until then too;
 *   ESTIMATED_MEDIA_VALUE  verified views × the tenant's benchmark median
 *                          price per 1,000 — an estimate, never revenue;
 *                          null with no benchmark.
 *
 * AUDIENCE SEGMENTS are always empty: nothing on file names a real source
 * for an audience breakdown, and a segment without one is never shown
 * (user, 2026-10-15).
 */
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { assertAllowed } from "../auth/scope";
import { prisma } from "../db/client";
import { BENCHMARK_METRIC } from "./benchmarks";
import { windowFor, type RangeKey } from "./overview-window";
import { AT_RISK_BELOW, WATCH_BELOW } from "./forecast-rules";

export const SPONSOR_INTEL_VERSION = "sponsor-intel@1.0.0";
export const RENEWAL_VERSION = "renewal-rules@1.0.0";
/** Renewal advice covers campaigns ending this many days ahead… */
export const RENEWAL_AHEAD_DAYS = 45;
/** …and those that ended this many days ago. */
export const RENEWAL_BEHIND_DAYS = 30;
/** A partner's score is fully trusted from this many published deliverables. */
export const PARTNER_FULL_CONFIDENCE_POSTS = 5;

const DAY_MS = 86_400_000;
const n = (x: number) => Math.round(x).toLocaleString("en-US");
const round2 = (x: number) => Math.round(x * 100) / 100;

/** The NIL jobs (nil-jobs.ts) as inventory kinds, so the hub speaks one format vocabulary. */
export const NIL_JOB_FORMAT: Record<string, string> = {
  "SX-01": "SOCIAL_POST", "SX-02": "SOCIAL_POST", "SX-03": "VIDEO", "SX-04": "VIDEO",
  "SX-05": "APPEARANCE", "SX-06": "VIDEO", "SX-07": "PACKAGE",
};

/** The format a ledger inventory key stands for. */
export function formatOf(inventoryKey: string, itemKinds: ReadonlyMap<string, string>): string {
  const [kind, id = ""] = inventoryKey.split(/:(.*)/s);
  if (kind === "NIL_JOB") return NIL_JOB_FORMAT[id] ?? "OTHER";
  if (kind === "LISTING_ITEM") return itemKinds.get(id) ?? "OTHER";
  if (kind === "AD_SLOT") return "AD_SLOT";
  return "OTHER";
}

type Provenance = "VERIFIED_API" | "VERIFIED_MANUAL";
const provenanceOf = (api: number, manual: number): Provenance => (manual > api ? "VERIFIED_MANUAL" : "VERIFIED_API");

export type RenewalAdvice = "RENEW" | "ADJUST" | "LET_END";

/** The renewal advice for a share of the promise delivered (user, 2026-10-15: the forecast's 80% / 50%). */
export function renewalOf(share: number): RenewalAdvice {
  return share >= WATCH_BELOW ? "RENEW" : share >= AT_RISK_BELOW ? "ADJUST" : "LET_END";
}

/**
 * A partner athlete's score, 0..1: the average of what applies — delivery
 * (published ÷ due, capped at 1) and reach (their verified views per
 * published deliverable against this sponsor's average, capped at 1).
 * Null when neither applies.
 */
export function partnerScore(p: { due: number; published: number; views: number }, avgViewsPerPost: number): number | null {
  const parts: number[] = [];
  if (p.due > 0) parts.push(Math.min(1, p.published / p.due));
  if (p.published > 0 && avgViewsPerPost > 0) parts.push(Math.min(1, p.views / p.published / avgViewsPerPost));
  return parts.length ? round2(parts.reduce((t, x) => t + x, 0) / parts.length) : null;
}

type SumRow = { campaignId: string; athleteId: string; inventoryKey: string; api: bigint; manual: bigint; due: bigint; published: bigint; net: bigint };

/** GET /intelligence/sponsor?range=7d|30d|90d|all — the caller's own sponsor org only. */
export async function sponsorIntelligence(actor: Actor, range: RangeKey, now = new Date()) {
  const scope = assertAllowed(actor, "sponsorIntelligence", "read");
  if (scope !== "own-sponsor" || !actor.sponsorId) throw new ForbiddenError("sponsorIntelligence", "read");
  const tenantId = actor.tenantId;
  const sponsorId = actor.sponsorId;

  const campaigns = await prisma.campaign.findMany({
    /* tenant-scope: explicit — the caller's own sponsor org's campaigns, in its tenant. */
    where: { tenantId, sponsorId, state: { not: "DRAFT" } },
    select: { id: true, name: true, state: true, startDate: true, endDate: true },
    orderBy: { id: "asc" },
  });
  const ids = campaigns.map((c) => c.id);
  const earliest = campaigns.reduce<Date | null>((m, c) => (!m || c.startDate < m ? c.startDate : m), null);
  const w = windowFor(range, now, earliest);
  /* "All time" counts bookings filed before the first campaign started, too. */
  const from = range === "all" ? new Date(0) : w.from;

  const [sums, redeems, benchmark, forecasts, sold] = await Promise.all([
    ids.length ? prisma.$queryRawUnsafe<SumRow[]>(
      /* tenant-scope: explicit — the caller's sponsor's campaigns' daily summaries. */
      `SELECT "campaignId", "athleteId", "inventoryKey",
              sum("viewsVerifiedApi") AS api, sum("viewsVerifiedManual") AS manual,
              sum("deliverablesDue") AS due, sum("deliverablesPublished") AS published,
              sum("bookedSellCents" - "cancelledSellCents") AS net
         FROM "CampaignDaySummary" WHERE "tenantId" = $1 AND "campaignId" = ANY($2::text[]) AND day >= $3::date AND day < $4::date
        GROUP BY 1, 2, 3`,
      tenantId, ids, from.toISOString().slice(0, 10), w.to.toISOString().slice(0, 10),
    ) : Promise.resolve([]),
    ids.length ? prisma.$queryRawUnsafe<Array<{ campaignId: string; athleteId: string | null; n: bigint }>>(
      /* tenant-scope: explicit — redemptions of the caller's sponsor's campaigns' rewards. */
      `SELECT r."campaignId", t."athleteId", count(*) AS n
         FROM "RewardEvent" e JOIN "RewardToken" t ON t.id = e."tokenId" JOIN "Reward" r ON r.id = t."rewardId"
        WHERE e."tenantId" = $1 AND r."campaignId" = ANY($2::text[]) AND e.type = 'REDEEM' AND e.at >= $3 AND e.at < $4
        GROUP BY 1, 2`,
      tenantId, ids, from, w.to,
    ) : Promise.resolve([]),
    prisma.benchmark.findFirst({ where: { tenantId, dimension: "ALL", segment: "", metric: BENCHMARK_METRIC }, select: { median: true } }),
    ids.length ? prisma.$queryRawUnsafe<Array<{ campaignId: string; metric: string; guarantee: number; mid: number; elapsed: number; forecastAt: Date }>>(
      /* tenant-scope: explicit — the latest forecast of each of the caller's sponsor's campaigns. */
      `SELECT DISTINCT ON ("campaignId") "campaignId", metric, guarantee, mid, elapsed, "forecastAt"
         FROM "CampaignForecast" WHERE "tenantId" = $1 AND "campaignId" = ANY($2::text[]) ORDER BY "campaignId", day DESC`,
      tenantId, ids,
    ) : Promise.resolve([]),
    prisma.marketplaceOrderLine.findMany({
      /* tenant-scope: explicit — the caller's sponsor's own marketplace orders, in its tenant. */
      where: { tenantId, propertyId: { not: null }, order: { sponsorId, state: { in: ["PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "REFUNDED"] }, createdAt: { gte: from, lt: w.to } } },
      select: { propertyId: true, orderId: true, order: { select: { state: true } } },
    }),
  ]);

  /* ── the totals: four classes, never added together ── */
  const views = sums.reduce((t, r) => t + Number(r.api) + Number(r.manual), 0);
  const redemptions = redeems.reduce((t, r) => t + Number(r.n), 0);
  const totals = {
    VERIFIED_REDEMPTION: { count: redemptions, amountCents: null },
    VERIFIED_TRANSACTION: { count: 0, amountCents: 0 },
    MODELLED: { count: 0, amountCents: 0 },
    ESTIMATED_MEDIA_VALUE: { count: views, amountCents: benchmark ? Math.round((views * benchmark.median) / 1000) : null },
  };

  /* ── formats: the ledger's inventory keys as inventory kinds ── */
  const itemIds = [...new Set(sums.filter((r) => r.inventoryKey.startsWith("LISTING_ITEM:")).map((r) => r.inventoryKey.slice("LISTING_ITEM:".length)))];
  const itemKinds = new Map((itemIds.length ? await prisma.inventoryItem.findMany({
    /* tenant-scope: tenantId — the caller's tenant's items its campaigns' summaries name. */
    where: { tenantId, id: { in: itemIds } }, select: { id: true, kind: true },
  }) : []).map((i) => [i.id, i.kind]));
  /* A redemption follows its athlete's order in the campaign (the largest booked, if several). */
  const formatOfPair = new Map<string, { format: string; net: number }>();
  for (const r of sums) {
    const key = `${r.campaignId}|${r.athleteId}`;
    const had = formatOfPair.get(key);
    if (!had || Number(r.net) > had.net) formatOfPair.set(key, { format: formatOf(r.inventoryKey, itemKinds), net: Number(r.net) });
  }
  type F = { format: string; campaigns: Set<string>; api: number; manual: number; net: number; redemptions: number };
  const formats = new Map<string, F>();
  const fmt = (format: string) => formats.get(format) ?? formats.set(format, { format, campaigns: new Set(), api: 0, manual: 0, net: 0, redemptions: 0 }).get(format)!;
  for (const r of sums) {
    const f = fmt(formatOf(r.inventoryKey, itemKinds));
    f.campaigns.add(r.campaignId);
    f.api += Number(r.api);
    f.manual += Number(r.manual);
    f.net += Number(r.net);
  }
  for (const r of redeems) {
    const pair = r.athleteId ? formatOfPair.get(`${r.campaignId}|${r.athleteId}`) : undefined;
    if (pair) fmt(pair.format).redemptions += Number(r.n);
  }

  /* ── partners: athletes from the ledger, teams and schools from the sponsor's marketplace orders ── */
  type A = { campaigns: Set<string>; api: number; manual: number; due: number; published: number };
  const byAthlete = new Map<string, A>();
  for (const r of sums) {
    if (!r.athleteId) continue;
    const a = byAthlete.get(r.athleteId) ?? { campaigns: new Set(), api: 0, manual: 0, due: 0, published: 0 };
    a.campaigns.add(r.campaignId);
    a.api += Number(r.api);
    a.manual += Number(r.manual);
    a.due += Number(r.due);
    a.published += Number(r.published);
    byAthlete.set(r.athleteId, a);
  }
  const allPublished = [...byAthlete.values()].reduce((t, a) => t + a.published, 0);
  const avgPerPost = allPublished > 0 ? views / allPublished : 0;
  const athleteNames = new Map((byAthlete.size ? await prisma.athlete.findMany({
    /* tenant-scope: tenantId — the athletes on the caller's sponsor's campaigns. */
    where: { tenantId, id: { in: [...byAthlete.keys()] } }, select: { id: true, displayName: true },
  }) : []).map((a) => [a.id, a.displayName]));
  const stampAt = now.toISOString();
  const partners: Array<{ kind: "athlete" | "property"; id: string; name: string; campaigns: number; score: number; provenance: Provenance; stamp: { modelVersion: string; confidence: number; computedAt: string } }> = [];
  for (const [id, a] of byAthlete) {
    const score = partnerScore({ due: a.due, published: a.published, views: a.api + a.manual }, avgPerPost);
    if (score === null || !athleteNames.has(id)) continue;
    partners.push({
      kind: "athlete", id, name: athleteNames.get(id)!, campaigns: a.campaigns.size, score, provenance: provenanceOf(a.api, a.manual),
      stamp: { modelVersion: SPONSOR_INTEL_VERSION, confidence: round2(Math.min(1, a.published / PARTNER_FULL_CONFIDENCE_POSTS)), computedAt: stampAt },
    });
  }
  type P = { orders: Set<string>; lines: number; fulfilled: number };
  const byProperty = new Map<string, P>();
  for (const l of sold) {
    const p = byProperty.get(l.propertyId!) ?? { orders: new Set(), lines: 0, fulfilled: 0 };
    p.orders.add(l.orderId);
    p.lines += 1;
    if (l.order.state === "FULFILLED" || l.order.state === "CLOSED") p.fulfilled += 1;
    byProperty.set(l.propertyId!, p);
  }
  const propertyNames = new Map((byProperty.size ? await prisma.property.findMany({
    /* tenant-scope: the sellers named on the caller's sponsor's own order lines (found in its tenant above); a seller may be an outside organisation. */
    where: { id: { in: [...byProperty.keys()] } }, select: { id: true, name: true },
  }) : []).map((p) => [p.id, p.name]));
  for (const [id, p] of byProperty) {
    if (!propertyNames.has(id)) continue;
    partners.push({
      kind: "property", id, name: propertyNames.get(id)!, campaigns: p.orders.size, score: round2(p.fulfilled / p.lines), provenance: "VERIFIED_MANUAL",
      stamp: { modelVersion: SPONSOR_INTEL_VERSION, confidence: round2(Math.min(1, p.lines / PARTNER_FULL_CONFIDENCE_POSTS)), computedAt: stampAt },
    });
  }
  partners.sort((a, b) => b.score - a.score || b.campaigns - a.campaigns || a.id.localeCompare(b.id));

  /* ── renewals: campaigns ending soon or just ended, from their latest forecast ── */
  const redeemsBy = new Map<string, number>();
  for (const r of redeems) redeemsBy.set(r.campaignId, (redeemsBy.get(r.campaignId) ?? 0) + Number(r.n));
  const forecastBy = new Map(forecasts.map((f) => [f.campaignId, f]));
  const lo = now.getTime() - RENEWAL_BEHIND_DAYS * DAY_MS;
  const hi = now.getTime() + RENEWAL_AHEAD_DAYS * DAY_MS;
  const renewals = campaigns
    .filter((c) => c.state !== "CANCELLED" && c.endDate.getTime() >= lo && c.endDate.getTime() <= hi && forecastBy.has(c.id))
    .map((c) => {
      const f = forecastBy.get(c.id)!;
      const share = f.guarantee > 0 ? f.mid / f.guarantee : 0;
      const advice = renewalOf(share);
      const ended = c.endDate.getTime() < now.getTime();
      const reasons = [
        `${ended ? "Delivered" : "On course to deliver"} ${n(f.mid)} of the ${n(f.guarantee)} ${f.metric} promised (${Math.round(share * 100)}%).`,
        ...(redeemsBy.get(c.id) ? [`${n(redeemsBy.get(c.id)!)} fans redeemed your offer.`] : []),
        advice === "RENEW" ? "It delivered what was promised, so it is worth booking again."
          : advice === "ADJUST" ? "It fell short of the promise, so renew with a different format or partner."
            : "It fell well short of the promise.",
      ];
      return {
        campaignId: c.id, campaignName: c.name, endsAt: c.endDate.toISOString(), renewalScore: round2(Math.min(1, share)), recommendation: advice, reasons,
        stamp: { modelVersion: RENEWAL_VERSION, confidence: round2(Math.min(1, 0.4 + 2 * f.elapsed)), computedAt: f.forecastAt.toISOString() },
      };
    })
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt) || a.campaignId.localeCompare(b.campaignId));

  return {
    asOf: now.toISOString(),
    range,
    campaigns: { count: campaigns.filter((c) => c.state !== "CANCELLED").length, active: campaigns.filter((c) => c.state === "ACTIVE").length },
    totals,
    formats: [...formats.values()].map((f) => ({
      format: f.format, campaigns: f.campaigns.size, deliveredImpressions: f.api + f.manual, redemptions: f.redemptions,
      costPerResultCents: f.redemptions > 0 ? Math.round(f.net / f.redemptions) : null, provenance: provenanceOf(f.api, f.manual),
    })).sort((a, b) => a.format.localeCompare(b.format)),
    partners,
    segments: [] as Array<{ label: string; share: number; source: string; provenance: string }>,
    renewals,
  };
}
