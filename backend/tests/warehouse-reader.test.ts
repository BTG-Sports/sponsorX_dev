import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readerGrantStatements } from "../worker/warehouse/grants.mts";
import { SOURCES, TRANSIENT_COLUMNS } from "../worker/warehouse/sources.mts";

/* --------------------------------------------------------------------------
   3S0-OPS-01 — ingestion reads the product through a READ-ONLY login that
   can see exactly the allow-listed columns (user, 2026-10-12: "only the
   allow-listed columns"). The grants are generated from sources.mts, so the
   list in code and the list the database enforces cannot drift apart: if
   code ever asked for a personal column, Postgres would refuse it.
   -------------------------------------------------------------------------- */

const ROLE = "wi_reader_test";

describe("3S0-OPS-01 · the reader's grants", () => {
  const sql = readerGrantStatements(ROLE).join(";\n");

  it("grants SELECT on exactly the allow-listed columns of each table, plus the transient ones", () => {
    for (const s of SOURCES) {
      const cols = [...s.columns, ...(TRANSIENT_COLUMNS[s.table] ?? [])].map((c) => `"${c}"`).join(", ");
      expect(sql, s.table).toContain(`GRANT SELECT (${cols}) ON TABLE "public"."${s.table}" TO "${ROLE}"`);
    }
  });

  it("starts from nothing and stays read-only", () => {
    expect(sql).toContain(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${ROLE}"`);
    expect(sql).toContain(`ALTER ROLE "${ROLE}" SET default_transaction_read_only = on`);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)/);
  });

  it("the worker reads the product through WAREHOUSE_SOURCE_DATABASE_URL when it is set", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toContain("process.env.WAREHOUSE_SOURCE_DATABASE_URL");
  });
});

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S0-OPS-01 · the reader against Postgres", { timeout: 120_000 }, async () => {
  const { applyReaderRole } = await import("../worker/warehouse/grants.mts");
  const { ingestWarehouse } = await import("../worker/warehouse/ingest.mts");
  const admin = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
  const password = `pw_${Math.random().toString(36).slice(2)}`;
  const readerUrl = (() => { const u = new URL(seededDb.TEST_DATABASE_URL); u.username = ROLE; u.password = password; return u.toString(); })();
  const warehouseUrl = (() => { const u = new URL(seededDb.TEST_DATABASE_URL); u.pathname = `${u.pathname}_warehouse_reader`; return u.toString(); })();
  let reader: pg.Pool;
  let warehouse: pg.Pool;

  beforeAll(async () => {
    await applyReaderRole(admin, ROLE, password);
    reader = new pg.Pool({ connectionString: readerUrl });
    const name = new URL(warehouseUrl).pathname.slice(1);
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!exists.rowCount) await admin.query(`CREATE DATABASE "${name}"`);
    warehouse = new pg.Pool({ connectionString: warehouseUrl });
  });

  afterAll(async () => {
    await reader?.end();
    await warehouse?.end();
    await admin.query(`DROP OWNED BY "${ROLE}"`).catch(() => {});
    await admin.query(`DROP ROLE IF EXISTS "${ROLE}"`).catch(() => {});
    await admin.end();
  });

  it("applying it twice is safe (the password is reset, the grants are the same)", async () => {
    await applyReaderRole(admin, ROLE, password);
    expect((await reader.query("SELECT 1 AS ok")).rows[0].ok).toBe(1);
  });

  it("a full ingestion runs through the reader", async () => {
    const out = await ingestWarehouse({ product: reader, warehouse });
    expect(out.status).toBe("ok");
  });

  it("the reader is refused any column not on the list, and any write", async () => {
    await expect(reader.query(`SELECT "email" FROM "Athlete" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`SELECT "token" FROM "RewardToken" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`SELECT * FROM "User" LIMIT 1`)).rejects.toThrow(/permission denied/);
    await expect(reader.query(`UPDATE "Sponsor" SET name = name WHERE false`)).rejects.toThrow(/permission denied|read-only/);
  });
});
