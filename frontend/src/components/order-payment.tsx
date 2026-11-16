"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { payOrderAction } from "@/app/(app)/sponsor/orders/[id]/payment-actions";
import { POLL_LIMIT, POLL_MS } from "@/lib/order-payment-live";
import { PAYMENTS_OPEN_SOON } from "@/lib/payment-switch-live";

/* --------------------------------------------------------------------------
   2S5-FE-05 — the order page's two client pieces.

   OrderPayButton   Pay / Try again on Stripe. Calls payOrderAction, which
                    redirects to the provider's page; a refusal (409) is shown
                    in the API's words. Disabled while payments are closed
                    (`canPay` false — BTG's switch off, or no provider,
                    POL-FE-36) — still rendered, saying "Payments open soon",
                    because the CTA is mandatory.
   PaymentRefresher While the provider confirms (E2), refreshes the server
                    page every few seconds until the order moves on, and
                    stops after a few minutes rather than polling forever.
   -------------------------------------------------------------------------- */

const PAY_CLASS =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-cta-ink transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-40";

export function OrderPayButton({
  orderId,
  label,
  ariaLabel,
  disabled,
  className = PAY_CLASS,
  sample = false,
}: {
  orderId: string;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
  /** POL-FE-94 — the Stadium order page draws its own lit button. */
  className?: string;
  /** `?demo=sample` — pressing it only says so; nothing is paid. */
  sample?: boolean;
}) {
  const [pending, begin] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  /* memory: double-submit-needs-a-ref — a busy flag alone lets a double click open two payments */
  const lock = useRef(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-label={disabled ? PAYMENTS_OPEN_SOON : ariaLabel}
        disabled={disabled || pending}
        onClick={() => {
          if (sample) {
            setMessage("This is a sample order — nothing is paid.");
            return;
          }
          if (lock.current) return;
          lock.current = true;
          setMessage(null);
          begin(async () => {
            try {
              const r = await payOrderAction(orderId);
              /* A success redirects to the provider and resolves with nothing. */
              if (r && !r.ok) setMessage(r.message);
            } finally {
              lock.current = false;
            }
          });
        }}
        className={className}
      >
        {pending ? "Opening Stripe…" : disabled ? PAYMENTS_OPEN_SOON : label}
        {!pending && !disabled && <span aria-hidden="true">↗</span>}
      </button>
      {message && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
          {message}
        </p>
      )}
    </div>
  );
}

export function PaymentRefresher() {
  const router = useRouter();
  const count = useRef(0);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      count.current += 1;
      if (count.current > POLL_LIMIT) {
        clearInterval(t);
        setStopped(true);
        return;
      }
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(t);
  }, [router]);
  if (!stopped) return null;
  return (
    <p className="text-[11px] text-muted">
      Still confirming. Refresh the page in a few minutes — you&rsquo;ll also get an email when it&rsquo;s done.
    </p>
  );
}
