/**
 * Look at the live database as a developer — 3S1-OPS-03. Uses the read-only
 * login (READONLY_DATABASE_URL), never the app's, inside a READ ONLY
 * transaction that is rolled back:
 *
 *   railway ssh --environment staging --service api -- \
 *     npm run db:read -w @sponsorx/backend -- 'SELECT id, state FROM "CampaignOrder" LIMIT 5'
 *
 * Corrections are not made here: they go through the admin actions, which
 * record their facts (documentation/SponsorX-Fact-Ledger.md §10).
 */
import pg from "pg";

const url = process.env.READONLY_DATABASE_URL;
const sql = process.argv.slice(2).join(" ").trim();
if (!url) {
  console.error("READONLY_DATABASE_URL is not set on this service (Deployment Runbook §6).");
  process.exit(1);
}
if (!sql) {
  console.error(`Give the query: npm run db:read -w @sponsorx/backend -- 'SELECT …'`);
  process.exit(1);
}

const db = new pg.Client({ connectionString: url, options: "-c TimeZone=UTC" });
await db.connect();
try {
  await db.query("BEGIN READ ONLY");
  const result = await db.query(sql);
  console.table(result.rows);
  console.log(`${result.rowCount ?? 0} row(s)`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await db.query("ROLLBACK").catch(() => {});
  await db.end();
}
