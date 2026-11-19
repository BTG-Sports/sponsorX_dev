import { packageOption } from "@/lib/brief-flow";
import { BriefWizard } from "@/components/brief-wizard";
import { LandingLoader } from "@/components/landing-loader";

import "./brief.css";

/* --------------------------------------------------------------------------
   Sponsor brief request — the public half of B3 (§13). Phase 1 is managed:
   this collects goal, business, budget range, market and contact; BTG does
   the rest. No card, no checkout, nothing signed.

   POL-FE-114 (2026-11-19): the brief is its own page. It used to sit in the
   (public) group, a 430px card beside a marketing panel under the site's
   header and above its footer. It now lives outside that group, like
   /login, so nothing is on screen but the wizard: one question at a time,
   full screen (brief-wizard.tsx).

   Entry, like the public pages (lib/page-transition.ts lists /brief with
   them): a hard load or refresh shows the boot screen (P1-ART-11, no city);
   a move to or from the site plays the page transition (P1-ART-12, "Your
   Brief"). Either one releases the first screen's entrance.

   ?package=<id> prefills the starting package (unknown ids fall back to
   "Not sure yet"); ?demo=submitted lands on the sent screen; ?new=1 starts
   a blank brief ("Send the form again" from /sponsor-request, 2S1-FE-11).
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Send a brief — SponsorX",
};

export default async function BriefPage({
  searchParams,
}: {
  searchParams: Promise<{ package?: string; demo?: string; new?: string }>;
}) {
  const sp = await searchParams;
  /* Only pass a package when one was actually asked for — a bare /brief
     visit must resume any stored draft, not reset it to "unsure". */
  const pkg = sp.package ? packageOption(sp.package).id : undefined;
  const demo = sp.demo === "submitted" ? ("submitted" as const) : null;

  return (
    <>
      {/* No JS: the boot screen never shows (the (public) layout's rule). */}
      <noscript>
        <style>{`.sx-loader{display:none!important}`}</style>
      </noscript>
      <LandingLoader city={false} />
      <BriefWizard pkg={pkg} demo={demo} fresh={sp.new === "1"} />
    </>
  );
}
