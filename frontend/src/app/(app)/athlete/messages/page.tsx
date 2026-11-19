import { MessagesPage } from "@/components/deal-chat/messages-page";
import { requirePortalAccess } from "@/server/portal";

/* 2S4-FE-08 — Messages: the athlete's deal chats with sponsors, and a
   guardian's for the minor they act for. ?chat=<id> opens one (the link in
   Deal Chat's emails lands here, through /athlete/sales/deal-chats/<id>). */

export const dynamic = "force-dynamic";

export default async function AthleteMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("athlete");
  const sp = await searchParams;
  return <MessagesPage portal="athlete" actor={actor} chatId={typeof sp.chat === "string" && sp.chat ? sp.chat : null} sample={sp.demo === "sample"} />;
}
