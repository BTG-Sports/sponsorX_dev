/* --------------------------------------------------------------------------
   Campaign reads for the portals (2026-09-29): one SERVER page
   (fetchCampaignPage — searched / filtered / sorted / counted in the
   database), one campaign (fetchCampaign), or the portfolio's DB-side totals
   (fetchCampaignSummary). Nothing here reads every campaign: a screen that
   needs a count or a sum asks the summary, never a list.
   -------------------------------------------------------------------------- */
import type { ApiCampaign } from "@/lib/sponsor-live";
import { apiFetch } from "@/server/api";
import { apiListQuery, textParam, type PageInfo, type SearchParams } from "@/lib/list-query";

/** GET /campaigns/:id — null when it isn't the caller's (403 / 404). */
export async function fetchCampaign(id: string): Promise<ApiCampaign | null> {
  const res = await apiFetch(`/campaigns/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`Campaign unavailable (${res.status}).`);
  return ((await res.json()) as { campaign: ApiCampaign }).campaign;
}

export const CAMPAIGN_STATES = ["DRAFT", "STAFFING", "APPROVAL", "ACTIVE", "REPORTING", "COMPLETED", "CANCELLED"] as const;
export const CAMPAIGN_SORTS = ["name", "ending"] as const;

/** One SERVER page of campaigns (2026-09-29): ?page ?size ?q ?state ?sort
 *  from the URL go to the API, which searches, filters, orders and counts in
 *  the database. Null on a 403. */
export async function fetchCampaignPage(
  sp: SearchParams,
  /** A fixed page size for a summary section (the dashboard's 5), instead of
   *  the URL's 12 / 24 / 60. */
  fixedSize?: number,
): Promise<{ campaigns: ApiCampaign[]; page: PageInfo } | null> {
  const query = apiListQuery(sp, {
    q: textParam(sp, "q"),
    state: textParam(sp, "state", CAMPAIGN_STATES),
    sort: textParam(sp, "sort", CAMPAIGN_SORTS),
  });
  const res = await apiFetch(`/campaigns${fixedSize ? query.replace(/size=\d+/, `size=${fixedSize}`) : query}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Campaigns unavailable (${res.status}).`);
  return (await res.json()) as { campaigns: ApiCampaign[]; page: PageInfo };
}

/** GET /campaigns/summary — the portfolio's DB-side totals. Money keys are
 *  absent where the matrix withholds them. Null on a 403. */
export type CampaignSummary = {
  total: number;
  byState: Record<string, number>;
  active: number;
  athletes: number;
  behind: number;
  pacing: { id: string; name: string; done: number; total: number; behind: boolean }[];
  contracted?: number;
  budget?: number;
  invoiced?: number;
  paid?: number;
};

export async function fetchCampaignSummary(): Promise<CampaignSummary | null> {
  const res = await apiFetch("/campaigns/summary");
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Campaign summary unavailable (${res.status}).`);
  return ((await res.json()) as { summary: CampaignSummary }).summary;
}
