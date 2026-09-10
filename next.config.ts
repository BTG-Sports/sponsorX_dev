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
};

export default nextConfig;
