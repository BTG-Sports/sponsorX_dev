import { BackLink } from "@/components/back-link";
import { MatchingStudio } from "@/components/matching-studio";
import { LiveMatchingStudio } from "@/components/matching-live-studio";
import { EmptyState } from "@/components/states";
import { BlockedNotice } from "@/components/ui";
import { MATCH_BRIEF, MIN_SCORE_FLOOR } from "@/lib/matching";
import {
  asortOf,
  briefsApiQuery,
  eligibleApiQuery,
  toMatchData,
  type ApiBrief,
  type ApiEligiblePage,
} from "@/lib/matching-live";
import { textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { sendInvitations } from "./actions";
import { BriefPicker } from "./brief-picker";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { mayWriteOffers } from "@/lib/admin-offers-live";

/* --------------------------------------------------------------------------
   /admin/campaigns/match — the Matching Studio (P4-ART-01 in-app).

   §13 step 3: the Athlete Network Manager filters the eligible network,
   weighs score/reach/cost/margin side by side, assembles the roster and
   reviews it before invitations go out. The island owns every interactive
   state; this frame resolves the shareable URL params (?view=, ?q=,
   ?sport=, ?tier=, ?min=) it hydrates from.

   LIVE vs DEMO (P4-FE-02 / -03, the P3-FE-02 precedent). A signed-in BTG
   matching desk sees a REAL brief: GET /briefs picks it (?brief= or the
   newest approved), GET /briefs/{id}/eligible-athletes is the roster —
   conflicts already excluded by the query (§26), each row carrying its
   stored §14 snapshot, reach with provenance, and rates — and Send creates
   the campaign (first time) and one invitation per package line through a
   server action. Anyone else keeps the fixture demo. The nav highlights
   Campaigns via the prefix rule.
   -------------------------------------------------------------------------- */

const DESK_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "NETWORK_MGR", "CAMPAIGN_MGR"];

/* SERVER-PAGED (2026-09-29). Two lists, each one page from the API: the
   brief picker (GET /briefs — matchable states in desk order, ?bq search,
   ?page / ?size) and the eligible roster (GET /briefs/{id}/eligible-athletes
   — the Studio's ?q ?sport ?tier ?min ?asort, ?apage / ?asize). Nothing
   fetches every brief or every athlete to slice in the browser. */
type BriefList = { briefs: ApiBrief[]; page: PageInfo };
type Live =
  | { kind: "denied" }
  | { kind: "none"; list: BriefList }
  | { kind: "brief"; list: BriefList; brief: ApiBrief; eligible: ApiEligiblePage; offers: boolean };

async function liveDesk(sp: SearchParams): Promise<Live | null> {
  /* No catch — an outage is an error page, never fixtures dressed as a real
     roster (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;

  /* A 403 is the API's answer for a role, not an outage (F-02, QA pass 5):
     the desk renders the out-of-scope message instead of the error page. */
  const listRes = await apiFetch(`/briefs${briefsApiQuery(sp)}`);
  if (listRes.status === 403) return { kind: "denied" };
  if (!listRes.ok) throw new Error(`Briefs unavailable (${listRes.status}).`);
  const list = (await listRes.json()) as BriefList;

  /* ?brief= picks one (it needn't be on this picker page); otherwise the
     page's first — on page one, the desk order's first. */
  const want = textParam(sp, "brief");
  const first = list.briefs[0]?.id;
  const load = async (id: string) =>
    Promise.all([
      apiFetch(`/briefs/${encodeURIComponent(id)}`),
      apiFetch(`/briefs/${encodeURIComponent(id)}/eligible-athletes${eligibleApiQuery(sp, MIN_SCORE_FLOOR)}`),
    ]);
  const pickId = want || first;
  if (!pickId) return { kind: "none", list };
  let [detailRes, eligibleRes] = await load(pickId);
  /* A ?brief= that isn't the caller's (or no longer exists) falls back to
     the picker's first, as the old in-list lookup did. */
  if (want && first && first !== want && (detailRes.status === 403 || detailRes.status === 404)) {
    [detailRes, eligibleRes] = await load(first);
  }
  if (detailRes.status === 403 || eligibleRes.status === 403) return { kind: "denied" };
  if (!detailRes.ok) throw new Error(`Brief unavailable (${detailRes.status}).`);
  if (!eligibleRes.ok) throw new Error(`Eligible roster unavailable (${eligibleRes.status}).`);
  const brief = (await detailRes.json()) as ApiBrief;
  const eligible = (await eligibleRes.json()) as ApiEligiblePage;
  /* P4-FE-08 — an offer writer's rows link to the pre-filled offer form. */
  return { kind: "brief", list, brief, eligible, offers: mayWriteOffers(who.actor.roles) };
}

