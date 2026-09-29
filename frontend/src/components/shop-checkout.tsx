"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reserveAction } from "@/app/(app)/sponsor/cart/actions";
import { placeOrderAction, releaseHoldAction } from "@/app/(app)/sponsor/checkout/actions";
import { cancelOrderAction } from "@/app/(app)/sponsor/orders/[id]/actions";
import { ShopRefusal } from "@/components/shop-bits";
import type { ShopResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — the buying buttons: Reserve & check out (cart, and "hold
   again" after a hold ends), Place order / Release hold (checkout), and
   Cancel order (order detail). Each calls its server action; a success
   redirects (reserve, place, release) or refreshes (cancel), a refusal is
   listed with every reason the API gave.
   -------------------------------------------------------------------------- */

type Refusal = { message: string; reasons: string[] } | null;

function useShopAction() {
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [pending, begin] = useTransition();
  const run = (fn: () => Promise<ShopResult>, onOk?: () => void) => {
    setRefusal(null);
    begin(async () => {
      const r = await fn();
      /* A redirecting action (reserve, place, release) navigates away and
         may resolve with nothing — there is then nothing to show here. */
      if (!r) return;
      if (r.ok) onOk?.();
      else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };
  return { refusal, pending, run };
}

const primary = "rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40";
const secondary = "rounded-lg border border-line px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";

export function ShopReserveButton({ label = "Reserve & check out", disabled }: { label?: string; disabled?: boolean }) {
  const { refusal, pending, run } = useShopAction();
  return (
    <div className="space-y-2">
      <button type="button" disabled={disabled || pending} onClick={() => run(() => reserveAction())} className={primary}>
        {pending ? "Holding the items…" : label}
      </button>
      {refusal && <ShopRefusal {...refusal} />}
    </div>
  );
}

export function ShopCheckoutActions({ reservationId }: { reservationId: string }) {
  const { refusal, pending, run } = useShopAction();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => placeOrderAction(reservationId))} className={primary}>
          {pending ? "Working…" : "Place order"}
        </button>
        <button type="button" disabled={pending} onClick={() => run(() => releaseHoldAction(reservationId))} className={secondary}>
          Release hold
        </button>
      </div>
      {refusal && <ShopRefusal {...refusal} />}
    </div>
  );
}

export function ShopCancelOrder({ orderId, state }: { orderId: string; state: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const { refusal, pending, run } = useShopAction();
  return (
    <div className="space-y-2">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted">Cancel this order? Its items go back on sale.</p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => cancelOrderAction(orderId, state),
                () => {
                  setConfirming(false);
                  router.refresh();
                },
              )
            }
            className="rounded-lg border border-danger/40 px-4 py-2 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-40"
          >
            {pending ? "Cancelling…" : "Yes, cancel the order"}
          </button>
          <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={secondary}>
            Keep it
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={secondary}>
          Cancel order
        </button>
      )}
      {refusal && <ShopRefusal {...refusal} />}
    </div>
  );
}
