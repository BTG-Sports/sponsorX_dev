import { PathCards, StartClose, StartHero, StartSteps } from "@/components/get-started-stage";
import { StageReveal } from "@/components/packages-fx";
import { fetchNetworkStats } from "@/server/network-stats";

/* --------------------------------------------------------------------------
   /get-started — where "Get Started" goes for someone signed out (2026-10-27).

   It used to go to /login: a sign-in form with the new-user doors under it.
   For someone new that read as "you need an account first" — confusing, and
   redundant beside the header's own Login. Phase 1 has no self-service
   sign-up (a Clerk sign-up alone is an identity with no SponsorX account),
   so getting started means one of three applications, and this page is that
   choice. Signed in, every Get Started still becomes "<Role> Dashboard"
   (P1-ART-27, my-dashboard.tsx) and never lands here.

   Built on the landing's visual language (get-started-stage.tsx, the same
   parts /packages uses). The hero shows the landing's live network card;
   like the home page, that makes this page render per request, and with no
   read the card is simply left out.
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Get started — SponsorX",
  description: "Apply as an athlete, request a sponsor brief, or list your team or venue on SponsorX.",
};

export default async function GetStartedPage() {
  const stats = await fetchNetworkStats();
  return (
    <StageReveal className="sx-stage relative -mt-[72px] w-full overflow-x-clip text-on-media">
      <StartHero stats={stats} />
      <PathCards />
      <StartSteps />
      <StartClose />
    </StageReveal>
  );
}
