import "server-only";

import { headers } from "next/headers";

import type { PublicNetworkStats } from "@/lib/network-stats";
import { edgeHeadersFrom } from "@/server/edge";

/* GET /public/network-stats — the public pages' network numbers (P8-FE-09).

   No login, and a short budget: the figures are decoration on a marketing
   page, so a slow or down API hides them instead of holding the page.

   ONE READ A MINUTE, NOT ONE PER VISIT. The counts are public and change
   slowly, and every visit to the home page or /login renders on this server.
   Keeping the last good read in memory for a minute keeps the API's traffic
   flat however busy the site is. It is a plain module variable, not Next's
   data cache or ISR, so it behaves the same on any host. A failed read isn't
   kept, so the next visit tries again.

   On a miss, the visitor's address is forwarded (P8-SEC-03, server/edge.ts),
   so the API's per-address limit counts them and not this server. */

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const KEEP_MS = 60_000;

let kept: { stats: PublicNetworkStats; at: number } | null = null;

export async function fetchNetworkStats(now: number = Date.now()): Promise<PublicNetworkStats | null> {
  if (kept && now - kept.at < KEEP_MS) return kept.stats;
  try {
    const res = await fetch(`${API_URL}/api/v1/public/network-stats`, {
      cache: "no-store",
      headers: edgeHeadersFrom(await headers()),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const stats = (await res.json()) as PublicNetworkStats;
    kept = { stats, at: now };
    return stats;
  } catch {
    return null;
  }
}
