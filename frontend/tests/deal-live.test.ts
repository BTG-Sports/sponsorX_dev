import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LivePass as LivePassContract, LivePassInput } from "../../backend/src/contracts/live";
import {
  EVERYTHING, LIVE_EVENTS, LIVE_LATER_MS, LIVE_LINGER_MS, LIVE_MAX_CHANNELS, LIVE_NOT_YET_MS,
  createDealLive, livePassResult, liveRetryDelay, liveWant, touches,
  type DealChanged, type LivePass, type LivePassResult, type LiveWant,
} from "../src/lib/deal-live";

/* 2S4-FE-10 — Deal Chat on the socket service: the web app's side of
   2S4-BE-18 (documentation/SponsorX-Socket-Service.md). The connection's rules
   live in lib/deal-live.ts with the socket, the pass and the tab's visibility
   handed in, so here they are fakes and the clock is the test's. */

const src = (f: string) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

type Handler = (...args: unknown[]) => void;

class FakeSocket {
  handlers = new Map<string, Handler[]>();
  sent: { event: string; args: unknown[] }[] = [];
  closed = false;
  constructor(readonly pass: LivePass) {}
  on(event: string, fn: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
  }
  emit(event: string, ...args: unknown[]) {
    this.sent.push({ event, args });
  }
  removeAllListeners() {
    this.handlers.clear();
  }
  disconnect() {
    this.closed = true;
  }
  /** The service says something. */
  fire(event: string, ...args: unknown[]) {
    for (const fn of [...(this.handlers.get(event) ?? [])]) fn(...args);
  }
  joins() {
    return this.sent.filter((s) => s.event === "join");
  }
  leaves() {
    return this.sent.filter((s) => s.event === "leave").map((s) => (s.args[0] as { channel: string }).channel);
  }
  /** The service answers the nth join. */
  ack(n: number, answer: unknown) {
    (this.joins()[n]!.args[1] as (r: unknown) => void)(answer);
  }
}

const channelOf = (want: LiveWant) => (want.kind === "chat" ? `chat:${want.chatId}:sponsor` : "inbox:sponsor:sp1");

function rig(answer?: (want: LiveWant) => LivePassResult | Promise<LivePassResult>) {
  let visible = true;
  let n = 0;
  const visibility = new Set<() => void>();
  const sockets: FakeSocket[] = [];
  const asked: LiveWant[] = [];
  const good = (want: LiveWant): LivePassResult => ({
    ok: true,
    pass: { url: "https://socketservice.test", path: "/ws", channel: channelOf(want), pass: `v1.pass${n}.sig`, expiresAt: "" },
  });
  const live = createDealLive({
    connect: (pass) => {
      const s = new FakeSocket(pass);
      sockets.push(s);
      return s;
    },
    pass: async (want) => {
      n += 1;
      asked.push(want);
      return answer ? answer(want) : good(want);
    },
    visible: () => visible,
    onVisibility: (fn) => {
      visibility.add(fn);
      return () => visibility.delete(fn);
    },
  });
  return {
    live, sockets, asked, good,
    last: () => sockets[sockets.length - 1]!,
    show(v: boolean) {
      visible = v;
      visibility.forEach((fn) => fn());
    },
  };
}

