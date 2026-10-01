import { JoinWizard } from "@/components/join-wizard";
import { JoinClose, JoinHero, JoinPath, JoinPromises } from "@/components/join-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";
import { rates } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door. P1-ART-07 built in-app:
   the phone-first progressive wizard (one section per screen, the §4 guardian
   branch, localStorage drafts, v0.4 click-wrap, after-submit state).

   Redesigned 2026-09-30 to the landing's and /packages' visual language
   (join-stage.tsx): the fixed-dark stage, a sticky HUD panel beside the
   wizard from lg (a compact hero above it on a phone, intro only), the
   wizard in a chamfered glass panel, then the §5 job types band, the path
   after submitting, the three promises and the closing panel. The form
   column never widens — long input rows hurt completion.

   Wired (P3-FE-01): submit POSTs the real application through the server
   action in ./actions.ts. Demo modes stay simulation — ?demo=minor lands on
   section 1 with an under-18 DOB, ?demo=submitted on the after-submit state
   with the guardian card, and neither ever reaches the API.
   -------------------------------------------------------------------------- */

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  const d = demo === "submitted" ? "submitted" : demo === "minor" ? "minor" : null;

  return (
    <StageReveal className="sx-stage sx-join relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <JoinHero>
        <JoinWizard demo={d} />
      </JoinHero>
      <InsideBand label="Jobs on the network" items={rates.map((r) => r.name)} />
      <JoinPath />
      <JoinPromises />
      <JoinClose />
    </StageReveal>
  );
}
