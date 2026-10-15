/**
 * The dynamic CPM engine, v1 — 3S2-BE-02 (documentation/SponsorX-Fact-Ledger.md §13).
 *
 * Rules and statistics, not machine learning: the spec says not to learn
 * prices before there is enough clean history. For each athlete's item for
 * sale it suggests a price per 1,000 impressions, and says why.
 *
 *   1. BASE — the market's middle (benchmark median, §11) for the most
 *      specific group with enough orders: the same NIL job, then the sport,
 *      the tier, the state, then every order. With no group reaching the
 *      minimum, the largest one there is, and lower confidence; with no
 *      benchmark at all, the item's own current CPM, and lowest confidence.
 *   2. FACTORS — each a signed fraction of the base, from the athlete's
 *      feature snapshot (§12), capped at ±MAX_FACTOR, all together at
 *      ±MAX_TOTAL (user, 2026-10-14) so no one signal swings a price.
 *   3. FLOOR — never below the sell floor domain/pricing.ts sets for the
 *      job and tier (as a CPM); when it lifts the price, a "floor" factor
 *      says so, and base + Σ impacts still equals the recommendation.
 *   4. STAMP — model version, a confidence from 0 to 1 that grows with
 *      comparable orders, verified audience and a delivery record, and when.
 *
 * v1 prices athlete items only; a venue's or team's item is not priced yet
 * (user, 2026-10-14) — the benchmarks come from athlete campaigns.
 *
 * Suggestions are stored nightly as made (3S2-BE-03; `storePricingRecommendations`)
 * and the reads serve the latest stored one. An override is its own record,
 * with a reason; it never edits a suggestion or the item's listed price.
 */
import type { Actor } from "../auth/actor";
import { assertTenantWide, can } from "../auth/scope";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { prisma } from "../db/client";
import { Prisma } from "../generated/prisma/client";
import type { PageInfo, PageRequest } from "../lib/paging";
import { BENCHMARK_MIN_SAMPLE, listBenchmarks, type BenchmarkView } from "./benchmarks";
import type { AthleteFeatures } from "./feature-snapshots";
import { impliedCpm, projectImpressions } from "./pricing-learning";

/** An item that is not an active athlete item of the caller's tenant, or has no snapshot yet — 404, never a guess. */
export class NotPricedError extends Error {
  readonly status = 404;
  readonly code = "not_priced";
  constructor() {
    super("Not priced yet: v1 prices active athlete items whose athlete has a feature snapshot.");
    this.name = "NotPricedError";
  }
}

export const PRICING_MODEL_VERSION = "cpm-rules@1.0.0";
/** One factor moves the price by at most this fraction of the base (user, 2026-10-14). */
export const MAX_FACTOR = 0.2;
/** All factors together, at most this (user, 2026-10-14). */
export const MAX_TOTAL = 0.4;
/** Below the medium confidence band — the screen's "low confidence" view. */
export const LOW_CONFIDENCE = 0.5;

const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
const round2 = (v: number) => Math.round(v * 100) / 100;
const pct = (f: number) => `${f >= 0 ? "+" : "−"}${Math.round(Math.abs(f) * 100)}%`;

export type Factor = { key: string; label: string; effect: number; impactCents: number; explanation: string };
export type Range = { p25Cents: number; medianCents: number; p75Cents: number; sampleSize: number; basis: string };
export type Stamp = { modelVersion: string; confidence: number; computedAt: string };
export type Recommendation = {
  id: string;
  currentCpmCents: number | null;
  recommendedCpmCents: number;
  baseCpmCents: number;
  floorCpmCents: number | null;
  factors: Factor[];
  range: Range | null;
  stamp: Stamp;
};

/** What the tenant's athletes look like on the day — the yardsticks a factor compares one athlete with. */
export type Peers = {
  /** Median verified engagement rate across the athletes that have one; null if none. */
  medianEngagementRate: number | null;
  /** Orders booked in the window, per bookable athlete, by "sport|STATE". */
  ordersPerAthlete: Map<string, number>;
};

