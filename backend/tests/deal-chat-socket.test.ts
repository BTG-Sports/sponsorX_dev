import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Deal Chat's live socket (2S4-FE-07/-08/-09; owner, 2026-11-19).

   The rule that matters: a login hears that a chat changed exactly when it
   could read that chat. The rooms are built from `whereFor(dealChat, read)`
   itself, so the first half checks them against that filter for every kind of
   caller; the second half connects real sockets and checks who is refused,
   who hears, who does not, and that nothing but two ids ever travels.

   No database: the socket is attached without its Postgres LISTEN and the
   test announces changes itself.
   -------------------------------------------------------------------------- */

/* Hoisted above the imports below: config/env.ts reads these as it loads. */
vi.hoisted(() => {
  process.env.CLERK_SECRET_KEY ??= "sk_test_x";
  process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
  process.env.DATABASE_URL ??= "postgresql://unused:unused@localhost:5432/unused";
});

import type { Actor } from "../src/auth/actor";
import { whereFor } from "../src/auth/scope";
import { DEAL_CHAT_CHANGED, DEAL_CHAT_SOCKET_PATH, roomsForActor, roomsForChat, type ChatParty } from "../src/realtime/deal-chat-rooms";
import { attachDealChatSocket, type DealChatSocket } from "../src/realtime/deal-chat-socket";

const T = "sockt_tenant_books";
const T_ATH = "sockt_tenant_athlete";
const T_TEAM = "sockt_tenant_team";

function actor(over: Partial<Actor>): Actor {
  return { userId: "sockt_u", tenantId: T, roles: [], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, studentId: null, studentActive: false, ...over } as Actor;
}

const athleteChat: ChatParty = { id: "sockt_chat_a", tenantId: T, orderId: "sockt_order_1", sponsorId: "sockt_sp_1", athleteId: "sockt_ath_1", athleteTenantId: T_ATH, propertyId: null, propertyTenantId: null };
const teamChat: ChatParty = { id: "sockt_chat_t", tenantId: T, orderId: "sockt_order_2", sponsorId: "sockt_sp_1", athleteId: null, athleteTenantId: null, propertyId: "sockt_prop_1", propertyTenantId: T_TEAM };

const PEOPLE: Record<string, Actor> = {
  superAdmin: actor({ roles: ["SUPER_ADMIN"], tenantId: "sockt_tenant_elsewhere" }),
  btgAdmin: actor({ roles: ["BTG_ADMIN"] }),
  btgAdminElsewhere: actor({ roles: ["BTG_ADMIN"], tenantId: "sockt_tenant_elsewhere" }),
  sponsorAdmin: actor({ roles: ["SPONSOR_ADMIN"], sponsorId: "sockt_sp_1" }),
  sponsorAnalyst: actor({ roles: ["SPONSOR_ANALYST"], sponsorId: "sockt_sp_1" }),
  otherSponsor: actor({ roles: ["SPONSOR_ADMIN"], sponsorId: "sockt_sp_2" }),
  sameSponsorIdOtherBooks: actor({ roles: ["SPONSOR_ADMIN"], sponsorId: "sockt_sp_1", tenantId: "sockt_tenant_elsewhere" }),
  athlete: actor({ roles: ["ATHLETE"], tenantId: T_ATH, athleteId: "sockt_ath_1" }),
  otherAthlete: actor({ roles: ["ATHLETE"], tenantId: T_ATH, athleteId: "sockt_ath_2" }),
  teamManager: actor({ roles: ["PROPERTY_MGR"], tenantId: T_TEAM, propertyId: "sockt_prop_1" }),
  otherTeam: actor({ roles: ["PROPERTY_MGR"], tenantId: T_TEAM, propertyId: "sockt_prop_2" }),
  finance: actor({ roles: ["FINANCE"] }),
  campaignManager: actor({ roles: ["CAMPAIGN_MGR"] }),
  nobody: actor({ roles: [] }),
};

/** Would this caller's own read filter return this chat? The answer GET /deal-chats gives. */
function couldRead(a: Actor, c: ChatParty): boolean {
  let scopes: Record<string, unknown>[];
  try {
    scopes = (whereFor(a, "dealChat", "read") as { AND: Record<string, unknown>[] }).AND;
  } catch {
    return false;
  }
  /* Every conjunct must hold; a conjunct that is not plain `field = value` (MATCHES_NOTHING's `id in []`) holds for no row. */
  return scopes.every((where) => Object.entries(where).every(([k, v]) => (typeof v === "object" ? false : (c as Record<string, unknown>)[k] === v)));
}
const hears = (a: Actor, c: ChatParty) => roomsForActor(a).some((r) => roomsForChat(c).includes(r));

