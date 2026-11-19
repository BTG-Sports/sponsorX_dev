/**
 * Deal Chat's live updates — who hears about which chat (2S4-FE-07/-08/-09,
 * owner 2026-11-19: "add socket on all of the messages functionality").
 *
 * A socket never decides who may read a chat. It sits in ROOMS, and a room's
 * name is the caller's own `whereFor(dealChat, read)` — the very filter every
 * GET /deal-chats runs through (auth/scope.ts). A change to a chat is
 * announced to the rooms that chat belongs to, built from the same five
 * shapes that filter can take. So a login hears about a chat exactly when it
 * could read it, and the two can never drift: there is no second rule here.
 *
 * Pure: no database, no socket. The server is deal-chat-socket.ts.
 */
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";

/** The parts of a DealChat row its rooms are built from. */
export type ChatParty = {
  id: string;
  tenantId: string;
  orderId: string;
  sponsorId: string;
  athleteId: string | null;
  athleteTenantId: string | null;
  propertyId: string | null;
  propertyTenantId: string | null;
};

/** One spelling for a filter, whatever order its keys were written in. */
function roomOf(where: Record<string, unknown>): string {
  const keys = Object.keys(where).sort();
  return `deal-chat:${keys.map((k) => `${k}=${JSON.stringify(where[k])}`).join("&")}`;
}

/**
 * The rooms a caller sits in: one, named by the filter they read chats
 * through — or none for someone the matrix gives no chat to (their filter
 * matches nothing, and nothing is ever announced to it).
 */
export function roomsForActor(actor: Actor): string[] {
  try {
    assertAllowed(actor, "dealChat", "read");
  } catch {
    return [];
  }
  /* whereFor answers `{ AND: [scope] }` (P8-SEC-02: the scope is a conjunct no sibling key can replace); the room is that one scope. */
  const wrapped = whereFor(actor, "dealChat", "read") as { AND?: unknown };
  const scopes = Array.isArray(wrapped.AND) ? wrapped.AND : [];
  const where = scopes.length === 1 && scopes[0] && typeof scopes[0] === "object" ? (scopes[0] as Record<string, unknown>) : null;
  if (!where) return [];
  /* MATCHES_NOTHING (`id in []`) and anything else that is not one of the five shapes below joins nothing. */
  const keys = Object.keys(where).sort().join(",");
  if (!SHAPES.has(keys) || Object.values(where).some((v) => typeof v !== "string")) return [];
  return [roomOf(where)];
}

/** The key sets `whereFor(dealChat, …)` answers with: any, own-tenant, own-property, own, own-sponsor (scope.ts). */
const SHAPES: ReadonlySet<string> = new Set(["", "tenantId", "propertyId,propertyTenantId", "athleteId,athleteTenantId", "sponsorId,tenantId"]);

/** Every room a chat is announced to: one per filter shape that would match its row. */
export function roomsForChat(c: ChatParty): string[] {
  const rooms = [
    roomOf({}),
    roomOf({ tenantId: c.tenantId }),
    roomOf({ tenantId: c.tenantId, sponsorId: c.sponsorId }),
  ];
  if (c.propertyId && c.propertyTenantId) rooms.push(roomOf({ propertyTenantId: c.propertyTenantId, propertyId: c.propertyId }));
  if (c.athleteId && c.athleteTenantId) rooms.push(roomOf({ athleteTenantId: c.athleteTenantId, athleteId: c.athleteId }));
  return rooms;
}

/** What is announced: which chat moved, and its order. Never a message, a name or an answer — the listener reads the chat again, through the API. */
export type DealChatChanged = { chatId: string; orderId: string };

export const DEAL_CHAT_CHANGED = "deal-chat:changed";
/** The Postgres channel the API's instances tell each other on (LISTEN / NOTIFY; the payload is a chat id). */
export const DEAL_CHAT_CHANNEL = "sx_deal_chat";
/** Where the socket answers, beside the REST routes. */
export const DEAL_CHAT_SOCKET_PATH = "/api/v1/socket";
