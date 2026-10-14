/**
 * Feature snapshots — 3S2-BE-01 (documentation/SponsorX-Fact-Ledger.md §12).
 *
 * The inputs a price is suggested from, as they stood on a day, one snapshot
 * per active athlete per UTC day. The pricing engine (3S2-BE-02) reads them,
 * and so can anyone asking later why a price was suggested: a snapshot is
 * written once and never changed, so it still says what was known then.
 *
 * Everything comes from the fact ledger and the app's own records, never
 * the warehouse:
 *
 * - audience: each platform's followers and average views, with their label (§22);
 * - engagement: verified engagements ÷ verified views, over the window;
 * - delivery: deliverables due, published on time, verified, sent back; orders cancelled;
 * - demand: orders booked for the athlete, and for athletes of the same sport and state;
 * - seasonality: this month against an average month, for the sport, once there is a year of bookings;
 * - geography: state and city, and the orders booked in that state;
 * - scarcity: active athletes sharing the sport, state and tier;
 * - benchmarks: the segment's price ranges as of the snapshot (§11).
 *
 * The window for "recent" is FEATURE_WINDOW_DAYS (user, 2026-10-14). A figure
 * that cannot be known yet is null with the reason, never a guess.
 */
import type { Prisma, PrismaClient } from "../generated/prisma/client";
import { listBenchmarks, type BenchmarkView } from "./benchmarks";

type Db = PrismaClient | Prisma.TransactionClient;

export const FEATURES_VERSION = "features-v1";
/** "Recent", for engagement, delivery and demand (user, 2026-10-14). */
export const FEATURE_WINDOW_DAYS = 90;
/** Seasonality needs this much booking history for the sport. */
export const SEASONALITY_HISTORY_DAYS = 365;
/** The athletes a sponsor can book — the ones a price is suggested for. */
export const SNAPSHOT_ATHLETE_STATES = ["ACTIVE", "FEATURED"] as const;

const DAY_MS = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const utcDay = (d: Date) => new Date(`${isoDay(d)}T00:00:00Z`);
const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 10_000) / 10_000 : null);

type Range = { p25: number; median: number; p75: number; sampleSize: number; smallSample: boolean } | null;

export type AthleteFeatures = {
  window: { days: number; from: string; to: string };
  audience: {
    platforms: Array<{ platform: string; followers: number | null; avgViews: number | null; source: string }>;
    totalFollowers: number;
    totalAvgViews: number;
    /** True when any platform's figures were verified rather than typed by the athlete. */
    anyVerified: boolean;
  };
  engagement: { verifiedViews: number; verifiedEngagements: number; rate: number | null };
  delivery: {
    due: number; published: number; verified: number; revisionsRequested: number;
    /** Deliverables whose due day has passed in the window, and those published by it. */
    dueByToday: number; publishedOnTime: number; onTimeRate: number | null;
    ordersCancelled: number;
  };
  demand: { ordersBooked: number; bookedNetCents: number; sameSportAndStateOrdersBooked: number };
  seasonality: { index: number | null; bookingsThisMonthLastYear: number; averageMonthlyBookings: number; reason: string | null };
  geography: { state: string | null; city: string | null; stateOrdersBooked: number };
  scarcity: { sameSportStateTier: number };
  benchmarks: { all: Range; sport: Range; market: Range; audience: Range };
};

type OrderRow = { athleteId: string; bookedOn: Date | null; cancelledOn: Date | null; net: bigint; state: string };
type LedgerRow = { athleteId: string; views: bigint; engagements: bigint; due: bigint; published: bigint; verified: bigint; revisions: bigint };
type DueRow = { athleteId: string; deliverable: string; dueOn: Date; publishedOn: Date | null };

const range = (b: BenchmarkView | undefined): Range =>
  b ? { p25: b.p25, median: b.median, p75: b.p75, sampleSize: b.sampleSize, smallSample: b.smallSample } : null;

