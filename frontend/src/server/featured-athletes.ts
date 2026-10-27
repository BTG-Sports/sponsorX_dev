import "server-only";

import { headers } from "next/headers";

import type { PublicFeaturedAthletes } from "@/lib/featured-athletes";
import { edgeHeadersFrom } from "@/server/edge";

/* GET /public/featured-athletes — the home page's Featured athletes panel
   (P8-FE-10, the read P8-BE-08 built).

   The same contract as the network numbers (server/network-stats.ts): no
   login, a short budget so a slow or down API hides the panel instead of
   holding the page, and the last good read kept in memory for a minute, so
   the API sees one call a minute however busy the home page is. A failed
   read isn't kept. On a miss the visitor's address is forwarded (P8-SEC-03),
   so the API's per-address limit counts them and not this server. */

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const KEEP_MS = 60_000;

let kept: { data: PublicFeaturedAthletes; at: number } | null = null;

export async function fetchFeaturedAthletes(now: number = Date.now()): Promise<PublicFeaturedAthletes | null> {
  if (kept && now - kept.at < KEEP_MS) return kept.data;
  try {
    const res = await fetch(`${API_URL}/api/v1/public/featured-athletes`, {
      cache: "no-store",
      headers: edgeHeadersFrom(await headers()),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PublicFeaturedAthletes;
    if (!data || !Array.isArray(data.athletes)) return null;
    kept = { data, at: now };
    return data;
  } catch {
    return null;
  }
}
