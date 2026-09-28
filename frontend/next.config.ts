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
};

export default nextConfig;
