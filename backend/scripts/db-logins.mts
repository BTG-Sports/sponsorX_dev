/**
 * Create or update the live database's two logins — 3S1-OPS-03.
 * The app's (`sponsorx_app`, owner of everything) and developers'
 * (`sponsorx_readonly`, look only). See src/db/logins.ts.
 *
 * Run as the master login, inside the api service, with the two passwords
 * on stdin as JSON — so they never appear in a command line or a log:
 *
 *   printf '{"app":"…","readonly":"…"}' | railway ssh --environment staging --service api -- \
 *     npm run db:logins -w @sponsorx/backend
 *
 * The master login is DATABASE_URL until the app is switched to its own; after
 * that, add "adminUrl" to the JSON. Deployment Runbook §6 has the full steps.
 * Prints what it changed and the checks only — never a URL or a password.
 * Exits 1 if any check fails.
 */
import pg from "pg";

import { applyLogins, checkLogins, loginsOk } from "../src/db/logins.ts";

const chunks: Buffer[] = [];
for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
let input: { app?: string; readonly?: string; adminUrl?: string };
try {
  input = JSON.parse(Buffer.concat(chunks).toString("utf8")) as typeof input;
} catch {
  console.error('Pipe the passwords in as JSON: {"app":"…","readonly":"…"} (and "adminUrl" once the app has its own login).');
  process.exit(1);
}
const adminUrl = input.adminUrl ?? process.env.DATABASE_URL;
if (!adminUrl || !input.app || !input.readonly || input.app.length < 24 || input.readonly.length < 24) {
  console.error("Need the master login's URL and two passwords of at least 24 characters.");
  process.exit(1);
}
const passwords = { app: input.app, readonly: input.readonly };

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
try {
  const report = await applyLogins(admin, passwords);
  console.log(`logins: sponsorx_app owns the database and ${report.objectsHandedOver} object(s) handed over; sponsorx_readonly reads ${report.schemas.join(", ")}.`);
} finally {
  await admin.end();
}

const check = await checkLogins(pg, adminUrl, passwords);
console.log([
  `app is a superuser: ${check.appIsSuperuser ? "YES — wrong" : "no"}`,
  `objects the app does not own: ${check.notOwnedByApp}`,
  `app can apply a new table: ${check.appCanChangeTables ? "yes" : "NO — wrong"}`,
  `read-only login can read: ${check.readonlyCanRead ? "yes" : "NO — wrong"}`,
  `read-only login refused a write: ${check.readonlyWriteRefused ? "yes" : "NO — wrong"}`,
  `read-only login refused a new table: ${check.readonlyCreateRefused ? "yes" : "NO — wrong"}`,
].map((l) => `  ${l}`).join("\n"));
if (!loginsOk(check)) {
  console.error("logins: a check failed — see above.");
  process.exit(1);
}
console.log("logins: all checks pass.");
