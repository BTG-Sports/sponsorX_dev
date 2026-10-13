/**
 * Warehouse ingestion — 3S1-DATA-01 (Spec §21;
 * documentation/SponsorX-Warehouse-Schema.md §2).
 *
 * Copies the product tables listed in `sources.mts` into the warehouse's
 * `raw` schema. Run hourly by the worker, only where `WAREHOUSE_DATABASE_URL`
 * is set; production stays off until 3S0-OPS-01 provisions the database.
 *
 * SAFE TO RE-RUN — the task's acceptance, and why each mode looks as it does:
 *   - APPEND tables keep one raw row per source row (`id` is the key), so
 *     re-reading the overlap updates rather than duplicates; a row only
 *     changes when its content hash does.
 *   - VERSIONED tables add a version only when a row's content hash differs
 *     from its latest version, so unchanged data adds nothing however often
 *     it runs; a row gone from the product gets one deleted version.
 *
 * ONE CONSISTENT VIEW OF THE PRODUCT. Every table is read inside one
 * REPEATABLE READ, READ ONLY transaction, so a run never sees an order
 * without the campaign it was written with. The product is only ever read.
 *
 * ONE RUN AT A TIME. A session advisory lock on the warehouse; a run that
 * cannot take it steps aside rather than queueing behind the one in progress.
 */
import type pg from "pg";

import { requiresGuardian } from "../../src/domain/guardian-rules.ts";
import { buildWarehouse } from "./build.mts";
import { migrateWarehouse } from "./migrate.mts";
import { reconcileWarehouse } from "./reconcile.mts";
import { SOURCES, TRANSIENT_COLUMNS, type Source } from "./sources.mts";

/** The advisory-lock key that keeps ingestion runs from overlapping. */
export const INGEST_LOCK_KEY = 3_100_001;
/** APPEND tables re-read this far behind their watermark each run. */
export const APPEND_OVERLAP_HOURS = 48;
const PAGE = 5_000;

export type TableOutcome =
  | { mode: "VERSIONED"; read: number; versions: number; deleted: number }
  | { mode: "APPEND"; read: number; inserted: number; updated: number };

export type IngestOutcome =
  | { status: "ok"; runId: number; rows: Record<string, TableOutcome>; built: Record<string, number>; buildMs: number;
      reconciled: { ok: boolean; failed: { check: string; key: string; warehouse: number; product: number }[] } }
  | { status: "skipped"; reason: string };

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** Create each source's raw table if it is not there yet. Two shapes, by mode. */
async function ensureRawTables(db: pg.ClientBase): Promise<void> {
  for (const s of SOURCES) {
    const t = `raw.${q(s.table)}`;
    if (s.mode === "APPEND") {
      await db.query(`CREATE TABLE IF NOT EXISTS ${t} (
        id text PRIMARY KEY, tenant_id text NOT NULL, _row jsonb NOT NULL, _row_hash text NOT NULL,
        _at timestamp NOT NULL, _ingested_at timestamptz NOT NULL DEFAULT now(), _updated_at timestamptz)`);
      await db.query(`CREATE INDEX IF NOT EXISTS ${q(`${s.table}_tenant_at`)} ON ${t} (tenant_id, _at)`);
    } else {
      await db.query(`CREATE TABLE IF NOT EXISTS ${t} (
        _version_id bigserial PRIMARY KEY, id text NOT NULL, tenant_id text NOT NULL, _row jsonb NOT NULL,
        _row_hash text NOT NULL, _deleted boolean NOT NULL DEFAULT false, _ingested_at timestamptz NOT NULL DEFAULT now())`);
      await db.query(`CREATE INDEX IF NOT EXISTS ${q(`${s.table}_id_version`)} ON ${t} (id, _version_id DESC)`);
      await db.query(`CREATE INDEX IF NOT EXISTS ${q(`${s.table}_tenant`)} ON ${t} (tenant_id)`);
    }
  }
}

type Extracted = { id: string; tenant_id: string; row: Record<string, unknown>; _at?: string };

/**
 * One page of a source, as JSON built by Postgres (so timestamps arrive as the
 * same ISO text every run, whatever the worker's own clock zone). Transient
 * columns are read beside the row, used, and dropped here.
 */
