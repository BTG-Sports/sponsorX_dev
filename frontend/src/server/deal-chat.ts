import "server-only";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";

import { apiFetch, WARD_COOKIE, type Actor } from "@/server/api";
import {
  chatRow, dealSocketUrl, summaryRow,
  type ApiDealChat, type ApiDealChatSummary, type ApiDealReviewItem, type ChatRow, type DealViewer,
} from "@/lib/deal-chat";

/* --------------------------------------------------------------------------
   Deal Chat's reads — 2S4-FE-07 / -08 / -09.

   GET /deal-chats answers with the chats the caller may read (its own
   sponsor's, its own as a seller, or every chat in BTG's books); the API
   scopes them, nothing here does. With the DEAL_CHAT switch off no order
   opens a chat, so the list is empty — which is how the web app knows to
   show no Messages link and no round button, without a flag of its own.

   A row in the list needs the other side's name and the last thing said, and
   the list endpoint carries neither (a summary: the order, unread, dates).
   So the rows read each chat's detail, the newest ROW_LIMIT of them.
   -------------------------------------------------------------------------- */

/** How many chats the list reads in full; older ones show their order number only. */
const ROW_LIMIT = 30;

/**
 * The caller's chats as the API lists them. Quiet on purpose: this runs in
 * every portal layout for the Messages link and the round button, and a blip
 * there must not take the whole portal down.
 */
export async function dealChatSummaries(orderId?: string): Promise<ApiDealChatSummary[]> {
  try {
    const res = await apiFetch(orderId ? `/deal-chats?orderId=${encodeURIComponent(orderId)}` : "/deal-chats");
    if (!res.ok) return [];
    const list = (await res.json()) as unknown;
    return Array.isArray(list) ? (list as ApiDealChatSummary[]) : [];
  } catch {
    return [];
  }
}

const PORTAL_ROLES: Record<Exclude<DealViewer["portal"], "admin">, readonly string[]> = {
  sponsor: ["SPONSOR_ADMIN", "SPONSOR_ANALYST"],
  athlete: ["ATHLETE", "GUARDIAN"],
  property: ["PROPERTY_MGR"],
};

/**
 * The chats behind a portal's Messages link and round button: the caller's
 * own, and none for BTG staff previewing the portal (who would otherwise be
 * handed every chat in BTG's books under a sponsor's or an athlete's chrome).
 */
export async function portalChats(portal: Exclude<DealViewer["portal"], "admin">, actor: Pick<Actor, "roles">): Promise<ApiDealChatSummary[]> {
  if (!PORTAL_ROLES[portal].some((r) => actor.roles.includes(r))) return [];
  return dealChatSummaries();
}

/** One chat, or why not: missing (not yours, or gone), or the API said no. */
export async function readDealChat(id: string): Promise<{ status: "ok"; chat: ApiDealChat } | { status: "missing" } | { status: "error"; code: number }> {
  let res: Response;
  try {
    res = await apiFetch(`/deal-chats/${encodeURIComponent(id)}`);
  } catch {
    return { status: "error", code: 0 };
  }
  if (res.status === 403 || res.status === 404) return { status: "missing" };
  if (!res.ok) return { status: "error", code: res.status };
  return { status: "ok", chat: (await res.json()) as ApiDealChat };
}

/** The list's rows: each chat with who it is with and the last thing said, the newest activity first. */
export async function dealChatRows(summaries?: ApiDealChatSummary[], orderId?: string): Promise<ChatRow[]> {
  const all = (summaries ?? (await dealChatSummaries(orderId))).filter((s) => !orderId || s.orderId === orderId);
  const head = all.slice(0, ROW_LIMIT);
  const read = await Promise.all(head.map((s) => readDealChat(s.id)));
  const rows = head.map((s, i) => {
    const r = read[i]!;
    return r.status === "ok" ? chatRow(r.chat) : summaryRow(s);
  });
  return [...rows, ...all.slice(ROW_LIMIT).map(summaryRow)];
}

/** BTG's desk: every message held before delivery or reported. Null when the caller is not a BTG admin. */
export async function dealChatReviews(): Promise<ApiDealReviewItem[] | null> {
  const res = await apiFetch("/deal-chat-reviews");
  if (res.status === 403) return null;
  if (!res.ok) throw new Error(`Deal Chat's review desk is unavailable (${res.status}).`);
  return (await res.json()) as ApiDealReviewItem[];
}

/** How many messages wait for BTG — the number on the admin's Deal chats link. Quiet, like the summaries. */
export async function dealChatReviewCount(roles: readonly string[]): Promise<number> {
  if (!roles.includes("SUPER_ADMIN") && !roles.includes("BTG_ADMIN")) return 0;
  try {
    const res = await apiFetch("/deal-chat-reviews");
    if (!res.ok) return 0;
    const list = (await res.json()) as unknown;
    return Array.isArray(list) ? list.length : 0;
  } catch {
    return 0;
  }
}

/** What a browser needs to open Deal Chat's socket: where it is, and who is asking. */
export type DealSocketTicket = { url: string; path: string; token: string; ward: string | null };

/**
 * A ticket for the socket: the signed-in person's own short-lived session
 * token (the one every API call here already forwards), and the minor a
 * guardian is acting for. Null when there is no address for it or nobody is
 * signed in — the chat then simply keeps asking on its own beat.
 */
export async function dealSocketTicket(): Promise<DealSocketTicket | null> {
  const url = dealSocketUrl(process.env);
  if (!url) return null;
  const token = await (await auth()).getToken();
  if (!token) return null;
  const ward = (await cookies()).get(WARD_COOKIE)?.value;
  return { url, path: "/api/v1/socket", token, ward: ward && /^[A-Za-z0-9_-]{1,64}$/.test(ward) ? ward : null };
}

/** Who is looking, for the words on the screen (a guardian's confirmations, a team's). */
export function dealViewer(portal: DealViewer["portal"], actor: Pick<Actor, "roles" | "actingFor">): DealViewer {
  return { portal, guardian: portal === "athlete" && actor.roles.includes("GUARDIAN") && Boolean(actor.actingFor) };
}
