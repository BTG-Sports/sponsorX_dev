import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability rule (.claude/stack-decision.md): an ordinary Node server
  // that runs anywhere. Do not adopt ISR, next/image optimization or edge
  // middleware without a deliberate decision.
  //
  // Exception: Vercel (test env) runs its own build pipeline instead of
  // `next start`. It reads Next's Node File Trace manifests
  // (.next/*.nft.json) to package functions; `output: "standalone"`
  // relocates those into .next/standalone/, so Vercel's onBuildComplete
  // step fails with ENOENT on next-server.js.nft.json. Vercel sets the
  // VERCEL env var during builds — skip standalone there, keep it for
  // Railway/Render.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),

  // The dev-tools badge defaults to bottom-left, where it sits on top of the
  // student portal's bottom tab bar (P1-FE-19) at phone widths. Dev-only.
  devIndicators: { position: "top-right" },

  // DEV-ONLY. Next's dev server serves its dev resources (/_next/hmr, the
  // client runtime) only to localhost and the host it started on, and
  // refuses everything else as cross-origin. The E2E harness opens the app at
  // 127.0.0.1 (playwright.config.ts), so without this every page rendered but
  // never hydrated — no client code ran, and Clerk never consumed a sign-in
  // ticket. Ignored by `next build` / `next start`.
  allowedDevOrigins: ["127.0.0.1"],

  // 2S8-SEC-02 (OWASP A05) — no "X-Powered-By: Next.js" advertising the stack.
  poweredByHeader: false,

  // 2S8-SEC-02 — baseline security headers on every response, ENFORCED. What
  // is enforced cannot break a page: no framing of ours anywhere (the admin
  // desks frame R2 links, never the reverse), no plugins, no <base> hijack.
  // 2S8-PMO-02 adds the full script/style policy beside it in REPORT-ONLY
  // mode (owner decision 1, 2026-10-06) — see buildReportOnlyCsp below.
  async headers() {
    return securityHeaders;
  },

  // 2S8-PMO-02 — where the browser sends CSP violation reports. Same-origin,
  // because the browser never talks to the API directly (API_URL is the
  // private address the web server uses), so the web server forwards this one
  // path to the API's POST /api/v1/public/csp-report. Read at build time, like
  // headers(): Railway passes service variables to the build.
  async rewrites() {
    return cspReportRewrites(process.env);
  },
};

type Env = Record<string, string | undefined>;

/** The web path a browser POSTs violation reports to (forwarded to the API). */
export const CSP_REPORT_PATH = "/api/v1/public/csp-report";

export function cspReportRewrites(env: Env) {
  const api = (env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");
  return [{ source: CSP_REPORT_PATH, destination: `${api}${CSP_REPORT_PATH}` }];
}

/** `pk_test_<base64("host$")>` → `https://host`, or null for a key that isn't one. */
export function clerkFrontendApi(publishableKey: string | undefined): string | null {
  const m = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey ?? "");
  if (!m) return null;
  const host = Buffer.from(m[1]!, "base64").toString("utf8").replace(/\$$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) ? `https://${host}` : null;
}