describe("who hears about a chat", () => {
  it("is exactly who could read it, for every kind of caller and both kinds of seller", () => {
    for (const [name, a] of Object.entries(PEOPLE)) {
      for (const c of [athleteChat, teamChat]) {
        expect(hears(a, c), `${name} / ${c.id}`).toBe(roomsForActor(a).length > 0 && couldRead(a, c));
      }
    }
  });
  it("spelled out: the order's sponsor, its seller and BTG in its books; nobody else", () => {
    const yes = (n: string, c: ChatParty) => expect(hears(PEOPLE[n]!, c), n).toBe(true);
    const no = (n: string, c: ChatParty) => expect(hears(PEOPLE[n]!, c), n).toBe(false);
    for (const n of ["superAdmin", "btgAdmin", "sponsorAdmin", "sponsorAnalyst", "athlete"]) yes(n, athleteChat);
    for (const n of ["btgAdminElsewhere", "otherSponsor", "sameSponsorIdOtherBooks", "otherAthlete", "teamManager", "otherTeam", "finance", "campaignManager", "nobody"]) no(n, athleteChat);
    yes("teamManager", teamChat);
    no("athlete", teamChat);
    no("otherTeam", teamChat);
  });
  it("a login the matrix gives no chat to sits in no room at all", () => {
    for (const n of ["finance", "campaignManager", "nobody"]) expect(roomsForActor(PEOPLE[n]!), n).toEqual([]);
    /* An athlete login with no athlete behind it reads nothing, so it joins nothing. */
    expect(roomsForActor(actor({ roles: ["ATHLETE"], athleteId: null }))).toEqual([]);
  });
});

describe("the socket", () => {
  let http: HttpServer;
  let dealSocket: DealChatSocket;
  let url = "";
  const open: Socket[] = [];

  beforeAll(async () => {
    http = createServer((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    dealSocket = attachDealChatSocket(http, {
      listen: false,
      origins: undefined,
      /* The token is a key into PEOPLE; anything else is nobody signed in. */
      authenticate: async (token) => PEOPLE[token] ?? null,
    });
    http.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => http.once("listening", () => resolve()));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    for (const s of open) s.disconnect();
    await dealSocket.close();
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });

  function client(token: string | null): Socket {
    const s = connect(url, { path: DEAL_CHAT_SOCKET_PATH, transports: ["websocket"], reconnection: false, auth: token ? { token } : {} });
    open.push(s);
    return s;
  }
  const connected = (s: Socket) => new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });
  const refused = (s: Socket) => new Promise<string>((resolve) => {
    s.once("connect_error", (e) => resolve(e.message));
    s.once("connect", () => resolve("connected"));
  });

  it("refuses a connection with no token, an unknown one, and a login with no chat to hear about", async () => {
    expect(await refused(client(null))).toBe("unauthenticated");
    expect(await refused(client("not-a-session"))).toBe("unauthenticated");
    expect(await refused(client("finance"))).toBe("forbidden");
  });

  it("tells the chat's own sides and BTG that it changed, with two ids and nothing else, and tells nobody else", async () => {
    const who = ["sponsorAdmin", "sponsorAnalyst", "athlete", "btgAdmin", "superAdmin", "otherSponsor", "otherAthlete", "teamManager", "btgAdminElsewhere"];
    const sockets = Object.fromEntries(who.map((n) => [n, client(n)]));
    await Promise.all(Object.values(sockets).map(connected));
    const heard: Record<string, unknown[]> = Object.fromEntries(who.map((n) => [n, []]));
    for (const n of who) sockets[n]!.on(DEAL_CHAT_CHANGED, (e: unknown) => heard[n]!.push(e));

    dealSocket.emit(athleteChat);
    await new Promise((r) => setTimeout(r, 300));

    for (const n of ["sponsorAdmin", "sponsorAnalyst", "athlete", "btgAdmin", "superAdmin"]) {
      expect(heard[n], n).toEqual([{ chatId: "sockt_chat_a", orderId: "sockt_order_1" }]);
    }
    for (const n of ["otherSponsor", "otherAthlete", "teamManager", "btgAdminElsewhere"]) expect(heard[n], n).toEqual([]);

    dealSocket.emit(teamChat);
    await new Promise((r) => setTimeout(r, 300));
    expect(heard.teamManager).toEqual([{ chatId: "sockt_chat_t", orderId: "sockt_order_2" }]);
    expect(heard.athlete).toHaveLength(1);
    expect(heard.sponsorAdmin).toHaveLength(2);
  });

  it("takes nothing from a browser: a client cannot announce a change to anyone", async () => {
    const sender = client("otherSponsor");
    const listener = client("sponsorAdmin");
    await Promise.all([connected(sender), connected(listener)]);
    const heard: unknown[] = [];
    listener.on(DEAL_CHAT_CHANGED, (e: unknown) => heard.push(e));
    sender.emit(DEAL_CHAT_CHANGED, { chatId: "sockt_chat_a", orderId: "sockt_order_1" });
    await new Promise((r) => setTimeout(r, 300));
    expect(heard).toEqual([]);
  });

  it("closes a connection after its session time, so the browser comes back with a fresh token", async () => {
    const quick = createServer();
    const short = attachDealChatSocket(quick, { listen: false, origins: undefined, sessionMs: 150, authenticate: async (token) => PEOPLE[token] ?? null });
    quick.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => quick.once("listening", () => resolve()));
    const s = connect(`http://127.0.0.1:${(quick.address() as AddressInfo).port}`, { path: DEAL_CHAT_SOCKET_PATH, transports: ["websocket"], reconnection: false, auth: { token: "athlete" } });
    await connected(s);
    const reason = await new Promise<string>((resolve) => s.once("disconnect", (r) => resolve(r)));
    expect(reason).toBe("io server disconnect");
    await short.close();
    await new Promise<void>((resolve) => quick.close(() => resolve()));
  });
});
