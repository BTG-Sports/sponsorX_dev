/**
 * The relay — database notices to the socket service. 2S4-BE-18.
 *
 * Every live event is raised by a trigger inside the writing transaction, on
 * the Postgres channel `sx_live` (migration 20261119120000_live_events), so a
 * notice exists only for a change that committed. One dedicated connection in
 * each API process LISTENs, gathers notices for a moment, and posts them to
 * the socket service's private door (SOCKETSERVICE_INTERNAL_URL +
 * /internal/publish, with SOCKETSERVICE_PUBLISH_SECRET).
 *
 * Losing a notice is harmless by design: a notice only says "read again", and
 * every browser re-reads when it (re)connects and on its few-second fallback.
 * So the relay never retries a failed post, and never blocks a request.
 */
import pg from "pg";

import { env } from "../config/env";
import { logError } from "../lib/redact";

export const LIVE_CHANNEL = "sx_live";
const BATCH_MS = 40;
const MAX_BATCH = 200;
const POST_TIMEOUT_MS = 3000;
const RETRY_MS = 5000;

export type LiveNotice = { channels: string[]; event: string; data?: Record<string, unknown> };

/** One notice from the channel, if it is the agreed shape (the database writes them; still checked). */
export function parseNotice(payload: string | undefined): LiveNotice | null {
  if (!payload) return null;
  try {
    const n = JSON.parse(payload) as LiveNotice;
    if (!Array.isArray(n.channels) || n.channels.length === 0 || typeof n.event !== "string") return null;
    if (!n.channels.every((c) => typeof c === "string")) return null;
    return { channels: n.channels, event: n.event, ...(n.data && typeof n.data === "object" ? { data: n.data } : {}) };
  } catch {
    return null;
  }
}

export type Relay = { stop: () => Promise<void>; flush: () => Promise<void> };

export function relayConfigured(): boolean {
  return Boolean(env.SOCKETSERVICE_INTERNAL_URL && env.SOCKETSERVICE_PUBLISH_SECRET);
}

/**
 * Start relaying, when the socket service is configured. `post` swaps the
 * HTTP call for a test's own; `connectionString` points at a test database.
 */
export function startLiveRelay(opts: { post?: (notices: LiveNotice[]) => Promise<void>; connectionString?: string } = {}): Relay | null {
  if (!opts.post && !relayConfigured()) return null;
  const post = opts.post ?? postToService;
  let queue: LiveNotice[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let client: pg.Client | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    while (queue.length) {
      const batch = queue.slice(0, MAX_BATCH);
      queue = queue.slice(MAX_BATCH);
      await post(batch).catch((error) => logError("[live relay] notices were not delivered:", error));
    }
  };

  const listen = async () => {
    if (stopped) return;
    const c = new pg.Client({ connectionString: opts.connectionString ?? env.DATABASE_URL });
    client = c;
    const again = () => {
      if (stopped || client !== c) return;
      client = null;
      c.end().catch(() => {});
      retry = setTimeout(() => void listen(), RETRY_MS);
    };
    c.on("error", again);
    c.on("end", again);
    c.on("notification", (msg) => {
      if (msg.channel !== LIVE_CHANNEL) return;
      const n = parseNotice(msg.payload);
      if (!n) return;
      queue.push(n);
      if (!timer) timer = setTimeout(() => void flush(), BATCH_MS);
    });
    try {
      await c.connect();
      await c.query(`LISTEN ${LIVE_CHANNEL}`);
    } catch (error) {
      logError("[live relay] LISTEN failed; trying again shortly:", error);
      again();
    }
  };
  void listen();

  return {
    flush,
    stop: async () => {
      stopped = true;
      clearTimeout(retry);
      await flush();
      const c = client;
      client = null;
      await c?.end().catch(() => {});
    },
  };
}

async function postToService(notices: LiveNotice[]): Promise<void> {
  const url = `${env.SOCKETSERVICE_INTERNAL_URL!.replace(/\/+$/, "")}/internal/publish`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.SOCKETSERVICE_PUBLISH_SECRET}` },
    body: JSON.stringify({ notices }),
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`socket service answered ${res.status}`);
}
