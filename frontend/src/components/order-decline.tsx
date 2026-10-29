"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { DECLINE_CONFIRM, type DeclineResult } from "@/lib/athlete-orders-live";

/* --------------------------------------------------------------------------
   OrderDecline — POL-FE-24. Declining a Campaign Order asks once more
   before it is recorded, as offers do (offer-respond.tsx). On the list it
   sits in the row; on the order page, under Accept. A 409 that reloading
   cures (already answered, withdrawn) offers the reload; a paused deal
   shows the API's sentence and nothing to retry.
   -------------------------------------------------------------------------- */

export function OrderDecline({
  orderId,
  decline,
  compact = false,
  onDone,
}: {
  orderId: string;
  decline: (orderId: string) => Promise<DeclineResult>;
  /** The row's version: a small text button, the confirmation beneath it. */
  compact?: boolean;
  onDone?: (state: string) => void;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload?: boolean } | null>(null);
  const [done, setDone] = useState(false);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await decline(orderId);
      if (r.ok) {
        setDone(true);
        setAsking(false);
        onDone?.(r.state);
        router.refresh();
      } else setError({ message: r.message, reload: r.reload });
    } finally {
      setBusy(false);
    }
  };

  if (done) return <p role="status" className="text-[11px] font-medium text-muted">Declined.</p>;

  const open = compact
    ? "text-[11px] font-medium text-muted underline-offset-2 transition-colors hover:text-danger hover:underline disabled:opacity-50"
    : "w-full rounded-lg border border-line px-4 py-2 text-xs text-text hover:bg-surface-2 disabled:opacity-50";

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {asking ? (
        <div role="group" aria-label="Confirm decline" className="space-y-2 rounded-lg border border-line p-3">
          <p className="text-[11px] leading-relaxed text-text">{DECLINE_CONFIRM}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={go}
              className="flex-1 rounded-lg border border-danger/40 px-3 py-2 text-[11px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {busy ? "Declining…" : "Yes, decline"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(false)}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-[11px] text-muted hover:text-text"
            >
              Keep it open
            </button>
          </div>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => setAsking(true)} className={open}>
          Decline
        </button>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {error.message}
          {error.reload && (
            <button type="button" onClick={() => router.refresh()} className="mt-1.5 block font-semibold underline underline-offset-2">
              Reload
            </button>
          )}
        </div>
      )}
    </div>
  );
}
