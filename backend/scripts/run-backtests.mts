/**
 * Backtest the forecast and pricing engines now — 3S9-QA-01. Real history,
 * per model version; with --simulate, also the forecast on the seeded
 * simulated history (stored marked simulated). The worker runs the real
 * backtests each night.
 *
 *   npm run models:backtest -w @sponsorx/backend -- [--tenant <id>] [--simulate]
 */
import { prisma } from "../src/db/client.ts";
import { runBacktests } from "../src/domain/backtest-engine.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await runBacktests(prisma, new Date(), { tenantId, simulate: args.includes("--simulate") });
  console.log(`backtests: ${r.runs} run(s) stored for ${r.tenants} tenant(s), ${r.simulated} on simulated history.`);
} finally {
  await prisma.$disconnect();
}