/** Let the pass that was asked for arrive. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const CHAT = (chatId: string): LiveWant => ({ kind: "chat", chatId });
const INBOX: LiveWant = { kind: "inbox" };

/** A chat followed and connected: the handshake's pass was taken. */
async function connected(r: ReturnType<typeof rig>, want: LiveWant, fn: (e: DealChanged) => void = () => {}) {
  const stop = r.live.follow(want, fn);
  await settle();
  r.last().fire("connect");
  return stop;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("what a browser may ask a pass for, and what the API's answer means", () => {
  it("exactly the API's two shapes: one chat by its id, or the Messages list", () => {
    expect(liveWant({ kind: "inbox" })).toEqual({ kind: "inbox" });
    expect(liveWant({ kind: "chat", chatId: "cmd_Chat-1" })).toEqual({ kind: "chat", chatId: "cmd_Chat-1" });
    /* Nothing else rides along, and nothing that isn't an id is ever sent on. */
    expect(liveWant({ kind: "inbox", tenantId: "t2" })).toEqual({ kind: "inbox" });
    for (const bad of [null, "inbox", {}, { kind: "chat" }, { kind: "chat", chatId: "" }, { kind: "chat", chatId: "a/b" }, { kind: "chat", chatId: "x".repeat(65) }, { kind: "game" }, { kind: "chat", chatId: 7 }]) {
      expect(liveWant(bad), JSON.stringify(bad)).toBeNull();
    }
    /* What is sent is what the API's contract takes. */
    expect(LivePassInput.safeParse(liveWant({ kind: "chat", chatId: "c1", extra: 1 })).success).toBe(true);
    expect(LivePassInput.safeParse(liveWant({ kind: "inbox", extra: 1 })).success).toBe(true);
  });
  it("a pass when there is one; off, not live, refused or later when there isn't — never a throw", () => {
    const pass = { url: "https://socketservice.sponsorx.net", path: "/ws", channel: "chat:c1:seller", pass: "v1.a.b", expiresAt: "2026-11-20T10:01:00.000Z" };
    expect(LivePassContract.safeParse(pass).success).toBe(true);
    expect(livePassResult(201, pass)).toEqual({ ok: true, pass });
    expect(livePassResult(201, { ...pass, url: "https://socketservice.sponsorx.net/" })).toEqual({ ok: true, pass });
    /* 503: live updates aren't switched on. 409: the chat ended, or none has begun. */
    expect(livePassResult(503, { error: "x" })).toEqual({ ok: false, why: "off" });
    expect(livePassResult(409, null)).toEqual({ ok: false, why: "not-live" });
    for (const s of [400, 401, 403, 404]) expect(livePassResult(s, null)).toEqual({ ok: false, why: "refused" });
    /* The API unreachable (0), asking too fast, or broken: worth asking again. */
    for (const s of [0, 429, 500, 502]) expect(livePassResult(s, null)).toEqual({ ok: false, why: "later" });
    /* An answer that isn't a pass is not connected to. */
    for (const bad of [null, {}, { ...pass, pass: "" }, { ...pass, url: "javascript:alert(1)" }, { ...pass, url: "socketservice.sponsorx.net" }, { ...pass, path: "ws" }]) {
      expect(livePassResult(201, bad)).toEqual({ ok: false, why: "later" });
    }
  });
  it("waits a second after a first drop, then longer each time, a minute at most", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 20].map(liveRetryDelay)).toEqual([1000, 1500, 3000, 6000, 12000, 24000, 48000, 60000, 60000]);
  });
  it("a listener picks its own chat; the catch-up after a (re)connection is everyone's", () => {
    expect(touches({ chatId: "c1", orderId: "o1" }, "c1")).toBe(true);
    expect(touches({ chatId: "c2", orderId: "o1" }, "c1")).toBe(false);
    expect(touches(EVERYTHING, "c1")).toBe(true);
  });
});

