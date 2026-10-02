/* --------------------------------------------------------------------------
   The signed-in sponsor's live reads — shared by the dashboard (P4-FE-05),
   the Campaigns list and the campaign detail (P2-FE-01).

   Each returns null for anyone who is not a linked sponsor, which is the
   page's cue to render the fixture demo. No catch: an outage is an error
   page, never fixtures dressed as the sponsor's own spend (QA pass 4 rule).
   -------------------------------------------------------------------------- */
import { SPONSOR_ROLES, type ApiCampaign } from "@/lib/sponsor-live";
import type { ApiOps } from "@/lib/ops-live";
import { apiFetch, fetchActor } from "@/server/api";
import { fetchCampaign, fetchCampaignPage, fetchCampaignSummary, type CampaignSummary } from "@/server/campaigns";
import type { PageInfo, SearchParams } from "@/lib/list-query";
import type { ApiCampaignArtworkSlot } from "@/lib/edition-artwork-live";

async function isSponsor(): Promise<boolean> {
  const who = await fetchActor();
  return who.status === "linked" && who.actor.roles.some((r) => SPONSOR_ROLES.includes(r));
}

/** One page of the sponsor's campaigns, searched / filtered / sorted by the
 *  API (?page ?size ?q ?state ?sort), plus the unfiltered summary for the
 *  header. Null for the demo. */
export async function liveSponsorCampaignPage(
  sp: SearchParams,
): Promise<{ rows: ApiCampaign[]; page: PageInfo; summary: CampaignSummary } | null> {
  if (!(await isSponsor())) return null;
  const [pg, summary] = await Promise.all([fetchCampaignPage(sp), fetchCampaignSummary()]);
  return { rows: pg?.campaigns ?? [], page: pg?.page ?? { page: 1, size: 12, total: 0, pages: 1 }, summary: summary ?? EMPTY_SUMMARY };
}

/** The dashboard: the DB-side summary for the KPIs, plus one five-row server
 *  page of the portfolio (?page). Null for the demo. */
export async function liveSponsorDashboard(
  sp: SearchParams,
): Promise<{ summary: CampaignSummary; rows: ApiCampaign[]; page: PageInfo } | null> {
  if (!(await isSponsor())) return null;
  const [pg, summary] = await Promise.all([fetchCampaignPage(sp, 5), fetchCampaignSummary()]);
  return { summary: summary ?? EMPTY_SUMMARY, rows: pg?.campaigns ?? [], page: pg?.page ?? { page: 1, size: 5, total: 0, pages: 1 } };
}

const EMPTY_SUMMARY: CampaignSummary = { total: 0, byState: {}, active: 0, athletes: 0, behind: 0, pacing: [] };

export type LiveCampaignDetail =
  | {
      status: "found";
      campaign: ApiCampaign;
      ops: ApiOps;
      /** P9-BE-16 — the SponsorX NEXT ad slots this campaign bought, each with its artwork. */
      artwork: ApiCampaignArtworkSlot[];
      /** SPONSOR_ADMIN — uploads and signs off; an analyst only sees the status. */
      canDecideArtwork: boolean;
    }
  /** Not theirs, or not a campaign — the API answers both the same (403). */
  | { status: "missing" };

/**
 * One campaign: its portfolio row (package, money — column-gated by the API)
 * and its delivery board (GET /campaigns/:id/ops, orders scoped by whereFor,
 * no invitations for a sponsor). Null for the demo.
 */
export async function liveSponsorCampaign(id: string): Promise<LiveCampaignDetail | null> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.roles.some((r) => SPONSOR_ROLES.includes(r))) return null;
  /* GET /campaigns/:id, not a search of the list — the 101st campaign is as
     findable as the first (QA pass 7, F-5). */
  /* The reads are independent — one round trip, not three (QA pass 9). */
  const [campaign, res, art] = await Promise.all([
    fetchCampaign(id),
    apiFetch(`/campaigns/${encodeURIComponent(id)}/ops`),
    apiFetch(`/campaigns/${encodeURIComponent(id)}/artwork`),
  ]);
  if (!campaign) return { status: "missing" };
  if (res.status === 403 || res.status === 404) return { status: "missing" };
  if (!res.ok) throw new Error(`Campaign unavailable (${res.status}).`);
  /* P9-BE-16 — no NEXT placements is an empty list, not an error. */
  if (!art.ok && art.status !== 403) throw new Error(`Ad artwork unavailable (${art.status}).`);
  const artwork = art.ok ? ((await art.json()) as { slots: ApiCampaignArtworkSlot[] }).slots : [];
  return {
    status: "found",
    campaign,
    ops: (await res.json()) as ApiOps,
    artwork,
    canDecideArtwork: who.actor.roles.includes("SPONSOR_ADMIN"),
  };
}