async function readPage(src: pg.ClientBase, s: Source, after: { id: string; at?: string } | null, since: string | null): Promise<Extracted[]> {
  const transient = TRANSIENT_COLUMNS[s.table] ?? [];
  const obj = `jsonb_build_object(${s.columns.map((c) => `'${c}', ${q(c)}`).join(", ")})`;
  const extra = transient.map((c) => (c === "birthDate" ? `(${q(c)} AT TIME ZONE 'UTC') AS ${q(`_t_${c}`)}` : `${q(c)} AS ${q(`_t_${c}`)}`));
  const where: string[] = [];
  const params: unknown[] = [];
  if (s.where) where.push(s.where);
  if (s.mode === "APPEND") {
    const at = q(s.timeColumn);
    if (since) { params.push(since); where.push(`${at} >= $${params.length}::timestamp`); }
    if (after) { params.push(after.at, after.id); where.push(`(${at}, "id") > ($${params.length - 1}::timestamp, $${params.length})`); }
    const sql = `SELECT "id", "tenantId", ${obj} AS row, ${at}::text AS _at${extra.length ? `, ${extra.join(", ")}` : ""}
                   FROM ${q(s.table)} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY ${at}, "id" LIMIT ${PAGE}`;
    return shape(s, (await src.query(sql, params)).rows);
  }
  if (after) { params.push(after.id); where.push(`"id" > $${params.length}`); }
  const sql = `SELECT "id", "tenantId", ${obj} AS row${extra.length ? `, ${extra.join(", ")}` : ""}
                 FROM ${q(s.table)} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY "id" LIMIT ${PAGE}`;
  return shape(s, (await src.query(sql, params)).rows);
}

function shape(s: Source, rows: Record<string, unknown>[]): Extracted[] {
  return rows.map((r) => {
    const row = { ...(r.row as Record<string, unknown>) };
    if (s.table === "Athlete") {
      /* The product's own minor rule; the birth date goes no further. */
      row.is_minor = requiresGuardian({
        birthDate: (r._t_birthDate as Date | null) ?? null,
        ageBand: (row.ageBand as string | null) ?? null,
        majorityAge: (r._t_majorityAge as number | null) ?? null,
      });
    }
    return { id: r.id as string, tenant_id: r.tenantId as string, row, ...(r._at ? { _at: r._at as string } : {}) };
  });
}

/** Stage extracted rows in a temporary table, hashing each row in Postgres. */
async function stage(wh: pg.ClientBase, rows: Extracted[], append: boolean): Promise<void> {
  if (!rows.length) return;
  await wh.query(
    `INSERT INTO _in (id, tenant_id, _row, _row_hash${append ? ", _at" : ""})
     SELECT x.id, x.tenant_id, x.row, md5(x.row::text)${append ? ", x._at::timestamp" : ""}
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, tenant_id text, row jsonb${append ? ", _at text" : ""})`,
    [JSON.stringify(rows)],
  );
}

async function copyVersioned(src: pg.ClientBase, wh: pg.ClientBase, s: Source): Promise<TableOutcome> {
  const t = `raw.${q(s.table)}`;
  await wh.query("BEGIN");
  try {
    await wh.query(`CREATE TEMP TABLE _in (id text PRIMARY KEY, tenant_id text NOT NULL, _row jsonb NOT NULL, _row_hash text NOT NULL) ON COMMIT DROP`);
    let read = 0;
    let after: { id: string } | null = null;
    for (;;) {
      const page = await readPage(src, s, after, null);
      await stage(wh, page, false);
      read += page.length;
      if (page.length < PAGE) break;
      after = { id: page[page.length - 1]!.id };
    }
    const latest = `SELECT DISTINCT ON (id) id, tenant_id, _row, _row_hash, _deleted FROM ${t} ORDER BY id, _version_id DESC`;
    const versions = await wh.query(
      `INSERT INTO ${t} (id, tenant_id, _row, _row_hash)
       SELECT i.id, i.tenant_id, i._row, i._row_hash FROM _in i LEFT JOIN (${latest}) l ON l.id = i.id
        WHERE l.id IS NULL OR l._deleted OR l._row_hash <> i._row_hash`,
    );
    const deleted = await wh.query(
      `INSERT INTO ${t} (id, tenant_id, _row, _row_hash, _deleted)
       SELECT l.id, l.tenant_id, l._row, l._row_hash, true FROM (${latest}) l
        WHERE NOT l._deleted AND NOT EXISTS (SELECT 1 FROM _in i WHERE i.id = l.id)`,
    );
    await wh.query("COMMIT");
    return { mode: "VERSIONED", read, versions: versions.rowCount ?? 0, deleted: deleted.rowCount ?? 0 };
  } catch (error) {
    await wh.query("ROLLBACK");
    throw error;
  }
}

