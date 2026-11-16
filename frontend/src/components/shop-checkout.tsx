"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelOrderAction } from "@/app/(app)/sponsor/orders/[id]/actions";
import { ShopRefusal } from "@/components/shop-bits";
import type { ShopResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — Cancel order (order detail): calls its server action,
   refreshes on success, and lists every reason the API gave on a refusal.

   POL-FE-93 (2026-11-16): checkout's contract gate (billing, terms, Place
   order, Release hold) and "hold again" moved into the checkout wizard,
   components/sponsor-checkout/checkout-wizard.tsx; the cart's Check out is
   in components/sponsor-cart/cart-board.tsx (POL-FE-92).
   -------------------------------------------------------------------------- */

type Refusal = { message: string; reasons: string[] } | null;

function useShopAction() {
  const [refusal, setRefusal] = useState<Refusal>(null);
  const [pending, begin] = useTransition();
  const run = (fn: () => Promise<ShopResult>, onOk?: () => void) => {
    setRefusal(null);
    begin(async () => {
      const r = await fn();
      if (!r) return;
      if (r.ok) onOk?.();
      else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };
  return { refusal, pending, run };
}

const secondary = "rounded-lg border border-line px-4 py-2 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";

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
