/**
 * `npm run cohort:import -w @sponsorx/backend -- <file.csv>` — P3-DATA-01.
 *
 * The operator's side of the pilot cohort import. Validates the whole file,
 * applies the production gate and queues ONE job; the worker creates the
 * athletes. On Railway it runs inside the api container:
 *
 *   railway ssh --environment staging --service api -- \
 *     npm run cohort:import -w @sponsorx/backend -- /tmp/cohort.csv
 *
 * Prints the file's fingerprint either way. After a clean staging run, that
 * fingerprint is what goes into production's COHORT_IMPORT_APPROVED_SHA256.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { prisma } from "../src/db/client.ts";
import { CohortFileInvalidError, requestCohortImport } from "../src/domain/cohort-import.ts";

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run cohort:import -w @sponsorx/backend -- <file.csv>");
  process.exit(2);
}

try {
  const result = await requestCohortImport(readFileSync(file, "utf8"), basename(file));
  console.log(
    `Queued ${result.count} athlete(s) for import on ${result.environment}.\n` +
      `Fingerprint: ${result.sha256}\n` +
      `The worker creates them as SUBMITTED applications; watch its log for the result.`,
  );
} catch (error) {
  if (error instanceof CohortFileInvalidError) {
    console.error(error.message);
    for (const row of error.rowErrors) {
      console.error(`  line ${row.line}${row.email ? ` (${row.email})` : ""}: ${row.errors.join("; ")}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
