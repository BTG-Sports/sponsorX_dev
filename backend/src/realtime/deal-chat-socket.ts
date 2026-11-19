/**
 * Deal Chat's live updates — the socket (2S4-FE-07/-08/-09; owner,
 * 2026-11-19: "add socket on all of the messages functionality"). Behind the
 * DEAL_CHAT_SOCKET switch (documentation/SponsorX-Switches.md).
 *
 * WHAT TRAVELS ON IT: one event, `deal-chat:changed`, with a chat's id and
 * its order's id. Never a message, an answer, an amount or a name. Whoever
 * hears it reads the chat again through GET /deal-chats/:id, where the
 * matrix, the tenant scope, and "a held message is the sender's and BTG's
 * only" are applied as on every read. The socket adds speed, not access.
 *
 * WHO HEARS IT: deal-chat-rooms.ts — a socket's room is its caller's own
 * `whereFor(dealChat, read)`.
 *
 * HOW A CHANGE GETS HERE: whoever changed a chat (a route, after its write
 * committed) calls `announceDealChat`, which is a Postgres NOTIFY. Every API
 * instance LISTENs and tells its own sockets, so two instances behind one
 * address need no shared socket state and nothing new in Redis (which stays
 * cache and rate-limit only — stack-decision Addendum A3/B4).
 *
 * WHO MAY CONNECT: a signed-in person, checked like any request (the Clerk
 * session token, the same authorised origins, a guardian's ward). A machine
 * token is refused. A connection is closed after 30 minutes so a login that
 * was switched off or signed out stops hearing; the browser reconnects with a
 * fresh token by itself.
 *
 * Nothing is lost if it is off or down: the web app still asks every few
 * seconds, as it did before there was a socket.
 */
import type { Server as HttpServer } from "node:http";

import pg from "pg";
import { Server } from "socket.io";

import type { Actor } from "../auth/actor";
import { env } from "../config/env";
import { logError } from "../lib/redact";
import {
  DEAL_CHAT_CHANGED, DEAL_CHAT_CHANNEL, DEAL_CHAT_SOCKET_PATH, roomsForActor, roomsForChat,
  type ChatParty, type DealChatChanged,
} from "./deal-chat-rooms";

const SESSION_MS = 30 * 60_000;
const RETRY_MS = 5_000;
/** A chat id is a cuid: letters, digits, `_` and `-`. Anything else on the channel is ignored. */
const CHAT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export type SocketAuth = (token: string, ward: string | null, host: string) => Promise<Actor | null>;

/** The caller behind a handshake, resolved exactly as `requireActor` resolves a request's. */
const clerkActor: SocketAuth = async (token, ward, host) => {
  const [{ authenticateClerkRequest }, { resolveActor }, { actForWard }, { isMachineToken }] = await Promise.all([
    import("../auth/clerk"), import("../auth/actor"), import("../domain/guardian-acts"), import("../auth/machine"),
  ]);
  if (isMachineToken(token)) return null;
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, host };
  /* authenticateClerkRequest reads a request's protocol, host, path and headers; a handshake has the same four. */
  const request = { protocol: "http", originalUrl: DEAL_CHAT_SOCKET_PATH, headers, get: (name: string) => headers[name.toLowerCase()] };
  const identity = await authenticateClerkRequest(request as never);
  if (!identity) return null;
  return actForWard(await resolveActor(identity.clerkId, identity.email), ward, "GET");
};

/** The chat a notice names, as its rooms need it. */
async function loadParty(chatId: string): Promise<ChatParty | null> {
  const { prisma } = await import("../db/client");
  return prisma.dealChat.findFirst({
    /* tenant-scope: the system's own fan-out — a chat named by its change notice. Only its id and its order's id leave, to rooms built from scope.ts. */
    where: { id: chatId },
    select: { id: true, tenantId: true, orderId: true, sponsorId: true, athleteId: true, athleteTenantId: true, propertyId: true, propertyTenantId: true },
  });
}

export type DealChatSocket = {
  io: Server;
  /** Tell this instance's sockets a chat changed (the LISTEN handler calls this; tests call it directly). */
  emit: (chat: ChatParty) => void;
  close: () => Promise<void>;
};

/**
 * Attach the socket to the API's HTTP server. `listen: false` leaves out the
 * Postgres LISTEN (tests drive `emit` themselves); `authenticate` swaps the
 * Clerk check for a test's own.
 */
