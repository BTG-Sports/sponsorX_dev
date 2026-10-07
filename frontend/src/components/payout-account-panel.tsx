"use client";

import { useActionState } from "react";

import { Badge } from "@/components/ui";
import type { AccountPanelView, PayoutWriteFailure } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   The payee's payout account on Stripe — 2S5-FE-02 / 2S5-FE-03.

   PayoutAccountPanel is the Earnings page's panel (design Earnings.dc.html):
   the status chip in words, what to do, and the one CTA that takes the payee
   to Stripe. StripeLinkButton is that CTA on its own, reused by the athlete
   home's banner. The view model (`accountPanel`, lib/payouts-live) decides
   the copy; this file only renders it and runs the server action.

   The action posts POST /payouts/account/link and redirects to the provider;
   it returns only on a refusal, whose message is shown. The CTA is mandatory:
   when the provider isn't connected it stays visible, disabled, with the
   line saying why.
   -------------------------------------------------------------------------- */

type LinkAction = () => Promise<PayoutWriteFailure>;

export function StripeLinkButton({ cta, action, testBadge }: { cta: AccountPanelView["cta"]; action: LinkAction; testBadge: string | null }) {
  const [refusal, run, pending] = useActionState<PayoutWriteFailure | null>(async () => action(), null);
  const look =
    cta.variant === "primary"
      ? "bg-primary text-cta-ink hover:bg-primary-soft"
      : "border border-primary/50 bg-transparent text-primary hover:bg-primary/10";
  return (
    <div className="space-y-2">
      <form action={run} className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={cta.disabled || pending}
          aria-label={cta.ariaLabel}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40 ${look}`}
        >
          {pending ? "Opening Stripe…" : cta.label}
        </button>
        {/* The staging badge is a sentence; let it wrap on a phone instead of widening the page. */}
        {testBadge && <span className="min-w-0 max-w-full [&>span]:inline-block [&>span]:max-w-full [&>span]:whitespace-normal [&>span]:text-left"><Badge>{testBadge}</Badge></span>}
      </form>
      {cta.disabledNote && <p className="text-[11px] text-muted">{cta.disabledNote}</p>}
      {refusal && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {refusal.message}
          {refusal.reasons.length > 0 && ` ${refusal.reasons.join(" · ")}`}
        </p>
      )}
    </div>
  );
}

export function PayoutAccountPanel({ view, action }: { view: AccountPanelView; action: LinkAction }) {
  const needed = view.actionNeeded;
  return (
    <section
      id="payout-account"
      aria-label="Payout account"
      className={`scroll-mt-20 rounded-xl border p-5 ${needed ? "border-primary/40 bg-primary/5" : "border-line bg-surface"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Payout account</h2>
            <Badge tone={view.chip.tone}>
              {view.chip.label}
              <span aria-hidden="true" className="ml-1">{view.chip.mark}</span>
            </Badge>
          </div>
          {view.status !== "READY" && <p className="mt-2 text-sm font-medium">{view.headline}</p>}
          <p className="mt-1 text-xs leading-relaxed text-muted">{view.body}</p>
        </div>
        {/* Never wider than the panel: on a phone the button and the staging badge wrap under the text (QA 2026-10-07). */}
        <div className="min-w-0 max-w-full">
          <StripeLinkButton cta={view.cta} action={action} testBadge={view.testBadge} />
        </div>
      </div>
    </section>
  );
}
