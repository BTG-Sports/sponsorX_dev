import Link from "next/link";
import { LoginForm } from "@/components/login-form";

/* --------------------------------------------------------------------------
   Authentication — §9 screen 2, mockup screen 2.

   Deliberately outside the (public) route group so it does not inherit the
   marketing header and footer; the mockup shows this screen full-bleed.
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
          <div className="w-full max-w-[17rem]">
            <LoginForm />
          </div>
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

      {/* Build note — not part of the design. */}
      <div className="mt-6 w-full max-w-4xl">
        <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
          Mock sign-in. The form matches the email against a fixed list and
          navigates — there is no session, no token and no server check, so
          every portal is still reachable by URL. Real auth is Clerk plus the{" "}
          <code className="font-mono">requireActor()</code> lookup in guide §04,
          which also brings MFA (§26 requires it for admin and finance),
          guardian/athlete linkage and tenant context.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <Link href="/sponsor" className="text-accent hover:underline">
            → Sponsor dashboard
          </Link>
          <Link href="/athlete" className="text-accent hover:underline">
            → Athlete portal
          </Link>
          <Link href="/admin" className="text-accent hover:underline">
            → Admin
          </Link>
          <Link href="/map" className="text-muted hover:text-text">
            route map
          </Link>
        </div>
      </div>
    </div>
  );
}