export function attachDealChatSocket(
  server: HttpServer,
  opts: { authenticate?: SocketAuth; listen?: boolean; origins?: string[] | undefined; sessionMs?: number } = {},
): DealChatSocket {
  const authenticate = opts.authenticate ?? clerkActor;
  const origins = "origins" in opts ? opts.origins : env.clerkAuthorizedParties;
  const io = new Server(server, {
    path: DEAL_CHAT_SOCKET_PATH,
    serveClient: false,
    /* WebSocket only: no long-polling fallback, so two instances need no sticky sessions. */
    transports: ["websocket"],
    /* Only our own web origins open it (the list a session token is checked against); with no list, the request's own origin, as Clerk's default allows. */
    cors: { origin: origins?.length ? origins : true, credentials: false },
  });

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown; ward?: unknown };
    const token = typeof auth.token === "string" ? auth.token : "";
    const ward = typeof auth.ward === "string" && CHAT_ID.test(auth.ward) ? auth.ward : null;
    if (!token) return next(new Error("unauthenticated"));
    authenticate(token, ward, socket.handshake.headers.host ?? "localhost")
      .then((actor) => {
        if (!actor) return next(new Error("unauthenticated"));
        const rooms = roomsForActor(actor);
        /* Signed in, but the matrix gives this login no chat: nothing to hear. */
        if (!rooms.length) return next(new Error("forbidden"));
        void socket.join(rooms);
        next();
      })
      .catch(() => next(new Error("unauthenticated")));
  });

  io.on("connection", (socket) => {
    /* A session is re-checked by making the browser come back with a fresh token. */
    const timer = setTimeout(() => socket.disconnect(true), opts.sessionMs ?? SESSION_MS);
    socket.on("disconnect", () => clearTimeout(timer));
  });

  const emit = (chat: ChatParty) => {
    const payload: DealChatChanged = { chatId: chat.id, orderId: chat.orderId };
    io.to(roomsForChat(chat)).emit(DEAL_CHAT_CHANGED, payload);
  };

  /* One dedicated connection that LISTENs; it comes back by itself if the database drops it. */
  let closed = false;
  let listener: pg.Client | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listen = async () => {
    if (closed) return;
    const client = new pg.Client({ connectionString: env.DATABASE_URL });
    listener = client;
    const again = () => {
      if (closed || listener !== client) return;
      listener = null;
      client.end().catch(() => {});
      retry = setTimeout(() => void listen(), RETRY_MS);
    };
    client.on("error", again);
    client.on("end", again);
    client.on("notification", (n) => {
      const id = n.payload ?? "";
      if (n.channel !== DEAL_CHAT_CHANNEL || !CHAT_ID.test(id)) return;
      loadParty(id)
        .then((chat) => {
          if (chat) emit(chat);
        })
        .catch((error) => logError("[deal-chat socket] a change could not be announced:", error));
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${DEAL_CHAT_CHANNEL}`);
    } catch (error) {
      logError("[deal-chat socket] LISTEN failed; trying again shortly:", error);
      again();
    }
  };
  if (opts.listen !== false) void listen();

  return {
    io,
    emit,
    close: async () => {
      closed = true;
      clearTimeout(retry);
      const l = listener;
      listener = null;
      await l?.end().catch(() => {});
      await io.close();
    },
  };
}

/**
 * Start the socket on the API's server when the switch is on. Called by both
 * entry points (index.ts, combined.mts), which say so in their start-up line
 * (the only files that may log plainly: tests/payments-pii.test.ts). Off:
 * nothing is attached, and the path answers 404 like any unknown route.
 */
export function startDealChatSocket(server: HttpServer): DealChatSocket | null {
  return env.DEAL_CHAT_SOCKET ? attachDealChatSocket(server) : null;
}

/* ── announcing a change (any instance, after the write committed) ──────── */

type Notice = { chatId: string } | { messageId: string } | { agreementId: string } | { orderId: string };

/**
 * A chat changed: tell every API instance, which tells its sockets. Named by
 * the chat, by one of its messages (BTG's release / keep back, a report), by
 * its agreement (a signature) or by its order (placed, called off: every chat
 * on it). Never throws and never delays the answer: a missed notice only
 * means the web app notices on its next ask.
 */
export function announceDealChat(notice: Notice): void {
  if (!env.DEAL_CHAT_SOCKET) return;
  void (async () => {
    const { prisma } = await import("../db/client");
    if ("chatId" in notice) {
      await prisma.$executeRaw`SELECT pg_notify(${DEAL_CHAT_CHANNEL}, ${notice.chatId})`;
    } else if ("messageId" in notice) {
      await prisma.$executeRaw`SELECT pg_notify(${DEAL_CHAT_CHANNEL}, "chatId") FROM "DealChatMessage" WHERE id = ${notice.messageId}`;
    } else if ("agreementId" in notice) {
      await prisma.$executeRaw`SELECT pg_notify(${DEAL_CHAT_CHANNEL}, id) FROM "DealChat" WHERE "dealAgreementId" = ${notice.agreementId}`;
    } else {
      await prisma.$executeRaw`SELECT pg_notify(${DEAL_CHAT_CHANNEL}, id) FROM "DealChat" WHERE "orderId" = ${notice.orderId}`;
    }
  })().catch((error) => logError("[deal-chat socket] a change could not be announced:", error));
}
