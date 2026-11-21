"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { edgeHeadersFrom } from "@/server/edge";
import { dealChatRows, dealChatSummaries, dealLivePass } from "@/server/deal-chat";
import { dealRefusal, type ApiDealAgreement, type ApiDealChat, type ChatRow } from "@/lib/deal-chat";
import { liveWant, type LivePassResult, type LiveWant } from "@/lib/deal-live";

/* --------------------------------------------------------------------------
   Deal Chat's writes, and the reads the open chat repeats — 2S4-FE-07 / -08 / -09.

   Every action forwards the caller's own Clerk token (apiFetch) and adds no
   authority: the API decides who may write in a chat, who may accept for a
   minor, and whether an answer is already locked. A refusal comes back as a
   sentence (the API's own for a 409 or a 422), never as a throw — a thrown
   action lands on the portal's error page and loses what the person typed.

   Only async functions are exported: a "use server" file that exports
   anything else fails every action in it at run time.
   -------------------------------------------------------------------------- */

type ChatResult = { ok: true; chat: ApiDealChat } | { ok: false; message: string; gone?: boolean };
type Done = { ok: true } | { ok: false; message: string };

async function call(path: string, init: RequestInit = {}): Promise<{ status: number; body: unknown }> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return { status: 0, body: null };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, body };
}