describe("connecting: only for what is on screen, with a pass for exactly that", () => {
  it("nothing is asked for and nothing connects until a chat or the list is followed", async () => {
    const r = rig();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.asked).toEqual([]);
    expect(r.sockets).toEqual([]);
    expect(r.live.live()).toBe(false);
  });
  it("an open chat asks for that chat's pass and connects to the address that came with it", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    r.live.follow(CHAT("c1"), (e) => heard.push(e));
    await settle();
    expect(r.asked).toEqual([{ kind: "chat", chatId: "c1" }]);
    expect(r.sockets).toHaveLength(1);
    expect(r.last().pass).toMatchObject({ url: "https://socketservice.test", path: "/ws", pass: "v1.pass1.sig" });
    /* Not live until the service has taken the pass. */
    expect(r.live.live()).toBe(false);
    expect(heard).toEqual([]);
    r.last().fire("connect");
    expect(r.live.live()).toBe(true);
    expect(r.live.live("c1")).toBe(true);
    /* Whatever changed before the connection was there was missed: read again. */
    expect(heard).toEqual([EVERYTHING]);
  });
  it("the Messages list asks for the inbox pass", async () => {
    const r = rig();
    await connected(r, INBOX);
    expect(r.asked).toEqual([{ kind: "inbox" }]);
    expect(r.live.live()).toBe(true);
    /* A chat nobody has open isn't followed for itself. */
    expect(r.live.live("c1")).toBe(false);
  });
  it("a tab that isn't in front asks for nothing; it connects when it comes to the front", async () => {
    const r = rig();
    r.show(false);
    r.live.follow(CHAT("c1"), () => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(r.asked).toEqual([]);
    expect(r.sockets).toEqual([]);
    r.show(true);
    await settle();
    expect(r.asked).toEqual([{ kind: "chat", chatId: "c1" }]);
    expect(r.sockets).toHaveLength(1);
  });
  it("tells the watchers when it comes up and goes down (the Live mark)", async () => {
    const r = rig();
    let n = 0;
    const stop = r.live.watch(() => {
      n += 1;
    });
    await connected(r, INBOX);
    expect(n).toBe(1);
    r.show(false);
    expect(n).toBe(2);
    stop();
    r.show(true);
    await settle();
    r.last().fire("connect");
    expect(n).toBe(2);
  });
});

