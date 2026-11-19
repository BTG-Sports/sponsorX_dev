"use client";

import { useSyncExternalStore } from "react";
import { io, type Socket } from "socket.io-client";

import { dealSocketTicketAction } from "@/server/deal-chat-actions";

/* --------------------------------------------------------------------------
   Deal Chat's live connection (owner, 2026-11-19: "add socket on all of the
   messages functionality"). One socket for the whole tab, opened the first
   time something on the page wants to hear about chats and closed a few
   seconds after the last one stops.

   All it ever carries is "this chat changed" — a chat id and its order's id
   (backend/src/realtime/deal-chat-socket.ts). Whoever hears it reads the
   chat again the ordinary way, through the server actions, where every
   permission is applied as before. So the socket makes the chat instant
   without being a second way to read anything.

   It is a speed-up, never a requirement: if the API has it switched off
   (DEAL_CHAT_SOCKET), the web service has no address for it (API_PUBLIC_URL)
   or the connection drops, every chat surface keeps asking on its own beat,
   exactly as before there was a socket.
   -------------------------------------------------------------------------- */

export type DealChanged = { chatId: string; orderId: string };

/** Sent to every listener when the socket (re)connects: something may have been missed, read again. */
export const EVERYTHING: DealChanged = { chatId: "*", orderId: "*" };

export const touches = (e: DealChanged, chatId: string) => e.chatId === "*" || e.chatId === chatId;

const listeners = new Set<(e: DealChanged) => void>();
const watchers = new Set<() => void>();
let socket: Socket | null = null;
let live = false;
let starting = false;
/** Not available here (no address, switched off, or refused): stop trying until the page is loaded again. */
let off = false;
let idle: ReturnType<typeof setTimeout> | undefined;

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  watchers.forEach((w) => w());
}

function stop() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  setLive(false);
}

async function start() {
  if (socket || starting || off) return;
  starting = true;
  const first = await dealSocketTicketAction().catch(() => null);
  starting = false;
  if (!first) {
    off = true;
    return;
  }
  if (listeners.size === 0 || socket) return;
  let ticket: typeof first | null = first;
  const s = io(first.url, {
    path: first.path,
    transports: ["websocket"],
    reconnectionAttempts: 6,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 15000,
    /* A fresh, short-lived token for every (re)connection: the first one is the ticket just fetched. */
    auth: (cb) => {
      if (ticket) {
        const t = ticket;
        ticket = null;
        return cb({ token: t.token, ward: t.ward });
      }
      dealSocketTicketAction()
        .then((t) => cb(t ? { token: t.token, ward: t.ward } : {}))
        .catch(() => cb({}));
    },
  });
  socket = s;
  s.on("connect", () => {
    setLive(true);
    /* Anything that changed while it was away was missed. */
    listeners.forEach((fn) => fn(EVERYTHING));
  });
  s.on("disconnect", (reason) => {
    setLive(false);
    /* The API closes a connection every 30 minutes so a session is checked again; come straight back. */
    if (reason === "io server disconnect" && socket === s) s.connect();
  });
  s.on("deal-chat:changed", (e: DealChanged) => {
    if (e && typeof e.chatId === "string") listeners.forEach((fn) => fn(e));
  });
  s.on("connect_error", (err) => {
    /* Signed in, but no chat is this login's to hear about. */
    if (err.message === "forbidden" && socket === s) {
      off = true;
      stop();
    }
  });
  s.io.on("reconnect_failed", () => {
    if (socket !== s) return;
    off = true;
    stop();
  });
}

/** Hear about chats changing. Returns the way to stop hearing. */
export function onDealSocket(fn: (e: DealChanged) => void): () => void {
  listeners.add(fn);
  clearTimeout(idle);
  void start();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      clearTimeout(idle);
      /* A few seconds' grace: moving between pages swaps one listener for another. */
      idle = setTimeout(() => {
        if (listeners.size === 0) stop();
      }, 5000);
    }
  };
}

export const dealSocketLive = () => live;

const watch = (w: () => void) => {
  watchers.add(w);
  return () => {
    watchers.delete(w);
  };
};

/** Is the live connection up right now (the small "Live" mark, and how often the fallback asks). */
export function useDealSocketLive(): boolean {
  return useSyncExternalStore(watch, dealSocketLive, () => false);
}
