import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { MatchingStudio } from "@/components/matching-studio";
import { LiveMatchingStudio } from "@/components/matching-live-studio";
import { EmptyState } from "@/components/states";
import { MATCH_BRIEF } from "@/lib/matching";
import {
  toMatchData,
  type ApiBrief,
  type ApiEligibleAthlete,
} from "@/lib/matching-live";
import { apiFetch, fetchActor } from "@/server/api";
import { sendInvitations } from "./actions";

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
/** Briefs worth matching, most useful first. */
const MATCHABLE = ["APPROVED", "CAMPAIGN_CREATED", "QUALIFIED"];

type Live =
  | { kind: "none"; briefs: ApiBrief[] }
  | { kind: "brief"; briefs: ApiBrief[]; brief: ApiBrief; eligible: ApiEligibleAthlete[] };

async function liveDesk(briefParam: string | undefined): Promise<Live | null> {
  /* No catch — an outage is an error page, never fixtures dressed as a real
     roster (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => DESK_ROLES.includes(r))) return null;

  const listRes = await apiFetch("/briefs");
  if (!listRes.ok) throw new Error(`Briefs unavailable (${listRes.status}).`);
  const { briefs } = (await listRes.json()) as { briefs: ApiBrief[] };
  const matchable = briefs
    .filter((b) => MATCHABLE.includes(b.state))
    .sort((a, b) => MATCHABLE.indexOf(a.state) - MATCHABLE.indexOf(b.state));

  const pick = briefs.find((b) => b.id === briefParam) ?? matchable[0];
  if (!pick) return { kind: "none", briefs: matchable };

  const [detailRes, eligibleRes] = await Promise.all([
    apiFetch(`/briefs/${encodeURIComponent(pick.id)}`),
    apiFetch(`/briefs/${encodeURIComponent(pick.id)}/eligible-athletes?limit=200`),
  ]);
  if (!detailRes.ok) throw new Error(`Brief unavailable (${detailRes.status}).`);
  if (!eligibleRes.ok) throw new Error(`Eligible roster unavailable (${eligibleRes.status}).`);
  const brief = (await detailRes.json()) as ApiBrief;
  const { athletes } = (await eligibleRes.json()) as { athletes: ApiEligibleAthlete[] };
  return { kind: "brief", briefs: matchable, brief, eligible: athletes };
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

  const live = str(sp.demo) ? null : await liveDesk(str(sp.brief));
  const data = live?.kind === "brief" ? toMatchData(live.brief, live.eligible) : null;
  const campaignName = data ? data.brief.campaign : MATCH_BRIEF.campaign;

  return (
    <div className="space-y-5">
      <BackLink target={{ href: "/admin/campaigns", label: "Back to campaigns" }} />

      <div className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-faint">
          Athlete Network · step 3 of 12
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
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
      {live && live.briefs.length > 1 && (
        <nav aria-label="Choose a brief" className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint">Brief:</span>
          {live.briefs.map((b) => {
            const current = live.kind === "brief" && live.brief.id === b.id;
            return (
              <Link
                key={b.id}
                href={`/admin/campaigns/match?brief=${encodeURIComponent(b.id)}`}
                aria-current={current ? "page" : undefined}
                className={
                  current
                    ? "rounded-full border border-admin/40 bg-admin/10 px-3 py-1 text-[11px] font-medium text-text"
                    : "rounded-full border border-line px-3 py-1 text-[11px] text-muted transition-colors hover:text-text"
                }
              >
                {b.sponsorName} · {b.objective.slice(0, 40)}
                <span className="ml-1.5 text-faint">{b.state.toLowerCase().replace(/_/g, " ")}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {live?.kind === "none" ? (
        <EmptyState
          mark="inbox"
          title="No brief is waiting for matching"
          hint="A sponsor brief lands here once BTG qualifies it. Approved briefs come first; each becomes its campaign when the first invitations go out."
          action={{ label: "Back to campaigns", href: "/admin/campaigns" }}
        />
      ) : data && live?.kind === "brief" ? (
        <LiveMatchingStudio
          data={data}
          initial={initial}
          send={sendInvitations.bind(null, live.brief.id)}
        />
      ) : (
        <MatchingStudio initial={initial} />
      )}
    </div>
  );
}