export type EngineInput = {
  item: { id: string; priceCents: number; jobId: string | null };
  athlete: { sport: string; stateCode: string | null; tier: string | null };
  snapshot: { day: string; features: AthleteFeatures };
  /** The tenant's benchmarks (§11). */
  benchmarks: BenchmarkView[];
  /** The job's sell floor at the athlete's tier, in cents; null when none applies (no job, or an ANCHOR tier). */
  floorPriceCents: number | null;
  peers: Peers;
  computedAt: Date;
};

const DIMENSION_WORDS: Record<string, (segment: string) => string> = {
  FORMAT: (s) => `${s} orders`,
  SPORT: (s) => `${s} athletes`,
  AUDIENCE: (s) => `${s.charAt(0)}${s.slice(1).toLowerCase()} tier athletes`,
  MARKET: (s) => `athletes in ${s}`,
  ALL: () => "all orders",
};

/** The base: the most specific benchmark with enough orders, else the largest there is. */
function chooseBase(input: EngineInput) {
  const { athlete, item, benchmarks } = input;
  const state = (athlete.stateCode ?? "").trim().toUpperCase();
  const wanted: Array<[string, string | null]> = [
    ["FORMAT", item.jobId], ["SPORT", athlete.sport], ["AUDIENCE", athlete.tier], ["MARKET", state || null], ["ALL", ""],
  ];
  const found = wanted
    .filter(([, seg]) => seg !== null)
    .map(([dim, seg]) => benchmarks.find((b) => b.dimension === dim && b.segment === seg))
    .filter((b): b is BenchmarkView => !!b && b.metric === "EFFECTIVE_CPM_CENTS");
  return found.find((b) => b.sampleSize >= BENCHMARK_MIN_SAMPLE) ?? found.sort((a, b) => b.sampleSize - a.sampleSize)[0] ?? null;
}

/** The factors, before capping: each a signed fraction and a sentence. */
function rawFactors(input: EngineInput): Array<Omit<Factor, "impactCents">> {
  const f = input.snapshot.features;
  const key = `${input.athlete.sport}|${(input.athlete.stateCode ?? "").trim().toUpperCase()}`;
  const out: Array<Omit<Factor, "impactCents">> = [];

  const rate = f.engagement.rate;
  const median = input.peers.medianEngagementRate;
  out.push(rate !== null && median !== null && median > 0
    ? { key: "engagement", label: "Engagement", effect: clamp((rate / median - 1) * 0.5, MAX_FACTOR),
        explanation: `${(rate * 100).toFixed(1)}% of verified viewers engaged, against ${(median * 100).toFixed(1)}% typical here.` }
    : { key: "engagement", label: "Engagement", effect: 0, explanation: "No verified engagement yet, so no adjustment." });

  const d = f.delivery;
  out.push(d.dueByToday >= 3 && d.onTimeRate !== null
    ? { key: "delivery", label: "Delivery record", effect: clamp((d.onTimeRate - 0.8) * 0.5, MAX_FACTOR),
        explanation: `${d.publishedOnTime} of ${d.dueByToday} deliverables were published on time in the last ${f.window.days} days.` }
    : { key: "delivery", label: "Delivery record", effect: 0, explanation: "Fewer than 3 deliverables due yet, so no adjustment." });

  const typical = input.peers.ordersPerAthlete.get(key) ?? 0;
  out.push(typical > 0
    ? { key: "demand", label: "Demand", effect: clamp((f.demand.ordersBooked / typical - 1) * 0.1, MAX_FACTOR),
        explanation: `${f.demand.ordersBooked} order(s) booked in the last ${f.window.days} days, against ${round2(typical)} typical for ${input.athlete.sport} athletes in the same state.` }
    : { key: "demand", label: "Demand", effect: 0, explanation: "No recent orders for comparable athletes, so no adjustment." });

  const s = f.seasonality;
  out.push(s.index !== null
    ? { key: "seasonality", label: "Seasonality", effect: clamp((s.index - 1) * 0.25, MAX_FACTOR),
        explanation: `This month is ${s.index >= 1 ? "busier" : "quieter"} than usual for ${input.athlete.sport} (${s.index}× an average month).` }
    : { key: "seasonality", label: "Seasonality", effect: 0, explanation: `No adjustment: ${s.reason ?? "not enough history"}.` });

  const peers = f.scarcity.sameSportStateTier;
  const scarcity = peers <= 2 ? 0.1 : peers <= 5 ? 0.05 : peers >= 10 ? -0.05 : 0;
  out.push({ key: "scarcity", label: "Scarcity", effect: scarcity,
    explanation: `${peers} bookable athlete(s) share this sport, state and tier${scarcity > 0 ? " — few alternatives" : scarcity < 0 ? " — many alternatives" : ""}.` });
  return out;
}

