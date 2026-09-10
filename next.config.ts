import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Portability rule (.claude/stack-decision.md): an ordinary Node server
  // that runs anywhere. Do not adopt ISR, next/image optimization or edge
  // middleware without a deliberate decision.
  output: "standalone",
};

export default nextConfig;
