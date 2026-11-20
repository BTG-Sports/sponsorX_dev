"use client";

import { useSyncExternalStore } from "react";
import { io } from "socket.io-client";

import { dealLivePassAction } from "@/server/deal-chat-actions";
import { createDealLive, type DealChanged, type DealLive, type LiveSocket } from "@/lib/deal-live";

/* --------------------------------------------------------------------------
   Deal Chat's live connection in the browser — 2S4-FE-10. The rules are in
   lib/deal-live.ts; this file only plugs in the real things: socket.io for
   the connection, the server action for a pass, and `document` for whether
   the tab is in front.

   One connection for the whole tab, to the socket service (its address comes
   with each pass), open only while a chat or the Messages list is on screen
   and the tab is in front. All it ever carries is "this chat changed".
   Whoever hears it reads the chat again the ordinary way, through the server
   actions — the connection is never a second way to read anything.
   -------------------------------------------------------------------------- */

export { touches, type DealChanged } from "@/lib/deal-live";

let hub: DealLive | null = null;

function dealLive(): DealLive {
  hub ??= createDealLive({
    /* No reconnecting of socket.io's own: a pass works once, so every connection is opened here with a fresh one. */
    connect: (pass) =>
      io(pass.url, { path: pass.path, transports: ["websocket"], auth: { pass: pass.pass }, reconnection: false, forceNew: true, timeout: 10_000 }) as unknown as LiveSocket,
    pass: (want) => dealLivePassAction(want),
    visible: () => document.visibilityState === "visible",
    onVisibility: (fn) => {
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
  });
  return hub;
}

/** Follow one chat while it is open on screen. Returns the way to stop (the chat closed, or left the screen). */
export function onDealChat(chatId: string, fn: (e: DealChanged) => void): () => void {
  return dealLive().follow({ kind: "chat", chatId }, fn);
}

/** Follow the person's own chats while their Messages list (or its button) is on screen. Returns the way to stop. */
export function onDealInbox(fn: (e: DealChanged) => void): () => void {
  return dealLive().follow({ kind: "inbox" }, fn);
}

/** Is the connection up; with a chat's id, is that chat itself being followed (how often its fallback asks). */
export const dealSocketLive = (chatId?: string) => hub?.live(chatId) ?? false;

const watch = (w: () => void) => dealLive().watch(w);
const connected = () => dealSocketLive();

/** Is the live connection up right now (the small "Live" mark). */
export function useDealSocketLive(): boolean {
  return useSyncExternalStore(watch, connected, () => false);
}
