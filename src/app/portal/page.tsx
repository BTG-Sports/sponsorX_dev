import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Logo } from "@/components/logo";
import { mirrorCurrentUser, portalFor } from "@/server/identity";

/* --------------------------------------------------------------------------
   Where sign-in lands — P2-INT-01, §9.2.

   Clerk sends everyone here, and this page decides where they actually go by
   reading the Postgres roles. That keeps role-aware routing exactly where
   Addendum A4 wants it: Clerk proved who you are, Postgres decides what that
   means.

   It is also the only route in the app that touches the database today, which
   is deliberate — every other screen still runs on fixtures, so the app boots
   on a laptop with no `DATABASE_URL`.
   -------------------------------------------------------------------------- */

export const metadata = { title: "Signing you in — SponsorX" };

/* The mirror writes on first sign-in, so this must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const result = await mirrorCurrentUser();

  if (result.status === "anonymous") redirect("/login");

  if (result.status === "linked") {
    const destination = portalFor(result.user.roles);
    if (destination) redirect(destination);
  }

  /* Authenticated, but with no portal to go to: either no `User` row was
     prepared for this address, or the row holds only the SERVICE role. Say so
     plainly instead of dropping them on a portal they cannot use. */
  const email = result.status === "unprovisioned" ? result.email : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="flex justify-center">
          <Logo className="h-10" />
        </div>

        <h1 className="mt-8 text-lg font-semibold tracking-tight">
          Your account isn&rsquo;t set up yet
        </h1>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          You signed in successfully
          {email ? (
            <>
              {" "}
              as <span className="text-text">{email}</span>
            </>
          ) : null}
          , but no SponsorX account has been prepared for you. SponsorX is a
          managed marketplace in Phase 1 — BTG staff set up sponsor, athlete and
          property accounts, so access is granted rather than self-served.
        </p>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          Ask your BTG contact to provision access for this address.
        </p>

        <div className="mt-7 flex items-center justify-center gap-4 text-[11px]">
          <SignOutButton redirectUrl="/">
            <button className="rounded-lg border border-line px-3 py-2 font-medium text-text transition-colors hover:bg-surface-2">
              Sign out
            </button>
          </SignOutButton>
          <Link href="/" className="text-muted hover:text-text">
            Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}
