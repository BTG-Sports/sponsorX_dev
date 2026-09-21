import { BackLink } from "@/components/back-link";
import { MatchingStudio } from "@/components/matching-studio";
import { MATCH_BRIEF } from "@/lib/matching";

/* --------------------------------------------------------------------------
   /admin/campaigns/match — the Matching Studio (P4-ART-01 in-app).

   §13 step 3 for the one campaign currently in STAFFING: the Athlete Network
   Manager filters the eligible network, weighs score/reach/cost/margin side
   by side, assembles the roster and reviews it before invitations go out.
   The island owns every interactive state; this frame resolves the shareable
   URL params (?view=, ?q=, ?sport=, ?tier=, ?min=) it hydrates from.

   Fixtures only — wiring to the real eligible-athletes query is P4-FE-02 on
   P4-BE-03, both Blocked. The nav highlights Campaigns via the prefix rule.
   -------------------------------------------------------------------------- */

export default async function MatchingStudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

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
          Pick who goes on {MATCH_BRIEF.campaign}&apos;s roster and review it
          before invitations go out. Conflicts stay visible, margin is checked
          per line against the {`1.4×`} floor, and athlete cost never leaves BTG
          screens.
        </p>
      </div>

      <MatchingStudio
        initial={{
          view: str(sp.view),
          q: str(sp.q),
          sport: str(sp.sport),
          tier: str(sp.tier),
          min: str(sp.min),
        }}
      />
    </div>
  );
}
