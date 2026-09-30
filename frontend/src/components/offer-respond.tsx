"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { RespondResult } from "@/lib/offer-live";

/* --------------------------------------------------------------------------
   OfferRespond — 2S2-FE-03. Accept or decline a formal offer.

   Accept is two deliberate steps: tick "I have read the agreement", then
   accept. The agreement body the page rendered comes in as a prop and goes
   back to the server action untouched, so the fingerprint is of the words
   on this screen; the terms hash goes back as it was served. Decline asks
   once more before it's recorded. A 409 that reloading cures (terms or
   text changed, already answered, expired) offers the reload; the guardian
   gate and restriction refusals show the API's own sentence.
   -------------------------------------------------------------------------- */

export function OfferRespond({
  offerId,
  termsHash,
  agreementId,
  body,
  version,
  blocker,
  accept,
  decline,
}: {
  offerId: string;
  termsHash: string | null;
  agreementId: string | null;
  body: string | null;
  version: number | null;
  /** Why Accept can't be offered, or null. Decline is still possible. */
  blocker: string | null;
  accept: (offerId: string, termsHash: string, agreementId: string, body: string) => Promise<RespondResult>;
  decline: (offerId: string) => Promise<RespondResult>;
}) {
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<{ message: string; reload?: boolean } | null>(null);
  const [done, setDone] = useState<{ state: string; orderId: string | null } | null>(null);

  const run = async (which: "accept" | "decline", fn: () => Promise<RespondResult>) => {
    setBusy(which);
    setError(null);
    try {
      const r = await fn();
      if (r.ok) {
        setDone({ state: r.state, orderId: r.orderId });
        router.refresh();
      } else setError({ message: r.message, reload: r.reload });
    } finally {
      setBusy(null);
    }
  };

  if (done) {
    return (
      <div role="status" className="space-y-2 rounded-lg bg-accent/10 px-3 py-2.5 text-[11px] leading-relaxed text-accent">
        {done.state === "ACCEPTED" ? (
          <>
            <p>Accepted. The deliverables are now scheduled on your Campaign Order.</p>
            {done.orderId && (
              <Link href={`/athlete/orders/${encodeURIComponent(done.orderId)}`} className="font-semibold underline underline-offset-2">
                Open the Campaign Order →
              </Link>
            )}
          </>
        ) : (
          <p>Declined. BTG has been told; no reason needed.</p>
        )}
      </div>
    );
  }

  const ready = !blocker && termsHash && agreementId && body !== null ? { termsHash, agreementId, body } : null;

  return (
    <div className="space-y-3">
      {ready ? (
        <>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={read}
              onChange={(e) => setRead(e.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-primary)]"
            />
            <span className="text-[11px] font-medium leading-relaxed text-text">
              I have read the agreement (version {version}) and the offer terms shown on this page.
            </span>
          </label>
          <button
            type="button"
            disabled={!read || busy !== null}
            onClick={() => run("accept", () => accept(offerId, ready.termsHash, ready.agreementId, ready.body))}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "accept" ? "Recording your acceptance…" : "Accept offer"}
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink opacity-40"
          >
            Accept offer
          </button>
          <p className="rounded-lg bg-warn/10 px-3 py-2.5 text-[11px] leading-relaxed text-warn">
            {blocker ?? "This offer can't be accepted yet."}
          </p>
        </>
      )}

      {confirmDecline ? (
        <div className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-[11px] leading-relaxed text-text">Decline this offer? It can&rsquo;t be reopened — BTG would have to send a new one.</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("decline", () => decline(offerId))}
              className="flex-1 rounded-lg border border-danger/40 px-3 py-2 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {busy === "decline" ? "Declining…" : "Yes, decline"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirmDecline(false)}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-[11px] text-muted hover:text-text"
            >
              Keep it open
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setConfirmDecline(true)}
          className="w-full rounded-lg border border-line px-4 py-2 text-xs text-text hover:bg-surface-2 disabled:opacity-50"
        >
          Decline
        </button>
      )}

      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {error.message}
          {error.reload && (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-1.5 block font-semibold underline underline-offset-2"
            >
              Reload the current offer
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-faint">
        Accepting records the agreement version, the time and a fingerprint of exactly the text shown — so what you agreed to
        can always be shown. Questions about these terms? Reply to BTG.
      </p>
    </div>
  );
}
