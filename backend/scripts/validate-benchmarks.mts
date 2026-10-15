/**
 * Validate every tenant's benchmarks and its reconciliation now — 3S9-QA-02.
 * Read-only. The worker logs the same each night.
 *
 *   npm run benchmarks:validate -w @sponsorx/backend -- [--tenant <id>]
 */
import { prisma } from "../src/db/client.ts";
import { validateBenchmarks } from "../src/domain/benchmark-validation.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const only = at >= 0 ? args[at + 1] : undefined;

try {
  const tenants = only ? [only] : (await prisma.tenant.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((t) => t.id);
  for (const t of tenants) {
    const r = await validateBenchmarks(prisma, t, new Date());
    console.log(`${t}: ${r.summary.valid} of ${r.summary.total} benchmark(s) valid; reconciliation ${r.reconciliation.ok ? "within tolerance" : "NOT within tolerance"} — ${r.reconciliation.reason}`);
    for (const b of r.benchmarks.filter((x) => x.status !== "valid")) console.log(`  ${b.dimension} ${b.segment || "(all)"}: ${b.status} — ${b.reasons.join(" ")}`);
  }
} finally {
  await prisma.$disconnect();
}
