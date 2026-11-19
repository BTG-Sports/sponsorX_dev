"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { onDealSocket } from "./deal-socket";

/* --------------------------------------------------------------------------
   An order page that keeps itself current: when the live socket says one of
   this order's deal chats changed (an answer, a signature, calling off), the
   page is read again, so the card, the order's stage and the Pay button move
   without a reload. Draws nothing.
   -------------------------------------------------------------------------- */

export function OrderLive({ orderId }: { orderId: string }) {
  const router = useRouter();
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const off = onDealSocket((e) => {
      if (e.orderId !== orderId && e.orderId !== "*") return;
      clearTimeout(soon);
      soon = setTimeout(() => router.refresh(), 500);
    });
    return () => {
      clearTimeout(soon);
      off();
    };
  }, [orderId, router]);
  return null;
}