describe("one connection per tab: a pass per channel, joined and left as chats come and go", () => {
  it("a further chat is a fresh pass sent as join on the same connection; it is live once the service takes it", async () => {
    const r = rig();
    await connected(r, INBOX);
    const heard: DealChanged[] = [];
    const inboxHeard: DealChanged[] = [];
    r.live.follow(INBOX, (e) => inboxHeard.push(e));
    r.live.follow(CHAT("c1"), (e) => heard.push(e));
    await settle();
    expect(r.sockets).toHaveLength(1);
    expect(r.asked).toEqual([{ kind: "inbox" }, { kind: "chat", chatId: "c1" }]);
    expect(r.last().joins()).toHaveLength(1);
    expect(r.last().joins()[0]!.args[0]).toEqual({ pass: "v1.pass2.sig" });
    expect(r.live.live("c1")).toBe(false);
    r.last().ack(0, { ok: true, channel: "chat:c1:sponsor" });
    expect(r.live.live("c1")).toBe(true);
    /* What happened between the chat's last read and the join was missed: that chat reads again, the list doesn't. */
    expect(heard).toEqual([{ chatId: "c1", orderId: "*" }]);
    expect(inboxHeard).toEqual([]);
    /* It is asked for once, not on every pass through. */
    r.live.follow(CHAT("c1"), () => {});
    await settle();
    expect(r.asked).toHaveLength(2);
  });
  it("two screens showing the same chat share its one channel", async () => {
    const r = rig();
    const a = await connected(r, CHAT("c1"));
    const b = r.live.follow(CHAT("c1"), () => {});
    await settle();
    expect(r.asked).toHaveLength(1);
    expect(r.last().joins()).toHaveLength(0);
    /* The channel stays while either is on screen. */
    a();
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS + 1);
    expect(r.last().leaves()).toEqual([]);
    expect(r.last().closed).toBe(false);
    b();
    b();
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS + 1);
    expect(r.last().closed).toBe(true);
  });
  it("a chat that closes or leaves the screen is left, after a few seconds' grace; the connection stays for the rest", async () => {
    const r = rig();
    await connected(r, INBOX);
    const stop = r.live.follow(CHAT("c1"), () => {});
    await settle();
    r.last().ack(0, { ok: true, channel: "chat:c1:sponsor" });
    stop();
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS - 1);
    expect(r.last().leaves()).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(r.last().leaves()).toEqual(["chat:c1:sponsor"]);
    expect(r.live.live("c1")).toBe(false);
    expect(r.last().closed).toBe(false);
    expect(r.live.live()).toBe(true);
  });
  it("moving between pages (one listener swapped for the next within the grace) leaves and re-joins nothing", async () => {
    const r = rig();
    const stop = await connected(r, INBOX);
    stop();
    await vi.advanceTimersByTimeAsync(1000);
    r.live.follow(INBOX, () => {});
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS * 2);
    expect(r.asked).toHaveLength(1);
    expect(r.last().leaves()).toEqual([]);
    expect(r.last().closed).toBe(false);
  });
  it("when the last chat or list leaves the screen the connection is closed", async () => {
    const r = rig();
    const stop = await connected(r, CHAT("c1"));
    stop();
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS + 1);
    expect(r.last().closed).toBe(true);
    expect(r.live.live()).toBe(false);
    /* And nothing is asked for again on its own. */
    await vi.advanceTimersByTimeAsync(300_000);
    expect(r.asked).toHaveLength(1);
    expect(r.sockets).toHaveLength(1);
  });
  it("a chat that left the screen while its join was on the way is left as soon as the service takes it", async () => {
    const r = rig();
    await connected(r, INBOX);
    const stop = r.live.follow(CHAT("c1"), () => {});
    await settle();
    stop();
    await vi.advanceTimersByTimeAsync(LIVE_LINGER_MS + 1);
    r.last().ack(0, { ok: true, channel: "chat:c1:sponsor" });
    expect(r.last().leaves()).toEqual(["chat:c1:sponsor"]);
    expect(r.live.live("c1")).toBe(false);
  });
  it("a join the service doesn't take is asked for again a little later, with a new pass", async () => {
    const r = rig();
    await connected(r, INBOX);
    r.live.follow(CHAT("c1"), () => {});
    await settle();
    r.last().ack(0, { ok: false, error: "unauthorized" });
    expect(r.live.live("c1")).toBe(false);
    await vi.advanceTimersByTimeAsync(LIVE_LATER_MS - 1);
    expect(r.last().joins()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(r.last().joins()).toHaveLength(2);
    expect(r.last().joins()[1]!.args[0]).toEqual({ pass: "v1.pass3.sig" });
  });
  it("never holds more channels than the service allows; the rest keep asking on their own beat", async () => {
    const r = rig();
    await connected(r, INBOX);
    for (let i = 0; i < LIVE_MAX_CHANNELS + 6; i += 1) r.live.follow(CHAT(`c${i}`), () => {});
    await settle();
    expect(r.last().joins()).toHaveLength(LIVE_MAX_CHANNELS - 1);
    expect(r.asked).toHaveLength(LIVE_MAX_CHANNELS);
  });
});

describe("a hidden tab holds no connection", () => {
  it("disconnects the moment the tab is hidden, and comes back with fresh passes for everything on screen", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, INBOX, (e) => heard.push(e));
    r.live.follow(CHAT("c1"), () => {});
    await settle();
    r.last().ack(0, { ok: true, channel: "chat:c1:sponsor" });
    const first = r.last();
    heard.length = 0;

    r.show(false);
    expect(first.closed).toBe(true);
    expect(r.live.live()).toBe(false);
    expect(r.live.live("c1")).toBe(false);
    /* Hidden for an hour: nothing is asked for, nothing reconnects. */
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(r.asked).toHaveLength(2);
    expect(r.sockets).toHaveLength(1);

    r.show(true);
    await settle();
    expect(r.sockets).toHaveLength(2);
    /* A pass works once: the handshake uses a new one, never the old. */
    expect(r.last().pass.pass).toBe("v1.pass3.sig");
    r.last().fire("connect");
    await settle();
    expect(r.asked.slice(2)).toEqual([{ kind: "inbox" }, { kind: "chat", chatId: "c1" }]);
    expect(r.last().joins()[0]!.args[0]).toEqual({ pass: "v1.pass4.sig" });
    /* Whatever changed while it was away was missed. */
    expect(heard).toEqual([EVERYTHING]);
  });
  it("a pass that arrives after the tab was hidden is not used", async () => {
    let release: (v: LivePassResult) => void = () => {};
    const r = rig(() => new Promise<LivePassResult>((res) => {
      release = res;
    }));
    r.live.follow(INBOX, () => {});
    await settle();
    r.show(false);
    release(r.good(INBOX));
    await settle();
    expect(r.sockets).toEqual([]);
  });
  it("the old connection's late words are not acted on", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, INBOX, (e) => heard.push(e));
    const old = r.last();
    const stale = [...(old.handlers.get("chat:changed") ?? [])];
    r.show(false);
    heard.length = 0;
    stale.forEach((fn) => fn({ chatId: "c1", orderId: "o1" }));
    expect(heard).toEqual([]);
  });
});

