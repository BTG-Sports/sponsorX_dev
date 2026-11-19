"use client";

import { useState } from "react";

import { agoShort, filterRows, type ChatFilter, type ChatRow, type DealViewer } from "@/lib/deal-chat";

import { ChatAvatar, Glyph } from "./chat-bits";

/* --------------------------------------------------------------------------
   The list of chats: a search box, three chips, and a row per chat with who
   it is with, the last thing said, how long ago, and a count when something
   is unread. The Messages page's left column and the round button's panel
   are the same list.
   -------------------------------------------------------------------------- */

const FILTERS: { key: ChatFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "turn", label: "Your turn" },
];

const EMPTY: Record<DealViewer["portal"], string> = {
  sponsor: "Your deal chats with sellers appear here. In a chat you settle an order's details with the seller, then sign and pay.",
  athlete: "Your deal chats with sponsors appear here. In a chat you settle an order's details with the sponsor, then sign.",
  property: "Your team's deal chats with sponsors appear here. In a chat you settle an order's details with the sponsor, then sign.",
  admin: "A chat opens for each seller when a sponsor places an order. They are listed here to read.",
};

export function ChatListGhost({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="sx-dc-list-rows" role="status" aria-label="Loading your chats">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="sx-dc-li-ghost">
          <span className="sx-dc-ghost sx-dc-ghost-dot" />
          <span className="sx-dc-li-main">
            <span className="sx-dc-ghost" style={{ width: `${46 + ((i * 17) % 30)}%`, height: 13 }} />
            <span className="sx-dc-ghost" style={{ width: `${68 - ((i * 11) % 24)}%`, height: 11 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ChatList({ rows, activeId, onPick, now, viewer, loading }: {
  /** Null while the first read is on its way. */
  rows: ChatRow[] | null;
  activeId: string | null;
  onPick: (id: string) => void;
  now: Date;
  viewer: DealViewer;
  loading?: boolean;
}) {
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [query, setQuery] = useState("");
  const admin = viewer.portal === "admin";
  const shown = rows ? filterRows(rows, admin && filter === "turn" ? "all" : filter, query) : [];

  return (
    <div className="sx-dc-list-in">
      <label className="sx-dc-search">
        <Glyph name="search" size={16} />
        <span className="sr-only">Search your chats</span>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or order" autoComplete="off" />
      </label>
      {!admin && (
        <div className="sx-dc-filters" role="group" aria-label="Show">
          {FILTERS.map((f) => {
            const n = f.key === "unread" ? rows?.filter((r) => r.unread > 0).length : f.key === "turn" ? rows?.filter((r) => r.yourTurn).length : undefined;
            return (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label}{n ? <i>{n}</i> : null}
              </button>
            );
          })}
        </div>
      )}

      {rows === null || loading ? (
        <ChatListGhost />
      ) : rows.length === 0 ? (
        <div className="sx-dc-list-empty">
          <span className="sx-dc-blank-mark"><Glyph name="chat" size={22} /></span>
          <b>No chats yet</b>
          <p>{EMPTY[viewer.portal]}</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="sx-dc-list-empty">
          <b>Nothing matches</b>
          <p>{query ? "No chat has that name or order number." : filter === "unread" ? "You've read everything." : "Nothing is waiting for you right now."}</p>
          <button type="button" className="sx-dc-link" onClick={() => { setFilter("all"); setQuery(""); }}>Show every chat</button>
        </div>
      ) : (
        <ul className="sx-dc-list-rows">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" className="sx-dc-li" aria-current={r.id === activeId ? "true" : undefined} data-unread={r.unread > 0 ? "" : undefined} data-ended={r.ended ? "" : undefined} onClick={() => onPick(r.id)}>
                <ChatAvatar name={r.title} size={48} dot={r.yourTurn} />
                <span className="sx-dc-li-main">
                  <span className="sx-dc-li-top">
                    <b>{r.title}</b>
                    <time dateTime={r.lastActionAt} suppressHydrationWarning>{agoShort(r.lastActionAt, now)}</time>
                  </span>
                  <span className="sx-dc-li-prev">{r.preview}</span>
                  <span className="sx-dc-li-sub">
                    <span>{r.orderRef}</span>
                    <span className="sx-dc-li-stage" data-tone={r.stage.tone}>{r.yourTurn ? "Your turn" : r.stage.label}</span>
                  </span>
                </span>
                {r.unread > 0 && <i className="sx-dc-unread" aria-label={`${r.unread} unread`}>{r.unread > 99 ? "99+" : r.unread}</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
