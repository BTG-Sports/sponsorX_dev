/**
 * Check the fact ledger — 3S1-QA-03.
 *
 *   npm run facts:check -w @sponsorx/backend
 *   npm run facts:check -w @sponsorx/backend -- --tenant <tenantId>
 *
 * Read-only: both checks run in a READ ONLY transaction, so this is safe
 * against staging and production. It answers two questions:
 *   1. do the daily summaries equal the sum of the facts? (checkFactSummaries)
 *   2. do the facts agree with the app's own records, for every campaign
 *      and every tenant's marketplace? (checkFactsAgainstApp)
 * Exits 1 when either finds a difference, listing them by measure. Before
 * the history fills (3S1-DATA-05/06/07) have run, differences for older
 * campaigns are expected: the check names what is still to fill.
 */
import { prisma } from "../src/db/client.ts";
import { checkFactSummaries } from "../src/domain/facts.ts";
import { checkFactsAgainstApp } from "../src/domain/fact-check.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;
if (at >= 0 && !tenantId) {
  console.error("--tenant needs a tenant id.");
  process.exit(2);
}

try {
  const [summaries, app] = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return [await checkFactSummaries(tx, { tenantId }), await checkFactsAgainstApp(tx, { tenantId })] as const;
  }, { timeout: 120_000 });

  const scope = tenantId ? `tenant ${tenantId}` : "every tenant";
  console.log(`Fact ledger check — ${scope}`);
  console.log(`  summaries = sum of the facts: ${summaries.ok ? "yes" : `NO — ${summaries.differences.length} difference(s)`}`);
  for (const d of summaries.differences.slice(0, 20)) console.log(`    ${d.tenantId} ${d.campaignId || "(no campaign)"} ${d.day} ${d.measure}: summary ${d.summary}, facts ${d.facts}`);

  console.log(`  facts = the app's records: ${app.ok ? "yes" : `NO — ${app.differences.length} difference(s)`}`);
  const byMeasure = new Map<string, number>();
  for (const d of app.differences) byMeasure.set(d.measure, (byMeasure.get(d.measure) ?? 0) + 1);
  for (const [measure, n] of [...byMeasure].sort()) console.log(`    ${measure}: ${n} campaign(s) or tenant(s)`);
  for (const d of app.differences.slice(0, 50)) console.log(`    ${d.tenantId} ${d.campaignId ?? "(marketplace)"} ${d.measure}: app ${d.app}, facts ${d.facts}`);
  if (app.differences.length > 50) console.log(`    … and ${app.differences.length - 50} more`);

  process.exitCode = summaries.ok && app.ok ? 0 : 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