describe("the events: each means read again, and none carries what was said", () => {
  it("every chat event reaches the listeners with the chat's id and its order's", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, INBOX, (e) => heard.push(e));
    heard.length = 0;
    expect([...LIVE_EVENTS]).toEqual(["chat:opened", "chat:changed", "chat:form", "chat:signed", "chat:order", "chat:closed"]);
    for (const event of LIVE_EVENTS) r.last().fire(event, { chatId: "c1", orderId: "o1", what: "message", by: "sponsor", state: "PAID", why: "ENDED" });
    expect(heard).toEqual(LIVE_EVENTS.map(() => ({ chatId: "c1", orderId: "o1" })));
    /* Anything that isn't about a chat is ignored. */
    heard.length = 0;
    r.last().fire("chat:changed", null);
    r.last().fire("chat:changed", { orderId: "o1" });
    r.last().fire("chat:changed", { chatId: 7 });
    expect(heard).toEqual([]);
    r.last().fire("chat:changed", { chatId: "c2" });
    expect(heard).toEqual([{ chatId: "c2", orderId: "" }]);
  });
  it("a screen following several chats hears a change once; one screen's trouble isn't the next one's", async () => {
    const r = rig();
    const order = vi.fn();
    r.live.follow(CHAT("c1"), order);
    r.live.follow(CHAT("c2"), order);
    const other = vi.fn();
    r.live.follow(INBOX, () => {
      throw new Error("a list that failed to redraw");
    });
    r.live.follow(INBOX, other);
    await settle();
    r.last().fire("connect");
    await settle();
    order.mockClear();
    other.mockClear();
    r.last().fire("chat:order", { chatId: "c1", orderId: "o1", state: "PAID" });
    expect(order).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
  });
  it("chat:closed: the service has taken the tab off that chat, so it is told once and never joined again", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, INBOX);
    r.live.follow(CHAT("c1"), (e) => heard.push(e));
    await settle();
    r.last().ack(0, { ok: true, channel: "chat:c1:sponsor" });
    heard.length = 0;
    r.last().fire("chat:closed", { chatId: "c1", orderId: "o1", why: "CALLED_OFF" });
    expect(heard).toEqual([{ chatId: "c1", orderId: "o1" }]);
    expect(r.live.live("c1")).toBe(false);
    expect(r.live.live()).toBe(true);
    await vi.advanceTimersByTimeAsync(600_000);
    r.show(false);
    r.show(true);
    await settle();
    r.last().fire("connect");
    await settle();
    expect(r.asked.filter((w) => w.kind === "chat")).toHaveLength(1);
  });
});

