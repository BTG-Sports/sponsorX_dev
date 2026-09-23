/**
 * Metric rollup — P7-DATA-02, §22.
 *
 * Totals athlete and campaign performance on a schedule.
 *
 * THE ROLLUP STORES NOTHING AUTHORITATIVE, AND THAT IS THE ACCEPTANCE.
 * "Aggregates are reproducible from events" is easy to claim and easy to
 * break: the usual implementation writes totals into an aggregate table, and
 * from that moment the table can drift from the rows it came from — a
 * backdated correction, a missed run, a partial failure, and the stored total
 * is quietly wrong with nothing to compare it against.
 *
 * So there is no aggregate table. Every total is computed from `MetricDaily`
 * by a single GROUP BY, and the result is written only to Redis, which the
 * architecture already designates as cache-only (Addendum A3). A cache that
 * is lost costs a recomputation; a cache that is stale is replaced by the
 * next run; and the number a sponsor is shown is always derived from the rows
 * that justify it.
 *
 * PROVENANCE SURVIVES THE ROLLUP. The group is BY SOURCE, so an aggregate is
 * five numbers rather than one. A rollup that summed the labels away would
 * destroy the exact distinction P7-DATA-01 exists to protect, one layer below
 * where anyone would think to look for it.
 */
import type pg from "pg";

import {
  emptyTotals, type MetricSource, type SourcedTotals, verifiedTotal,
} from "../../src/domain/metric-source.ts";

export type RollupOutcome = {
  campaigns: number;
  athletes: number;
  cached: number;
};

type GroupedRow = {
  key: string;
  source: string;
  views: string | number;
  engagements: string | number;
};

export type RolledUp = {
  key: string;
  views: SourcedTotals;
  engagements: SourcedTotals;
  verifiedViews: number;
  verifiedEngagements: number;
};

/** Cache keys. Namespaced so a flush of one kind cannot take the other. */
export function campaignKey(id: string): string {
  return `metrics:campaign:${id}`;
}
export function athleteKey(id: string): string {
  return `metrics:athlete:${id}`;
}

/** Fold the grouped rows into one entry per subject, five labels each. */
export function foldGrouped(rows: GroupedRow[]): RolledUp[] {
  const bySubject = new Map<string, RolledUp>();
  for (const r of rows) {
    let entry = bySubject.get(r.key);
    if (!entry) {
      entry = {
        key: r.key,
        views: emptyTotals(),
        engagements: emptyTotals(),
        verifiedViews: 0,
        verifiedEngagements: 0,
      };
      bySubject.set(r.key, entry);
    }
    const s = r.source as MetricSource;
    entry.views[s] += Number(r.views);
    entry.engagements[s] += Number(r.engagements);
  }
  for (const entry of bySubject.values()) {
    entry.verifiedViews = verifiedTotal(entry.views);
    entry.verifiedEngagements = verifiedTotal(entry.engagements);
  }
  return [...bySubject.values()];
}

/* One statement per subject. Grouped BY SOURCE so the five labels survive. */
const CAMPAIGN_SQL = `
  SELECT o."campaignId" AS key, m.source::text AS source,
         SUM(m.views) AS views, SUM(m.engagements) AS engagements
    FROM "MetricDaily" m
    JOIN "Deliverable" d ON d.id = m."deliverableId"
    JOIN "CampaignOrder" o ON o.id = d."orderId"
   GROUP BY o."campaignId", m.source`;

const ATHLETE_SQL = `
  SELECT o."athleteId" AS key, m.source::text AS source,
         SUM(m.views) AS views, SUM(m.engagements) AS engagements
    FROM "MetricDaily" m
    JOIN "Deliverable" d ON d.id = m."deliverableId"
    JOIN "CampaignOrder" o ON o.id = d."orderId"
   GROUP BY o."athleteId", m.source`;

/**
 * Recompute every aggregate and warm the cache.
 *
 * `cache` is injected so this is testable without Redis, and so the job does
 * not reach into the API's client. A cache write that fails is logged by the
 * caller and costs nothing — the next read recomputes.
 */
export async function handleRollupMetrics(
  db: pg.Pool,
  deps: {
    cache: { set: (key: string, value: string, ttlSeconds: number) => Promise<void> } | null;
    ttlSeconds?: number;
  },
): Promise<RollupOutcome> {
  const [campaignRows, athleteRows] = await Promise.all([
    db.query<GroupedRow>(CAMPAIGN_SQL),
    db.query<GroupedRow>(ATHLETE_SQL),
  ]);

  const campaigns = foldGrouped(campaignRows.rows);
  const athletes = foldGrouped(athleteRows.rows);

  let cached = 0;
  if (deps.cache) {
    /* A generous TTL. The cache is a convenience, not a schedule: it expires
       so a subject whose rows were deleted stops being served a total that no
       longer has anything behind it. */
    const ttl = deps.ttlSeconds ?? 60 * 60 * 25;
    for (const c of campaigns) {
      await deps.cache.set(campaignKey(c.key), JSON.stringify(c), ttl);
      cached += 1;
    }
    for (const a of athletes) {
      await deps.cache.set(athleteKey(a.key), JSON.stringify(a), ttl);
      cached += 1;
    }
  }

  return { campaigns: campaigns.length, athletes: athletes.length, cached };
}
