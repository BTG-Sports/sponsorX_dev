/* --------------------------------------------------------------------------
   The athlete dashboard's live reads — P2-FE-01. Every read is the athlete's
   own (own-scoped at the API).

   SERVER-PAGED (2026-09-29): nothing here reads a whole list. The counts and
   money are the API's aggregates (/invitations/summary, /deliverables/summary,
   /earnings/summary and the paged lists' page.total); the attention queue is
   the top QUEUE_TOP of each queue as one small server page.

   Null for anyone who isn't a linked ATHLETE — the page's cue for the demo;
   "unlinked" for an ATHLETE role with no athlete record (F-3). No catch: an
   outage is an error page, never a sample athlete's money.
   -------------------------------------------------------------------------- */
import type { ApiDeliverable } from "@/lib/deliverables-live";
import type { ApiEarningsSummary } from "@/lib/earnings-live";
import type { ApiInvitation } from "@/lib/invitations-live";
import type { ApiMyProfile } from "@/lib/profile-live";
import { QUEUE_TOP, type AthleteHomeInput, type GuardianStatus } from "@/lib/athlete-home-live";
import type { PageInfo } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";

async function json<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path.split("?")[0]} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

/** Everything except VERIFIED — the campaigns whose delivery is still open. */
const OPEN_STATES = "NOT_STARTED,DRAFT_SUBMITTED,BTG_REVIEW,SPONSOR_REVIEW,APPROVED,PUBLISHED";

export async function liveAthleteHome(): Promise<AthleteHomeInput | "unlinked" | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.includes("ATHLETE")) return null;

  const me = await apiFetch("/athletes/me");
  if (me.status === 403 || me.status === 404) return "unlinked";
  if (!me.ok) throw new Error(`/athletes/me unavailable (${me.status}).`);
  const profile = (await me.json()) as ApiMyProfile;

  const top = `page=1&size=${QUEUE_TOP}`;
  const [invites, inbox, todo, review, open, earnings, readiness] = await Promise.all([
    json<{ invitations: ApiInvitation[]; page: PageInfo }>(`/invitations?${top}&state=open&sort=expiry`),
    json<{ summary: { open: number } }>("/invitations/summary"),
    json<{ deliverables: ApiDeliverable[]; page: PageInfo }>(`/deliverables?${top}&tab=todo&sort=due`),
    json<{ deliverables: ApiDeliverable[]; page: PageInfo }>(`/deliverables?${top}&tab=review&sort=due`),
    json<{ campaigns: { id: string }[] }>(`/deliverables/summary?state=${OPEN_STATES}`),
    json<ApiEarningsSummary>(`/earnings/summary?year=${new Date().getUTCFullYear()}`),
    json<{ status: GuardianStatus }>(`/athletes/${encodeURIComponent(profile.id)}/guardian-readiness`),
  ]);

  return {
    profile,
    invitesTop: invites.invitations,
    openInvites: inbox.summary.open,
    dueTop: todo.deliverables,
    dueTotal: todo.page.total,
    reviewTop: review.deliverables,
    reviewTotal: review.page.total,
    activeCampaigns: open.campaigns.length,
    earnings,
    guardian: readiness.status,
  };
}
