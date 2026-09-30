"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { PayoutWriteFailure, RequestButtonView } from "@/lib/payouts-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   "Request payout · $X" and its confirm — 2S5-FE-02 (design Earnings.dc.html).

   The button is live only when GET /payouts/me says canRequest; otherwise it
   stays visible, disabled, with the first unmet check written under it. The
   confirm names the amount, where it goes and the orders it includes, then
   runs the server action (POST /payouts — the whole requestable balance). A
   409 shows the API's message; either way the page refreshes to the truth.
   -------------------------------------------------------------------------- */

type Order = { orderId: string; orderRef: string; title: string; amount: string };

export function PayoutRequest({
  view,
  amount,
  orders,
  action,
  note,
}: {
  view: RequestButtonView;
  amount: string;
  orders: Order[];
  action: () => Promise<{ ok: true; count: number } | PayoutWriteFailure>;
  /** A line under the orders — e.g. what stays in reserve (design MyMoney). */
  note?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <button
        type="button"
        disabled={!view.enabled}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors outline-none hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40"
      >
        {view.label}
      </button>
      {view.reason && <p className="max-w-xs text-[11px] text-muted">{view.reason}</p>}
      {done && (
        <p role="status" className="max-w-xs text-[11px] text-accent">
          Requested — BTG reviews it next.
        </p>
      )}
      {open && (
        <ConfirmDialog
          amount={amount}
          orders={orders}
          action={action}
          note={note ?? null}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            setDone(true);
          }}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  amount,
  orders,
  action,
  note,
  onClose,
  onDone,
}: {
  amount: string;
  orders: Order[];
  note: string | null;
  action: () => Promise<{ ok: true; count: number } | PayoutWriteFailure>;
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayoutWriteFailure | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (r.ok) onDone();
      else setError(r);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="fixed inset-0 z-50 text-left" role="dialog" aria-modal="true" aria-labelledby="payout-confirm-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/55" />
      <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
        <div className="sx-pop relative w-full max-w-md rounded-2xl border border-line bg-bg p-5 shadow-2xl">
          <h2 id="payout-confirm-title" className="text-sm font-semibold tracking-tight">
            Request a payout of {amount}?
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            It goes to your payout account on Stripe. It usually arrives within a few days after BTG approves it.
          </p>
          {orders.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] font-medium text-muted">Orders included</p>
              <ul className="mt-1 divide-y divide-line-soft rounded-lg border border-line">
                {orders.map((o) => (
                  <li key={o.orderId} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block font-medium tabular-nums">{o.orderRef}</span>
                      {o.title !== o.orderRef && <span className="block truncate text-[11px] text-muted">{o.title}</span>}
                    </span>
                    <span className="tabular-nums">{o.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {note && <p className="mt-2 text-[11px] text-muted">{note}</p>}
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
              {error.message}
              {error.reasons.length > 0 && ` Still needed: ${error.reasons.join(" · ")}.`}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              data-autofocus
              disabled={busy}
              onClick={go}
              className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Requesting…" : `Request ${amount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
