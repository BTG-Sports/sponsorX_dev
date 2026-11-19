/**
 * SponsorX's live socket service — 2S4-BE-18 (owner, 2026-11-19: its own
 * Railway service, "a solid socket environment", used by Deal Chat now and the
 * INFINEX game later). Spec: documentation/SponsorX-Socket-Service.md.
 *
 * WHAT IT KNOWS: nothing. No database, no Clerk, no business rule, no message
 * text. It checks passes the API signed and passes the API's notices on to the
 * channels they name.
 *
 *   GET  /health            Railway's check.
 *   WS   /ws                Browsers, with a pass (socket.io, WebSocket only).
 *   POST /internal/publish  The API, over Railway's private network, with the
 *                           shared publish secret. Refused on any public host.
 *
 * A CONNECTION: the browser sends a pass in the handshake. The pass names one
 * person and one channel; the connection joins that channel and the person's
 * own `user:<id>` channel. More channels come one pass at a time (`join`),
 * always for the same person. After the session time the service says
 * `session:renew` and closes it, so the browser fetches a fresh pass and the
 * API checks access again. `access:ended` on a user channel closes every
 * connection of that person at once; `chat:closed` takes everyone off that
 * chat's channels.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { Server, type Socket } from "socket.io";

import { CHANNEL, checkPass, PassError, PassLedger, type Pass } from "./pass.ts";

export const SOCKET_PATH = "/ws";
/** Most channels one connection may hold (a person's open chats plus their inbox). */
export const MAX_CHANNELS = 24;
/** Most notices one publish call may carry. */
const MAX_NOTICES = 200;
const MAX_BODY_BYTES = 256 * 1024;
const EVENT = /^[a-z]{2,16}:[a-z-]{2,32}$/;

export type Notice = { channels: string[]; event: string; data?: Record<string, unknown> };

export type ServiceConfig = {
  passKey: KeyObject;
  publishSecret: string;
  allowedOrigins: string[];
  sessionMs: number;
  /** Hosts on which /internal/publish answers: Railway's private network and local runs. */
  internalHost?: (host: string) => boolean;
  now?: () => number;
};

const defaultInternalHost = (host: string) => {
  const name = host.split(":")[0]!.toLowerCase();
  return name.endsWith(".railway.internal") || name === "localhost" || name === "127.0.0.1" || name === "::1";
};

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

/** Only notices in the agreed shape go out: known-looking channels and events, a plain object of data. */
export function validNotice(n: unknown): n is Notice {
  if (!n || typeof n !== "object") return false;
  const x = n as Notice;
  return Array.isArray(x.channels) && x.channels.length > 0 && x.channels.length <= 32
    && x.channels.every((c) => typeof c === "string" && CHANNEL.test(c))
    && typeof x.event === "string" && EVENT.test(x.event)
    && (x.data === undefined || (typeof x.data === "object" && x.data !== null && !Array.isArray(x.data)));
}

export function createSocketService(cfg: ServiceConfig) {
  const now = cfg.now ?? (() => Date.now());
  const internalHost = cfg.internalHost ?? defaultInternalHost;
  const ledger = new PassLedger();
  const allowed = new Set(cfg.allowedOrigins);

  const http = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (req.method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, connections: io.engine.clientsCount });
    if (req.method === "POST" && url.pathname === "/internal/publish") {
      if (!internalHost(req.headers.host ?? "")) return send(res, 404, { error: "not found" });
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ") || !sameSecret(auth.slice(7), cfg.publishSecret)) return send(res, 401, { error: "unauthorized" });
      readBody(req)
        .then((raw) => {
          const parsed = JSON.parse(raw) as { notices?: unknown };
          const notices = Array.isArray(parsed.notices) ? parsed.notices : [];
          if (notices.length > MAX_NOTICES || !notices.every(validNotice)) return send(res, 400, { error: "bad notice" });
          for (const n of notices as Notice[]) deliver(n);
          send(res, 202, { delivered: notices.length });
        })
        .catch(() => send(res, 400, { error: "bad body" }));
      return;
    }
    /* socket.io answers its own path; everything else is not here. */
    if (!url.pathname.startsWith(SOCKET_PATH)) send(res, 404, { error: "not found" });
  });

  const io = new Server(http, {
    path: SOCKET_PATH,
    serveClient: false,
    transports: ["websocket"],
    maxHttpBufferSize: 4096,
    pingInterval: 25_000,
    pingTimeout: 20_000,
    /* The browser origin is checked on the WebSocket upgrade itself (socket.io's `cors` does not cover WebSocket). */
    allowRequest: (req, cb) => cb(null, allowed.has(String(req.headers.origin ?? ""))),
  });

  /** Check a pass for this person; claim it so it never works twice. */
  function admit(token: unknown, sub: string | null): Pass {
    const pass = checkPass(token, cfg.passKey, now());
    if (sub !== null && pass.sub !== sub) throw new PassError("pass is for someone else");
    if (!ledger.claim(pass, now())) throw new PassError("pass already used");
    return pass;
  }

  io.use((socket, next) => {
    try {
      const pass = admit((socket.handshake.auth as { pass?: unknown }).pass, null);
      socket.data.sub = pass.sub;
      void socket.join([pass.ch, `user:${pass.sub}`]);
      next();
    } catch (e) {
      next(new Error(e instanceof PassError ? "unauthorized" : "unavailable"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const renew = setTimeout(() => {
      socket.emit("session:renew", {});
      socket.disconnect(true);
    }, cfg.sessionMs);
    socket.on("disconnect", () => clearTimeout(renew));

    socket.on("join", (body: unknown, ack?: (r: unknown) => void) => {
      const reply = typeof ack === "function" ? ack : () => {};
      try {
        if ([...socket.rooms].filter((r) => r !== socket.id).length >= MAX_CHANNELS) throw new PassError("too many channels");
        const pass = admit((body as { pass?: unknown } | null)?.pass, socket.data.sub as string);
        void socket.join(pass.ch);
        reply({ ok: true, channel: pass.ch });
      } catch {
        reply({ ok: false, error: "unauthorized" });
      }
    });

    socket.on("leave", (body: unknown) => {
      const ch = (body as { channel?: unknown } | null)?.channel;
      if (typeof ch === "string" && !ch.startsWith("user:") && ch !== socket.id) void socket.leave(ch);
    });
    /* Anything else a browser sends is ignored: a browser never publishes. */
  });

  function deliver(n: Notice) {
    const data = n.data ?? {};
    io.to(n.channels).emit(n.event, data);
    if (n.event === "access:ended") {
      for (const ch of n.channels) if (ch.startsWith("user:")) io.in(ch).disconnectSockets(true);
    }
    if (n.event === "chat:closed") {
      for (const ch of n.channels) if (ch.startsWith("chat:")) io.in(ch).socketsLeave(ch);
    }
  }

  return {
    http,
    io,
    ledger,
    deliver,
    listen: (port: number) => new Promise<void>((resolve) => http.listen(port, resolve)),
    close: () => new Promise<void>((resolve) => {
      io.close(() => resolve());
    }),
  };
}