const ok = (status: number) => status >= 200 && status < 300;
const json = (method: "POST" | "PUT", body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const chatPath = (id: string, rest = "") => `/deal-chats/${encodeURIComponent(id)}${rest}`;

async function chatWrite(path: string, init: RequestInit, fallback: string): Promise<ChatResult> {
  const r = await call(path, init);
  return ok(r.status) ? { ok: true, chat: r.body as ApiDealChat } : { ok: false, message: dealRefusal(r.status, r.body, fallback) };
}

/** The moves that change what an order page says (the amount, a signature, calling off) redraw it. */
function redrawOrder(chat: ApiDealChat) {
  revalidatePath(`/sponsor/orders/${chat.orderId}`);
  revalidatePath("/sponsor/orders");
}

/* ------------------------------------------------------------------ reads */

/** The open chat, read again every few seconds (spec §9: no sockets). */
export async function loadDealChatAction(id: string): Promise<ChatResult> {
  const r = await call(chatPath(id));
  if (ok(r.status)) return { ok: true, chat: r.body as ApiDealChat };
  return { ok: false, message: dealRefusal(r.status, r.body, "The chat couldn't be loaded"), gone: r.status === 403 || r.status === 404 };
}

/** The list's rows; `orderId` narrows them to one order's chats. */
export async function loadDealChatRowsAction(orderId?: string): Promise<ChatRow[]> {
  return dealChatRows(undefined, orderId);
}

/** Unread messages across the caller's chats, and how many chats there are — the round button's number. */
export async function loadDealUnreadAction(): Promise<{ unread: number; chats: number }> {
  const list = await dealChatSummaries();
  return { unread: list.reduce((n, c) => n + c.unread, 0), chats: list.length };
}

/**
 * A pass to the live socket service for what the browser has on screen: one
 * chat, or the Messages list (2S4-FE-10, components/deal-chat/deal-socket.ts).
 * The API decides whether there is one; anything but a chat's id or the list
 * is refused here before it is asked.
 */
export async function dealLivePassAction(want: LiveWant): Promise<LivePassResult> {
  const asked = liveWant(want);
  if (!asked) return { ok: false, why: "refused" };
  return dealLivePass(asked).catch((): LivePassResult => ({ ok: false, why: "later" }));
}

/** The caller's side has read the chat up to now. */
export async function markDealChatReadAction(id: string): Promise<void> {
  await call(chatPath(id, "/read"), json("POST"));
}

/* ------------------------------------------------------------------ the two sides' moves */

export async function sendDealMessageAction(id: string, text: string): Promise<ChatResult> {
  return chatWrite(chatPath(id, "/messages"), json("POST", { text }), "Your message wasn't sent");
}

export async function pickDealCardAction(id: string, cardKey: string, value: string | string[]): Promise<ChatResult> {
  return chatWrite(chatPath(id, `/picks/${encodeURIComponent(cardKey)}`), json("PUT", { value }), "Your answer wasn't saved");
}

export async function makeDealOfferAction(id: string, text: string, cardKey: string | null): Promise<ChatResult> {
  return chatWrite(chatPath(id, "/offers"), json("POST", { text, cardKey }), "Your offer wasn't sent");
}

export async function replyDealOfferAction(id: string, exchangeId: string, text: string): Promise<ChatResult> {
  return chatWrite(chatPath(id, `/exchanges/${encodeURIComponent(exchangeId)}/reply`), json("POST", { text }), "Your reply wasn't sent");
}

/** `messageId` is the offer's latest message as the person read it: the API refuses when a newer one arrived. */
export async function acceptDealOfferAction(id: string, exchangeId: string, messageId: string): Promise<ChatResult> {
  return chatWrite(chatPath(id, `/exchanges/${encodeURIComponent(exchangeId)}/accept`), json("POST", { messageId }), "It wasn't accepted");
}

export async function declineDealOfferAction(id: string, exchangeId: string): Promise<ChatResult> {
  return chatWrite(chatPath(id, `/exchanges/${encodeURIComponent(exchangeId)}/decline`), json("POST"), "It wasn't declined");
}

export async function confirmDealAmountAction(id: string, amountCents: number): Promise<ChatResult> {
  const r = await chatWrite(chatPath(id, "/amount"), json("PUT", { amountCents }), "The amount wasn't saved");
  if (r.ok) redrawOrder(r.chat);
  return r;
}

export async function callOffDealAction(id: string, reason: string): Promise<ChatResult> {
  const r = await chatWrite(chatPath(id, "/call-off"), json("POST", { reason }), "The deal wasn't called off");
  if (r.ok) redrawOrder(r.chat);
  return r;
}

export async function reportDealMessageAction(messageId: string, reason: string): Promise<Done> {
  const r = await call(`/deal-chat-messages/${encodeURIComponent(messageId)}/report`, json("POST", reason.trim() ? { reason: reason.trim() } : {}));
  return ok(r.status) ? { ok: true } : { ok: false, message: dealRefusal(r.status, r.body, "It wasn't reported") };
}

/* ------------------------------------------------------------------ the agreement */

export async function loadDealAgreementAction(id: string): Promise<{ ok: true; agreement: ApiDealAgreement } | { ok: false; message: string }> {
  const r = await call(`/deal-agreements/${encodeURIComponent(id)}`);
  return ok(r.status) ? { ok: true, agreement: r.body as ApiDealAgreement } : { ok: false, message: dealRefusal(r.status, r.body, "The agreement couldn't be loaded") };
}

/**
 * Sign the agreement as it was shown (`bodyHashShown`; the API refuses a
 * stale one). The signer's address and browser go with it as evidence (§12),
 * on the edge-keyed headers the other acceptances use.
 */
export async function signDealAgreementAction(agreementId: string, bodyHashShown: string, orderId: string): Promise<{ ok: true; agreement: ApiDealAgreement } | { ok: false; message: string }> {
  const evidence = edgeHeadersFrom(await headers(), { signer: true });
  const r = await call(`/deal-agreements/${encodeURIComponent(agreementId)}/sign`, { ...json("POST", { bodyHashShown }), headers: evidence });
  if (!ok(r.status)) return { ok: false, message: dealRefusal(r.status, r.body, "It wasn't signed") };
  revalidatePath(`/sponsor/orders/${orderId}`);
  revalidatePath("/sponsor/orders");
  return { ok: true, agreement: r.body as ApiDealAgreement };
}

/* ------------------------------------------------------------------ BTG's desk */

export async function releaseDealMessageAction(messageId: string): Promise<Done> {
  const r = await call(`/deal-chat-messages/${encodeURIComponent(messageId)}/release`, json("POST"));
  if (!ok(r.status)) return { ok: false, message: dealRefusal(r.status, r.body, "It wasn't released") };
  revalidatePath("/admin/deal-chats");
  return { ok: true };
}

export async function keepBackDealMessageAction(messageId: string, reason: string): Promise<Done> {
  const r = await call(`/deal-chat-messages/${encodeURIComponent(messageId)}/keep-back`, json("POST", { reason }));
  if (!ok(r.status)) return { ok: false, message: dealRefusal(r.status, r.body, "It wasn't kept back") };
  revalidatePath("/admin/deal-chats");
  return { ok: true };
}
