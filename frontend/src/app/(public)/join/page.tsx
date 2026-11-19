import { redirect } from "next/navigation";

import { JoinStart } from "@/components/join-start";
import { JoinClose, JoinHero, JoinPath, JoinPromises } from "@/components/join-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";
import { rates } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Application — §11, and §39's front door: the landing.

   Redesigned 2026-09-30 to the landing's and /packages' visual language
   (join-stage.tsx): the fixed-dark stage, a sticky HUD panel beside a
   chamfered glass panel from lg (a compact hero above it on a phone), then
   the §5 job types band, the path after submitting, the three promises and
   the closing panel.

   POL-FE-115 (2026-11-19): the application itself moved to its own page,
   /join/apply (app/join/apply, join-wizard.tsx). The glass panel now holds
   the "start" panel (join-start.tsx): the ten sections, and a button at the
   top that goes to the application ("Start application", or "Resume —
   section N of M" when this device has a draft). The closing panel's button
   goes there too.

   The demo links moved with the wizard: ?demo=minor and ?demo=submitted are
   sent on to /join/apply, so an old link still lands on the same screen.
   -------------------------------------------------------------------------- */

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const { demo } = await searchParams;
  if (demo === "submitted" || demo === "minor") redirect(`/join/apply?demo=${demo}`);

  return (
    <StageReveal className="sx-stage sx-join relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <JoinHero>
        <JoinStart />
      </JoinHero>
      <InsideBand label="Jobs on the network" items={rates.map((r) => r.name)} />
      <JoinPath />
      <JoinPromises />
      <JoinClose />
    </StageReveal>
  );
}
