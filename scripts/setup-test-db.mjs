#!/usr/bin/env node
/* --------------------------------------------------------------------------
   npm run db:test — build the local test database exactly as CI does.

   The backend suite (including the seeded half of the authorisation matrix)
   runs against a database called `sponsorx_test`, never the dev database
   your running app uses — suites delete what they create, and the audit log
   may only be purged in a database marked for it. CI builds that database in
   four steps (.github/workflows/ci.yml, job "unit"); this is the same four,
   with no `psql` needed on your machine:

     1. drop and recreate `sponsorx_test` on the local Postgres
     2. `prisma migrate deploy` against it
     3. apply backend/prisma/sql/*.sql (partial indexes, the immutable
        ledger) — Prisma's schema language cannot express them
     4. mark it purgeable: sponsorx.audit_purge = 'on'

   Needs the local stack up first (`npm run infra:up`). Safe to re-run; it
   always starts from an empty database.

     npm run db:test
     DATABASE_URL=postgresql://sponsorx:sponsorx@localhost:5432/sponsorx_test npm test -w @sponsorx/backend

   P8-PMO-05 (developer handoff). See documentation/SponsorX-Developer-Handoff.md.
   -------------------------------------------------------------------------- */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ADMIN_URL = process.env.TEST_DB_ADMIN_URL ?? "postgresql://sponsorx:sponsorx@localhost:5432/postgres";
const NAME = "sponsorx_test";
const TEST_URL = ADMIN_URL.replace(/\/[^/?]*(\?|$)/, `/${NAME}$1`);

if (!/^[a-z_]+$/.test(NAME)) throw new Error("unsafe database name");

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (e) {
    console.error(`\n✗ Cannot reach Postgres at ${url.replace(/:[^:@/]*@/, ":***@")}.\n  Is the stack up? Run \`npm run infra:up\`.\n  (${e.message})`);
    process.exit(1);
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

console.log(`1/4  recreate ${NAME}`);
await withClient(ADMIN_URL, async (c) => {
  await c.query(`DROP DATABASE IF EXISTS ${NAME} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${NAME}`);
});

console.log("2/4  prisma migrate deploy");
execFileSync("npm", ["run", "prisma:deploy", "-w", "@sponsorx/backend"], {
  cwd: ROOT,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, DATABASE_URL: TEST_URL },
  shell: process.platform === "win32", // npm is npm.cmd on Windows
});

const sqlDir = join(ROOT, "backend", "prisma", "sql");
const files = readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();
console.log(`3/4  apply ${files.length} SQL files from backend/prisma/sql`);
await withClient(TEST_URL, async (c) => {
  for (const f of files) {
    try {
      await c.query(readFileSync(join(sqlDir, f), "utf8"));
    } catch (e) {
      console.error(`\n✗ ${f}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log("4/4  mark purgeable");
  await c.query(`ALTER DATABASE ${NAME} SET sponsorx.audit_purge = 'on'`);
});

console.log(`\n✓ ${NAME} is ready. Run the backend suite against it:\n\n  DATABASE_URL=${TEST_URL} npm test -w @sponsorx/backend\n`);
