import { redirect } from "next/navigation";

/* 2S4-FE-08 — the address Deal Chat's emails give an athlete or a guardian
   (backend/src/domain/deal-chat.ts chatUrl). The chat itself lives on the
   Messages page, so this only sends them there with the chat open. */
export default async function DealChatLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/athlete/messages?chat=${encodeURIComponent(id)}`);
}
