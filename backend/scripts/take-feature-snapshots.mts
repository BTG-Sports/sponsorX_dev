/**
 * Take today's feature snapshots now — 3S2-BE-01. The worker does this every
 * night after the benchmarks; this is the same by hand. A snapshot already
 * taken today stands unchanged.
 *
 *   npm run features:snapshot -w @sponsorx/backend -- [--tenant <id>]
 */
import { prisma } from "../src/db/client.ts";
import { takeFeatureSnapshots } from "../src/domain/feature-snapshots.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await takeFeatureSnapshots(prisma, new Date(), { tenantId });
  console.log(`feature snapshots: ${r.written} taken today for ${r.athletes} active athlete(s) in ${r.tenants} tenant(s); ${r.alreadyTaken} already taken today.`);
} finally {
  await prisma.$disconnect();
}
