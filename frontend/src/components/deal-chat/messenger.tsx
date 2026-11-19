"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { chatRow, unreadTotal, type ApiDealChat, type ChatRow, type DealViewer } from "@/lib/deal-chat";

import { Glyph } from "./chat-bits";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import { useDealSocketLive } from "./deal-socket";
import { useChatRows } from "./use-deal-chat";

import "./deal-chat.css";

/* --------------------------------------------------------------------------
   The Messages page — three columns the way a messenger lays them out:
   your chats on the left, the open chat in the middle, the deal on the
   right. On a phone it is one column at a time: the list, then the chat
   (Back returns to the list), with the deal sliding over the chat.

   On its own page it takes the whole screen under the portal's header, edge
   to edge with no card around it (owner, 2026-11-19: "make it whole screen
   no borders") — `data-full`, deal-chat.css. Inside BTG's desk (`embedded`)
   it stays a panel under the desk's title and cards.

   Which chat is open lives in the address (?chat=…), written with
   history.pushState so switching chats never re-runs the server page, and
   the phone's own Back button closes a chat.
   -------------------------------------------------------------------------- */

const TITLE: Record<DealViewer["portal"], { title: string; lede: string }> = {
  sponsor: { title: "Messages", lede: "Your deal chats with sellers" },
  athlete: { title: "Messages", lede: "Your deal chats with sponsors" },
  property: { title: "Messages", lede: "Your team's deal chats with sponsors" },
  admin: { title: "Deal chats", lede: "Every chat, to read" },
};

export function Messenger({ viewer, initialRows, initialChat, embedded = false, sample }: {
  viewer: DealViewer;
  initialRows: ChatRow[];
  /** The chat named in the address, read on the server so it is there on arrival. */
  initialChat: ApiDealChat | null;
  /** Inside a desk that has its own page title (BTG's Deal chats): the list's heading steps down. */
  embedded?: boolean;
  /** `?demo=sample`: these chats, fixed. Nothing is read again and nothing is sent. */
  sample?: ApiDealChat[];
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const chatId = params.get("chat");
  const { rows } = useChatRows(sample ? sample.map(chatRow) : initialRows, !sample);
  const socketLive = useDealSocketLive();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const go = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("chat", id);
    else next.delete("chat");
    const qs = next.toString();
    window.history.pushState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const words = TITLE[viewer.portal];
  const unread = rows ? unreadTotal(rows) : 0;

  return (
    <div className="sx-dc sx-dc-page" data-view={chatId ? "chat" : "list"} data-portal={viewer.portal} data-full={embedded ? undefined : ""}>
      <aside className="sx-dc-list" aria-label="Your chats">
        <header className="sx-dc-list-head">
          <div>
            {embedded ? <h2>Chats</h2> : <h1>{words.title}</h1>}
            {socketLive && !sample && <span className="sx-dc-livemark" title="Live: new messages appear as they are sent">Live</span>}
            <p>{words.lede}{unread > 0 ? ` · ${unread} unread` : ""}</p>
          </div>
        </header>
        {sample && <p className="sx-dc-sample">Sample data. Nothing here is sent or signed.</p>}
        <ChatList rows={rows} activeId={chatId} onPick={go} now={now} viewer={viewer} />
      </aside>

      <div className="sx-dc-main">
        {chatId ? (
          <ChatPane
            key={chatId}
            id={chatId}
            initial={sample ? sample.find((c) => c.id === chatId) ?? null : initialChat?.id === chatId ? initialChat : null}
            sample={!!sample}
            viewer={viewer}
            layout="page"
            onBack={() => go(null)}
          />
        ) : (
          <div className="sx-dc-blank sx-dc-blank-pick">
            <span className="sx-dc-blank-mark"><Glyph name="chat" size={30} /></span>
            <h3>{rows && rows.length === 0 ? "No chats yet" : "Pick a chat"}</h3>
            <p>
              {rows && rows.length === 0
                ? viewer.portal === "sponsor"
                  ? "When one of your orders has a deal chat with its seller, it opens here."
                  : viewer.portal === "admin"
                    ? "Chats appear here as sponsors place orders."
                    : "When a sponsor's order has a deal chat with you, it opens here."
                : "Choose a chat on the left to read it, answer its questions and sign the agreement."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