/** Every active athlete's features for one tenant, as of `day`. */
export async function athleteFeatures(db: Db, tenantId: string, day: Date): Promise<Map<string, AthleteFeatures>> {
  const today = utcDay(day);
  const from = new Date(today.getTime() - (FEATURE_WINDOW_DAYS - 1) * DAY_MS);
  const inWindow = (d: Date | null) => !!d && d >= from && d <= today;

  const athletes = await db.athlete.findMany({
    /* tenant-scope: explicit — this tenant's athletes. */
    where: { tenantId },
    select: { id: true, sport: true, stateCode: true, city: true, tier: true, state: true },
  });
  const byId = new Map(athletes.map((a) => [a.id, a]));
  const active = athletes.filter((a) => (SNAPSHOT_ATHLETE_STATES as readonly string[]).includes(a.state));
  if (!active.length) return new Map();
  const st = (s: string | null) => (s ?? "").trim().toUpperCase();

  const [ledger, orders, dues, socials, benchmarks] = await Promise.all([
    db.$queryRawUnsafe<LedgerRow[]>(
      /* tenant-scope: explicit — this tenant's summaries. */
      `SELECT "athleteId",
              sum("viewsVerifiedApi" + "viewsVerifiedManual") AS views, sum("engagementsVerifiedApi" + "engagementsVerifiedManual") AS engagements,
              sum("deliverablesDue") AS due, sum("deliverablesPublished") AS published, sum("deliverablesVerified") AS verified,
              sum("revisionsRequested") AS revisions
         FROM "CampaignDaySummary"
        WHERE "tenantId" = $1 AND "athleteId" <> '' AND day BETWEEN $2::date AND $3::date
        GROUP BY 1`,
      tenantId, isoDay(from), isoDay(today),
    ),
    db.$queryRawUnsafe<OrderRow[]>(
      /* tenant-scope: explicit — this tenant's orders, one row per campaign, athlete and NIL job. */
      `SELECT "athleteId",
              min(day) FILTER (WHERE "bookedSellCents" > 0) AS "bookedOn",
              max(day) FILTER (WHERE "cancelledSellCents" > 0) AS "cancelledOn",
              sum("bookedSellCents" - "cancelledSellCents") AS net,
              split_part(coalesce(min("marketKey") FILTER (WHERE "bookedSellCents" > 0), ''), ':', 1) AS state
         FROM "CampaignDaySummary"
        WHERE "tenantId" = $1 AND left("inventoryKey", 8) = 'NIL_JOB:' AND "athleteId" <> '' AND day <= $2::date
        GROUP BY "athleteId", "campaignId", "inventoryKey"`,
      tenantId, isoDay(today),
    ),
    db.$queryRawUnsafe<DueRow[]>(
      /* tenant-scope: explicit — this tenant's deliverable facts. A due fact since reversed (order cancelled) no longer counts. */
      `SELECT d."athleteId", d."sourceId" AS deliverable, max(d."occurredOn") AS "dueOn",
              (SELECT min(p."occurredOn") FROM "Fact" p
                WHERE p."tenantId" = d."tenantId" AND p.kind = 'DELIVERABLE_PUBLISHED' AND p."sourceType" = 'Deliverable' AND p."sourceId" = d."sourceId") AS "publishedOn"
         FROM "Fact" d
        WHERE d."tenantId" = $1 AND d.kind = 'DELIVERABLE_DUE' AND d."sourceType" = 'Deliverable' AND d."athleteId" IS NOT NULL
          AND d."occurredOn" BETWEEN $2::date AND $3::date
          AND NOT EXISTS (SELECT 1 FROM "Fact" r WHERE r."reversesId" = d.id)
        GROUP BY d."tenantId", d."athleteId", d."sourceId"`,
      tenantId, isoDay(from), isoDay(today),
    ),
    db.athleteSocial.findMany({
      /* tenant-scope: explicit — this tenant's socials. */
      where: { tenantId, athleteId: { in: active.map((a) => a.id) } },
      orderBy: { platform: "asc" },
      select: { athleteId: true, platform: true, followers: true, avgViews: true, source: true },
    }),
    listBenchmarks(db, tenantId),
  ]);

  const ledgerBy = new Map(ledger.map((r) => [r.athleteId, r]));
  const bench = new Map(benchmarks.map((b) => [`${b.dimension}:${b.segment}`, b]));
  /* Every booking counts as demand, cancelled later or not; cancellations are counted under delivery. */
  const booked = orders.filter((o) => o.bookedOn);

  /* Seasonality, per sport: needs a full year of bookings for that sport. */
  const yearAgo = new Date(today.getTime() - SEASONALITY_HISTORY_DAYS * DAY_MS);
  const monthStartLastYear = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1));
  const monthEndLastYear = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth() + 1, 1));
  const seasonality = new Map<string, AthleteFeatures["seasonality"]>();
  for (const sport of new Set(active.map((a) => a.sport))) {
    const ofSport = booked.filter((o) => byId.get(o.athleteId)?.sport === sport);
    const earliest = ofSport.reduce<Date | null>((m, o) => (!m || o.bookedOn! < m ? o.bookedOn! : m), null);
    const thisMonth = ofSport.filter((o) => o.bookedOn! >= monthStartLastYear && o.bookedOn! < monthEndLastYear).length;
    const average = Math.round((ofSport.filter((o) => o.bookedOn! > yearAgo && o.bookedOn! <= today).length / 12) * 100) / 100;
    const enough = !!earliest && earliest <= yearAgo;
    seasonality.set(sport, {
      index: enough && average > 0 ? Math.round((thisMonth / average) * 100) / 100 : null,
      bookingsThisMonthLastYear: thisMonth, averageMonthlyBookings: average,
      reason: !enough ? `less than ${SEASONALITY_HISTORY_DAYS} days of ${sport} bookings` : average > 0 ? null : `no ${sport} bookings in the last ${SEASONALITY_HISTORY_DAYS} days`,
    });
  }

  const out = new Map<string, AthleteFeatures>();
  for (const a of active) {
    const l = ledgerBy.get(a.id);
    const n = (v: bigint | undefined) => Number(v ?? 0n);
    const mine = orders.filter((o) => o.athleteId === a.id);
    const recent = mine.filter((o) => inWindow(o.bookedOn));
    const myDues = dues.filter((d) => d.athleteId === a.id && d.dueOn <= today);
    const onTime = myDues.filter((d) => d.publishedOn && d.publishedOn <= d.dueOn).length;
    const platforms = socials.filter((s) => s.athleteId === a.id).map((s) => ({ platform: s.platform, followers: s.followers, avgViews: s.avgViews, source: s.source }));
    const state = st(a.stateCode) || null;
    const views = n(l?.views);
    const engagements = n(l?.engagements);
    out.set(a.id, {
      window: { days: FEATURE_WINDOW_DAYS, from: isoDay(from), to: isoDay(today) },
      audience: {
        platforms,
        totalFollowers: platforms.reduce((t, p) => t + (p.followers ?? 0), 0),
        totalAvgViews: platforms.reduce((t, p) => t + (p.avgViews ?? 0), 0),
        anyVerified: platforms.some((p) => p.source === "VERIFIED_API" || p.source === "VERIFIED_MANUAL"),
      },
      engagement: { verifiedViews: views, verifiedEngagements: engagements, rate: ratio(engagements, views) },
      delivery: {
        due: n(l?.due), published: n(l?.published), verified: n(l?.verified), revisionsRequested: n(l?.revisions),
        dueByToday: myDues.length, publishedOnTime: onTime, onTimeRate: ratio(onTime, myDues.length),
        ordersCancelled: mine.filter((o) => inWindow(o.cancelledOn)).length,
      },
      demand: {
        ordersBooked: recent.length,
        bookedNetCents: recent.reduce((t, o) => t + Math.max(Number(o.net), 0), 0),
        sameSportAndStateOrdersBooked: booked.filter((o) => {
          const b = byId.get(o.athleteId);
          return inWindow(o.bookedOn) && !!b && b.sport === a.sport && !!state && st(b.stateCode) === state;
        }).length,
      },
      seasonality: seasonality.get(a.sport)!,
      geography: { state, city: a.city, stateOrdersBooked: state ? booked.filter((o) => inWindow(o.bookedOn) && o.state === state).length : 0 },
      scarcity: { sameSportStateTier: active.filter((b) => b.sport === a.sport && st(b.stateCode) === st(a.stateCode) && b.tier === a.tier).length },
      benchmarks: {
        all: range(bench.get("ALL:")),
        sport: range(bench.get(`SPORT:${a.sport}`)),
        market: state ? range(bench.get(`MARKET:${state}`)) : null,
        audience: a.tier ? range(bench.get(`AUDIENCE:${a.tier}`)) : null,
      },
    });
  }
  return out;
}

