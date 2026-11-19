"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";

import { useMounted } from "@/components/use-mounted";
import { loadDealUnreadAction } from "@/server/deal-chat-actions";
import { DEAL_LIST_POLL_MS, chatRow, messagesHref, unreadTotal, type ApiDealChat, type ChatRow, type DealViewer } from "@/lib/deal-chat";

import { ChatAvatar, Glyph, IconButton } from "./chat-bits";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import { onDealSocket } from "./deal-socket";
import { DEAL_CHANGED, DEAL_OPEN, useChatRows } from "./use-deal-chat";

import "./deal-chat.css";

/* --------------------------------------------------------------------------
   The round Messages button, on every page of a portal: bottom-right, with
   the number of unread messages. It opens your chats; picking one opens it
   in a small window that stays put while you move around the page, and
   folds down to a round picture when you minimise it.

   On a phone there is no room for a window, so the button goes straight to
   the Messages page (and an "open this chat" request goes to that chat).

   It is not drawn on the Messages page itself, and not at all for someone
   with no chats (the DEAL_CHAT switch off, or nothing ordered yet).

   Portaled to <body>: the stage's cards carry backdrop filters, which would
   pin a `position: fixed` box inside them (see OrderDialog).
   -------------------------------------------------------------------------- */

const PHONE = "(max-width: 767px)";
const NOTHING = () => {};

