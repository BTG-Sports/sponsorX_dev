"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { LinkExpired } from "@/components/link-expired";
import { confirmClaimAction, type ClaimConfirmOutcome } from "./actions";

/* --------------------------------------------------------------------------
   2S8-FE-02 — the card on /athletes/claim/confirm: the claim's wording, one
   button. A form whose action is the server action, so the POST is a press
   and never a page load; on success the action redirects and this card is
   gone. Each refusal is its own notice, in the page's Plain look.
   -------------------------------------------------------------------------- */

function Plain({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <div className="space-y-2 text-sm text-muted">{children}</div>
    </div>
  );
}

export function ClaimConfirmCard({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [outcome, setOutcome] = useState<ClaimConfirmOutcome | null>(null);

  if (outcome?.kind === "expired") return <LinkExpired kind={outcome.linkKind} token={token} what="the confirmation link" />;
  if (outcome?.kind === "invalid") {
    return (
      <Plain title="This confirmation link isn't valid">
        <p>{outcome.message ?? "Check you opened the whole link from the email — it's long. If it still doesn't work, claim the profile again from its page."}</p>
        <p>
          <Link href="/" className="text-primary hover:underline">
            Go to the home page →
          </Link>
        </p>
      </Plain>
    );
  }
  if (outcome?.kind === "limited") {
    return (
      <Plain title="Give it a few minutes">
        <p>There have been a lot of requests from this connection. Open the link from your email again in a few minutes.</p>
      </Plain>
    );
  }

  return (
    <form
      action={() =>
        start(async () => {
          setOutcome(await confirmClaimAction(token));
        })
      }
      className="space-y-4 rounded-xl border border-line bg-surface p-6"
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">BTG SponsorX · Profile claim</p>
        <h1 className="text-xl font-semibold tracking-tight">Confirm your email</h1>
        <p className="text-sm leading-relaxed text-muted">
          You told us a featured profile is you. Confirming this address is step one of three: your school checks the claim next, and if
          you&rsquo;re under 18 a parent or guardian authorises anything commercial.
        </p>
        <p className="text-sm leading-relaxed text-muted">
          Confirming does not sign you with anyone, and it does not mean anyone represents you. The profile stays editorial until every step is
          done.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Confirming…" : "Confirm my email"}
        </button>
        {outcome?.kind === "failed" && (
          <p role="alert" className="text-sm text-danger">
            {outcome.status === 0 ? "We couldn't reach SponsorX. Check your connection and try again." : `Your email couldn't be confirmed (${outcome.status}). Try again in a minute.`}
          </p>
        )}
      </div>
    </form>
  );
}
