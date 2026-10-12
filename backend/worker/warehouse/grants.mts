/**
 * The product database's read-only login for warehouse ingestion — 3S0-OPS-01.
 *
 * COLUMN-LEVEL, FROM THE ALLOW-LIST (user, 2026-10-12). The login may SELECT
 * exactly the columns `sources.mts` copies, plus the transient ones read to
 * compute a value (an athlete's birth date, for `is_minor`) — nothing else,
 * and no table outside the list. So the database itself enforces what the
 * allow-list promises: a personal column is refused by Postgres even if code
 * asked for it. Generated here so the two can never drift apart.
 *
 * Re-runnable: it resets the role's password and column grants each time,
 * so adding a column to `sources.mts` and re-applying is the whole procedure.
 * Applied to staging and production with `scripts/warehouse-reader.mts`.
 */
import type pg from "pg";

import { SOURCES, TRANSIENT_COLUMNS } from "./sources.mts";

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** The grant statements for `role`, in order. The role must already exist. */
export function readerGrantStatements(role: string): string[] {
  const r = ident(role);
  return [
    /* Start from nothing: table-level grants, then any column-level ones left by an earlier list. */
    `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${r}`,
    `DO $$ DECLARE c record; BEGIN
       FOR c IN SELECT DISTINCT table_name FROM information_schema.column_privileges
                 WHERE grantee = ${`'${role.replace(/'/g, "''")}'`} AND table_schema = 'public' LOOP
         EXECUTE format('REVOKE ALL (%s) ON TABLE public.%I FROM %I',
           (SELECT string_agg(quote_ident(column_name), ', ') FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = c.table_name), c.table_name, ${`'${role.replace(/'/g, "''")}'`});
       END LOOP;
       EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), ${`'${role.replace(/'/g, "''")}'`});
     END $$`,
    `GRANT USAGE ON SCHEMA public TO ${r}`,
    ...SOURCES.map((s) => {
      const cols = [...s.columns, ...(TRANSIENT_COLUMNS[s.table] ?? [])].map(ident).join(", ");
      return `GRANT SELECT (${cols}) ON TABLE "public".${ident(s.table)} TO ${r}`;
    }),
    /* Belt and braces: every transaction it opens is read-only. */
    `ALTER ROLE ${r} SET default_transaction_read_only = on`,
  ];
}

/** Create (or update) the login with this password, and apply its grants — one transaction. */
export async function applyReaderRole(admin: pg.Pool, role: string, password: string): Promise<void> {
  const db = await admin.connect();
  try {
    await db.query("BEGIN");
    const exists = await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    await db.query(`${exists.rowCount ? "ALTER" : "CREATE"} ROLE ${ident(role)} LOGIN PASSWORD ${db.escapeLiteral(password)}`);
    for (const statement of readerGrantStatements(role)) await db.query(statement);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}