export function ChatDock({ viewer, unread: unreadAtLoad, sample }: {
  viewer: DealViewer;
  unread: number;
  /** `?demo=sample`: these chats, fixed (a page's own preview of the round button). */
  sample?: ApiDealChat[];
}) {
  const mounted = useMounted();
  const pathname = usePathname();
  const router = useRouter();
  const home = sample ? `${messagesHref(viewer.portal)}?demo=sample` : messagesHref(viewer.portal);
  const base = messagesHref(viewer.portal);
  const onMessages = pathname === base || pathname.startsWith(`${base}/`);

  const [panel, setPanel] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [folded, setFolded] = useState(false);
  const [unread, setUnread] = useState(sample ? unreadTotal(sample) : unreadAtLoad);
  const { rows, reload: reloadRows } = useChatRows(sample ? sample.map(chatRow) : null, panel && !sample);
  const reload = sample ? NOTHING : reloadRows;
  const [now, setNow] = useState(() => new Date());
  const wrap = useRef<HTMLDivElement>(null);

  /* The list is read the first time the panel opens, and refreshed each time after. */
  const openPanel = () => {
    setPanel(true);
    setNow(new Date());
    reload();
  };

  /* The number on the button: asked again every twenty seconds, and whenever a chat says it moved. */
  useEffect(() => {
    if (onMessages || sample) return;
    let live = true;
    let soon: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      if (document.visibilityState !== "visible") return;
      void loadDealUnreadAction()
        .then((r) => {
          if (live) setUnread(r.unread);
        })
        .catch(() => {});
    };
    const beat = setInterval(ask, DEAL_LIST_POLL_MS);
    const changed = () => {
      clearTimeout(soon);
      soon = setTimeout(ask, 800);
    };
    window.addEventListener(DEAL_CHANGED, changed);
    /* Live: the number moves the moment a message arrives, on whatever page the person is. */
    const off = onDealSocket(changed);
    return () => {
      live = false;
      clearInterval(beat);
      clearTimeout(soon);
      window.removeEventListener(DEAL_CHANGED, changed);
      off();
    };
  }, [onMessages, sample]);

  /* "Open chat" from a page (the order's Deal chat card). */
  useEffect(() => {
    const open = (e: Event) => {
      const id = (e as CustomEvent<{ chatId?: string }>).detail?.chatId;
      if (!id) return;
      if (window.matchMedia(PHONE).matches) {
        router.push(sample ? `${messagesHref(viewer.portal, id)}&demo=sample` : messagesHref(viewer.portal, id));
        return;
      }
      setChatId(id);
      setFolded(false);
      setPanel(false);
      /* So the chat has its name and picture when it is folded down. */
      reload();
    };
    window.addEventListener(DEAL_OPEN, open);
    return () => window.removeEventListener(DEAL_OPEN, open);
  }, [router, viewer.portal, reload, sample]);

  /* Escape and a click outside close the list (never the chat window: a half-typed message stays). */
  useEffect(() => {
    if (!panel) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanel(false);
    };
    const click = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setPanel(false);
    };
    document.addEventListener("keydown", key);
    document.addEventListener("mousedown", click);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("mousedown", click);
    };
  }, [panel]);

  if (!mounted || onMessages) return null;

  const head: ChatRow | undefined = chatId ? rows?.find((r) => r.id === chatId) : undefined;
  const badge = unread > 99 ? "99+" : String(unread);

  return createPortal(
    <div className="sx-dc sx-dc-dock" ref={wrap} data-portal={viewer.portal}>
      {chatId && !folded && (
        <div className="sx-dc-window" role="dialog" aria-label="Deal chat">
          <ChatPane
            key={chatId}
            id={chatId}
            initial={sample?.find((c) => c.id === chatId) ?? null}
            sample={!!sample}
            viewer={viewer}
            layout="window"
            fullHref={sample ? `${messagesHref(viewer.portal, chatId)}&demo=sample` : messagesHref(viewer.portal, chatId)}
            onMinimise={() => setFolded(true)}
            onClose={() => setChatId(null)}
          />
        </div>
      )}

      {panel && (
        <div className="sx-dc-popover" role="dialog" aria-label="Your chats">
          <header className="sx-dc-list-head">
            <div><h2>Chats</h2></div>
            <IconButton label="Open Messages" name="expand" href={home} size={16} />
            <IconButton label="Close" name="x" onClick={() => setPanel(false)} />
          </header>
          <ChatList
            rows={rows}
            activeId={chatId}
            now={now}
            viewer={viewer}
            onPick={(id) => {
              setChatId(id);
              setFolded(false);
              setPanel(false);
            }}
          />
        </div>
      )}

      <div className="sx-dc-rail">
        {chatId && folded && (
          <span className="sx-dc-head-chip">
            <button type="button" className="sx-dc-chathead" aria-label={`Open the chat${head ? ` with ${head.title}` : ""}`} onClick={() => setFolded(false)}>
              <ChatAvatar name={head?.title ?? "Chat"} size={48} dot={head?.yourTurn} />
              {head && head.unread > 0 && <i className="sx-dc-unread">{head.unread > 99 ? "99+" : head.unread}</i>}
            </button>
            <button type="button" className="sx-dc-chathead-x" aria-label="Close this chat" onClick={() => setChatId(null)}><Glyph name="x" size={11} /></button>
          </span>
        )}

        {/* A window on a wide screen; the Messages page on a phone. */}
        <button type="button" className="sx-dc-launch sx-dc-launch-wide" aria-label={unread ? `Messages, ${unread} unread` : "Messages"} aria-expanded={panel} onClick={() => (panel ? setPanel(false) : openPanel())}>
          <Glyph name={panel ? "x" : "chat"} size={24} />
          {unread > 0 && !panel && <i className="sx-dc-unread">{badge}</i>}
        </button>
        <a className="sx-dc-launch sx-dc-launch-phone" href={home} aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
          <Glyph name="chat" size={24} />
          {unread > 0 && <i className="sx-dc-unread">{badge}</i>}
        </a>
      </div>
    </div>,
    document.body,
  );
}

/** A button anywhere on a page that opens a chat in the round button's window (or the Messages page on a phone). */
export function OpenChatButton({ chatId, portal, className, kind, children }: { chatId: string; portal: DealViewer["portal"]; className?: string; kind?: "primary"; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      data-kind={kind}
      onClick={() => {
        /* With no round button on the page to hear it, go to the Messages page instead. */
        if (!document.querySelector(".sx-dc-dock") || window.matchMedia(PHONE).matches) router.push(chatId.startsWith("sample-") ? `${messagesHref(portal, chatId)}&demo=sample` : messagesHref(portal, chatId));
        else window.dispatchEvent(new CustomEvent(DEAL_OPEN, { detail: { chatId } }));
      }}
    >
      {children}
    </button>
  );
}