/** The confidence: comparable orders, verified audience, a delivery record, and what else is known. */
function confidence(base: BenchmarkView | null, f: AthleteFeatures): number {
  const fromBase = !base ? 0.05 : base.sampleSize >= 30 ? 0.45 : base.sampleSize >= BENCHMARK_MIN_SAMPLE ? 0.35 : 0.15;
  const audience = f.audience.anyVerified ? 0.2 : f.audience.platforms.length ? 0.05 : 0;
  const delivery = f.delivery.dueByToday >= 3 ? 0.15 : 0;
  const engagement = f.engagement.rate !== null ? 0.1 : 0;
  const season = f.seasonality.index !== null ? 0.05 : 0;
  const demand = f.demand.ordersBooked > 0 ? 0.05 : 0;
  return round2(Math.min(1, fromBase + audience + delivery + engagement + season + demand));
}

/**
 * One recommendation. Null when nothing can be priced: no benchmark and no
 * current CPM (no audience to imply one from).
 */
export function recommend(input: EngineInput): Recommendation | null {
  const f = input.snapshot.features;
  const projection = projectImpressions(f.audience.platforms.map((p) => ({ followers: p.followers, avgViews: p.avgViews, source: p.source as never })));
  const impressions = projection?.impressions ?? null;
  const currentCpmCents = impliedCpm(input.item.priceCents, impressions);
  const base = chooseBase(input);
  const baseCpmCents = base ? base.median : currentCpmCents;
  if (baseCpmCents === null || baseCpmCents <= 0) return null;
  const floorCpmCents = input.floorPriceCents !== null ? impliedCpm(input.floorPriceCents, impressions) : null;

  /* Cap each factor, then the total: scaled down together, so each keeps its share. */
  const raw = rawFactors(input);
  const sum = raw.reduce((t, x) => t + x.effect, 0);
  const scale = Math.abs(sum) > MAX_TOTAL ? MAX_TOTAL / Math.abs(sum) : 1;
  const factors: Factor[] = raw.map((x) => {
    const effect = Math.round(x.effect * scale * 10_000) / 10_000;
    return { ...x, effect, impactCents: Math.round(baseCpmCents * effect) };
  });
  let recommended = baseCpmCents + factors.reduce((t, x) => t + x.impactCents, 0);
  if (floorCpmCents !== null && recommended < floorCpmCents) {
    const lift = floorCpmCents - recommended;
    factors.push({ key: "floor", label: "Sell floor", effect: Math.round((lift / baseCpmCents) * 10_000) / 10_000, impactCents: lift,
      explanation: `Raised to the sell floor for this job and tier (${pct(lift / baseCpmCents)}): a suggestion never goes below it.` });
    recommended = floorCpmCents;
  }

  return {
    id: `computed:${input.item.id}:${input.snapshot.day}`,
    currentCpmCents,
    recommendedCpmCents: recommended,
    baseCpmCents,
    floorCpmCents,
    factors,
    range: base
      ? { p25Cents: base.p25, medianCents: base.median, p75Cents: base.p75, sampleSize: base.sampleSize,
          basis: `${DIMENSION_WORDS[base.dimension]!(base.segment)}, last 12 months${base.smallSample ? " (small sample)" : ""}` }
      : null,
    stamp: { modelVersion: PRICING_MODEL_VERSION, confidence: confidence(base, f), computedAt: input.computedAt.toISOString() },
  };
}

/* ───────────────────────────── computing a tenant ───────────────────────────── */

