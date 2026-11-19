import type { Actor } from "@/server/api";
import { dealChatRows, dealViewer, portalChats, readDealChat } from "@/server/deal-chat";
import { sampleChats } from "@/lib/deal-chat-sample";

import { ChatListGhost } from "./chat-list";
import { ChatPaneGhost } from "./chat-pane";
import { Messenger } from "./messenger";

import "./deal-chat.css";

/* --------------------------------------------------------------------------
   The Messages page of a portal — 2S4-FE-07 (sponsor) and 2S4-FE-08
   (athlete, guardian, team manager). One server component for the three:
   the caller's chats (the API scopes them), and the chat named in the
   address read here too, so a link from an email opens on the conversation
   and not on a loader.
   -------------------------------------------------------------------------- */

type Portal = "sponsor" | "athlete" | "property";

export async function MessagesPage({ portal, actor, chatId, sample = false }: {
  portal: Portal;
  actor: Actor;
  chatId: string | null;
  /** `?demo=sample`: four sample chats, one in each stage. Nothing is read or sent. */
  sample?: boolean;
}) {
  if (sample) {
    /* Read by the caller's own side when they have one; a BTG preview reads as the portal's side would. */
    const chats = sampleChats(new Date().getTime(), portal === "sponsor" ? "SPONSOR" : "SELLER");
    return <Messenger viewer={dealViewer(portal, actor)} initialRows={[]} initialChat={null} sample={chats} />;
  }
  const [rows, first] = await Promise.all([
    portalChats(portal, actor).then((list) => dealChatRows(list)),
    chatId ? readDealChat(chatId) : null,
  ]);
  return <Messenger viewer={dealViewer(portal, actor)} initialRows={rows} initialChat={first?.status === "ok" ? first.chat : null} />;
}

/** The page's shape while it loads: the list on the left, a chat on the right. */
export function MessagesGhost({ label = "Loading your messages" }: { label?: string }) {
  return (
    <div className="sx-dc sx-dc-page" data-view="list" data-full="" role="status" aria-label={label}>
      <aside className="sx-dc-list">
        <header className="sx-dc-list-head">
          <div>
            <span className="sx-dc-ghost" style={{ width: 130, height: 24 }} />
            <span className="sx-dc-ghost" style={{ width: 190, height: 12, marginTop: 8 }} />
          </div>
        </header>
        <div className="sx-dc-list-in">
          <span className="sx-dc-ghost" style={{ height: 38, margin: "4px 12px 12px", borderRadius: 999 }} />
          <ChatListGhost rows={6} />
        </div>
      </aside>
      <div className="sx-dc-main">
        <div className="sx-dc-pane"><ChatPaneGhost label={label} /></div>
      </div>
    </div>
  );
}
