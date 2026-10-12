/**
 * Create or update the product database's read-only warehouse login —
 * 3S0-OPS-01. Column-level grants from the allow-list (worker/warehouse/grants.mts).
 *
 *   PRODUCT_ADMIN_URL=<product db, admin>  READER_PASSWORD=<new password> \
 *     npm run warehouse:reader -w @sponsorx/backend
 *
 * Re-run after adding a column to worker/warehouse/sources.mts. Prints the
 * role and table count only — never a URL or the password.
 */
import pg from "pg";

import { applyReaderRole } from "../worker/warehouse/grants.mts";
import { SOURCES } from "../worker/warehouse/sources.mts";

const ROLE = process.env.READER_ROLE ?? "warehouse_reader";
const adminUrl = process.env.PRODUCT_ADMIN_URL;
const password = process.env.READER_PASSWORD;
if (!adminUrl || !password) {
  console.error("Set PRODUCT_ADMIN_URL and READER_PASSWORD.");
  process.exit(1);
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
try {
  await applyReaderRole(admin, ROLE, password);
  console.log(`${ROLE}: read-only, ${SOURCES.length} tables, allow-listed columns only.`);
} finally {
  await admin.end();
}
