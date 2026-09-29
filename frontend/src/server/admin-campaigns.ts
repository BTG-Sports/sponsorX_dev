/* --------------------------------------------------------------------------
   The admin Campaigns desk's live read, SERVER-PAGED (2026-09-29): one page
   of GET /campaigns for the URL's tab / search / sort / page, each row with
   its delivery-health flags (`?health=true`), plus the flagged count.

   A role that doesn't read delivery health (FINANCE, SALES) gets a 403 for
   a tab that FILTERS by it — the read is retried without the health filter
   (the page then shows no attention tab). A 403 after that is the list
   itself out of scope → null. Any other failure throws.
   -------------------------------------------------------------------------- */
import type { ApiCampaign } from "@/lib/sponsor-live";
import type { PageInfo, SearchParams } from "@/lib/list-query";
import { adminCampaignsQuery } from "@/lib/admin-campaign-groups";
import { apiFetch } from "@/server/api";

export type CampaignHealth = {
  deliverablesOverdue: number;
  underDeliveringWork: boolean;
  underDeliveringReach: boolean;
};

export type AdminCampaign = ApiCampaign & { health?: CampaignHealth | null };

export type AdminCampaignPage = {
  campaigns: AdminCampaign[];
  page: PageInfo;
  healthVisible: boolean;
  /** Campaigns delivery health flags — null when not readable. */
  attention: number | null;
};

export async function fetchAdminCampaignPage(sp: SearchParams): Promise<AdminCampaignPage | null> {
  let query = adminCampaignsQuery(sp, true);
  let res = await apiFetch(`/campaigns${query}`);
  if (res.status === 403 && query.includes("attention=")) {
    query = adminCampaignsQuery(sp, false);
    res = await apiFetch(`/campaigns${query}`);
  }
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Campaigns unavailable (${res.status}).`);
  const body = (await res.json()) as {
    campaigns: AdminCampaign[];
    page: PageInfo;
    healthVisible?: boolean;
    attention?: number;
  };
  return {
    campaigns: body.campaigns,
    page: body.page,
    healthVisible: body.healthVisible === true,
    attention: typeof body.attention === "number" ? body.attention : null,
  };
}