const originOf = (url: string | undefined): string | null => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * The full Content-Security-Policy, sent as **Report-Only** — 2S8-PMO-02,
 * owner decision 1 (2026-10-06). Nothing is blocked; every violation is
 * reported, so the policy can be corrected from real traffic before it is
 * enforced (the switch is a one-line change, security review "Decisions").
 *
 * SCRIPTS: `'self' 'unsafe-inline'`, not nonces. Next's App Router streams
 * its payload in inline <script> tags and the root layout sets the theme in
 * one, so a policy without either nonces or 'unsafe-inline' breaks every
 * page. A nonce is per request: it can only come from the proxy (a header
 * set here in next.config is fixed at build time), and it forces every page
 * to render dynamically. The fan routes /r, /t and /u are deliberately
 * outside the proxy (Addendum A10, frontend/tests/fan-route-budget.test.ts),
 * so they could never carry one. Next's own guide gives this shape for an
 * app without nonces. `'unsafe-eval'` is added in `next dev` only (React's
 * dev tooling needs it).
 *
 * Everything else is what the app really loads:
 *   - Clerk: its Frontend API host (decoded from the publishable key), the
 *     production instance at clerk.sponsorx.net, *.clerk.accounts.dev for a
 *     development instance, img.clerk.com for avatars, and blob: workers.
 *   - Cloudflare Turnstile (Clerk's bot protection): challenges.cloudflare.com
 *     as a script, a frame and a connection.
 *   - R2: browsers PUT uploads straight to presigned URLs on
 *     *.r2.cloudflarestorage.com (connect-src); the admin desks frame private
 *     presigned links (frame-src); public-bucket logos and images load from
 *     the R2 public URL (img-src). R2_PUBLIC_BASE_URL / S3_ENDPOINT add a
 *     custom domain when the web service has them; MinIO and the e2e object
 *     store stand-in are allowed in development.
 *   - Inline styles: the <style> on /u (a route handler) and on several
 *     pages, and React `style` attributes — `style-src 'unsafe-inline'`.
 *   - Fonts: next/font self-hosts Google Fonts at build, so 'self' only.
 *   - Stripe's hosted pages are top-level redirects; nothing is embedded. A
 *     native form POST that redirects there is checked against form-action
 *     by Chrome, so Checkout and Connect onboarding are listed there.
 */
export function buildReportOnlyCsp(env: Env): string {
  const dev = env.NODE_ENV !== "production";
  const key = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const devInstance = dev || key.startsWith("pk_test_");
  const clerk = [
    clerkFrontendApi(key),
    "https://clerk.sponsorx.net",
    ...(devInstance ? ["https://*.clerk.accounts.dev"] : []),
  ].filter((h): h is string => Boolean(h));
  const turnstile = "https://challenges.cloudflare.com";
  const storage = [
    "https://*.r2.cloudflarestorage.com",
    "https://*.r2.dev",
    originOf(env.R2_PUBLIC_BASE_URL),
    originOf(env.S3_ENDPOINT),
    ...(dev ? ["http://localhost:9000", "http://127.0.0.1:9000", "http://127.0.0.1:9100"] : []),
  ].filter((h): h is string => Boolean(h));
  const uniq = (xs: string[]) => [...new Set(xs)].join(" ");

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...clerk, turnstile]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", "https://img.clerk.com", ...storage]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", ...clerk, turnstile, ...storage, ...(devInstance ? ["https://clerk-telemetry.com"] : []), ...(dev ? ["ws:"] : [])]],
    ["frame-src", ["'self'", turnstile, ...storage]],
    ["media-src", ["'self'", "blob:", ...storage]],
    ["worker-src", ["'self'", "blob:"]],
    ["manifest-src", ["'self'"]],
    ["form-action", ["'self'", "https://checkout.stripe.com", "https://connect.stripe.com"]],
    /* The three enforced directives, repeated so this is the whole policy
       the day it is switched to enforce. */
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["object-src", ["'none'"]],
    ["report-uri", [CSP_REPORT_PATH]],
    ["report-to", ["csp"]],
  ];
  return directives.map(([name, values]) => `${name} ${uniq(values)}`).join("; ");
}

/**
 * The headers for every path, built from the build's environment.
 *
 * HSTS — 2S8-PMO-02, the programme owner's decision of 2026-10-06: one year,
 * WITH includeSubDomains, so every sponsorx.net host (clerk., accounts. and
 * any added later) is HTTPS-only in a browser that has seen this header; and
 * WITHOUT preload. Preload ships in browsers and takes months to undo, so it
 * stays off (security review §A05).
 */
export function buildSecurityHeaders(env: Env) {
  return [
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        /* ENFORCED, unchanged by 2S8-PMO-02. */
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        /* Beside it, the full policy, reporting only (owner decision 1). */
        { key: "Content-Security-Policy-Report-Only", value: buildReportOnlyCsp(env) },
        /* The Reporting API's endpoint for `report-to csp`; `report-uri` in
           the policy is the fallback for browsers without it. A relative URL
           resolves against the page, so reports stay same-origin. */
        { key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
    /* Pages whose URL IS the credential — the fan's reward link, the
       unsubscribe link, the stand-in provider's signed pages — send no
       Referer at all, so the token never reaches another site. Listed after
       the catch-all so this value wins. */
    ...["/r/:path*", "/u/:path*", "/test-provider/:path*"].map((source) => ({
      source,
      headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
    })),
  ];
}

/* Exported for tests/security-review.test.ts. */
export const securityHeaders = buildSecurityHeaders(process.env);

export default nextConfig;
