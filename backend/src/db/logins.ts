/**
 * The live database's two logins — 3S1-OPS-03 (documentation/SponsorX-Fact-Ledger.md §10).
 *
 * Only the app writes. The app gets its own login, `sponsorx_app`: it owns
 * the database and everything in it, so it reads and writes rows and its
 * deploy step applies new tables (`prisma migrate deploy`). Developers get
 * `sponsorx_readonly`: it may look at every table, and Postgres refuses it
 * any write. Corrections are made through the admin actions, which record
 * their facts, so no edit can bypass the ledger. The master login Railway
 * keeps (`postgres`) is break-glass only (Deployment Runbook §6).
 *
 * Applied with `npm run db:logins` (scripts/db-logins.mts). Re-runnable: it
 * resets both passwords, and hands to the app anything another login created
 * since — run it again after break-glass work as the master login.
 */
import type pg from "pg";

export const APP_LOGIN = "sponsorx_app";
export const READONLY_LOGIN = "sponsorx_readonly";

export type Logins = { app: string; readonly: string };
export type LoginPasswords = { app: string; readonly: string };

const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Schemas the logins cover: every schema that is not Postgres' own (today `public` and pg-boss' `pgboss`). */
const USER_SCHEMAS = `SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' ORDER BY nspname`;

/**
 * The ALTER … OWNER statements that hand every object to `app`: tables,
 * views, sequences not owned by a column (those follow their table),
 * functions, enum and domain types, and the schemas themselves. Objects an
 * extension owns are left to it.
 */
async function ownershipStatements(db: pg.ClientBase, app: string): Promise<string[]> {
  const notExtension = (catalog: string, oid: string) =>
    `NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = '${catalog}'::regclass AND d.objid = ${oid} AND d.deptype = 'e')`;
  const sql = `
    WITH s AS (${USER_SCHEMAS}), me AS (SELECT oid FROM pg_roles WHERE rolname = $1)
    SELECT 0 AS step, format('ALTER SCHEMA %I OWNER TO %I', n.nspname, $1) AS statement
      FROM pg_namespace n JOIN s USING (nspname)
     WHERE n.nspowner <> (SELECT oid FROM me) AND n.nspowner <> 'pg_database_owner'::regrole
    UNION ALL
    SELECT 1, format('ALTER %s %I.%I OWNER TO %I',
             CASE c.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'S' THEN 'SEQUENCE' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
             n.nspname, c.relname, $1)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN s USING (nspname)
     WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f') AND c.relowner <> (SELECT oid FROM me)
       AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
       AND ${notExtension("pg_class", "c.oid")}
    UNION ALL
    SELECT 2, format('ALTER ROUTINE %s OWNER TO %I', p.oid::regprocedure, $1)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN s USING (nspname)
     WHERE p.proowner <> (SELECT oid FROM me) AND ${notExtension("pg_proc", "p.oid")}
    UNION ALL
    SELECT 3, format('ALTER %s %s OWNER TO %I', CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.oid::regtype, $1)
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN s USING (nspname)
     WHERE t.typtype IN ('e', 'd', 'r') AND t.typowner <> (SELECT oid FROM me) AND ${notExtension("pg_type", "t.oid")}
    ORDER BY 1, 2`;
  return (await db.query<{ statement: string }>(sql, [app])).rows.map((r) => r.statement);
}

async function upsertLogin(db: pg.ClientBase, role: string, password: string): Promise<void> {
  const exists = await db.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
  await db.query(
    `${exists.rowCount ? "ALTER" : "CREATE"} ROLE ${ident(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${db.escapeLiteral(password)}`,
  );
}

export type LoginsReport = { schemas: string[]; objectsHandedOver: number };

/**
 * Create (or update) both logins and their rights — one transaction, as a
 * superuser connected to the live database. Nothing is changed if any
 * statement fails.
 */