export default async function MatchingStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const initial = {
    view: str(sp.view),
    q: str(sp.q),
    sport: str(sp.sport),
    tier: str(sp.tier),
    min: str(sp.min),
  };

  /* C-1: a staff role this desk isn't for gets "not in your role". */
  if (!str(sp.demo)) {
    const lacking = await staffWithoutAccess("/admin/campaigns/match");
    if (lacking) return <NotInRole path="/admin/campaigns/match" title="Matching Studio" roles={lacking} />;
  }
  const live = str(sp.demo) ? null : await liveDesk(sp);
  const data = live?.kind === "brief" ? toMatchData(live.brief, live.eligible.athletes, { offers: live.offers }) : null;
  const bq = textParam(sp, "bq");
  const campaignName = data ? data.brief.campaign : MATCH_BRIEF.campaign;

  return (
    <div className="space-y-5">
      <BackLink target={{ href: "/admin/campaigns", label: "Back to campaigns" }} />

      <div className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
          Athlete Network · step 3 of 12
        </p>
        <h1 className="sx-page-title mt-1">
          Matching &amp; roster review
        </h1>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
          Pick who goes on {campaignName}&apos;s roster and review it
          before invitations go out. Conflicts stay visible, margin is checked
          per line against the {`1.4×`} floor, and athlete cost never leaves BTG
          screens.
        </p>
      </div>

      {/* Which brief — a live desk can have several waiting. */}
      {live && live.kind !== "denied" && (live.list.page.total > 1 || bq) && (
        <BriefPicker
          briefs={live.list.briefs}
          page={live.list.page}
          q={bq}
          currentId={live.kind === "brief" ? live.brief.id : null}
        />
      )}

      {live?.kind === "denied" ? (
        <EmptyState
          mark="inbox"
          title="Matching is outside your role"
          hint="The matching desk reads sponsor briefs and the eligible roster together; your role doesn't read one of them (§15)."
          action={{ label: "Back to campaigns", href: "/admin/campaigns" }}
        />
      ) : live?.kind === "none" ? (
        bq ? null : <EmptyState
          mark="inbox"
          title="No brief is waiting for matching"
          hint="A sponsor brief lands here once BTG qualifies it. Approved briefs come first; each becomes its campaign when the first invitations go out."
          action={{ label: "Back to campaigns", href: "/admin/campaigns" }}
        />
      ) : data && live?.kind === "brief" ? (
        <LiveMatchingStudio
          key={live.brief.id}
          data={data}
          initial={initial}
          send={sendInvitations.bind(null, live.brief.id)}
          page={live.eligible.page}
          facets={live.eligible.facets}
          sort={asortOf(sp)}
        />
      ) : (
        <>
          {/* P7-QA-02: reached without ?demo= only by staff outside the desk's
              roles (SALES, FINANCE) — the scores, reach and margins below
              are the fixture roster. */}
          {!str(sp.demo) && (
            <BlockedNotice>
              Demo data — the live matching desk is BTG admin, Network and
              Campaign Managers&rsquo;, so every athlete and figure below is
              sample data.
            </BlockedNotice>
          )}
          <MatchingStudio initial={initial} />
        </>
      )}
    </div>
  );
}
