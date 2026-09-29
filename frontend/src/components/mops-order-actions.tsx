"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideOrderAction, moveOrderAction } from "@/app/(app)/admin/marketplace/actions";
import { MOVE_COPY, orderDecisions, orderMoves, type MarketplaceOrderState, type OrderDecision } from "@/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   2S7-FE-02 — what BTG can do to one marketplace order. While it is held
   (PENDING_APPROVAL): approve, or reject with a note the sponsor reads.
   After that: only the staff transitions the order's state allows
   (marketplace-order-rules.ts). Final or money-moving steps ask twice.
   -------------------------------------------------------------------------- */

export function MopsOrderActions({ id, state }: { id: string; state: MarketplaceOrderState }) {
  const router = useRouter();
  const decisions = orderDecisions(state);
  const moves = orderMoves(state);
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState<MarketplaceOrderState | null>(null);
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
      setNotes("");
      router.refresh();
    });
  };
  const decide = (d: OrderDecision) => run(() => decideOrderAction(id, state, d, notes));
  const move = (to: MarketplaceOrderState) => {
    if (MOVE_COPY[to].confirm && confirming !== to) return setConfirming(to);
    run(() => moveOrderAction(id, state, to));
  };

  if (decisions.length === 0 && moves.length === 0) {
    return <p className="text-xs text-muted">This order is final — no further moves.</p>;
  }

  return (
    <div className="space-y-3">
      {decisions.length > 0 && (
        <>
          <label className="block text-xs font-medium">
            Note to the sponsor <span className="text-faint">(required to reject)</span>
            <textarea
              rows={3}
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why — the sponsor reads this"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => decide("APPROVE")}
              className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
            >
              Approve order
            </button>
            <button
              type="button"
              disabled={pending || !notes.trim()}
              onClick={() => decide("REJECT")}
              className="rounded-lg border border-danger/50 px-3.5 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reject
            </button>
          </div>
          <p className="text-[11px] text-faint">Approving contracts the stock, freezes the split and books the ledger. Rejecting cancels the order and returns the stock.</p>
        </>
      )}

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
                  {confirming === to ? `Confirm: ${MOVE_COPY[to].label.toLowerCase()}` : MOVE_COPY[to].label}
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
    </div>
  );
}
