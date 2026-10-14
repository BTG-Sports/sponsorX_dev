/**
 * Rebuild the benchmarks now — 3S1-DATA-03. The worker does this every night
 * after the fact check; this is the same refresh by hand.
 *
 *   npm run benchmarks:refresh -w @sponsorx/backend -- [--tenant <id>]
 *
 * Prints each tenant's figures: segment, low / middle / high in $ per 1,000
 * verified views, and the orders behind them ("small" below the minimum).
 */
import { prisma } from "../src/db/client.ts";
import { BENCHMARK_MIN_SAMPLE, listBenchmarks, refreshBenchmarks } from "../src/domain/benchmarks.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

try {
  const report = await refreshBenchmarks(prisma, new Date(), { tenantId });
  console.log(`benchmarks: ${report.benchmarks} figure(s) for ${report.tenants} tenant(s); small sample below ${BENCHMARK_MIN_SAMPLE} orders.`);
  const tenants = tenantId ? [tenantId] : (await prisma.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  for (const t of tenants) {
    const rows = await listBenchmarks(prisma, t);
    if (!rows.length) continue;
    console.log(`\n${t}`);
    for (const r of rows) {
      console.log(`  ${r.dimension.padEnd(8)} ${(r.segment || "—").padEnd(16)} ${dollars(r.p25)} / ${dollars(r.median)} / ${dollars(r.p75)}  ${r.sampleSize} order(s)${r.smallSample ? " (small)" : ""}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
