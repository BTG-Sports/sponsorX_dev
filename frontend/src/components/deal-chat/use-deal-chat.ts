"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadDealChatAction, loadDealChatRowsAction, markDealChatReadAction } from "@/server/deal-chat-actions";
import { DEAL_LIST_POLL_MS, chatPollDelay, chatRow, type ApiDealChat, type ChatRow } from "@/lib/deal-chat";
import { SAMPLE_NOTE } from "@/lib/deal-chat-sample";

import { dealSocketLive, onDealSocket, touches } from "./deal-socket";

/* --------------------------------------------------------------------------
   One open chat: its latest read, read again the moment the live socket says
   it changed (deal-socket.ts) and, as the safety net, on a beat of its own
   while the tab is in front — every few seconds without the socket, every
   half minute with it. And the one door every write goes through.

   Mount it with `key={chatId}` — a different chat is a different hook, so
   nothing of the last one is ever shown under the new title.
   -------------------------------------------------------------------------- */

export type ChatWrite = { ok: true; chat: ApiDealChat } | { ok: false; message: string };

/** Tell the other chat surfaces on the page (the list, the round button, the order's card) that something moved. */
export const DEAL_CHANGED = "sx-deal-chat:changed";
/** Ask the round button to open a chat: `detail.chatId`. */
export const DEAL_OPEN = "sx-deal-chat:open";

export function announceChange(chat?: ApiDealChat) {
  window.dispatchEvent(new CustomEvent(DEAL_CHANGED, { detail: chat ? { chat } : undefined }));
}

/**
 * The list's rows, kept current: read again every twenty seconds while
 * `active` and the tab is in front, at once when an open chat reports a
 * change, and patched in place when that change carries the chat itself.
 * Null until the first read lands (`initial` null: the round button's panel).
 */
export function useChatRows(initial: ChatRow[] | null, active: boolean): { rows: ChatRow[] | null; reload: () => void } {
  const [rows, setRows] = useState<ChatRow[] | null>(initial);
  const live = useRef(true);
  const reading = useRef(false);

  const reload = useCallback(() => {
    if (reading.current) return;
    reading.current = true;
    void loadDealChatRowsAction()
      .then((next) => {
        if (live.current) setRows(next);
      })
      .catch(() => {
        /* Keep what is on screen; the next beat tries again. */
      })
      .finally(() => {
        reading.current = false;
      });
  }, []);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const beat = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, DEAL_LIST_POLL_MS);
    const changed = (e: Event) => {
      const chat = (e as CustomEvent<{ chat?: ApiDealChat } | undefined>).detail?.chat;
      if (chat) {
        const row = chatRow(chat);
        setRows((rs) => (rs ? (rs.some((r) => r.id === row.id) ? rs.map((r) => (r.id === row.id ? row : r)) : [row, ...rs]) : rs));
        return;
      }
      clearTimeout(soon);
      soon = setTimeout(reload, 600);
    };
    window.addEventListener(DEAL_CHANGED, changed);
    /* Live: any chat of the reader's changed (a new message elsewhere, a new chat), so the list reads again. */
    const off = onDealSocket(() => {
      clearTimeout(soon);
      soon = setTimeout(reload, 400);
    });
    return () => {
      clearInterval(beat);
      clearTimeout(soon);
      window.removeEventListener(DEAL_CHANGED, changed);
      off();
    };
  }, [active, reload]);

  return { rows, reload };
}

/** `sample`: the `?demo=sample` preview — nothing is read again and every write is refused with a note. */
export function useDealChat(id: string, initial: ApiDealChat | null, sample = false) {
  const [chat, setChat] = useState<ApiDealChat | null>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  /* A read that started before a write finished must not paint over it. */
  const seq = useRef(0);
  const writing = useRef(0);
  const loaded = useRef(initial !== null);

  useEffect(() => {
    if (sample) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (document.visibilityState !== "visible" || writing.current > 0) return;
      const mine = ++seq.current;
      const r = await loadDealChatAction(id).catch(() => null);
      if (!live || mine !== seq.current || writing.current > 0) return;
      if (r?.ok) {
        loaded.current = true;
        setChat(r.chat);
        setProblem(null);
      } else if (r && "gone" in r && r.gone) {
        setGone(true);
      } else if (!loaded.current) {
        setProblem(r ? r.message : "We couldn't reach SponsorX. Check your connection.");
      }
    };
    /* One beat at a time: a read asked for early (the tab came to the front, the socket spoke) replaces the waiting one. */
    let turn = 0;
    const loop = async () => {
      const mine = ++turn;
      clearTimeout(timer);
      await read();
      if (live && mine === turn) timer = setTimeout(loop, chatPollDelay(dealSocketLive()));
    };
    /* A chat handed in by the server is fresh: wait one beat before asking again. */
    if (loaded.current) timer = setTimeout(loop, chatPollDelay(dealSocketLive()));
    else void loop();
    const front = () => {
      if (document.visibilityState === "visible") void loop();
    };
    document.addEventListener("visibilitychange", front);
    /* Live: this chat changed (or the socket just came back and may have missed it). */
    const off = onDealSocket((e) => {
      if (touches(e, id)) void loop();
    });
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", front);
      off();
    };
  }, [id, sample]);

  /* Read up to here: once per newest message, only while the tab is in front. */
  const marked = useRef<string | null>(null);
  const unread = chat?.unread ?? 0;
  const newest = chat?.messages[chat.messages.length - 1]?.id ?? "";
  useEffect(() => {
    if (sample || !unread || !newest || marked.current === newest || document.visibilityState !== "visible") return;
    marked.current = newest;
    void markDealChatReadAction(id)
      .then(() => {
        setChat((c) => (c ? { ...c, unread: 0 } : c));
        announceChange();
      })
      .catch(() => {
        marked.current = null;
      });
  }, [id, unread, newest, sample]);

  /** Run a write; on success the chat it answers with replaces the one on screen. */
  const act = useCallback(async (write: () => Promise<ChatWrite>): Promise<ChatWrite> => {
    if (sample) return { ok: false, message: SAMPLE_NOTE };
    writing.current += 1;
    seq.current += 1;
    try {
      const r = await write().catch((): ChatWrite => ({ ok: false, message: "We couldn't reach SponsorX. Nothing changed. Try again." }));
      if (r.ok) {
        loaded.current = true;
        setChat(r.chat);
        announceChange(r.chat);
      }
      return r;
    } finally {
      writing.current -= 1;
      seq.current += 1;
    }
  }, [sample]);

  return { chat, problem, gone, act };
}
