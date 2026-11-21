/* --------------------------------------------------------------------------
   Deal Chat's live connection — 2S4-FE-10, the web app's side of the socket
   service (2S4-BE-18, documentation/SponsorX-Socket-Service.md).

   The service is its own address (socketservice.sponsorx.net) and knows
   nothing: it checks a PASS the API signed and forwards the API's notices to
   the channel that pass names. A pass opens one channel, for one person, for
   60 seconds, once. So this side:

     - asks the API for a pass (POST /live-passes, through a server action)
       only for what is on the screen: one chat, or the Messages list (the
       person's inbox);
     - keeps ONE connection per tab, opened with the first pass; every further
       chat on screen is one more pass, sent as `join`; a chat that closes or
       leaves the screen is a `leave`;
     - holds nothing while the tab is hidden: the connection is closed, and on
       the way back every channel is asked for again with fresh passes (which
       is the API checking access again);
     - hears only "this chat changed" — a chat id and its order's id, never a
       word of a message. Whoever is told reads the chat again the ordinary
       way, where every permission is applied as before.

   It is a speed-up, never a requirement. Live updates off (503), a chat that
   has ended (409), a refusal, the service unreachable: every chat surface
   keeps asking on its own beat, exactly as with no connection at all.

   No React and no browser globals here: the connection, the pass and the
   tab's visibility are handed in (`LiveDeps`), so the whole thing is tested
   with fakes (tests/deal-live.test.ts). components/deal-chat/deal-socket.ts
   plugs in socket.io, the server action and `document`.
   -------------------------------------------------------------------------- */

/** What a screen is showing: one chat, or the Messages list. */
export type LiveWant = { kind: "chat"; chatId: string } | { kind: "inbox" };

/** What POST /live-passes answers with (backend/src/contracts/live.ts). */
export type LivePass = { url: string; path: string; channel: string; pass: string; expiresAt: string };

/**
 * A pass, or why there is none:
 *   off      — live updates aren't switched on here (503). Nothing more is asked until the page is loaded again.
 *   not-live — nothing to follow (409): the chat has ended, or no chat of this person's has begun.
 *   refused  — not theirs to follow, or not signed in.
 *   later    — the API couldn't be reached, or said "slow down": worth asking again.
 */
export type LivePassResult = { ok: true; pass: LivePass } | { ok: false; why: "off" | "not-live" | "refused" | "later" };

/** A chat changed. `"*"` stands for "any": sent when the connection (re)opens and something may have been missed. */
export type DealChanged = { chatId: string; orderId: string };

export const EVERYTHING: DealChanged = { chatId: "*", orderId: "*" };

export const touches = (e: DealChanged, chatId: string) => e.chatId === "*" || e.chatId === chatId;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

/** What a browser may ask a pass for: exactly the API's two shapes, with an id that looks like one. */
export function liveWant(input: unknown): LiveWant | null {
  if (!input || typeof input !== "object") return null;
  const x = input as { kind?: unknown; chatId?: unknown };
  if (x.kind === "inbox") return { kind: "inbox" };
  if (x.kind === "chat" && typeof x.chatId === "string" && ID.test(x.chatId)) return { kind: "chat", chatId: x.chatId };
  return null;
}

/** The API's answer, as the connection needs it. Status 0: the API couldn't be reached. */
export function livePassResult(status: number, body: unknown): LivePassResult {
  if (status >= 200 && status < 300) {
    const p = body as Partial<LivePass> | null;
    const good = !!p && [p.url, p.path, p.channel, p.pass].every((v) => typeof v === "string" && v.length > 0)
      && /^https?:\/\/[^\s/]+$/.test(p.url!.replace(/\/+$/, "")) && p.path!.startsWith("/");
    return good
      ? { ok: true, pass: { url: p!.url!.replace(/\/+$/, ""), path: p!.path!, channel: p!.channel!, pass: p!.pass!, expiresAt: typeof p!.expiresAt === "string" ? p!.expiresAt : "" } }
      : { ok: false, why: "later" };
  }
  if (status === 503) return { ok: false, why: "off" };
  if (status === 409) return { ok: false, why: "not-live" };
  if (status === 400 || status === 401 || status === 403 || status === 404) return { ok: false, why: "refused" };
  return { ok: false, why: "later" };
}

