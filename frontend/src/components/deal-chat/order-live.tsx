"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { onDealChat } from "./deal-socket";

/* --------------------------------------------------------------------------
   An order page that keeps itself current: while its Deal chat card is on
   screen it follows the chats on that card (one pass each, deal-socket.ts),
   and when the live connection says one of them changed (an answer, a
   signature, the order moving, calling off) the page is read again, so the
   card, the order's stage and the Pay button move without a reload. Draws
   nothing.
   -------------------------------------------------------------------------- */

export function OrderLive({ orderId, chatIds }: { orderId: string; chatIds: string[] }) {
  const router = useRouter();
  const ids = chatIds.join(",");
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const mine = ids ? ids.split(",") : [];
    const changed = (e: { chatId: string; orderId: string }) => {
      if (e.orderId !== orderId && e.orderId !== "*" && !mine.includes(e.chatId)) return;
      clearTimeout(soon);
      soon = setTimeout(() => router.refresh(), 500);
    };
    const offs = mine.map((id) => onDealChat(id, changed));
    return () => {
      clearTimeout(soon);
      offs.forEach((off) => off());
    };
  }, [orderId, ids, router]);
  return null;
}
