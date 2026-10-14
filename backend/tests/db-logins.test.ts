import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyLogins, checkLogins, loginsOk, loginUrl } from "../src/db/logins";

/* --------------------------------------------------------------------------
   3S1-OPS-03 — only the app writes to the live database
   (documentation/SponsorX-Fact-Ledger.md §10, Deployment Runbook §6).

   A scratch database built the way staging and production were: every
   migration applied, and pg-boss' schema created, all by the master login.
   Then the two logins are applied, and each is tried for real.

   Done when: only the app's login can write; a read-only login exists for
   people. The app's login still deploys (applies new tables) and runs the
   job queue.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("3S1-OPS-03 · the app's login and people's read-only login", { timeout: 180_000 }, () => {
  const tag = Math.random().toString(36).slice(2, 8);
  const logins = { app: `t_ol_app_${tag}`, readonly: `t_ol_ro_${tag}` };
  const passwords = { app: `app_${tag}_${"x".repeat(24)}`, readonly: `ro_${tag}_${"y".repeat(24)}` };
  const name = `sponsorx_logins_${tag}`;
  const scratchUrl = (() => { const u = new URL(seededDb.TEST_DATABASE_URL); u.pathname = `/${name}`; return u.toString(); })();
  const appUrl = loginUrl(scratchUrl, logins.app, passwords.app);
  const roUrl = loginUrl(scratchUrl, logins.readonly, passwords.readonly);
  const server = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, max: 1 });
  let master: pg.Pool;
  const as = async <T>(url: string, run: (db: pg.Client) => Promise<T>): Promise<T> => {
    const db = new pg.Client({ connectionString: url });
    await db.connect();
    try { return await run(db); } finally { await db.end(); }
  };
  const errorCode = (p: Promise<unknown>) => p.then(() => "none", (e: { code?: string }) => e.code);
  const migrate = (url: string) => execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", stdio: "pipe",
  });

  beforeAll(async () => {
    await server.query(`CREATE DATABASE "${name}"`);
    migrate(scratchUrl);
    const boss = new PgBoss({ connectionString: scratchUrl });
    await boss.start();
    await boss.stop({ graceful: false });
    master = new pg.Pool({ connectionString: scratchUrl, max: 1 });
  });

  afterAll(async () => {
    await master?.end();
    await server.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    for (const role of [logins.app, logins.readonly]) await server.query(`DROP ROLE IF EXISTS "${role}"`).catch(() => {});
    await server.end();
  });

  it("hands the whole database to the app's login, and every check passes", async () => {
    const report = await applyLogins(master, passwords, logins);
    expect(report.schemas).toEqual(["pgboss", "public"]);
    expect(report.objectsHandedOver).toBeGreaterThan(100);
    const check = await checkLogins(pg, scratchUrl, passwords, logins);
    expect(check).toEqual({
      appIsSuperuser: false, notOwnedByApp: 0, appCanChangeTables: true,
      readonlyCanRead: true, readonlyWriteRefused: true, readonlyCreateRefused: true,
    });
    expect(loginsOk(check)).toBe(true);
  });

  it("people's login reads every table, and every write is refused — even with read-only switched off", async () => {
    await as(roUrl, async (db) => {
      expect((await db.query(`SELECT count(*)::int AS n FROM "Fact"`)).rows[0].n).toBe(0);
      expect((await db.query(`SELECT count(*)::int AS n FROM pgboss.job`)).rows[0].n).toBe(0);
      expect(await errorCode(db.query(`INSERT INTO "Tenant" (id, name) VALUES ('t_ol', 'x')`))).toBe("25006");
      await db.query("SET default_transaction_read_only = off");
      expect(await errorCode(db.query(`INSERT INTO "Tenant" (id, name) VALUES ('t_ol', 'x')`))).toBe("42501");
      expect(await errorCode(db.query(`UPDATE "CampaignOrder" SET "sellPrice" = 0`))).toBe("42501");
      expect(await errorCode(db.query(`DELETE FROM "AuditLog"`))).toBe("42501");
      expect(await errorCode(db.query(`DELETE FROM pgboss.job`))).toBe("42501");
      expect(await errorCode(db.query(`ALTER TABLE "Fact" DISABLE TRIGGER ALL`))).toBe("42501");
      expect(await errorCode(db.query(`CREATE TABLE public.mine (id int)`))).toBe("42501");
    });
  });

  it("the app's login still deploys: migrate deploy runs as it", () => {
    expect(migrate(appUrl)).toMatch(/No pending migrations|migrations? (found|applied)/i);
  });

  it("the app's login runs the job queue", async () => {
    const boss = new PgBoss({ connectionString: appUrl });
    await boss.start();
    try {
      await boss.createQueue("logins.probe");
      expect(await boss.send("logins.probe", { ok: true })).toBeTruthy();
      expect(await boss.fetch("logins.probe")).toHaveLength(1);
    } finally {
      await boss.stop({ graceful: false });
    }
  });

  it("the app's login reads the backup archiver's statistics (the system-health check)", async () => {
    await as(appUrl, async (db) => {
      expect((await db.query(`SELECT last_archived_time, last_failed_time FROM pg_stat_archiver`)).rows).toHaveLength(1);
    });
  });

  it("a table the app adds later can be read by people, and not written", async () => {
    await as(appUrl, (db) => db.query(`CREATE TABLE public."LoginsLater" (id int); INSERT INTO public."LoginsLater" VALUES (1)`));
    await as(roUrl, async (db) => {
      expect((await db.query(`SELECT id FROM "LoginsLater"`)).rows).toEqual([{ id: 1 }]);
      await db.query("SET default_transaction_read_only = off");
      expect(await errorCode(db.query(`INSERT INTO "LoginsLater" VALUES (2)`))).toBe("42501");
    });
  });

  it("re-running is safe, and hands over what the master login made since (break-glass work)", async () => {
    await master.query(`CREATE TABLE public."MadeByMaster" (id int)`);
    expect((await applyLogins(master, passwords, logins)).objectsHandedOver).toBe(1);
    expect(loginsOk(await checkLogins(pg, scratchUrl, passwords, logins))).toBe(true);
    await as(roUrl, (db) => db.query(`SELECT * FROM "MadeByMaster"`));
  });

  it("only the master login can apply it", async () => {
    const appPool = new pg.Pool({ connectionString: appUrl, max: 1 });
    try {
      await expect(applyLogins(appPool, passwords, logins)).rejects.toThrow(/master login/);
    } finally {
      await appPool.end();
    }
  });
});
