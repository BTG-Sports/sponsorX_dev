import { type ChatRow, type DealViewer } from "@/lib/deal-chat";

import { AgreementDownload } from "./agreement-download";
import { ChatAvatar, Glyph, StagePill } from "./chat-bits";
import { OpenChatButton } from "./chat-dock";
import { OrderLive } from "./order-live";

import "./deal-chat.css";

/* --------------------------------------------------------------------------
   2S4-FE-07 — the Deal chat card on an order page: one row per seller the
   order buys from, saying where that deal stands and what the reader does
   next, with the way into the chat and the agreement's PDF once there is
   one (downloadable at any time: owner, 2026-11-17).

   "Open chat" opens the chat in the round button's window, so the order
   stays on screen beside it; on a phone it goes to the Messages page.
   -------------------------------------------------------------------------- */

export function OrderDealChats({ rows, portal }: { rows: ChatRow[]; portal: DealViewer["portal"] }) {
  /* The chats this card follows live: the ones still going (an ended chat has nothing live), never a sample. */
  const followed = rows.filter((r) => !r.ended && !r.id.startsWith("sample-")).map((r) => r.id);
  return (
    <section className="sx-dc sx-dc-ordercard sx-stadium-in" aria-label="Deal chat">
      {followed.length > 0 && <OrderLive orderId={rows[0]!.orderId} chatIds={followed} />}
      <h2><Glyph name="chat" size={18} />{rows.length > 1 ? "Deal chats" : "Deal chat"}</h2>
      {rows.map((r) => (
        <div key={r.id} className="sx-dc-orderrow">
          <ChatAvatar name={r.title} size={44} dot={r.yourTurn} />
          <div className="sx-dc-orderrow-main">
            <div className="sx-dc-orderrow-top">
              <b>{r.title}</b>
              <StagePill stage={r.stage} />
              {r.unread > 0 && <i className="sx-dc-unread">{r.unread} new</i>}
            </div>
            <p>{r.next}</p>
          </div>
          <div className="sx-dc-orderrow-acts">
            <OpenChatButton chatId={r.id} portal={portal} className="sx-dc-btn" kind={r.yourTurn || r.unread > 0 ? "primary" : undefined}>
              <Glyph name="chat" size={15} />Open chat
            </OpenChatButton>
            {r.agreementId && (
              <AgreementDownload id={r.agreementId} className="sx-dc-btn">
                <Glyph name="download" size={15} />Agreement
              </AgreementDownload>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
