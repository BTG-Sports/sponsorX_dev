"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";
import { ErrorPanel } from "@/components/states";

/* --------------------------------------------------------------------------
   /portal's error boundary — QA pass 6 (P6-FE-09).

   /portal is where every sign-in lands, and it asks the API who you are
   (fetchActor). A transient API failure throws there on purpose — it must not
   be reported as "your account isn't set up" — but with no boundary the
   throw fell to Next's generic error page. This says what actually happened,
   keeps the same centred card as the page itself, and offers a retry that
   re-runs the server render (Next 16 `retry`, error.md).
   -------------------------------------------------------------------------- */

export default function PortalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo className="h-10" />
        </div>
        <ErrorPanel
          title="We couldn't open your portal just now"
          hint="You're signed in and your account is fine — SponsorX didn't answer in time. Try again in a few seconds."
          refCode={error.digest}
          action={
            <div className="mt-1 flex items-center justify-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={retry}
                className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
              >
                Try again
              </button>
              <Link href="/" className="text-muted hover:text-text">
                Back to site
              </Link>
            </div>
          }
        />
      </div>
    </main>
  );
}
