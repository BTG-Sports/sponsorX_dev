/**
 * Store today's suggested prices now — 3S2-BE-03. The worker does this every
 * night after the feature snapshots; this is the same by hand (take the day's
 * snapshots first: `npm run features:snapshot`). A suggestion already stored
 * today stands unchanged.
 *
 *   npm run pricing:refresh -w @sponsorx/backend -- [--tenant <id>]
 */
import { prisma } from "../src/db/client.ts";
import { storePricingRecommendations } from "../src/domain/pricing-engine.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await storePricingRecommendations(new Date(), { tenantId });
  console.log(`suggested prices: ${r.stored} stored today for ${r.items} priceable item(s) in ${r.tenants} tenant(s); ${r.alreadyStored} already stored today.`);
} finally {
  await prisma.$disconnect();
}
