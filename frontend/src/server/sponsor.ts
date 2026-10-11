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
import { apiListQuery, apiListQueryFor, pageOrAll, textParam, type ListKeys, type PageInfo, type SearchParams } from "@/lib/list-query";
import type { ApiCampaignArtworkSlot } from "@/lib/edition-artwork-live";
import type { ApiDeliverable } from "@/lib/deliverables-live";
import { openRequests, type ApiSponsorRequest } from "@/lib/brief-status";
import type { RangeKey, SponsorOverview } from "@/lib/sponsor-overview-live";
import { fetchSponsorOverview } from "@/server/sponsor-overview";

async function isSponsor(): Promise<boolean> {
  const who = await fetchActor();
  return who.status === "linked" && who.actor.roles.some((r) => SPONSOR_ROLES.includes(r));
}

/** One page of the sponsor's campaigns, searched / filtered / sorted by the
 *  API (?page ?size ?q ?state ?sort), plus the unfiltered summary for the
 *  header and (P1-ART-23) the open-request count for the "Your requests"
 *  link tile — a minimal `/briefs?size=1` read just for its `counts`, never
 *  the capped `liveSponsorRequests` list (that would undercount past 20).
 *  `requestsOpen` is undefined when the role can't read briefs at all. Null
 *  for the demo. */
export async function liveSponsorCampaignPage(
  sp: SearchParams,
): Promise<{ rows: ApiCampaign[]; page: PageInfo; summary: CampaignSummary; requestsOpen?: number } | null> {
  if (!(await isSponsor())) return null;
  const [pg, summary, briefsRes] = await Promise.all([
    fetchCampaignPage(sp),
    fetchCampaignSummary(),
    apiFetch("/briefs?page=1&size=1"),
  ]);
  let requestsOpen: number | undefined;
  if (briefsRes.ok) {
    const { counts } = (await briefsRes.json()) as { counts: BriefCounts };
    requestsOpen = (counts.DRAFT ?? 0) + (counts.QUALIFIED ?? 0) + (counts.APPROVED ?? 0);
  }
  return {
    rows: pg?.campaigns ?? [],
    page: pg?.page ?? { page: 1, size: 12, total: 0, pages: 1 },
    summary: summary ?? EMPTY_SUMMARY,
    requestsOpen,
  };
}

/** The dashboard (P1-ART-23): the overview read for the window (every tile,
 *  the trend, needs-you, the funnel, top athletes and cities), plus one
 *  server page of the campaigns (?page ?size ?q ?state ?sort). `overview`
 *  is null when the role has no metric reads (403). Null for the demo. */
export async function liveSponsorDashboard(
  sp: SearchParams,
  range: RangeKey,
): Promise<{ overview: SponsorOverview | null; rows: ApiCampaign[]; page: PageInfo } | null> {
  if (!(await isSponsor())) return null;
  const [overview, pg] = await Promise.all([fetchSponsorOverview(range), fetchCampaignPage(sp)]);
  return { overview, rows: pg?.campaigns ?? [], page: pg?.page ?? { page: 1, size: 12, total: 0, pages: 1 } };
}

/**
 * P4-FE-09 — the sponsor's own requests still waiting to become a campaign
 * (GET /briefs, own scope, newest first), each with the API's sponsor-safe
 * status. Never the reasons a request is held: the API doesn't send them to
 * a sponsor. A role that can't read briefs gets none, not an error.
 */
export async function liveSponsorRequests(): Promise<ApiSponsorRequest[]> {
  const res = await apiFetch("/briefs?page=1&size=20&state=DRAFT,QUALIFIED,APPROVED&sort=newest");
  if (res.status === 403) return [];
  if (!res.ok) throw new Error(`Requests unavailable (${res.status}).`);
  return openRequests(((await res.json()) as { briefs: ApiSponsorRequest[] }).briefs);
}

/** GET /briefs's tab counts, over the caller's whole scope — never the page
 *  or the search. A state key is absent rather than 0 when no brief of
 *  that state exists in scope. */
export type BriefCounts = { all: number; held: number } & Partial<Record<"DRAFT" | "QUALIFIED" | "APPROVED" | "CAMPAIGN_CREATED" | "CLOSED", number>>;

/** The Requests page's tab strip sets `?state=` to one brief state or, for
 *  "Being matched by BTG", the combo "DRAFT,QUALIFIED" — the API splits
 *  `?state=A,B` itself (`allowedList`). */
export const BRIEF_STATE_FILTERS = ["DRAFT", "QUALIFIED", "APPROVED", "CAMPAIGN_CREATED", "CLOSED", "DRAFT,QUALIFIED"] as const;

/** One SERVER page of the sponsor's own requests (P1-ART-23 Task 9): ?page
 *  ?size ?q ?state from the URL, sort fixed to newest (the page has no sort
 *  control). Null for the demo; a role that can't read briefs also answers
 *  null, which is this page's cue to fall back to the fixture deck rather
 *  than show an empty "no requests" a sponsor would mistake for the truth. */