type Priced = {
  /** The day of the feature snapshot the suggestion read; not read back from storage. */
  snapshotDay?: string;
  inventory: { id: string; title: string; kind: string; seller: { kind: "ATHLETE"; id: string; name: string }; priceCents: number };
  recommendation: Recommendation;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Every athlete item of the tenant that can be priced, with its recommendation. */
async function priceTenant(tenantId: string, now: Date): Promise<Priced[]> {
  const items = await prisma.inventoryItem.findMany({
    /* tenant-scope: explicit — this tenant's active athlete items. */
    where: { tenantId, active: true, athleteId: { not: null } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, kind: true, priceCents: true, jobId: true, athleteId: true, athlete: { select: { displayName: true, sport: true, stateCode: true, tier: true } } },
  });
  if (!items.length) return [];
  /* The latest snapshot of every athlete, on or before today — the yardsticks need them all. */
  const snapshots = await prisma.$queryRawUnsafe<Array<{ entityId: string; day: Date; features: AthleteFeatures }>>(
    /* tenant-scope: explicit — this tenant's snapshots. */
    `SELECT DISTINCT ON ("entityId") "entityId", day, features
       FROM "FeatureSnapshot"
      WHERE "tenantId" = $1 AND "entityType" = 'ATHLETE' AND day <= $2::date
      ORDER BY "entityId", day DESC`,
    tenantId, now.toISOString().slice(0, 10),
  );
  const snapBy = new Map(snapshots.map((s) => [s.entityId, s]));
  const athletes = await prisma.athlete.findMany({
    /* tenant-scope: explicit — the snapshotted athletes, for the peer yardsticks. */
    where: { tenantId, id: { in: snapshots.map((s) => s.entityId) } },
    select: { id: true, sport: true, stateCode: true },
  });
  const rates = snapshots.map((s) => s.features.engagement.rate).filter((r): r is number => r !== null);
  const groups = new Map<string, number[]>();
  for (const a of athletes) {
    const k = `${a.sport}|${(a.stateCode ?? "").trim().toUpperCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), snapBy.get(a.id)!.features.demand.ordersBooked]);
  }
  const peers: Peers = {
    medianEngagementRate: median(rates),
    ordersPerAthlete: new Map([...groups].map(([k, xs]) => [k, xs.reduce((t, x) => t + x, 0) / xs.length])),
  };
  const benchmarks = await listBenchmarks(prisma, tenantId);
  const jobs = new Map((await prisma.nilJob.findMany({
    /* tenant-scope: the SX catalogue is reference data — one row per job id, whichever tenant seeded it — read only for its sell floors. */
    where: { id: { in: [...new Set(items.map((i) => i.jobId).filter((j): j is string => !!j))] } },
    select: { id: true, sellFloorEmerging: true, sellFloorCreator: true, sellFloorPremium: true },
  })).map((j) => [j.id, j]));

  const out: Priced[] = [];
  for (const i of items) {
    const snap = snapBy.get(i.athleteId!);
    if (!snap || !i.athlete) continue;
    const job = i.jobId ? jobs.get(i.jobId) : undefined;
    const tierFloor = job && i.athlete.tier
      ? ({ EMERGING: job.sellFloorEmerging, CREATOR: job.sellFloorCreator, PREMIUM: job.sellFloorPremium } as Record<string, number>)[i.athlete.tier]
      : undefined;
    const recommendation = recommend({
      item: { id: i.id, priceCents: i.priceCents, jobId: i.jobId },
      athlete: { sport: i.athlete.sport, stateCode: i.athlete.stateCode, tier: i.athlete.tier },
      snapshot: { day: snap.day.toISOString().slice(0, 10), features: snap.features },
      benchmarks,
      /* NIL job floors are in dollars (nil-jobs.ts); an item's price is in cents. */
      floorPriceCents: tierFloor !== undefined ? tierFloor * 100 : null,
      peers,
      computedAt: now,
    });
    if (!recommendation) continue;
    out.push({
      snapshotDay: snap.day.toISOString().slice(0, 10),
      inventory: { id: i.id, title: i.title, kind: i.kind, seller: { kind: "ATHLETE", id: i.athleteId!, name: i.athlete.displayName }, priceCents: i.priceCents },
      recommendation,
    });
  }
  return out;
}

/* ───────────────────────────── storing (3S2-BE-03) ───────────────────────────── */

export type StoreReport = { tenants: number; items: number; stored: number; alreadyStored: number; skipped: string[] };

/**
 * Store today's suggestion for every priceable athlete item, as made. One per
 * item per UTC day: a second run the same day stores nothing new, and the
 * database refuses any edit of what was stored. `skipTenants` store none —
 * the worker passes the tenants whose fact check failed.
 */
export async function storePricingRecommendations(now: Date, opts: { tenantId?: string; skipTenants?: string[] } = {}): Promise<StoreReport> {
  const skip = new Set(opts.skipTenants ?? []);
  const tenants = opts.tenantId
    ? [opts.tenantId]
    : (await prisma.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  let items = 0;
  let stored = 0;
  for (const tenantId of tenants.filter((t) => !skip.has(t))) {
    const priced = await priceTenant(tenantId, now);
    items += priced.length;
    if (!priced.length) continue;
    const res = await prisma.pricingRecommendation.createMany({
      data: priced.map((p) => ({
        tenantId, inventoryId: p.inventory.id, athleteId: p.inventory.seller.id, day,
        snapshotDay: new Date(`${p.snapshotDay}T00:00:00Z`),
        modelVersion: p.recommendation.stamp.modelVersion, confidence: p.recommendation.stamp.confidence,
        currentCpmCents: p.recommendation.currentCpmCents, recommendedCpmCents: p.recommendation.recommendedCpmCents,
        baseCpmCents: p.recommendation.baseCpmCents, floorCpmCents: p.recommendation.floorCpmCents,
        factors: p.recommendation.factors as unknown as Prisma.InputJsonValue,
        range: (p.recommendation.range ?? Prisma.DbNull) as Prisma.InputJsonValue,
        computedAt: now,
      })),
      skipDuplicates: true,
    });
    stored += res.count;
  }
  return { tenants: tenants.filter((t) => !skip.has(t)).length, items, stored, alreadyStored: items - stored, skipped: tenants.filter((t) => skip.has(t)) };
}

/* ───────────────────────────── reads ───────────────────────────── */

type StoredRow = {
  id: string; inventoryId: string; athleteId: string; modelVersion: string; confidence: number; currentCpmCents: number | null;
  recommendedCpmCents: number; baseCpmCents: number; floorCpmCents: number | null; factors: Factor[]; range: Range | null; computedAt: Date;
  title: string; kind: string; priceCents: number; sellerName: string;
};

const fromStored = (r: StoredRow): Priced => ({
  inventory: { id: r.inventoryId, title: r.title, kind: r.kind, seller: { kind: "ATHLETE", id: r.athleteId, name: r.sellerName }, priceCents: r.priceCents },
  recommendation: {
    id: r.id, currentCpmCents: r.currentCpmCents, recommendedCpmCents: r.recommendedCpmCents, baseCpmCents: r.baseCpmCents,
    floorCpmCents: r.floorCpmCents, factors: r.factors, range: r.range,
    stamp: { modelVersion: r.modelVersion, confidence: r.confidence, computedAt: r.computedAt.toISOString() },
  },
});

/** Each active athlete item's latest stored suggestion, on or before today. */
async function latestStored(tenantId: string, now: Date, onlyItem?: string): Promise<Priced[]> {
  const rows = await prisma.$queryRawUnsafe<StoredRow[]>(
    /* tenant-scope: explicit — this tenant's suggestions, for its own active athlete items. */
    `SELECT DISTINCT ON (r."inventoryId")
            r.id, r."inventoryId", r."athleteId", r."modelVersion", r.confidence, r."currentCpmCents", r."recommendedCpmCents",
            r."baseCpmCents", r."floorCpmCents", r.factors, r.range, r."computedAt",
            i.title, i.kind, i."priceCents", a."displayName" AS "sellerName"
       FROM "PricingRecommendation" r
       JOIN "InventoryItem" i ON i.id = r."inventoryId" AND i."tenantId" = r."tenantId" AND i.active
       JOIN "Athlete" a ON a.id = r."athleteId" AND a."tenantId" = r."tenantId"
      WHERE r."tenantId" = $1 AND r.day <= $2::date AND ($3::text IS NULL OR r."inventoryId" = $3)
      ORDER BY r."inventoryId", r.day DESC`,
    tenantId, now.toISOString().slice(0, 10), onlyItem ?? null,
  );
  return rows.map(fromStored).sort((a, b) => a.inventory.title.localeCompare(b.inventory.title) || a.inventory.id.localeCompare(b.inventory.id));
}

/** The override in force for each item: the newest one (user, 2026-10-14 — it stays until another replaces it). */
async function overridesInForce(tenantId: string, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, { cpmCents: number; at: string }>();
  const rows = await prisma.$queryRawUnsafe<Array<{ inventoryId: string; cpmCents: number; createdAt: Date }>>(
    /* tenant-scope: explicit — this tenant's overrides. */
    `SELECT DISTINCT ON ("inventoryId") "inventoryId", "cpmCents", "createdAt"
       FROM "PricingOverride" WHERE "tenantId" = $1 AND "inventoryId" = ANY($2::text[])
      ORDER BY "inventoryId", "createdAt" DESC, id DESC`,
    tenantId, itemIds,
  );
  return new Map(rows.map((r) => [r.inventoryId, { cpmCents: r.cpmCents, at: r.createdAt.toISOString() }]));
}

const FLAT = 0.005;
const direction = (r: Recommendation) => {
  if (r.currentCpmCents === null || r.currentCpmCents === 0) return "none" as const;
  const d = r.recommendedCpmCents / r.currentCpmCents - 1;
  return Math.abs(d) <= FLAT ? ("flat" as const) : d > 0 ? ("above" as const) : ("below" as const);
};

export type PricingDeskView = "above" | "below" | "low" | "";

/** GET /intelligence/pricing — the priced items, a page of them, and the summary over all of them. */
export async function pricingDesk(actor: Actor, q: { page: PageRequest; search?: string; view?: PricingDeskView }, now = new Date()) {
  assertTenantWide(actor, "pricingRecommendation", "read");
  const all = await latestStored(actor.tenantId, now);
  const summary = {
    priced: all.length,
    above: all.filter((p) => direction(p.recommendation) === "above").length,
    below: all.filter((p) => direction(p.recommendation) === "below").length,
    atRate: all.filter((p) => direction(p.recommendation) === "flat").length,
    lowConfidence: all.filter((p) => p.recommendation.stamp.confidence < LOW_CONFIDENCE).length,
  };
  const term = q.search?.trim().toLowerCase();
  const shown = all
    .filter((p) => !term || p.inventory.title.toLowerCase().includes(term) || p.inventory.seller.name.toLowerCase().includes(term))
    .filter((p) => !q.view || (q.view === "low" ? p.recommendation.stamp.confidence < LOW_CONFIDENCE : direction(p.recommendation) === q.view));
  const pageItems = shown.slice(q.page.skip, q.page.skip + q.page.take);
  const overrides = await overridesInForce(actor.tenantId, pageItems.map((p) => p.inventory.id));
  const page: PageInfo = { page: q.page.page, size: q.page.size, total: shown.length, pages: Math.max(1, Math.ceil(shown.length / q.page.size)) };
  return {
    items: pageItems.map((p) => ({
      inventoryId: p.inventory.id, title: p.inventory.title, kind: p.inventory.kind, seller: p.inventory.seller,
      recommendationId: p.recommendation.id, currentCpmCents: p.recommendation.currentCpmCents,
      recommendedCpmCents: p.recommendation.recommendedCpmCents, override: overrides.get(p.inventory.id) ?? null, stamp: p.recommendation.stamp,
    })),
    page,
    summary,
  };
}

/** GET /intelligence/pricing/:inventoryId — one item's latest suggestion, with its factors and range, and every override. */
export async function pricingDetail(actor: Actor, inventoryId: string, now = new Date()) {
  assertTenantWide(actor, "pricingRecommendation", "read");
  const [p] = await latestStored(actor.tenantId, now, inventoryId);
  if (!p) throw new NotPricedError();
  const overrides = await prisma.$queryRawUnsafe<Array<{ id: string; cpmCents: number; reason: string; email: string | null; createdAt: Date }>>(
    /* tenant-scope: explicit — this tenant's overrides of this item, newest first. */
    `SELECT o.id, o."cpmCents", o.reason, u.email, o."createdAt"
       FROM "PricingOverride" o LEFT JOIN "User" u ON u.id = o."byUserId" AND u."tenantId" = o."tenantId"
      WHERE o."tenantId" = $1 AND o."inventoryId" = $2
      ORDER BY o."createdAt" DESC, o.id DESC`,
    actor.tenantId, inventoryId,
  );
  return {
    inventory: p.inventory,
    recommendation: p.recommendation,
    overrides: overrides.map((o) => ({ id: o.id, cpmCents: o.cpmCents, reason: o.reason, by: { name: o.email ?? "a former user" }, at: o.createdAt.toISOString() })),
    canOverride: can(actor, "pricingRecommendation", "write"),
  };
}

/* ───────────────────────────── overrides (3S2-BE-03) ───────────────────────────── */

export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;
/** An override above $10,000 per 1,000 impressions is a typo, not a price — refused on the wire (QA 2026-10-15; the screen stops at the same figure). */
export const OVERRIDE_MAX_CENTS = 1_000_000;

export class OverrideReasonError extends Error {
  readonly status = 422;
  readonly code = "override_reason";
  constructor() {
    super(`An override needs a reason of ${OVERRIDE_REASON_MIN}–${OVERRIDE_REASON_MAX} characters.`);
    this.name = "OverrideReasonError";
  }
}

export class OverrideBelowFloorError extends Error {
  readonly status = 422;
  readonly code = "override_below_floor";
  constructor(floorCpmCents: number) {
    super(`An override cannot go below the sell floor (${floorCpmCents} cents per 1,000 impressions).`);
    this.name = "OverrideBelowFloorError";
  }
}

/**
 * POST /intelligence/pricing/recommendations/:id/overrides — a BTG admin's own
 * price, with the reason. It is a record of its own and an audit row; the
 * suggestion is never touched, and neither is the item's listed price (user,
 * 2026-10-14). Below the sell floor it is refused, and the attempt itself is
 * audited (`pricing.floorOverrideAttempt`).
 */
export async function overridePrice(actor: Actor, recommendationId: string, input: { cpmCents: number; reason: string }) {
  assertTenantWide(actor, "pricingRecommendation", "write");
  const rec = await prisma.pricingRecommendation.findFirst({
    where: { id: recommendationId, tenantId: actor.tenantId },
    select: { id: true, inventoryId: true, floorCpmCents: true, recommendedCpmCents: true },
  });
  if (!rec) throw new NotPricedError();
  const reason = input.reason.trim();
  if (reason.length < OVERRIDE_REASON_MIN || reason.length > OVERRIDE_REASON_MAX) throw new OverrideReasonError();
  if (rec.floorCpmCents !== null && input.cpmCents < rec.floorCpmCents) {
    await prisma.$transaction((tx) => audit(tx, actor, AUDIT_ACTIONS.pricing.floorOverrideAttempt, "PricingRecommendation", rec.id, {
      after: { inventoryId: rec.inventoryId, attemptedCpmCents: input.cpmCents, floorCpmCents: rec.floorCpmCents, reason },
    }));
    throw new OverrideBelowFloorError(rec.floorCpmCents);
  }
  const override = await prisma.$transaction(async (tx) => {
    const o = await tx.pricingOverride.create({
      data: { tenantId: actor.tenantId, inventoryId: rec.inventoryId, recommendationId: rec.id, cpmCents: input.cpmCents, reason, byUserId: actor.userId },
      select: { id: true, cpmCents: true, reason: true, createdAt: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.pricing.override, "PricingOverride", o.id, {
      after: { inventoryId: rec.inventoryId, recommendationId: rec.id, recommendedCpmCents: rec.recommendedCpmCents, cpmCents: input.cpmCents, reason },
    });
    return o;
  });
  const me = await prisma.user.findFirst({ where: { id: actor.userId, tenantId: actor.tenantId }, select: { email: true } });
  return { override: { id: override.id, cpmCents: override.cpmCents, reason: override.reason, by: { name: me?.email ?? "you" }, at: override.createdAt.toISOString() } };
}
