/**
 * Open, refresh or close every at-risk campaign's shortfall now, with its
 * substitutes, and approve automatically where every safety check passes —
 * 3S5. The worker does this every night after the forecasts; this is the
 * same by hand. It reads today's forecasts, so run forecasts:refresh first.
 *
 *   npm run makegoods:refresh -w @sponsorx/backend -- [--tenant <id>]
 */
import { prisma } from "../src/db/client.ts";
import { runMakeGoods } from "../src/domain/makegood-engine.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await runMakeGoods(prisma, new Date(), { tenantId });
  console.log(`make-goods: ${r.shortfalls} shortfall(s) in ${r.tenants} tenant(s), ${r.opened} new, ${r.closed} closed; ${r.autoApproved} approved automatically, ${r.held} held for BTG.`);
} finally {
  await prisma.$disconnect();
}
