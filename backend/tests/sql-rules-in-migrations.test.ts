import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   The rules in prisma/sql/ must be what the MIGRATIONS install.

   CI applies every prisma/sql file after `prisma migrate deploy`; a Railway
   deploy only runs `prisma migrate deploy`. So a rule edited in prisma/sql
   and never carried into a migration passes every test and is missing from
   staging and production. That happened: the contract gate's lock on an
   order's acceptance and billing contact (2S4-FE-02) lived only in
   prisma/sql/marketplace_order_immutable.sql until 20261004000000.

   This builds a throwaway database from the migrations alone, takes a
   snapshot of every function, constraint, index, trigger and column default
   in it, applies prisma/sql the way CI does, and requires that nothing
   changed. Its own database, so the parallel suite is never touched.
   -------------------------------------------------------------------------- */

const backend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.DATABASE_URL;
const name = `sponsorx_sqlrules_${randomBytes(4).toString("hex")}`;
const url = base ? Object.assign(new URL(base), { pathname: `/${name}` }).toString() : "";
const admin = base ? Object.assign(new URL(base), { pathname: "/postgres" }).toString() : "";

type Snapshot = Record<string, string>;

async function snapshot(): Promise<Snapshot> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const out: Snapshot = {};
    const rows = async (sql: string) => (await c.query(sql)).rows as Record<string, string>[];
    for (const r of await rows(`SELECT p.proname AS n, pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace WHERE s.nspname = 'public'`)) out[`function ${r.n}`] = r.d!;
    for (const r of await rows(`SELECT conrelid::regclass::text AS t, conname AS n, pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE connamespace = 'public'::regnamespace`)) out[`constraint ${r.t}.${r.n}`] = r.d!;
    for (const r of await rows(`SELECT indexname AS n, indexdef AS d FROM pg_indexes WHERE schemaname = 'public'`)) out[`index ${r.n}`] = r.d!;
    for (const r of await rows(`SELECT tgname AS n, pg_get_triggerdef(oid) AS d FROM pg_trigger WHERE NOT tgisinternal`)) out[`trigger ${r.n}`] = r.d!;
    for (const r of await rows(`SELECT table_name AS t, column_name AS n, is_nullable || ' ' || coalesce(column_default, '') AS d FROM information_schema.columns WHERE table_schema = 'public'`)) out[`column ${r.t}.${r.n}`] = r.d!;
    return out;
  } finally {
    await c.end();
  }
}

async function onAdmin(sql: string) {
  const c = new pg.Client({ connectionString: admin });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

let fromMigrations: Snapshot = {};
let withSqlApplied: Snapshot = {};

beforeAll(async () => {
  if (!base) return;
  await onAdmin(`CREATE DATABASE "${name}"`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: backend, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  fromMigrations = await snapshot();
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const dir = resolve(backend, "prisma/sql");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) await c.query(readFileSync(resolve(dir, f), "utf8"));
  } finally {
    await c.end();
  }
  withSqlApplied = await snapshot();
}, 180_000);

afterAll(async () => {
  if (base) await onAdmin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
});

describe.skipIf(!base)("prisma/sql rules are installed by the migrations", () => {
  it("applying prisma/sql after the migrations changes nothing", () => {
    const changed = [...new Set([...Object.keys(fromMigrations), ...Object.keys(withSqlApplied)])]
      .filter((k) => fromMigrations[k] !== withSqlApplied[k])
      .sort();
    expect(changed, "these are in prisma/sql but no migration installs them — add a migration").toEqual([]);
  });

  it("an order's acceptance and billing contact are locked by what a deploy installs", () => {
    expect(fromMigrations["function marketplace_order_immutable"]).toContain(`"billingEmail"`);
  });

  it("no restrictions is an empty list, never NULL, so a shortlist never drops an athlete for it", () => {
    expect(fromMigrations["column Athlete.restrictedCategories"]).toBe("NO '{}'::text[]");
    expect(fromMigrations["column InventoryItem.restrictedCategories"]).toBe("NO '{}'::text[]");
  });
});
