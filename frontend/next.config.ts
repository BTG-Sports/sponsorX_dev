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

  // 2S8-SEC-02 — baseline security headers on every response. Deliberately
  // NOT a full script/style CSP yet: Clerk, Turnstile, the R2 upload host and
  // the inline <style> on /r and /u all need allowing, so that lands in
  // report-only mode first (owner decision, security review §A05). What is
  // here cannot break a page: no framing of ours anywhere (the admin desks
  // frame R2 links, never the reverse), no plugins, no <base> hijack.
  async headers() {
    return securityHeaders;
  },
};

/* Exported for tests/security-headers.test.ts. HSTS without includeSubDomains
   and without preload: both are commitments about every sponsorx.net host,
   which is the owner's call (security review §A05). */
export const securityHeaders = [
  {
    source: "/:path*",
    headers: [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
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

export default nextConfig;