describe("the control events", () => {
  it("session:renew: a fresh pass and a new connection by itself, at once", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, CHAT("c1"), (e) => heard.push(e));
    const first = r.last();
    heard.length = 0;
    first.fire("session:renew", {});
    expect(first.closed).toBe(true);
    expect(r.live.live()).toBe(false);
    await settle();
    expect(r.sockets).toHaveLength(2);
    expect(r.asked).toEqual([{ kind: "chat", chatId: "c1" }, { kind: "chat", chatId: "c1" }]);
    expect(r.last().pass.pass).toBe("v1.pass2.sig");
    r.last().fire("connect");
    expect(r.live.live("c1")).toBe(true);
    expect(heard).toEqual([EVERYTHING]);
    /* The service closing the old connection right after is not a second reconnection. */
    await vi.advanceTimersByTimeAsync(120_000);
    expect(r.sockets).toHaveLength(2);
  });
  it("access:ended: it stops, and doesn't come back — not later, not for a new chat, not when the tab returns", async () => {
    const r = rig();
    await connected(r, INBOX);
    r.last().fire("access:ended", {});
    expect(r.last().closed).toBe(true);
    expect(r.live.live()).toBe(false);
    r.live.follow(CHAT("c1"), () => {});
    r.show(false);
    r.show(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.asked).toHaveLength(1);
    expect(r.sockets).toHaveLength(1);
  });
});

