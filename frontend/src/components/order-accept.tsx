"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AcceptResult } from "@/lib/order-live";

/* --------------------------------------------------------------------------
   OrderAccept — the Campaign Order's acceptance control (P5-FE-01).

   Two deliberate steps: confirm you've read it, then accept. The agreement
   body the page rendered comes in as a prop and goes back to the server
   action untouched, so the fingerprint is of the words on this screen. On a
   409 (the text changed, or someone already answered) the page reloads the
   truth rather than retrying.
   -------------------------------------------------------------------------- */

export function OrderAccept({
  orderId,
  agreementId,
  body,
  version,
  blocker,
  accept,
}: {
  orderId: string;
  agreementId: string | null;
  body: string | null;
  version: number | null;
  /** Why acceptance isn't possible, or null. Shown instead of the button. */
  blocker: string | null;
  accept: (orderId: string, agreementId: string, body: string) => Promise<AcceptResult>;
}) {
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload?: boolean } | null>(null);

  if (blocker || !agreementId || body === null) {
    return (
      <p className="rounded-lg bg-warn/10 px-3 py-2.5 text-[11px] leading-relaxed text-warn">
        {blocker ?? "This order can't be accepted yet."}
      </p>
    );
  }

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await accept(orderId, agreementId, body);
      if (r.ok) router.refresh();
      else setError({ message: r.message, reload: r.reload });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={read}
          onChange={(e) => setRead(e.target.checked)}
          className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-primary)]"
        />
        <span className="text-[11px] font-medium leading-relaxed text-text">
          I&rsquo;ve read the order details and the Campaign Order agreement
          (version {version}) shown on this page.
        </span>
      </label>
      <button
        type="button"
        disabled={!read || busy}
        onClick={go}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Recording your acceptance…" : "Accept this order"}
      </button>
      {error && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] leading-relaxed text-danger">
          {error.message}
          {error.reload && (
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-1.5 block font-semibold underline underline-offset-2"
            >
              Reload the current version
            </button>
          )}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-faint">
        Accepting records this version, the time and a fingerprint of exactly
        the text above — so what you agreed to can always be shown.
      </p>
    </div>
  );
}