export async function liveSponsorRequestPage(
  sp: SearchParams,
): Promise<{ rows: ApiSponsorRequest[]; page: PageInfo; counts: BriefCounts } | null> {
  if (!(await isSponsor())) return null;
  const query = apiListQuery(sp, {
    q: textParam(sp, "q"),
    state: textParam(sp, "state", BRIEF_STATE_FILTERS),
    sort: "newest",
  });
  const res = await apiFetch(`/briefs${query}`);
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Requests unavailable (${res.status}).`);
  const data = (await res.json()) as { briefs: ApiSponsorRequest[]; page: PageInfo; counts: BriefCounts };
  return { rows: data.briefs, page: data.page, counts: data.counts };
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
      /** P5-BE-09 / P4-FE-08 — content waiting for the sponsor's sign-off
       *  (SPONSOR_REVIEW on this campaign), with its caption and wait. */
      review: ApiDeliverable[];
      /** SPONSOR_ADMIN approves or asks for changes; an analyst only sees it. */
      canDecideContent: boolean;
      /** P1-ART-23 — every post this campaign includes, oldest due first,
       *  server-paged (own URL keys: a second paged read on this page).
       *  null when that read failed — the rest of the page still renders,
       *  and `postsUnavailable` says why. */
      posts: ApiDeliverable[] | null;
      postsPage: PageInfo;
      /** "forbidden" — the role can't read posts (403): hide the section.
       *  "error" — anything else went wrong: say so, offer a refresh. */
      postsUnavailable?: "error" | "forbidden";
      /** When these reads were made — the head's "Updated" pill. */
      readAt: string;
    }
  /** Not theirs, or not a campaign — the API answers both the same (403). */
  | { status: "missing" };

/** P1-ART-23 — the one-campaign page's "Posts" list keeps its own URL keys
 *  (this page has no other paged list, but the spec fixes these names). */
export const CAMPAIGN_POST_KEYS: ListKeys = { page: "ppage", size: "psize" };

/**
 * One campaign: its portfolio row (package, money — column-gated by the API),
 * its delivery board (GET /campaigns/:id/ops, orders scoped by whereFor, no
 * invitations for a sponsor), and one server page of its posts. Null for the
 * demo. The posts read is the one exception to "no catch": it is secondary,
 * so its failure degrades to a notice in the section (`readPosts`) instead
 * of an error page for the whole campaign.
 */
export async function liveSponsorCampaign(id: string, sp: SearchParams): Promise<LiveCampaignDetail | null> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.roles.some((r) => SPONSOR_ROLES.includes(r))) return null;
  /* GET /campaigns/:id, not a search of the list — the 101st campaign is as
     findable as the first (QA pass 7, F-5). */
  /* The reads are independent — one round trip, not four (QA pass 9). */
  const [campaign, res, art, rev, postsRes] = await Promise.all([
    fetchCampaign(id),
    apiFetch(`/campaigns/${encodeURIComponent(id)}/ops`),
    apiFetch(`/campaigns/${encodeURIComponent(id)}/artwork`),
    apiFetch(`/deliverables?state=SPONSOR_REVIEW&campaignId=${encodeURIComponent(id)}`),
    /* The post log is secondary — a failure here (even a network throw) must
       not take the page down, so it can't reject the batch. */
    apiFetch(`/deliverables${apiListQueryFor(sp, CAMPAIGN_POST_KEYS, { campaignId: id })}`).catch(() => null),
  ]);
  const readAt = new Date().toISOString();
  if (!campaign) return { status: "missing" };
  if (res.status === 403 || res.status === 404) return { status: "missing" };
  if (!res.ok) throw new Error(`Campaign unavailable (${res.status}).`);
  /* P9-BE-16 — no NEXT placements is an empty list, not an error. */
  if (!art.ok && art.status !== 403) throw new Error(`Ad artwork unavailable (${art.status}).`);
  const artwork = art.ok ? ((await art.json()) as { slots: ApiCampaignArtworkSlot[] }).slots : [];
  /* Content for sign-off: a role that can't read it gets none, not an error. */
  if (!rev.ok && rev.status !== 403) throw new Error(`Content review unavailable (${rev.status}).`);
  const review = rev.ok ? ((await rev.json()) as { deliverables: ApiDeliverable[] }).deliverables : [];
  const posts = await readPosts(postsRes);
  return {
    status: "found",
    campaign,
    ops: (await res.json()) as ApiOps,
    artwork,
    canDecideArtwork: who.actor.roles.includes("SPONSOR_ADMIN"),
    review,
    canDecideContent: who.actor.roles.includes("SPONSOR_ADMIN"),
    ...posts,
    readAt,
  };
}

/** The campaign's post log, degraded rather than thrown: a 403 hides the
 *  section, any other failure (status, network, a body that isn't the
 *  expected shape) reads as "couldn't load". A route still answering the
 *  unpaged shape gets one page holding every row (`pageOrAll`). */
async function readPosts(
  res: Response | null,
): Promise<{ posts: ApiDeliverable[] | null; postsPage: PageInfo; postsUnavailable?: "error" | "forbidden" }> {
  const none = (why: "error" | "forbidden") => ({ posts: null, postsPage: pageOrAll([]), postsUnavailable: why });
  if (!res) return none("error");
  if (res.status === 403) return none("forbidden");
  if (!res.ok) return none("error");
  try {
    const body = (await res.json()) as { deliverables?: unknown; page?: PageInfo | null };
    if (!Array.isArray(body?.deliverables)) return none("error");
    const rows = body.deliverables as ApiDeliverable[];
    return { posts: rows, postsPage: pageOrAll(rows, body.page) };
  } catch {
    return none("error");
  }
}
