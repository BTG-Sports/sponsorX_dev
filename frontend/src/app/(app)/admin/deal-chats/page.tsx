import { DealChatsDesk } from "@/components/deal-chat/deal-chats-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { chatRow } from "@/lib/deal-chat";
import { sampleChats, sampleReviews } from "@/lib/deal-chat-sample";
import { dealChatReviews, dealChatRows, readDealChat } from "@/server/deal-chat";

import "../applications/(queue)/applications.css";

/* --------------------------------------------------------------------------
   Deal chats — 2S4-FE-09 (feature spec documentation/SponsorX-Deal-Chat-Feature.md
   §6, §7). BTG reads any order's chat, and checks the messages held before
   delivery or reported by a side: release, or keep back with a reason the
   sender reads. BTG admins only (dealChat read, dealChatReview read/write);
   no other role reaches it.

   ?tab=review | chats   which tab (review when anything waits, else chats)
   ?chat=<id>            one chat, open, under All chats
   ?demo=sample          sample chats and messages; nothing is released or kept back
   /admin/deal-chats/review is the address in BTG's "needs a check" email.

   Reads  GET /deal-chat-reviews   held and reported messages, oldest first
          GET /deal-chats          every chat in BTG's books (+ each one's detail, for its names)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/deal-chats";
const TITLE = "Deal chats";

export default async function DealChatsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const sp = await searchParams;
  /* `?demo=sample` — the desk with sample chats and messages, to see it before a real chat exists. */
  if (sp.demo === "sample") {
    const now = new Date().getTime();
    const chats = sampleChats(now, null);
    return <DealChatsDesk reviews={sampleReviews(now)} rows={chats.map(chatRow)} initialChat={null} readAt="" sample={chats} />;
  }
  const chatId = typeof sp.chat === "string" && sp.chat ? sp.chat : null;
  const [reviews, rows, first] = await Promise.all([dealChatReviews(), dealChatRows(), chatId ? readDealChat(chatId) : null]);
  /* A role the nav lets in but the API refuses: say so, never an empty desk. */
  if (reviews === null) return <NotInRole path={PATH} title={TITLE} roles={["SUPER_ADMIN", "BTG_ADMIN"]} />;

  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return <DealChatsDesk reviews={reviews} rows={rows} initialChat={first?.status === "ok" ? first.chat : null} readAt={readAt} />;
}
