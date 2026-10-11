import { apiFetch } from "@/server/api";
import type { RangeKey, SponsorOverview } from "@/lib/sponsor-overview-live";

/** GET /sponsor/overview. Null on a 403 (a role without metric reads). No
 *  catch: an outage is an error page, never fixtures dressed as live data. */
export async function fetchSponsorOverview(range: RangeKey, campaignId?: string): Promise<SponsorOverview | null> {
  const q = new URLSearchParams({ range, ...(campaignId ? { campaignId } : {}) });
  const res = await apiFetch(`/sponsor/overview?${q}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Overview unavailable (${res.status}).`);
  return ((await res.json()) as { overview: SponsorOverview }).overview;
}
