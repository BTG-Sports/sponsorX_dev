import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { Logo } from "@/components/logo";
import { currentUser } from "@clerk/nextjs/server";
import { fetchActor } from "@/server/api";
import { pendingWords } from "@/lib/pending-words";
import { portalFor } from "@/server/portal";

/* --------------------------------------------------------------------------
   Where sign-in lands — P2-INT-01, §9.2.

   Clerk sends everyone here, and this page decides where they actually go by
   reading the Postgres roles. That keeps role-aware routing exactly where
   Addendum A4 wants it: Clerk proved who you are, Postgres decides what that
   means.

   Nothing here touches the database. Authorisation moved to the API with
   Addendum B, so this asks `GET /api/v1/me` — and that call is also what
   *completes* a first sign-in, because claiming a provisioned row happens
   inside the API's resolveActor().
   -------------------------------------------------------------------------- */

export const metadata = { title: "Signing you in — SponsorX" };

/* The mirror writes on first sign-in, so this must never be prerendered. */
export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const result = await fetchActor();

  if (result.status === "anonymous") redirect("/login");

  if (result.status === "linked") {
    const destination = portalFor(result.actor.roles);
    if (destination) redirect(destination);
  }

  /* Authenticated, but with no portal to go to: either no `User` row was
     prepared for this address, or the row holds only the SERVICE role. Say so
     plainly instead of dropping them on a portal they cannot use.

     The address comes from Clerk rather than the API, because the API has no
     account to report — telling someone which address failed is the single
     most useful thing on this page, since the usual cause is signing up with
     a different one from the address BTG provisioned. */
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? null;
  /* POL-BE-118 — what this address applied for, when it did: the page speaks
     about that application instead of telling someone who just applied to
     apply (owner, 2026-11-20: "this is super misleading"). */
  const pending = result.status === "unprovisioned" ? result.pending ?? null : null;
  const said = pendingWords(pending);
  const who = email ? (
    <>
      {" "}
      as <span className="text-text">{email}</span>
    </>
  ) : null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
        <div className="flex justify-center">
          <Logo className="h-10" />
        </div>

        {said ? (
          <>
            <h1 className="mt-8 text-lg font-semibold tracking-tight">{said.heading}</h1>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              You signed in{who}. {said.lead}
            </p>
            {said.todo.length > 0 && (
              <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-xs text-text">
                {said.todo.map((t) => (
                  <li key={t} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent">•</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            )}
            {said.after && <p className="mt-4 text-xs leading-relaxed text-muted">{said.after}</p>}
            {said.action && (
              <Link
                href={said.action.href}
                className="mt-6 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-xs font-semibold text-cta-ink transition-opacity hover:opacity-90"
              >
                {said.action.label}
              </Link>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-8 text-lg font-semibold tracking-tight">
              Your account isn&rsquo;t set up yet
            </h1>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              You signed in successfully{who}, but no application or account
              uses this address. Athletes, sponsors and teams or venues get an
              account by applying on{" "}
              <Link href="/get-started" className="text-text underline underline-offset-2">
                Get started
              </Link>
              .
            </p>

            <p className="mt-3 text-xs leading-relaxed text-muted">
              Applied with a different address? Sign out and sign in with that
              one.
            </p>
          </>
        )}

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
