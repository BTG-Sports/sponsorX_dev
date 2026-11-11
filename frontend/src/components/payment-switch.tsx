"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { setPaymentSwitchAction } from "@/app/(app)/admin/payments/actions";
import { REASON_MAX, confirmWords, historyLine, reasonProblem, switchWords, type ApiPaymentSwitch } from "@/lib/payment-switch-live";

/* --------------------------------------------------------------------------
   POL-FE-36 — the payments switch, as BTG works it. One island for both
   desks: Mission Control's /admin/payments and the Vault's /finance/payments
   each wrap it in their own frame and hand it their own chip, so the two
   component families never mix (memory portal-stage-identities).

   Reads nothing itself: the page's GET /payments/switch is `state`. The one
   write is setPaymentSwitchAction (PUT /payments/switch), behind a confirm
   step that says what on / off means and asks why — the reason is checked
   here first (≥ 5 characters, the API's own rule) and sent with the change.
   "Turn on" stays visible but disabled while Railway names no provider.
   -------------------------------------------------------------------------- */

/** `chip` is the desk's own chip for `switchWords(state).chip`, rendered by the
 *  server page — a render function can't cross into a client island (QA walk
 *  2026-11-03: it crashed the page), a node can. router.refresh() after a
 *  change re-renders it with the new state. */
export function PaymentSwitch({ state, chip }: { state: ApiPaymentSwitch; chip: ReactNode }) {
  const router = useRouter();
  const w = switchWords(state);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const id = useId();
  const c = confirmWords(w.next.open);
  /* QA pass 3 (2026-11-03): the confirm step is role="dialog", so it takes
     focus when it opens (the reason field) and hands it back to the button
     that opened it when it closes; Escape cancels, as the house dialogs do. */
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const wasConfirming = useRef(false);
  /* QA pass 3 (2026-11-03): a double click fired the write twice — React batches the busy state, so each click's closure still saw it idle. A ref flips synchronously. */
  const inFlight = useRef(false);
  useEffect(() => {
    if (confirming) reasonRef.current?.focus();
    else if (wasConfirming.current) triggerRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  const problem = reasonProblem(reason);

  const cancel = () => {
    setConfirming(false);
    setReason("");
    setError(null);
  };

  const run = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await setPaymentSwitchAction({ open: w.next.open, reason: reason.trim() });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setDone(w.next.open ? "Payments are on. The page is refreshing with the change." : "Payments are off. The page is refreshing with the change.");
      cancel();
      router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="payment-switch">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">{w.headline}</h2>
            {chip}
          </div>
          <p className="text-xs leading-relaxed text-muted">{w.text}</p>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted">Switch</dt>
              <dd className="font-medium">{state.on ? "On" : "Off"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted">Provider</dt>
              <dd className="font-medium">{w.providerLine.replace(/^Provider: /, "")}</dd>
            </div>
          </dl>
          {w.changedLine ? (
            <p className="text-[11px] leading-relaxed text-muted">{w.changedLine}</p>
          ) : (
            <p className="text-[11px] text-muted">Not changed yet. This is the starting setting.</p>
          )}
        </div>
        {!confirming && (
          <div className="flex flex-col items-start gap-1.5">
            <button
              type="button"
              disabled={w.next.disabled || busy}
              aria-describedby={w.next.disabledNote ? `${id}-why` : undefined}
              ref={triggerRef}
              onClick={() => {
                setDone(null);
                setConfirming(true);
              }}
              className={`rounded-lg px-4 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                w.next.open ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-warn/60 text-warn hover:bg-warn/10"
              }`}
            >
              {w.next.label}
            </button>
            {w.next.disabledNote && (
              <p id={`${id}-why`} className="text-[11px] text-warn">
                {w.next.disabledNote}
              </p>
            )}
          </div>
        )}
      </div>

      {done && !confirming && (
        <p role="status" className="rounded-lg border border-accent/30 bg-accent/8 px-3 py-2 text-xs text-text">
          {done}
        </p>
      )}

      {confirming && (
        <section
          role="dialog"
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-text`}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) {
              e.stopPropagation();
              cancel();
            }
          }}
          className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4"
        >
          <h3 id={`${id}-title`} className="text-sm font-semibold">
            {c.title}
          </h3>
          <p id={`${id}-text`} className="text-xs leading-relaxed text-text/85">
            {c.text}
          </p>
          <label className="block text-xs font-medium" htmlFor={`${id}-reason`}>
            Why <span className="text-warn">(required — kept with the change)</span>
          </label>
          <textarea
            ref={reasonRef}
            id={`${id}-reason`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={REASON_MAX}
            placeholder={w.next.open ? "Why are you turning payments on?" : "Why are you turning payments off?"}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-xs outline-none focus:border-primary"
          />
          {reason.trim().length > 0 && problem && <p className="text-[11px] text-warn">{problem}</p>}
          {error && (
            <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || Boolean(problem)}
              onClick={run}
              className={`rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40 ${w.next.open ? "bg-primary text-cta-ink" : "border border-warn/60 text-warn"}`}
            >
              {busy ? "Changing…" : c.button}
            </button>
            <button type="button" disabled={busy} onClick={cancel} className="rounded-lg border border-line px-3.5 py-2 text-xs text-muted">
              Cancel
            </button>
          </div>
        </section>
      )}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Changes</h3>
        {state.history.length === 0 ? (
          <p className="mt-1.5 text-xs text-muted">No change recorded yet.</p>
        ) : (
          <ol className="mt-1.5 divide-y divide-line-soft text-xs">
            {state.history.map((h, i) => {
              const l = historyLine(h);
              return (
                <li key={`${h.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span className={`font-medium ${h.on ? "text-accent" : "text-warn"}`}>{l.what}</span>
                  <span className="text-muted">{l.who}</span>
                  <span className="tabular-nums text-muted">{l.when}</span>
                  <span className="basis-full text-text/85">{l.reason}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