export type SnapshotReport = { tenants: number; athletes: number; written: number; alreadyTaken: number; skipped: string[] };

/**
 * Take today's snapshot of every active athlete. One per athlete per day: a
 * second run the same day writes nothing (the first stands, unchanged).
 * `skipTenants` take none today — the worker passes the tenants whose fact
 * check failed, so a snapshot is never taken from figures known to be wrong.
 */
export async function takeFeatureSnapshots(db: PrismaClient, now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<SnapshotReport> {
  const skip = new Set(opts.skipTenants ?? []);
  const tenants = opts.tenantId
    ? [opts.tenantId]
    : (await db.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const day = utcDay(now);
  let athletes = 0;
  let written = 0;
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    const features = await athleteFeatures(db, tenantId, day);
    athletes += features.size;
    if (!features.size) continue;
    const res = await db.featureSnapshot.createMany({
      data: [...features].map(([entityId, f]) => ({
        tenantId, entityType: "ATHLETE", entityId, day, version: FEATURES_VERSION, features: f as unknown as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    written += res.count;
  }
  return { tenants: tenants.filter((t) => !skip.has(t)).length, athletes, written, alreadyTaken: athletes - written, skipped: tenants.filter((t) => skip.has(t)) };
}

export type FeatureSnapshotView = { athleteId: string; day: string; version: string; features: AthleteFeatures; takenAt: string };

const view = (r: { entityId: string; day: Date; version: string; features: unknown; createdAt: Date }): FeatureSnapshotView => ({
  athleteId: r.entityId, day: isoDay(r.day), version: r.version, features: r.features as AthleteFeatures, takenAt: r.createdAt.toISOString(),
});
const SELECT = { entityId: true, day: true, version: true, features: true, createdAt: true } as const;

/** What was known about an athlete on `on`: that day's snapshot, or the latest before it. Null if none yet. */
export async function getFeatureSnapshot(db: Db, tenantId: string, athleteId: string, on: Date): Promise<FeatureSnapshotView | null> {
  const r = await db.featureSnapshot.findFirst({
    where: { tenantId, entityType: "ATHLETE", entityId: athleteId, day: { lte: utcDay(on) } },
    orderBy: { day: "desc" },
    select: SELECT,
  });
  return r ? view(r) : null;
}

/** An athlete's snapshots between two days, oldest first. */
export async function listFeatureSnapshots(db: Db, tenantId: string, athleteId: string, from: Date, to: Date): Promise<FeatureSnapshotView[]> {
  const rows = await db.featureSnapshot.findMany({
    where: { tenantId, entityType: "ATHLETE", entityId: athleteId, day: { gte: utcDay(from), lte: utcDay(to) } },
    orderBy: { day: "asc" },
    select: SELECT,
  });
  return rows.map(view);
}
