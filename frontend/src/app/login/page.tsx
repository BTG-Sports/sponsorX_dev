import { SignIn } from "@clerk/nextjs";

import { LoginFigures, LoginGround, LoginHud, LoginMHero, LoginTopBar, SignInPanel } from "@/components/login-stage";
import { LandingLoader } from "@/components/landing-loader";
import { LoginStage } from "@/components/login-fx";
import { SiteFooter } from "@/components/site-chrome";

/* --------------------------------------------------------------------------
   Authentication — §9 screen 2. Redesigned 2026-10-02 to the landing's and
   /packages' / /join's / /next/about's visual language (login-stage.tsx):
   the fixed-dark stage with a pointer-led light, sweeping floodlights (kept
   from the 2026-09-23 Stadium Night scene), rising motes and the receding
   floor drifting in parallax; from lg a HUD column —
   scrambled eyebrow, masked three-line headline, a "Where you'll land" card
   cycling the five workspaces, the network figures — beside the sign-in in
   a chamfered glass panel. Below lg a compact hero above the panel and the
   figures under it. The HUD sheds the figures and then the card as the
   screen gets shorter. The landing's compact footer (with its outlined
   SPONSORX wordmark) closes the page, the same one its last stop carries.

   Fixed-dark in both themes: `.sx-login` (globals.css) re-pins the themed
   tokens the widget and links read, and restyles Clerk's own elements to
   the house glass.

   Entry, like the public pages (lib/page-transition.ts lists /login with
   them): a hard load or refresh shows the boot screen (P1-ART-11, no city,
   waiting on fonts and load); a move to or from the site plays the page
   transition (P1-ART-12, "Login"). Either one releases the stage's
   entrance. Signing in (→ /portal) stays a plain navigation.

   Clerk is untouched: `routing="hash"` keeps this a single route (Clerk
   drives password/reset/verification through the URL fragment), and it lands
   on /portal, which reads the Postgres roles and forwards to the right
   workspace (§9.2, A4).
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Sign in — SponsorX",
};

export default function LoginPage() {
  return (
    <>
      {/* No JS: the boot screen never shows (the (public) layout's rule). */}
      <noscript>
        <style>{`.sx-loader{display:none!important}`}</style>
      </noscript>
      <LandingLoader city={false} />
      <LoginStage className="sx-stage sx-login relative isolate flex min-h-svh flex-col overflow-x-clip text-on-media">
        <LoginGround />
        <LoginTopBar />

        <main className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 content-center gap-7 px-5 pb-10 pt-8 sm:px-[6vw] sm:pt-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-center lg:gap-16 lg:py-8 xl:gap-24 2xl:px-0 lg:[@media(max-height:780px)]:py-3">
          <LoginHud />
          <LoginMHero />

          <SignInPanel>
            <SignIn
              routing="hash"
              forceRedirectUrl="/portal"
              appearance={{
                /* Clerk defaults to its light theme — dark ink — which is
                   unreadable on the stage. These variables re-express the house
                   tokens (globals.css :root) inside the widget; values are
                   literals because this page is fixed-dark in both themes.
                   colorTextOnPrimaryBackground is the --sx-cta-ink rule: white
                   on brand blue is 2.95:1 (P1-QA-02), dark ink is 6.64. */
                variables: {
                  colorPrimary: "#2e9bf5",
                  colorPrimaryForeground: "#0a0c10",
                  colorBackground: "#0b1628",
                  colorForeground: "#f4f5f7",
                  colorMutedForeground: "#8f9ab0",
                  colorNeutral: "#f4f5f7",
                  colorBorder: "#1f2d44",
                  colorInput: "#08142a",
                  colorInputForeground: "#f4f5f7",
                  colorDanger: "#ff4d4f",
                  colorSuccess: "#22c98d",
                  colorWarning: "#facc15",
                  borderRadius: "0.5rem",
                  fontFamily: "var(--font-poppins), system-ui, sans-serif",
                },
                elements: {
                  /* The glass panel already provides the chrome, so Clerk's own
                     card would double it up. The width overrides matter at
                     390px: .cl-card is 25rem wide by default, which bursts out
                     of the frame on phones (2026-09-24 QA sweep). */
                  rootBox: "w-full",
                  cardBox: "shadow-none border-0 bg-transparent w-full max-w-full",
                  card: "shadow-none border-0 bg-transparent px-0 py-0 w-full max-w-full",
                  footer: "bg-transparent",
                },
              }}
            />
          </SignInPanel>

          <div className="sx-stage-in mx-auto w-full max-w-[460px] lg:hidden" style={{ "--sx-reveal-delay": "0.5s" } as React.CSSProperties}>
            <LoginFigures />
          </div>
        </main>

        <div className="sx-stage-in" style={{ "--sx-reveal-delay": "0.6s" } as React.CSSProperties}>
          <SiteFooter compact />
        </div>
      </LoginStage>
    </>
  );
}
