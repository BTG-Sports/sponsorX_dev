/**
 * Queue the Zoho backfill — P8-INT-07.
 *
 *   npm run zoho:backfill -w @sponsorx/backend
 *   npm run zoho:backfill -w @sponsorx/backend -- Accounts Contacts
 *   npm run zoho:backfill -w @sponsorx/backend -- --confirm-production
 *
 * Imports Users (staff ↔ Zoho user mapping), Accounts (→ sponsors) and
 * Contacts (→ sponsor contacts) that Zoho already has. Kept, and safe to run
 * again: a second run over the same org creates nothing. Runs on the worker;
 * watch its log for `zoho.backfill`.
 */
import { prisma } from "../src/db/client.ts";
import { env } from "../src/config/env.ts";
import {
  BackfillNeedsConfirmationError,
  requestBackfill,
  type BackfillModule,
} from "../src/domain/zoho-sync.ts";

const args = process.argv.slice(2);
const modules = args.filter((a) => !a.startsWith("--")) as BackfillModule[];
const allowed = new Set(["Users", "Accounts", "Contacts"]);
if (modules.some((m) => !allowed.has(m))) {
  console.error(`Modules are Users, Accounts, Contacts. Got: ${modules.join(", ")}`);
  process.exit(2);
}

try {
  const { environment } = await requestBackfill(prisma, {
    tenantId: env.PUBLIC_INTAKE_TENANT_ID,
    modules: modules.length ? modules : undefined,
    environment: env.RAILWAY_ENVIRONMENT_NAME,
    confirmProduction: args.includes("--confirm-production"),
  });
  console.log(`Queued zoho.backfill (${modules.join(", ") || "Users, Accounts, Contacts"}) on ${environment}.`);
} catch (error) {
  console.error(error instanceof BackfillNeedsConfirmationError ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
