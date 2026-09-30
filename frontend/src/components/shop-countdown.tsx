"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { countdown } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-02 — the hold's countdown, from the reservation's `expiresAt`.

   A one-second clock read through useSyncExternalStore: the server snapshot
   is the server's own "now" (passed in), so the first client render matches
   the HTML; after hydration it ticks. When it reaches zero the page is
   refreshed once, and the server — which reads the reservation as EXPIRED
   once past expiresAt — renders the "hold ended" state. The clock never
   decides anything: placing an order after expiry is refused by the API.
   -------------------------------------------------------------------------- */

function subscribe(tick: () => void) {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
const clientSecond = () => Math.floor(Date.now() / 1000);

export function ShopCountdown({ expiresAt, serverNow }: { expiresAt: string; serverNow: number }) {
  const router = useRouter();
  const second = useSyncExternalStore(subscribe, clientSecond, () => Math.floor(serverNow / 1000));
  const left = countdown(expiresAt, second * 1000);

  useEffect(() => {
    if (left.expired) router.refresh();
  }, [left.expired, router]);

  return (
    <span role="timer" aria-live="off" className="font-semibold tabular-nums">
      {left.expired ? "0:00" : left.label}
    </span>
  );
}
