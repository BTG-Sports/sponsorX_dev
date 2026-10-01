"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui";
import { handoffCarryOver, whenLabel, type ApiHandoffRequest } from "@/lib/guardian-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The current guardian's view of a handoff request — 2S1-FE-10 (design
   GuardianHandoff.dc.html, "card" and "confirm"). One island because Hand
   off opens the confirm dialog.

   LIVE (2S1-BE-15). "Hand off to …" and "Decline" call the page's action →
   POST /guardian-handoffs/:id/decision {decision: "HAND_OFF" | "DECLINE"}.
   With no `decide` (an athlete reading the request, or the ?demo= preview)
   both stay off with the reason in their tooltip — only the current
   guardian answers, and a preview never looks like it handed anyone's
   child over.
   -------------------------------------------------------------------------- */

const primaryBtn =
  "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";

type Decide = (decision: "HAND_OFF" | "DECLINE") => Promise<{ ok: true } | { ok: false; message: string }>;

function ConfirmDialog({ request, onClose, decide, offReason }: { request: ApiHandoffRequest; onClose: () => void; decide?: Decide; offReason: string }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { athlete, requester } = request;
  const handOff = () =>
    start(async () => {
      if (!decide) return;
      setError(null);
      const r = await decide("HAND_OFF").catch(() => ({ ok: false as const, message: "Couldn’t reach SponsorX just now. Nothing has changed." }));
      if (!r.ok) setError(r.message);
      else onClose();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="ho-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <section className="sx-pop relative flex w-full max-w-[480px] flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-5 shadow-2xl sm:p-6">
          <h2 id="ho-title" className="text-lg font-semibold tracking-tight">
            Hand {athlete.firstName}&rsquo;s account to {requester.name}?
          </h2>
          <p className="text-xs leading-relaxed text-muted">
            {requester.firstName}&rsquo;s documents are checked as you hand off; then {requester.firstName} becomes {athlete.firstName}&rsquo;s guardian and you no
            longer approve things for {athlete.firstName}. Until then, you still do.
          </p>
          <ul className="divide-y divide-line-soft rounded-lg border border-line bg-bg">
            {handoffCarryOver(request).map((line) => (
              <li key={line} className="px-3 py-2.5 text-sm">
                <span aria-hidden="true" className="text-success">✓ </span>
                {line}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" className={secondaryBtn} onClick={onClose} data-autofocus disabled={pending}>
              Cancel
            </button>
            <button type="button" className={primaryBtn} disabled={!decide || pending} title={decide ? undefined : offReason} onClick={handOff} aria-busy={pending}>
              {pending ? "Handing off…" : `Hand off to ${requester.firstName}`}
            </button>
          </div>
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        </section>
      </div>
    </div>
  );
}

export function HandoffRequestCard({ request, decide, offReason = "Only the athlete’s current guardian can answer." }: {
  request: ApiHandoffRequest;
  /** The page's server action, bound to this request — absent for anyone but the current guardian. */
  decide?: Decide;
  offReason?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { athlete, requester } = request;
  const decline = () =>
    start(async () => {
      if (!decide) return;
      setError(null);
      const r = await decide("DECLINE").catch(() => ({ ok: false as const, message: "Couldn’t reach SponsorX just now. Nothing has changed." }));
      if (!r.ok) setError(r.message);
    });

  return (
    <section aria-label={`Request from ${requester.name}`} className="flex flex-col gap-3 rounded-xl border border-warn/45 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 className="text-base font-semibold">
          {requester.name} asked to become {athlete.firstName}&rsquo;s guardian
        </h2>
        <Badge tone="warn">
          <span aria-hidden="true" className="mr-1">!</span>Waiting for you
        </Badge>
      </div>
      <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
        <dt className="text-muted">Relationship</dt>
        <dd>{requester.relationship}</dd>
        <dt className="text-muted">Asked</dt>
        <dd>{whenLabel(request.requestedAt)}</dd>
        <dt className="text-muted">{requester.firstName}&rsquo;s documents</dt>
        <dd>{request.documentsUploaded ? "ID and proof of guardianship uploaded · checked when you hand off" : "Not uploaded yet"}</dd>
      </dl>
      <p className="text-xs leading-relaxed text-muted">
        Only you can approve this. If you don&rsquo;t know {requester.firstName}, or this is about custody, decline and{" "}
        <Link href="/contact?topic=guardianship" className="text-primary-soft hover:underline">
          contact BTG
        </Link>
        .
      </p>
      <div className="flex flex-wrap gap-2.5">
        <button type="button" className={primaryBtn} onClick={() => setConfirming(true)} disabled={pending}>
          Hand off
        </button>
        <button type="button" className={secondaryBtn} disabled={!decide || pending} title={decide ? undefined : offReason} onClick={decline} aria-busy={pending}>
          {pending ? "Declining…" : "Decline"}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {confirming && <ConfirmDialog request={request} onClose={() => setConfirming(false)} decide={decide} offReason={offReason} />}
    </section>
  );
}
