import { MessagesPage } from "@/components/deal-chat/messages-page";
import { requirePortalAccess } from "@/server/portal";

/* 2S4-FE-07 — Messages: the sponsor's deal chats with each seller on its
   orders. ?chat=<id> opens one. */

export const dynamic = "force-dynamic";

export default async function SponsorMessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePortalAccess("sponsor");
  const sp = await searchParams;
  return <MessagesPage portal="sponsor" actor={actor} chatId={typeof sp.chat === "string" && sp.chat ? sp.chat : null} sample={sp.demo === "sample"} />;
}
