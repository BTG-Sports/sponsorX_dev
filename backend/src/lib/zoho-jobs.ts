/**
 * Which outbox jobs need Zoho CRM credentials, and whether this process has
 * them. Split out of the worker's zoho-sync (P2-OPS-11) because the API's
 * health check needs both facts and must never import the Zoho client:
 * "Zoho never touches a request path", enforced by
 * tests/zoho-boundary.test.ts. Nothing here can call Zoho — it is a list of
 * names and an environment check (the same three variables
 * zohoConfigFromEnv requires).
 */

/**
 * Jobs that cannot run without CRM credentials. On a worker without them
 * (production, until real records move) the drain leaves these IN THE
 * OUTBOX rather than dispatching them into pg-boss, where each would fail
 * against the retry limit and be archived — lost. Waiting in the outbox,
 * they go the moment credentials are set, which is what "syncs wait" means.
 * `zoho.ingestInvoice` is not here: it applies a Books payload already on
 * disk and never calls the CRM.
 */
export const NEEDS_ZOHO_CRM = new Set([
  "zoho.pushDeal", "zoho.pushCampaign", "zoho.pushTask", "zoho.pushLead",
  "zoho.pushRenewal", "zoho.ingestCrm", "zoho.backfill", "zoho.pushMarketplaceOrder", "zoho.pushSponsor",
]);

/** True when the three CRM credentials are all set. */
export function zohoCrmConfigured(e: Record<string, string | undefined> = process.env): boolean {
  return Boolean(e.ZOHO_CLIENT_ID && e.ZOHO_CLIENT_SECRET && e.ZOHO_REFRESH_TOKEN);
}
