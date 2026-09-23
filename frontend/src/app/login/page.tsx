import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { networkStats } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Authentication — §9 screen 2, redesigned 2026-09-23 as Stadium Night
   (spec: docs/superpowers/specs/2026-09-23-login-stadium-night-design.md).

   A full-bleed CSS night-stadium scene — floodlight beams, bokeh crowd, the
   badge and glass card center stage — replacing the two-panel card whose
   right half was a placeholder awaiting venue photography. Scene CSS lives in
   globals.css as the sx-login-* block; the page stays a server component and
   the redesign adds no client JavaScript.

   Fixed-dark in both themes, like the media panels: a night match has no
   Frost variant. Ink over the scene is on-media; the card interior keeps
   normal tokens (its glass is dark regardless of theme).

   Clerk is untouched: `routing="hash"` keeps this a single route (Clerk
   drives password/reset/verification through the URL fragment), and it lands
   on /portal, which reads the Postgres roles and forwards to the right
   workspace (§9.2, A4).
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Sign in — SponsorX",
};

export default function LoginPage() {
  /* Block B swaps these for the same Postgres counts the landing page uses;
     the labels already name their sources in the fixture. */
  const [athletes, campaigns] = networkStats;

  return (
    <div className="sx-login relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-12">
      {/* ------------------------------------------------------- the scene */}
      <div aria-hidden="true" className="sx-login-sky" />
      <div aria-hidden="true" className="sx-login-beam sx-login-beam-1" />
      <div aria-hidden="true" className="sx-login-beam sx-login-beam-2" />
      <div aria-hidden="true" className="sx-login-beam sx-login-beam-3" />
      <div aria-hidden="true" className="sx-login-crowd" />

      {/* ---------------------------------------------------- center stage */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- brand badge, host-portable */}
        <img
          src="/sponsorx-badge.png"
          alt="BTG SponsorX"
          className="sx-login-badge h-20 w-20"
        />

        <div className="sx-login-card mt-6 w-full rounded-2xl border border-primary/25 bg-surface/70 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-8">
          <SignIn
            routing="hash"
            forceRedirectUrl="/portal"
            appearance={{
              /* Clerk defaults to its light theme — dark ink — which is
                 unreadable on the night scene. These variables re-express the
                 house tokens (globals.css :root) inside the widget; values are
                 literals because this page is fixed-dark in both themes.
                 colorTextOnPrimaryBackground is the --sx-cta-ink rule: white
                 on brand blue is 2.95:1 (P1-QA-02), dark ink is 6.64. */
              variables: {
                colorPrimary: "#2e9bf5",
                colorPrimaryForeground: "#0a0c10",
                colorBackground: "#12151d",
                colorForeground: "#f4f5f7",
                colorMutedForeground: "#8a90a2",
                colorNeutral: "#f4f5f7",
                colorBorder: "#242a38",
                colorInput: "#1a1f2b",
                colorInputForeground: "#f4f5f7",
                colorDanger: "#ff4d4f",
                colorSuccess: "#22c98d",
                colorWarning: "#facc15",
                borderRadius: "0.5rem",
                fontFamily: "var(--font-poppins), system-ui, sans-serif",
              },
              elements: {
                /* The glass card already provides the chrome, so Clerk's own
                   card would double it up. */
                cardBox: "shadow-none border-0 bg-transparent w-full",
                card: "shadow-none border-0 bg-transparent px-0 py-0",
                footer: "bg-transparent",
              },
            }}
          />

          {/* ------------------------------------------- new-user paths */}
          {/* The managed-marketplace front doors (P1-FE-17's dual paths).
              Clerk's own "Sign up" creates an identity with no SponsorX
              account, which lands on /portal's "not set up yet" — correct,
              but a dead end for someone arriving cold. An athlete applies, a
              sponsor asks for a brief, and BTG provisions from there. */}
          <div className="mt-6 border-t border-line/60 pt-5">
            <p className="text-center text-[11px] text-muted">
              New to SponsorX?
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              <Link
                href="/join"
                className="rounded-lg border border-primary/40 px-3 py-2.5 text-center text-[11px] font-medium text-primary-soft transition-colors hover:bg-primary/10"
              >
                Apply as an athlete
              </Link>
              <Link
                href="/brief"
                className="rounded-lg border border-accent/40 px-3 py-2.5 text-center text-[11px] font-medium text-accent transition-colors hover:bg-accent/10"
              >
                Request a sponsor brief
              </Link>
            </div>
          </div>
        </div>

        {/* one quiet proof line over the crowd — counts from networkStats */}
        <p className="sx-login-proof mt-5 text-center text-[11px] tracking-wide text-on-media/70">
          {athletes.value} athletes in the network · {campaigns.value} campaigns
          delivered
        </p>
      </div>
    </div>
  );
}