async function copyAppend(src: pg.ClientBase, wh: pg.ClientBase, s: Source & { mode: "APPEND" }): Promise<TableOutcome> {
  const t = `raw.${q(s.table)}`;
  await wh.query("BEGIN");
  try {
    const mark = (await wh.query<{ since: string | null }>(
      `SELECT (last_at - make_interval(hours => $2))::text AS since FROM raw._watermark WHERE table_name = $1`,
      [s.table, APPEND_OVERLAP_HOURS],
    )).rows[0]?.since ?? null;
    await wh.query(`CREATE TEMP TABLE _in (id text PRIMARY KEY, tenant_id text NOT NULL, _row jsonb NOT NULL, _row_hash text NOT NULL, _at timestamp NOT NULL) ON COMMIT DROP`);
    let read = 0;
    let after: { id: string; at: string } | null = null;
    for (;;) {
      const page = await readPage(src, s, after, mark);
      await stage(wh, page, true);
      read += page.length;
      if (page.length < PAGE) break;
      const last = page[page.length - 1]!;
      after = { id: last.id, at: last._at! };
    }
    const written = await wh.query<{ inserted: boolean }>(
      `INSERT INTO ${t} AS r (id, tenant_id, _row, _row_hash, _at)
       SELECT id, tenant_id, _row, _row_hash, _at FROM _in
       ON CONFLICT (id) DO UPDATE SET _row = EXCLUDED._row, _row_hash = EXCLUDED._row_hash, _at = EXCLUDED._at, _updated_at = now()
        WHERE r._row_hash <> EXCLUDED._row_hash
       RETURNING (xmax = 0) AS inserted`,
    );
    await wh.query(
      `INSERT INTO raw._watermark (table_name, last_at)
       SELECT $1, max(_at) FROM _in HAVING max(_at) IS NOT NULL
       ON CONFLICT (table_name) DO UPDATE SET last_at = GREATEST(raw._watermark.last_at, EXCLUDED.last_at), updated_at = now()`,
      [s.table],
    );
    await wh.query("COMMIT");
    const inserted = written.rows.filter((r) => r.inserted).length;
    return { mode: "APPEND", read, inserted, updated: written.rows.length - inserted };
  } catch (error) {
    await wh.query("ROLLBACK");
    throw error;
  }
}

/** A build slower than this is logged as a warning: time to build the incremental mode (3S1-DATA-04). */
export const SLOW_BUILD_MS = 60_000;

export async function ingestWarehouse(opts: {
  product: pg.Pool;
  warehouse: pg.Pool;
  /** Tests only: runs after the copy, before the build and the double-check. */
  onCopied?: () => Promise<void>;
}): Promise<IngestOutcome> {
  const wh = await opts.warehouse.connect();
  try {
    const locked = (await wh.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [INGEST_LOCK_KEY])).rows[0]!.ok;
    if (!locked) return { status: "skipped", reason: "another ingestion run is in progress" };
    let runId: number | null = null;
    try {
      await migrateWarehouse(wh);
      await ensureRawTables(wh);
      runId = Number((await wh.query<{ id: string }>(`INSERT INTO raw._ingest_run DEFAULT VALUES RETURNING id`)).rows[0]!.id);
      const src = await opts.product.connect();
      const rows: Record<string, TableOutcome> = {};
      let built: Record<string, number>;
      let buildMs: number;
      let reconciled: { ok: boolean; failed: { check: string; key: string; warehouse: number; product: number }[] };
      try {
        await src.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        for (const s of SOURCES) rows[s.table] = s.mode === "APPEND" ? await copyAppend(src, wh, s) : await copyVersioned(src, wh, s);
        await opts.onCopied?.();
        /* 3S1-DATA-02 — rebuild the model from what was just copied, under the
           same lock, so facts never trail the raw layer by more than a run. */
        const started = Date.now();
        built = await buildWarehouse(wh);
        buildMs = Date.now() - started;
        /* The double-check, still inside the frozen view the copy was taken
           from: both sides see the same moment, so a booking made while this
           ran is not a false alarm. */
        const check = await reconcileWarehouse({ product: src, warehouse: wh });
        reconciled = { ok: check.ok, failed: check.checks.filter((c) => !c.ok).map(({ check: name, key, warehouse, product }) => ({ check: name, key, warehouse, product })) };
        await src.query("COMMIT");
      } catch (error) {
        await src.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        src.release();
      }
      await wh.query(`UPDATE raw._ingest_run SET status = 'ok', finished_at = now(), rows = $2, built = $3, build_ms = $4, reconcile = $5 WHERE id = $1`,
        [runId, JSON.stringify(rows), JSON.stringify(built), buildMs, JSON.stringify(reconciled)]);
      return { status: "ok", runId, rows, built, buildMs, reconciled };
    } catch (error) {
      if (runId !== null) {
        await wh.query(`UPDATE raw._ingest_run SET status = 'failed', finished_at = now(), error = $2 WHERE id = $1`,
          [runId, String((error as Error)?.message ?? error).slice(0, 2000)]).catch(() => {});
      }
      throw error;
    } finally {
      await wh.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK_KEY]).catch(() => {});
    }
  } finally {
    wh.release();
  }
}
