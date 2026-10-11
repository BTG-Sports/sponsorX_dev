"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { countdown } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   The checkout hold countdown (P1-ART-23 Task 14, spec §7.9) — "Spots held
   for mm:ss", ticking once a second from the reservation's `expiresAt`. At
   zero it reads "Hold expired. Go back to your cart" straight away, and also
   asks the page to refresh once so the server's own EXPIRED read (and "hold
   again") take over — the clock itself never decides anything, same
   contract as shop-countdown.tsx's ShopCountdown.
   -------------------------------------------------------------------------- */

function subscribe(tick: () => void) {
  const id = window.setInterval(tick, 1000);
  return () => window.clearInterval(id);
}
const clientSecond = () => Math.floor(Date.now() / 1000);

export function StadiumHoldCountdown({ expiresAt, serverNow }: { expiresAt: string; serverNow: number }) {
  const router = useRouter();
  const second = useSyncExternalStore(subscribe, clientSecond, () => Math.floor(serverNow / 1000));
  const left = countdown(expiresAt, second * 1000);

  useEffect(() => {
    if (left.expired) router.refresh();
  }, [left.expired, router]);

  if (left.expired) {
    return (
      <span role="status">
        Hold expired.{" "}
        <Link href="/sponsor/cart" className="font-semibold underline">
          Go back to your cart →
        </Link>
      </span>
    );
  }

  return (
    <span role="timer" aria-live="off">
      Spots held for <span className="font-semibold tabular-nums">{left.label}</span>
    </span>
  );
}
