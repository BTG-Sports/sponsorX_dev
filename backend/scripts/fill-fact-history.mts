/**
 * Fill the fact history — 3S1-DATA-05 (and 3S1-DATA-06 / 07 as they land).
 *
 *   npm run facts:fill -w @sponsorx/backend -- orders
 *   npm run facts:fill -w @sponsorx/backend -- orders --tenant <tenantId>
 *   npm run facts:fill -w @sponsorx/backend -- orders --confirm-production
 *
 * Records the facts for what happened before the fact ledger existed, from
 * the app's records and audit log, through the live actions' own writers.
 * Safe to run again, and while the app is live: an event already recorded
 * adds nothing. Production needs --confirm-production, after a clean run
 * on staging (3S1-OPS-04). Afterwards the "match the app" check runs for the
 * measures the fill is answerable for, and the exit code says whether they
 * all match.
 *
 * Parts: orders — orders booked and cancelled, deliverables due, published
 * and verified, drafts sent back.
 */
import { prisma } from "../src/db/client.ts";
import { env } from "../src/config/env.ts";
import { fillOrderHistory, ORDER_HISTORY_MEASURES } from "../src/domain/fact-history.ts";
import { checkFactsAgainstApp } from "../src/domain/fact-check.ts";

const PARTS = { orders: { fill: fillOrderHistory, measures: ORDER_HISTORY_MEASURES } } as const;

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;
const parts = args.filter((a, i) => !a.startsWith("--") && (at < 0 || i !== at + 1));
const environment = env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() ?? "local";

if (!parts.length || parts.some((p) => !(p in PARTS))) {
  console.error(`Name the part(s) to fill: ${Object.keys(PARTS).join(", ")}. Got: ${parts.join(", ") || "none"}`);
  process.exit(2);
}
if (environment === "production" && !args.includes("--confirm-production")) {
  console.error("This is production. Run the fill on staging first; once its check is clean, re-run here with --confirm-production.");
  process.exit(2);
}

try {
  const measures = new Set<string>();
  for (const part of parts as Array<keyof typeof PARTS>) {
    const started = Date.now();
    const report = await PARTS[part].fill(prisma, { tenantId });
    console.log(`Filled ${part} on ${environment}${tenantId ? ` (tenant ${tenantId})` : ""}: ${report.orders} orders, ${report.factsAdded} facts added, ` +
      `${report.fallbackDates} dated by fallback (no audit entry), in ${Math.round((Date.now() - started) / 1000)}s.`);
    for (const m of PARTS[part].measures) measures.add(m);
  }
  const check = await checkFactsAgainstApp(prisma, { tenantId });
  const left = check.differences.filter((d) => measures.has(d.measure));
  console.log(`Check for these measures: ${left.length ? `${left.length} difference(s)` : "every campaign matches the app"}.`);
  for (const d of left.slice(0, 50)) console.log(`  ${d.tenantId} ${d.campaignId ?? "(marketplace)"} ${d.measure}: app ${d.app}, facts ${d.facts}`);
  process.exitCode = left.length ? 1 : 0;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
