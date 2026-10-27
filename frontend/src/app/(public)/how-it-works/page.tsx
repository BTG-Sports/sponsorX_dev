import { HowClose, HowHero, LOOP_BAND, LoopTrack, Safeguards, SideCards } from "@/components/how-it-works-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";

/* --------------------------------------------------------------------------
   /how-it-works — the nav's "How It Works" (2026-10-27). Until now the item
   was inert text (site-nav.tsx `pending`); the landing's basketball stop is
   the four-card teaser, and this page is the whole story: the §39 loop from
   athlete application to sponsor report, each of the four sides' part in
   it, and what BTG checks along the way.

   Built on the landing's visual language (how-it-works-stage.tsx, the same
   parts /packages and /get-started use). Static: nothing on it is read
   from the API, so it carries no figure that needs a source.
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "How it works — SponsorX",
  description:
    "How SponsorX works: sponsors brief, BTG matches athletes and clears conflicts, athletes deliver, fans redeem rewards by QR, and sponsors get the report.",
};

export default function HowItWorksPage() {
  return (
    <StageReveal className="sx-stage relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <HowHero />
      <InsideBand items={LOOP_BAND} label="The loop" />
      <LoopTrack />
      <SideCards />
      <Safeguards />
      <HowClose />
    </StageReveal>
  );
}
