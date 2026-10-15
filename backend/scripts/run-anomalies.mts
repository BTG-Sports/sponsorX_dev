/**
 * Run the anomaly rules over the last 30 days now — 3S8-DATA-01. The worker
 * does this every night; this is the same by hand. A flag already raised is
 * not raised again.
 *
 *   npm run anomalies:refresh -w @sponsorx/backend -- [--tenant <id>]
 */
import { prisma } from "../src/db/client.ts";
import { runAnomalies } from "../src/domain/anomaly-engine.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await runAnomalies(prisma, new Date(), { tenantId });
  console.log(`anomalies: ${r.flagged} new flag(s) in ${r.tenants} tenant(s); ${r.excludedAutomatically} excluded from reporting automatically.`);
} finally {
  await prisma.$disconnect();
}
