"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { moveOrderAction } from "@/app/(app)/admin/marketplace/actions";
import {
  MOVE_COPY, manualPaymentProblem, orderDecisions, orderMoves, PAYMENT_METHOD_COPY, type ManualPaymentMethod, type MarketplaceOrderState,
} from "@/lib/marketplace-ops-live";
import { ZOHO_PAID_NOTE, markPaidSummary } from "@/lib/order-automation-live";
import { DialogError, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S7-FE-02 — what BTG can do to one marketplace order. While it is held
   (PENDING_APPROVAL): approve, or reject with a note the sponsor reads.
   After that: only the staff transitions the order's state allows
   (marketplace-order-rules.ts). Final or money-moving steps ask twice.
   2S4-BE-10 — "Mark paid" is for a payment made another way: it asks how it
   was paid, the reference and the date received before it is sent.
   2S4-FE-05 (OrderExceptions.dc.html, view markPaid) — that is now the
   design's dialog, with the Zoho note (a Zoho Books invoice marks the order
   paid by itself), BTG admin and Finance only (the API decides). A held
   order's Approve / Reject moved to the Held order card beside the
   sponsor's spending limit (mops-held-order.tsx).
   -------------------------------------------------------------------------- */

export function MopsOrderActions({ id, state, orderRef, totalCents }: { id: string; state: MarketplaceOrderState; orderRef: string; totalCents: number }) {
  const router = useRouter();
  const decisions = orderDecisions(state);
  const moves = orderMoves(state);
  const [confirming, setConfirming] = useState<MarketplaceOrderState | null>(null);
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => ReturnType<typeof moveOrderAction>) => {
    setMessage(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  };
  const move = (to: MarketplaceOrderState) => {
    if (to === "PAID") return setPaying(true);
    if (MOVE_COPY[to].confirm && confirming !== to) return setConfirming(to);
    run(() => moveOrderAction(id, state, to));
  };

  if (decisions.length > 0 && moves.length === 0) {
    return <p className="text-xs text-muted">Approve or reject it in the Held order box, beside the sponsor&rsquo;s spending limit.</p>;
  }
  if (decisions.length === 0 && moves.length === 0) {
    return <p className="text-xs text-muted">This order is final — no further moves.</p>;
  }

  return (
    <div className="space-y-3">
      {moves.length > 0 && (
        <ul className="space-y-2">
          {moves.map((to) => (
            <li key={to} className="rounded-lg border border-line-soft p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted">{MOVE_COPY[to].hint}</p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => move(to)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                    to === "CANCELLED" || to === "REFUNDED"
                      ? "border border-danger/50 text-danger hover:bg-danger/10"
                      : "bg-primary text-cta-ink hover:bg-primary-soft"
                  }`}
                >
                  {to === "PAID" ? "Mark paid by hand" : confirming === to ? `Confirm: ${MOVE_COPY[to].label.toLowerCase()}` : MOVE_COPY[to].label}
                </button>
              </div>
              {confirming === to && (
                <p className="mt-2 text-[11px] text-warn">
                  This can&rsquo;t be undone. Press again to confirm, or{" "}
                  <button type="button" className="underline" onClick={() => setConfirming(null)}>
                    keep it as it is
                  </button>
                  .
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {message}
        </p>
      )}
      {paying && <MarkPaidDialog id={id} state={state} orderRef={orderRef} totalCents={totalCents} onClose={() => setPaying(false)} />}
    </div>
  );
}

/** "Mark {ref} paid by hand" — how it was paid, its reference, the date received (OrderExceptions.dc.html markPaid). */
function MarkPaidDialog({ id, state, orderRef, totalCents, onClose }: { id: string; state: MarketplaceOrderState; orderRef: string; totalCents: number; onClose: () => void }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [method, setMethod] = useState<ManualPaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
  const submit = () => {
    const problem = manualPaymentProblem({ method, reference, receivedOn }, today);
    if (problem) return setError(problem);
    start(async () => {
      setError(null);
      const r = await moveOrderAction(id, state, "PAID", { method, reference, receivedOn });
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id="mp" title={`Mark ${orderRef} paid by hand`} onClose={onClose} onSubmit={submit}>
      <p className="rounded-lg border border-primary/40 bg-primary/7 px-3 py-2.5 text-xs leading-relaxed">{ZOHO_PAID_NOTE}</p>
      <fieldset>
        <legend className="mb-2 text-xs font-medium">Method</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PAYMENT_METHOD_COPY) as ManualPaymentMethod[]).map((m) => (
            <label key={m} className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-xs ${method === m ? "border-primary-soft bg-primary/12" : "border-line bg-bg"}`}>
              <input type="radio" name="mp-method" value={m} checked={method === m} onChange={() => setMethod(m)} className="accent-primary" />
              {PAYMENT_METHOD_COPY[m]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          <span>Payment reference <span className="text-warn">(required)</span></span>
          <input data-autofocus value={reference} required maxLength={200} onChange={(e) => setReference(e.target.value)} placeholder="e.g. the transfer or cheque number" className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Date received
          <input type="date" value={receivedOn} max={today} required onChange={(e) => setReceivedOn(e.target.value)} className={field} />
        </label>
      </div>
      <p className="text-[11px] text-faint">Never a card or bank account number.</p>
      <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-relaxed">{markPaidSummary(totalCents)}</p>
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Saving…" : "Mark paid"}</button>
      </div>
    </OrderDialog>
  );
}
