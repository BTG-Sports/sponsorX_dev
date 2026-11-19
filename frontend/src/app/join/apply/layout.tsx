import { LandingLoader } from "@/components/landing-loader";

import "@/app/brief/brief.css";

/* --------------------------------------------------------------------------
   /join/apply — the athlete application on its own page (POL-FE-115).

   Outside the (public) group on purpose, like /brief and /login: no site
   header and no footer, only the wizard. This layout carries what the
   (public) layout would have: the boot screen on a hard load (P1-ART-11, no
   city), which the page transition (P1-ART-12, "For Athletes") replaces on
   a move from the site. The wizard's stylesheet is the sponsor brief's
   (app/brief/brief.css), in athlete blue.
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Athlete application — SponsorX",
};

export default function JoinApplyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* No JS: the boot screen never shows (the (public) layout's rule). */}
      <noscript>
        <style>{`.sx-loader{display:none!important}`}</style>
      </noscript>
      <LandingLoader city={false} />
      {children}
    </>
  );
}