describe("it is a speed-up, never a requirement: with no connection every screen keeps its own beat", () => {
  it("live updates off (503): nothing connects, and nothing is asked again until the page is loaded again", async () => {
    const r = rig(() => ({ ok: false, why: "off" }));
    r.live.follow(INBOX, () => {});
    await settle();
    r.live.follow(CHAT("c1"), () => {});
    r.show(false);
    r.show(true);
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.asked).toEqual([{ kind: "inbox" }]);
    expect(r.sockets).toEqual([]);
    expect(r.live.live()).toBe(false);
    expect(r.live.live("c1")).toBe(false);
  });
  it("a chat that has ended (409) or isn't theirs (403) is not asked for again; what else is on screen still goes live", async () => {
    const r = rig((want) => (want.kind === "chat" && want.chatId === "ended" ? { ok: false, why: "not-live" } : want.kind === "chat" && want.chatId === "theirs" ? { ok: false, why: "refused" } : r.good(want)));
    r.live.follow(CHAT("ended"), () => {});
    r.live.follow(CHAT("theirs"), () => {});
    r.live.follow(CHAT("c1"), () => {});
    await settle();
    expect(r.sockets).toHaveLength(1);
    r.last().fire("connect");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(r.live.live("c1")).toBe(true);
    /* Not followed live, so the chat's own few-second beat goes on (use-deal-chat.ts asks live(id)). */
    expect(r.live.live("ended")).toBe(false);
    expect(r.asked.filter((w) => w.kind === "chat" && w.chatId !== "c1")).toHaveLength(2);
  });
  it("a Messages list with no chat in progress (409) asks again a minute later: one may have begun", async () => {
    let begun = false;
    const r = rig((want) => (begun ? r.good(want) : { ok: false, why: "not-live" }));
    r.live.follow(INBOX, () => {});
    await settle();
    expect(r.sockets).toEqual([]);
    await vi.advanceTimersByTimeAsync(LIVE_NOT_YET_MS - 1);
    expect(r.asked).toHaveLength(1);
    begun = true;
    await vi.advanceTimersByTimeAsync(2);
    expect(r.asked).toHaveLength(2);
    expect(r.sockets).toHaveLength(1);
  });
  it("and at once when the tab comes back to the front", async () => {
    let begun = false;
    const r = rig((want) => (begun ? r.good(want) : { ok: false, why: "not-live" }));
    r.live.follow(INBOX, () => {});
    await settle();
    begun = true;
    r.show(false);
    r.show(true);
    await settle();
    expect(r.sockets).toHaveLength(1);
  });
  it("the API unreachable: asked again after longer and longer waits, and it connects when the API is back", async () => {
    let down = true;
    const r = rig((want) => (down ? { ok: false, why: "later" } : r.good(want)));
    r.live.follow(INBOX, () => {});
    await settle();
    expect(r.asked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(r.asked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(r.asked).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(5999);
    expect(r.asked).toHaveLength(3);
    down = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(r.asked).toHaveLength(4);
    expect(r.sockets).toHaveLength(1);
  });
  it("a pass that throws is the same as no pass", async () => {
    const r = rig(() => {
      throw new Error("the server action failed");
    });
    r.live.follow(INBOX, () => {});
    await settle();
    expect(r.sockets).toEqual([]);
    expect(r.live.live()).toBe(false);
  });
  it("the service refusing or unreachable: each new try is a new pass, further apart each time", async () => {
    const r = rig();
    r.live.follow(INBOX, () => {});
    await settle();
    r.last().fire("connect_error", new Error("unauthorized"));
    expect(r.sockets[0]!.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(1499);
    expect(r.sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.sockets).toHaveLength(2);
    expect(r.sockets.map((s) => s.pass.pass)).toEqual(["v1.pass1.sig", "v1.pass2.sig"]);
    r.last().fire("connect_error", new Error("websocket error"));
    await vi.advanceTimersByTimeAsync(2999);
    expect(r.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.sockets).toHaveLength(3);
  });
  it("a connection that drops comes back by itself with fresh passes, and everyone reads again", async () => {
    const r = rig();
    const heard: DealChanged[] = [];
    await connected(r, INBOX, (e) => heard.push(e));
    await vi.advanceTimersByTimeAsync(60_000);
    heard.length = 0;
    r.last().fire("disconnect", "transport close");
    expect(r.live.live()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(r.sockets).toHaveLength(2);
    expect(r.last().pass.pass).toBe("v1.pass2.sig");
    r.last().fire("connect");
    expect(heard).toEqual([EVERYTHING]);
  });
  it("a service that keeps dropping the connection is tried less and less often", async () => {
    const r = rig();
    await connected(r, INBOX);
    r.last().fire("disconnect", "transport close");
    await vi.advanceTimersByTimeAsync(1500);
    expect(r.sockets).toHaveLength(2);
    r.last().fire("connect");
    r.last().fire("disconnect", "transport close");
    await vi.advanceTimersByTimeAsync(2999);
    expect(r.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(r.sockets).toHaveLength(3);
  });
});

describe("in the browser (components/deal-chat/deal-socket.ts)", () => {
  const socket = src("components/deal-chat/deal-socket.ts");
  it("connects the way the service asks: its address and path from the pass, WebSocket only, the pass in the handshake", () => {
    expect(socket).toContain('io(pass.url, { path: pass.path, transports: ["websocket"], auth: { pass: pass.pass }, reconnection: false, forceNew: true,');
    /* socket.io must not reconnect by itself: it would send the same, already used, pass again. */
    expect(socket).not.toMatch(/reconnection: true|reconnectionAttempts/);
  });
  it("asks for a pass through the server action, and takes the tab's visibility from the document", () => {
    expect(socket).toContain("pass: (want) => dealLivePassAction(want)");
    expect(socket).toContain('visible: () => document.visibilityState === "visible"');
    expect(socket).toContain('document.addEventListener("visibilitychange", fn)');
  });
  it("the rules themselves touch no browser global, so they are the ones tested here", () => {
    expect(src("lib/deal-live.ts")).not.toMatch(/\bdocument\.|\bwindow\.|socket\.io-client|"use client"/);
  });
  it("the content security policy lets a browser reach the socket service, in both environments", async () => {
    const { buildReportOnlyCsp, LIVE_SOCKET_ORIGINS } = await import("../next.config");
    expect(LIVE_SOCKET_ORIGINS).toEqual(["wss://socketservice.sponsorx.net", "wss://socketservice-staging.sponsorx.net"]);
    const policy = buildReportOnlyCsp({ NODE_ENV: "production" });
    const connect = policy.split("; ").find((d) => d.startsWith("connect-src "))!.split(" ");
    for (const origin of LIVE_SOCKET_ORIGINS) expect(connect).toContain(origin);
    /* Named exactly: never every WebSocket anywhere. */
    expect(connect).not.toContain("wss:");
    expect(connect).not.toContain("ws:");
  });
});