export async function applyLogins(admin: pg.Pool, passwords: LoginPasswords, logins: Logins = { app: APP_LOGIN, readonly: READONLY_LOGIN }): Promise<LoginsReport> {
  const db = await admin.connect();
  try {
    const me = await db.query<{ rolsuper: boolean }>("SELECT rolsuper FROM pg_roles WHERE rolname = current_user");
    if (!me.rows[0]?.rolsuper) throw new Error("Run this as the master login (a superuser): only it can hand the database over.");
    await db.query("BEGIN");
    await upsertLogin(db, logins.app, passwords.app);
    await upsertLogin(db, logins.readonly, passwords.readonly);
    const app = ident(logins.app);
    const ro = ident(logins.readonly);

    /* The app: owner of the database (so `public`, owned by pg_database_owner, is its own) and of everything in it. */
    await db.query(`DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), ${db.escapeLiteral(logins.app)}); END $$`);
    const handOver = await ownershipStatements(db, logins.app);
    for (const statement of handOver) await db.query(statement);

    /* Developers: connect and look, in every schema, including tables the app adds later. No write is granted. */
    const schemas = (await db.query<{ nspname: string }>(USER_SCHEMAS)).rows.map((r) => r.nspname);
    await db.query(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), ${db.escapeLiteral(logins.readonly)}); END $$`);
    for (const s of schemas.map(ident)) {
      await db.query(`REVOKE CREATE ON SCHEMA ${s} FROM PUBLIC`);
      await db.query(`GRANT USAGE ON SCHEMA ${s} TO ${ro}`);
      await db.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${s} TO ${ro}`);
      await db.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${app} IN SCHEMA ${s} GRANT SELECT ON TABLES TO ${ro}`);
    }
    /* Belt and braces: a person's every transaction starts read-only. */
    await db.query(`ALTER ROLE ${ro} SET default_transaction_read_only = on`);
    await db.query("COMMIT");
    return { schemas, objectsHandedOver: handOver.length };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
}

/** The connection URL for `role`: the admin URL with that login's name and password. */
export function loginUrl(adminUrl: string, role: string, password: string): string {
  const u = new URL(adminUrl);
  u.username = encodeURIComponent(role);
  u.password = encodeURIComponent(password);
  return u.toString();
}

export type LoginsCheck = {
  appIsSuperuser: boolean;
  notOwnedByApp: number;
  appCanChangeTables: boolean;
  readonlyCanRead: boolean;
  readonlyWriteRefused: boolean;
  readonlyCreateRefused: boolean;
};

const refused = async (db: pg.ClientBase, sql: string): Promise<boolean> => {
  await db.query("BEGIN");
  try {
    await db.query(sql);
    return false;
  } catch (error) {
    return (error as { code?: string }).code === "42501";
  } finally {
    await db.query("ROLLBACK");
  }
};

/**
 * Prove it, logged in as each login: the app is no superuser, owns
 * everything, and can apply a new table; the read-only login can read, and
 * is refused a write and a new table even with read-only switched off.
 * Every probe is rolled back.
 */
export async function checkLogins(pgLib: typeof pg, adminUrl: string, passwords: LoginPasswords, logins: Logins = { app: APP_LOGIN, readonly: READONLY_LOGIN }): Promise<LoginsCheck> {
  const app = new pgLib.Client({ connectionString: loginUrl(adminUrl, logins.app, passwords.app) });
  const ro = new pgLib.Client({ connectionString: loginUrl(adminUrl, logins.readonly, passwords.readonly) });
  await app.connect();
  await ro.connect();
  try {
    const appIsSuperuser = (await app.query<{ rolsuper: boolean }>("SELECT rolsuper FROM pg_roles WHERE rolname = current_user")).rows[0]!.rolsuper;
    const notOwnedByApp = (await ownershipStatements(app, logins.app)).length;
    await app.query("BEGIN");
    let appCanChangeTables = true;
    try {
      await app.query(`CREATE TABLE public."__logins_probe" (id int)`);
      await app.query(`ALTER TABLE public."_prisma_migrations" ADD COLUMN "__logins_probe" int`);
    } catch {
      appCanChangeTables = false;
    } finally {
      await app.query("ROLLBACK");
    }
    let readonlyCanRead = true;
    try {
      await ro.query(`SELECT count(*) FROM public."_prisma_migrations"`);
    } catch {
      readonlyCanRead = false;
    }
    await ro.query("SET default_transaction_read_only = off");
    const readonlyWriteRefused = await refused(ro, `UPDATE public."_prisma_migrations" SET id = id`);
    const readonlyCreateRefused = await refused(ro, `CREATE TABLE public."__logins_probe" (id int)`);
    return { appIsSuperuser, notOwnedByApp, appCanChangeTables, readonlyCanRead, readonlyWriteRefused, readonlyCreateRefused };
  } finally {
    await app.end();
    await ro.end();
  }
}

export const loginsOk = (c: LoginsCheck): boolean =>
  !c.appIsSuperuser && c.notOwnedByApp === 0 && c.appCanChangeTables && c.readonlyCanRead && c.readonlyWriteRefused && c.readonlyCreateRefused;
