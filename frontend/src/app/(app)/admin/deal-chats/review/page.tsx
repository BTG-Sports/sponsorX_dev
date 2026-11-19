import { redirect } from "next/navigation";

/* 2S4-FE-09 — the address BTG's "a message needs a check" email gives
   (backend/src/domain/deal-chat.ts tellBtg). The desk is a tab of Deal chats. */
export default function DealChatReviewLink() {
  redirect("/admin/deal-chats?tab=review");
}
