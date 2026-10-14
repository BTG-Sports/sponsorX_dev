/**
 * Pace and forecast every active campaign now — 3S4. The worker does this
 * every night after the fact check; this is the same by hand. A forecast
 * already made today stands unchanged. Emails follow FORECAST_EMAILS.
 *
 *   npm run forecasts:refresh -w @sponsorx/backend -- [--tenant <id>]
 */
import { env } from "../src/config/env.ts";
import { prisma } from "../src/db/client.ts";
import { runForecasts } from "../src/domain/forecast-engine.ts";

const args = process.argv.slice(2);
const at = args.indexOf("--tenant");
const tenantId = at >= 0 ? args[at + 1] : undefined;

try {
  const r = await runForecasts(prisma, new Date(), { tenantId, emails: env.FORECAST_EMAILS });
  console.log(`forecasts: ${r.forecasts} made today for ${r.campaigns} active campaign(s) in ${r.tenants} tenant(s); ${r.alertsRaised} alert(s) raised, ${r.emails} email(s)${env.FORECAST_EMAILS ? "" : " (emails off)"}.`);
} finally {
  await prisma.$disconnect();
}
