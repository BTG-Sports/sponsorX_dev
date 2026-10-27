import { AboutClose, AboutHero, Desks, Programmes, Story, VALUES_BAND, Values } from "@/components/about-stage";
import { StageReveal } from "@/components/packages-fx";
import { InsideBand } from "@/components/packages-stage";

/* --------------------------------------------------------------------------
   /about — the nav's "About" (2026-10-27). Until now the item was inert
   text (site-nav.tsx `pending`). Who runs SponsorX and what it stands for:
   BTG Sports Group, the three things the platform keeps on record, the four
   commitments, the four BTG desks behind it, and the group's two
   programmes, SponsorX and SponsorX NEXT.

   Built on the landing's visual language (about-stage.tsx, the same parts
   /packages, /get-started and /how-it-works use). Static: nothing on it is
   read from the API, so it carries no figure that needs a source.
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "About — SponsorX",
  description:
    "SponsorX is BTG Sports Group's sponsorship platform: athletes matched on audience fit, every invitation the athlete's choice, minors with a guardian, and results from tracked events.",
};

export default function AboutPage() {
  return (
    <StageReveal className="sx-stage relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <AboutHero />
      <InsideBand items={VALUES_BAND} label="What we stand for" />
      <Story />
      <Values />
      <Desks />
      <Programmes />
      <AboutClose />
    </StageReveal>
  );
}