/** The events that mean "read again" (spec §5). Each carries `chatId` and `orderId`, and nothing a person wrote. */
export const LIVE_EVENTS = ["chat:opened", "chat:changed", "chat:form", "chat:signed", "chat:order", "chat:closed"] as const;

/** The service holds at most 24 channels a connection (its MAX_CHANNELS); anything past that keeps asking on its beat. */
export const LIVE_MAX_CHANNELS = 24;
/** A few seconds' grace before a channel is left: moving between pages swaps one screen's listener for the next. */
export const LIVE_LINGER_MS = 5000;
/** How long before an inbox with no chat in progress is asked for again (a chat may have begun since). */
export const LIVE_NOT_YET_MS = 60_000;
/** How long before a pass the API couldn't give just now, or a join the service didn't take, is asked for again. */
export const LIVE_LATER_MS = 15_000;
/** A connection that stayed up this long was a good one: the next drop starts the waits from the shortest again. */
const STEADY_MS = 30_000;

/** How long to wait before connecting again: a second after a first drop, then longer each time, a minute at most. */
export function liveRetryDelay(failures: number): number {
  return failures <= 0 ? 1000 : Math.min(60_000, 1500 * 2 ** (failures - 1));
}

/** As much of a socket.io client socket as the connection uses. */
export type LiveSocket = {
  on(event: string, fn: (...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  removeAllListeners(): unknown;
  disconnect(): unknown;
};

export type LiveDeps = {
  /** Open the connection with this pass (deal-socket.ts: socket.io, WebSocket only, no reconnecting of its own). */
  connect: (pass: LivePass) => LiveSocket;
  /** Ask the API for a pass. */
  pass: (want: LiveWant) => Promise<LivePassResult>;
  /** Is the tab in front. */
  visible: () => boolean;
  /** Tell me when that changes. Returns the way to stop. */
  onVisibility: (fn: () => void) => () => void;
  now?: () => number;
};

type Listener = { fn: (e: DealChanged) => void };
type Timer = ReturnType<typeof setTimeout>;
type Entry = {
  key: string;
  want: LiveWant;
  listeners: Set<Listener>;
  /** The channel this connection holds for it, once joined. */
  channel: string | null;
  /** A pass, the handshake or a join is on its way. */
  asking: boolean;
  /** Not to be asked for again before this time (Infinity: not while this screen stays). */
  refusedUntil: number;
  recheck?: Timer;
  drop?: Timer;
};

const LATER: LivePassResult = { ok: false, why: "later" };
const keyOf = (w: LiveWant) => (w.kind === "chat" ? `chat:${w.chatId}` : "inbox");

export function createDealLive(deps: LiveDeps) {
  const now = deps.now ?? (() => Date.now());
  const entries = new Map<string, Entry>();
  const watchers = new Set<() => void>();
  let socket: LiveSocket | null = null;
  /** Connected: the handshake's pass was taken. */
  let up = false;
  let upSince = 0;
  /** The first pass or the handshake is on its way. */
  let opening = false;
  /** Live updates are off here, or this login was switched off: nothing more until the page is loaded again. */
  let off = false;
  let failures = 0;
  let retry: Timer | undefined;
  /** Goes up every time the connection is closed, so an answer that arrives late knows it is stale. */
  let gen = 0;
  let watching = false;

  const changed = () => watchers.forEach((w) => w());

  function tell(e: DealChanged, only?: Entry) {
    const fns = new Set<Listener["fn"]>();
    for (const entry of only ? [only] : entries.values()) for (const l of entry.listeners) fns.add(l.fn);
    for (const fn of fns) {
      try {
        fn(e);
      } catch {
        /* One screen's trouble is not the next one's. */
      }
    }
  }

  function close() {
    gen += 1;
    clearTimeout(retry);
    retry = undefined;
    opening = false;
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    for (const e of entries.values()) {
      e.channel = null;
      e.asking = false;
    }
    if (up) {
      up = false;
      changed();
    }
  }

  function again() {
    if (retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      sync();
    }, liveRetryDelay(failures));
  }

  function refuse(e: Entry, forMs: number) {
    e.refusedUntil = forMs === Infinity ? Infinity : now() + forMs;
    clearTimeout(e.recheck);
    e.recheck = undefined;
    if (forMs !== Infinity) {
      e.recheck = setTimeout(() => {
        e.recheck = undefined;
        sync();
      }, forMs);
    }
  }

  /** What a refused pass means for this want. True: live updates are off altogether, and everything was closed. */
  function refused(e: Entry, why: "off" | "not-live" | "refused" | "later"): boolean {
    if (why === "off") {
      off = true;
      close();
      return true;
    }
    /* A chat that isn't live has ended, for good. An inbox that isn't live has no chat in progress yet. */
    if (why === "not-live") refuse(e, e.want.kind === "inbox" ? LIVE_NOT_YET_MS : Infinity);
    else if (why === "refused") refuse(e, Infinity);
    else refuse(e, LIVE_LATER_MS);
    return false;
  }

  const eligible = (e: Entry) => !e.channel && !e.asking && e.refusedUntil <= now();
  const held = () => [...entries.values()].filter((e) => e.channel || e.asking).length;

  /** The one place that decides what should be happening, called whenever anything changes. */
  function sync() {
    if (off) return;
    if (entries.size === 0 || !deps.visible()) {
      close();
      return;
    }
    if (!socket) {
      if (!opening && retry === undefined) void open();
      return;
    }
    if (!up) return;
    for (const e of entries.values()) {
      if (held() >= LIVE_MAX_CHANNELS) break;
      if (eligible(e)) void join(e);
    }
  }

  /** Open the connection with the first pass the API gives. */
  async function open() {
    opening = true;
    const mine = gen;
    const tried = new Set<string>();
    for (;;) {
      const e = [...entries.values()].find((x) => !tried.has(x.key) && eligible(x));
      if (!e) break;
      tried.add(e.key);
      const r = await deps.pass(e.want).catch(() => LATER);
      /* Closed while asking (the tab was hidden, the last screen left): the pass is simply not used. */
      if (mine !== gen) return;
      if (entries.get(e.key) !== e) continue;
      if (r.ok) {
        start(e, r.pass);
        return;
      }
      if (r.why === "later") {
        /* The API couldn't be reached: wait, then start over. */
        opening = false;
        failures += 1;
        again();
        return;
      }
      if (refused(e, r.why)) return;
    }
    /* Nothing could be opened: every screen keeps asking on its own beat. */
    opening = false;
  }

  function start(e: Entry, pass: LivePass) {
    let s: LiveSocket;
    try {
      s = deps.connect(pass);
    } catch {
      opening = false;
      failures += 1;
      again();
      return;
    }
    socket = s;
    e.asking = true;
    const on = (event: string, fn: (...args: unknown[]) => void) => s.on(event, fn);

    on("connect", () => {
      if (socket !== s) return;
      opening = false;
      up = true;
      upSince = now();
      e.asking = false;
      if (entries.get(e.key) === e) e.channel = pass.channel;
      else s.emit("leave", { channel: pass.channel });
      changed();
      /* Anything that changed while there was no connection was missed. */
      tell(EVERYTHING);
      sync();
    });
    on("connect_error", () => {
      if (socket !== s) return;
      close();
      failures += 1;
      again();
    });
    on("disconnect", () => {
      if (socket !== s) return;
      const steady = up && now() - upSince >= STEADY_MS;
      close();
      failures = steady ? 0 : failures + 1;
      again();
    });
    for (const event of LIVE_EVENTS) {
      on(event, (data) => {
        if (socket !== s) return;
        const d = data as { chatId?: unknown; orderId?: unknown } | null;
        if (!d || typeof d.chatId !== "string") return;
        if (event === "chat:closed") {
          /* The service has already taken this connection off the chat, and the API gives no pass for it now. */
          const c = entries.get(`chat:${d.chatId}`);
          if (c) {
            c.channel = null;
            refuse(c, Infinity);
            changed();
          }
        }
        tell({ chatId: d.chatId, orderId: typeof d.orderId === "string" ? d.orderId : "" });
      });
    }
    /* The session time is up (15 minutes): come straight back with fresh passes, so access is checked again. */
    on("session:renew", () => {
      if (socket !== s) return;
      close();
      failures = 0;
      sync();
    });
    /* This login was switched off. */
    on("access:ended", () => {
      if (socket !== s) return;
      off = true;
      close();
    });
  }

  /** One more channel on the open connection: a fresh pass for it, sent as `join`. */
  async function join(e: Entry) {
    e.asking = true;
    const mine = gen;
    const s = socket!;
    const r = await deps.pass(e.want).catch(() => LATER);
    if (mine !== gen || socket !== s) return;
    e.asking = false;
    if (entries.get(e.key) !== e) return;
    if (!r.ok) {
      refused(e, r.why);
      return;
    }
    e.asking = true;
    s.emit("join", { pass: r.pass.pass }, (ack: unknown) => {
      if (mine !== gen || socket !== s) return;
      e.asking = false;
      const a = ack as { ok?: unknown; channel?: unknown } | null;
      const taken = !!a && a.ok === true;
      const channel = taken && typeof a.channel === "string" ? a.channel : r.pass.channel;
      if (entries.get(e.key) !== e) {
        if (taken) s.emit("leave", { channel });
        return;
      }
      if (!taken) {
        refuse(e, LIVE_LATER_MS);
        return;
      }
      e.channel = channel;
      changed();
      /* Whatever happened between this screen's last read and the join was missed: its own listeners read again. */
      tell(e.want.kind === "chat" ? { chatId: e.want.chatId, orderId: "*" } : EVERYTHING, e);
    });
  }

  function drop(e: Entry) {
    e.drop = undefined;
    if (e.listeners.size > 0 || entries.get(e.key) !== e) return;
    entries.delete(e.key);
    clearTimeout(e.recheck);
    if (e.channel && socket && up) socket.emit("leave", { channel: e.channel });
    e.channel = null;
    sync();
  }

  function onVisibility() {
    if (!deps.visible()) {
      /* A hidden tab holds no connection. */
      close();
      return;
    }
    failures = 0;
    /* Back in front: what wasn't live a moment ago may be now. What was refused for good stays refused. */
    for (const e of entries.values()) {
      if (e.refusedUntil !== Infinity) {
        e.refusedUntil = 0;
        clearTimeout(e.recheck);
        e.recheck = undefined;
      }
    }
    sync();
  }

  /**
   * Follow what a screen is showing, while it is showing it. `fn` hears every
   * change this connection is told about (pick yours with `touches`, or by
   * `orderId`). Returns the way to stop — call it when the chat or the list
   * closes or leaves the screen.
   */
  function follow(want: LiveWant, fn: (e: DealChanged) => void): () => void {
    const key = keyOf(want);
    let e = entries.get(key);
    if (!e) {
      e = { key, want, listeners: new Set(), channel: null, asking: false, refusedUntil: 0 };
      entries.set(key, e);
    }
    clearTimeout(e.drop);
    e.drop = undefined;
    const listener: Listener = { fn };
    e.listeners.add(listener);
    if (!watching) {
      watching = true;
      deps.onVisibility(onVisibility);
    }
    sync();
    const entry = e;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && entries.get(key) === entry) {
        clearTimeout(entry.drop);
        entry.drop = setTimeout(() => drop(entry), LIVE_LINGER_MS);
      }
    };
  }

  /** Is the connection up — and, for a chat, is that chat's own channel held (so it is told when to read again). */
  function live(chatId?: string): boolean {
    if (!up) return false;
    return chatId === undefined ? true : Boolean(entries.get(`chat:${chatId}`)?.channel);
  }

  function watch(w: () => void): () => void {
    watchers.add(w);
    return () => {
      watchers.delete(w);
    };
  }

  return { follow, live, watch };
}

export type DealLive = ReturnType<typeof createDealLive>;
