import { MessagesPage } from "@/components/deal-chat/messages-page";
import { requirePortalAccess } from "@/server/portal";

/* 2S4-FE-08 — Messages: the team's deal chats with sponsors. ?chat=<id>
   opens one (the link in Deal Chat's emails lands here, through
   /property/sales/deal-chats/<id>). */

export const dynamic = "force-dynamic";

export default async function PropertyMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("property");
  const sp = await searchParams;
  return <MessagesPage portal="property" actor={actor} chatId={typeof sp.chat === "string" && sp.chat ? sp.chat : null} sample={sp.demo === "sample"} />;
}
