import { SignIn } from "@clerk/nextjs";

/* --------------------------------------------------------------------------
   Authentication — §9 screen 2, mockup screen 2.

   Deliberately outside the (public) route group so it does not inherit the
   marketing header and footer; the mockup shows this screen full-bleed.

   P2-INT-01 replaced the mock form with Clerk. The two-panel composition from
   the mockup is kept and Clerk's <SignIn /> occupies the left panel, so the
   screen still reads as the designed one rather than as a vendor default.

   `routing="hash"` keeps this a single route: Clerk drives its own steps
   (password, reset, verification) through the URL fragment instead of
   demanding a `[[...rest]]` catch-all, which would have split one designed
   screen across a route group for no benefit.

   Where it lands: /portal, which reads the Postgres roles and forwards to the
   right workspace. Role-aware routing stays a database decision (§9.2, A4).
   -------------------------------------------------------------------------- */

export const metadata = {
  title: "Sign in — SponsorX",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-line bg-surface md:grid-cols-2">
        {/* --------------------------------------------------- form panel */}
        <div className="flex items-center justify-center bg-bg px-8 py-12 sm:px-12">
          <SignIn
            routing="hash"
            forceRedirectUrl="/portal"
            appearance={{
              elements: {
                /* The panel already provides the card, so Clerk's own card
                   chrome would double it up. */
                cardBox: "shadow-none border-0 bg-transparent w-full",
                card: "shadow-none border-0 bg-transparent px-0 py-0",
                footer: "bg-transparent",
              },
            }}
          />
        </div>

        {/* -------------------------------------------------- image panel */}
        {/* The mockup uses a night aerial of a stadium with BTG on the roof.
            That asset is not in the repo, so this is a placeholder treatment
            rather than an invented image. */}
        <div className="relative hidden min-h-[26rem] overflow-hidden md:block">
          <div className="absolute inset-0 bg-gradient-to-br from-[#123049] via-[#0e1d2c] to-[#0a0c10]" />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-warn/25 blur-[110px]"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-1/2 h-40 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--sx-on-media)_10%,transparent),transparent_70%)]"
          />
          <div className="relative grid h-full place-items-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- brand badge, host-portable */}
            <img
              src="/sponsorx-badge.png"
              alt="BTG SponsorX"
              className="h-40 w-40 drop-shadow-[0_0_40px_rgba(46,155,245,0.25)]"
            />
          </div>
          <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-on-media/25">
            venue photography pending
          </p>
        </div>
      </div>
    </div>
  );
}
