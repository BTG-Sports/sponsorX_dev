/**
 * Which web origins may mint the Clerk sessions this API accepts — 2S8-PMO-02,
 * owner decision 3 (2026-10-06).
 *
 * A Clerk session token carries `azp`: the origin of the page that obtained
 * it. Passing `authorizedParties` makes Clerk refuse a token whose `azp` is
 * anything else, so a session minted on some other site that shares our
 * Clerk instance (a development instance is shared by every developer's
 * machine and by staging) is not accepted here.
 *
 * CLERK_AUTHORIZED_PARTIES is a comma-separated list of origins. Unset, it
 * is APP_URL's origin, plus the local web origins outside production, so
 * nothing breaks on an environment that has not set it.
 *
 * Pure (no env import), so the rules are unit-testable alone. The web app's
 * proxy (frontend/src/proxy.ts) applies the same rule to the same variable.
 */

/** `next dev` (3000), and the e2e harness's web server (playwright.config.ts, 3100). */
export const LOCAL_WEB_ORIGINS = ["http://127.0.0.1:3100", "http://localhost:3100", "http://localhost:3000"] as const;

/** `https://Sponsorx.net/` → `https://sponsorx.net`; anything that is not a bare http(s) origin throws. */
export function toOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`CLERK_AUTHORIZED_PARTIES: "${value.trim()}" is not a URL. List origins like https://sponsorx.net, comma-separated.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`CLERK_AUTHORIZED_PARTIES: "${value.trim()}" is not an http(s) origin.`);
  }
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash || url.username || url.password) {
    throw new Error(`CLERK_AUTHORIZED_PARTIES: "${value.trim()}" has a path, query or credentials — list the origin only (scheme, host, port).`);
  }
  return url.origin;
}

export function authorizedPartiesFrom(raw: string | undefined, appUrl: string, nodeEnv: string): string[] {
  const listed = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origins = listed.length
    ? listed.map(toOrigin)
    : [new URL(appUrl).origin, ...(nodeEnv === "production" ? [] : LOCAL_WEB_ORIGINS)];
  return [...new Set(origins)];
}
