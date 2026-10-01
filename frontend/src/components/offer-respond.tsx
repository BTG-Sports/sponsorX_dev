"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  CHANGE_NOTE_MAX,
  changeNoteProblem,
  fmtWhen,
  type ApiOfferChangeRequest,
  type RespondResult,
} from "@/lib/offer-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   OfferRespond — 2S2-FE-03. Accept, decline or request a change to a
   formal offer.

   Accept is two deliberate steps: tick "I have read the agreement", then
   accept. The agreement body the page rendered comes in as a prop and goes
   back to the server action untouched, so the fingerprint is of the words
   on this screen; the terms hash goes back as it was served. Decline asks
   once more before it's recorded. A 409 that reloading cures (terms or
   text changed, already answered, expired) offers the reload; the guardian
   gate and restriction refusals show the API's own sentence.

   "Request a change" opens a small dialog for the note (required, ≤ 2000
   characters). Sending it leaves the offer open — Accept and Decline stay
   — and shows "Change requested — BTG will come back to you" with the note
   and time, from the API's answer and then from the reloaded offer.
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
  requestChange,
  changeRequest,
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
  requestChange: (offerId: string, note: string) => Promise<RespondResult>;
  /** The latest change request already on the offer, or null. */
  changeRequest: ApiOfferChangeRequest | null;
}) {
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<{ message: string; reload?: boolean } | null>(null);
  const [done, setDone] = useState<{ state: string; orderId: string | null } | null>(null);
  const [asking, setAsking] = useState(false);
  /* The request just sent, until the refreshed page carries it. */
  const [sent, setSent] = useState<ApiOfferChangeRequest | null>(null);
  const shown = [sent, changeRequest].filter((c): c is ApiOfferChangeRequest => c !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;

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
      {shown && (
        <div role="status" className="space-y-1 rounded-lg border border-primary/30 bg-primary/8 px-3 py-2.5 text-[11px] leading-relaxed">
          <p className="font-semibold text-text">Change requested — BTG will come back to you</p>
          <p className="whitespace-pre-wrap break-words text-muted">&ldquo;{shown.note}&rdquo;</p>
          <p className="text-faint">
            Sent {fmtWhen(shown.createdAt)}. The offer stays open: you can still accept or decline it as it stands.
          </p>
        </div>
      )}

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

      <button
        type="button"
        disabled={busy !== null}
        onClick={() => setAsking(true)}
        className="w-full rounded-lg border border-line px-4 py-2 text-xs text-text hover:bg-surface-2 disabled:opacity-50"
      >
        {shown ? "Request another change" : "Request a change"}
      </button>
      {asking && (
        <ChangeDialog
          onClose={() => setAsking(false)}
          send={async (note) => {
            const r = await requestChange(offerId, note);
            if (!r.ok) return r;
            setSent(r.changeRequest ?? { id: "just-sent", note: note.trim(), requestedBy: "", createdAt: new Date().toISOString() });
            setAsking(false);
            setError(null);
            router.refresh();
            return r;
          }}
        />
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
        can always be shown. Want different terms? Request a change — BTG&rsquo;s campaign manager is told.
      </p>
    </div>
  );
}

function ChangeDialog({ onClose, send }: { onClose: () => void; send: (note: string) => Promise<RespondResult> }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const problem = changeNoteProblem(note);
  const length = note.trim().length;

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const r = await send(note);
      if (!r.ok) setError(r.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="oc-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md space-y-4 rounded-2xl border border-primary/40 bg-bg p-5 shadow-2xl">
          <h2 id="oc-title" className="text-base font-semibold tracking-tight">Request a change</h2>
          <p className="text-xs text-muted">
            Tell BTG what you&rsquo;d like different — the pay, a due date, the usage rights. Their campaign manager is emailed. The offer
            stays open while they look at it.
          </p>
          <div>
            <label htmlFor="oc-note" className="block text-sm font-semibold">
              What would you like changed? <span className="font-medium text-warn">(required)</span>
            </label>
            <textarea
              id="oc-note"
              data-autofocus
              rows={4}
              required
              maxLength={CHANGE_NOTE_MAX + 200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-describedby="oc-count"
              placeholder="e.g. Could the second post be due a week later? I have a tournament that weekend."
              className="mt-1.5 w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
            />
            <p id="oc-count" className={`mt-1 text-right text-[11px] ${length > CHANGE_NOTE_MAX ? "text-danger" : "text-faint"}`}>
              {length.toLocaleString("en-US")} / {CHANGE_NOTE_MAX.toLocaleString("en-US")}
            </p>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || problem !== null}
              title={problem ?? undefined}
              onClick={submit}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Sending…" : "Send to BTG"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
