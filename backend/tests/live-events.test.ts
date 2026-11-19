import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-18 — the live socket service, the API's side: passes (option B) and
   the database's events, relayed. Over a real database.

   "Put the socket on a railway service ... ensure there are security checks
   made when the chat is open or visible." (owner, 2026-11-19)
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@live-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-18 · live passes and events", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const chat = await import("../src/domain/deal-chat");
  const { startLiveRelay } = await import("../src/realtime/relay");
  const { checkPass, publicKeyFrom } = await import("../../socketservice/src/pass.ts");
  type LiveNotice = import("../src/realtime/relay").LiveNotice;

  const T = "live_tenant_a";
  const OTHER = "live_tenant_b";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);
  const keys = generateKeyPairSync("ed25519");
  const publicPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const settings = env as unknown as Record<string, unknown>;

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, "user-agent": "live-test", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json: ReturnType<typeof JSON.parse> = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json };
  };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" IN ($1, $2)`, T, OTHER).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [T, OTHER] } } });
  }
  const user = (id: string, roles: string[], extra: Record<string, unknown> = {}, tenant = T) =>
    prisma.user.create({ data: { id, tenantId: tenant, clerkId: id, email: `${id}@live-test.invalid`, roles, ...extra } as never });

  let seq = 0;
  async function openChat(item: string, owner: { athleteId?: string; propertyId?: string }) {
    const id = p(`ord${seq++}`);
    await prisma.reservation.create({ data: { id: `${id}_res`, tenantId: T, sponsorId: p("sponsor"), cartId: `${id}_cart`, expiresAt: inDays(1) } });
    await prisma.marketplaceOrder.create({ data: {
      id, tenantId: T, sponsorId: p("sponsor"), reservationId: `${id}_res`, state: "IN_CHAT", createdBy: p("sa"),
      subtotalCents: 0, feesCents: 0, totalCents: 0, requiresApproval: false, approvalReasons: [],
      lines: { create: [{
        id: `${id}_l0`, tenantId: T, listingId: `${id}_lst0`, inventoryItemId: p(item), itemTenantId: T,
        propertyId: owner.propertyId ?? null, sellerAthleteId: owner.athleteId ?? null, title: `Item ${item}`, quantity: 1,
        startsOn: inDays(10), endsOn: inDays(12), unitPriceCents: 50_000, lineTotalCents: 50_000,
      }] },
    } });
    await prisma.$transaction((tx) => chat.openDealChats(tx, id, new Date()));
    const c = await prisma.dealChat.findFirstOrThrow({ where: { tenantId: T, orderId: id }, select: { id: true } });
    return { orderId: id, chatId: c.id };
  }

  /* The relay, posting into this list instead of to the socket service. */
  let seen: LiveNotice[] = [];
  let relay: ReturnType<typeof startLiveRelay>;
  const settle = async () => {
    await new Promise((r) => setTimeout(r, 250));
    await relay!.flush();
  };
  const take = async () => {
    await settle();
    const out = seen;
    seen = [];
    return out;
  };

  beforeAll(async () => {
    await wipe();
    for (const t of [T, OTHER]) await prisma.tenant.create({ data: { id: t, name: `LIVE ${t}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "Harbor Coffee", categories: [] } });
    await prisma.sponsor.create({ data: { id: p("rival"), tenantId: T, name: "Rival Roasters", categories: [] } });
    await prisma.guardian.create({ data: { id: p("sam"), tenantId: T, legalName: "Sam Lee", email: "sam@live-test.invalid", relationship: "PARENT", verifiedAt: new Date() } as never });
    await prisma.athlete.create({ data: { id: p("riley"), tenantId: T, slug: p("riley"), legalName: "Riley Park", displayName: "Riley P", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.athlete.create({ data: {
      id: p("jordan"), tenantId: T, slug: p("jordan"), legalName: "Jordan Lee", displayName: "Jordan L", sport: "Soccer", ageBand: "16_17",
      birthDate: new Date(Date.now() - 16 * 365 * DAY), majorityAge: 18, state: "ACTIVE", guardianId: p("sam"),
    } as never });
    await prisma.property.create({ data: { id: p("hawks"), tenantId: T, slug: p("hawks"), name: "Westfield Hawks", kind: "TEAM" } as never });
    await prisma.inventoryItem.create({ data: { id: p("post"), tenantId: T, title: "post", kind: "SOCIAL_POST", priceCents: 50_000, categories: [], active: true, athleteId: p("riley") } });
    await prisma.inventoryItem.create({ data: { id: p("visit"), tenantId: T, title: "visit", kind: "APPEARANCE", priceCents: 50_000, categories: [], active: true, athleteId: p("jordan") } });
    await user(p("sa"), ["SPONSOR_ADMIN"], { sponsorId: p("sponsor") });
    await user(p("an"), ["SPONSOR_ANALYST"], { sponsorId: p("sponsor") });
    await user(p("rival_sa"), ["SPONSOR_ADMIN"], { sponsorId: p("rival") });
    await user(p("riley_user"), ["ATHLETE"], { athleteId: p("riley") });
    await user(p("sam_user"), ["GUARDIAN"], { guardianId: p("sam") });
    await user(p("mgr"), ["PROPERTY_MGR"], { propertyId: p("hawks") });
    await user(p("admin"), ["BTG_ADMIN"]);
    await user(`${OTHER}_admin`, ["BTG_ADMIN"], {}, OTHER);
    relay = startLiveRelay({ post: async (n) => { seen.push(...n); }, connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
    await new Promise((r) => setTimeout(r, 300));
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await relay?.stop();
    settings.SOCKETSERVICE_PASS_PRIVATE_KEY = undefined;
    settings.SOCKETSERVICE_PUBLIC_URL = undefined;
    await wipe();
  });

  describe("the pass", () => {
    it("is refused while live updates aren't configured", async () => {
      const { chatId } = await openChat("post", { athleteId: p("riley") });
      expect((await call("POST", "/live-passes", p("sa"), { kind: "chat", chatId })).status).toBe(503);
      settings.SOCKETSERVICE_PASS_PRIVATE_KEY = Buffer.from(keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString()).toString("base64");
      settings.SOCKETSERVICE_PUBLIC_URL = "https://socketservice-staging.sponsorx.net";
    });

    it("opens the caller's own side of an open chat only, checked by the socket service's own code", async () => {
      const { chatId } = await openChat("post", { athleteId: p("riley") });
      const key = publicKeyFrom(publicPem);
      const want: Array<[string, string]> = [[p("sa"), "sponsor"], [p("an"), "sponsor"], [p("riley_user"), "seller"], [p("admin"), "btg"]];
      for (const [who, side] of want) {
        const r = await call("POST", "/live-passes", who, { kind: "chat", chatId });
        expect(r.status, who).toBe(201);
        expect(r.json).toMatchObject({ url: "https://socketservice-staging.sponsorx.net", path: "/ws", channel: `chat:${chatId}:${side}` });
        const pass = checkPass(r.json.pass, key);
        expect(pass).toMatchObject({ sub: who, ch: `chat:${chatId}:${side}`, aud: "socketservice" });
        expect(pass.exp - pass.iat).toBe(60);
      }
      for (const who of [p("rival_sa"), p("mgr"), `${OTHER}_admin`, p("sam_user")]) {
        expect((await call("POST", "/live-passes", who, { kind: "chat", chatId })).status, who).toBe(403);
      }
      expect((await call("POST", "/live-passes", p("sa"), { kind: "chat", chatId: "nope" })).status).toBe(403);
      expect((await call("POST", "/live-passes", p("sa"), { kind: "room", chatId })).status).toBe(400);
    });

    it("a minor's chat is the guardian's, acting for them", async () => {
      const { chatId } = await openChat("visit", { athleteId: p("jordan") });
      const r = await fetch(`${base}/api/v1/live-passes`, {
        method: "POST",
        headers: { "x-test-clerk": p("sam_user"), "x-sponsorx-ward": p("jordan"), "content-type": "application/json" },
        body: JSON.stringify({ kind: "chat", chatId }),
      });
      expect(r.status).toBe(201);
      expect((await r.json()).channel).toBe(`chat:${chatId}:seller`);
    });

    it("nothing is live before a chat begins or after it ends", async () => {
      const { orderId, chatId } = await openChat("post", { athleteId: p("riley") });
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { state: "CANCELLED", cancelReason: "CALLED_OFF" } });
      expect((await call("POST", "/live-passes", p("sa"), { kind: "chat", chatId })).status).toBe(409);
      /* The team has no chat at all: its inbox isn't live. */
      expect((await call("POST", "/live-passes", p("mgr"), { kind: "inbox" })).status).toBe(409);
      const inbox = async (who: string) => (await call("POST", "/live-passes", who, { kind: "inbox" })).json?.channel;
      expect(await inbox(p("sa"))).toBe(`inbox:sponsor:${p("sponsor")}`);
      expect(await inbox(p("riley_user"))).toBe(`inbox:athlete:${p("riley")}`);
      expect(await inbox(p("admin"))).toBe(`inbox:btg:${T}`);
      expect((await call("POST", "/live-passes", p("rival_sa"), { kind: "inbox" })).status).toBe(409);
    });
  });

  describe("the events, raised by the database and relayed", () => {
    const sides = (chatId: string, list: string[]) => list.map((s) => `chat:${chatId}:${s}`);

    it("a chat opening reaches both sides' inboxes and BTG's", async () => {
      await take();
      const { chatId, orderId } = await openChat("post", { athleteId: p("riley") });
      const n = (await take()).find((x) => x.event === "chat:opened");
      expect(n).toBeDefined();
      expect(n!.data).toEqual({ chatId, orderId });
      expect(n!.channels).toEqual(expect.arrayContaining([...sides(chatId, ["sponsor", "seller", "btg"]), `inbox:sponsor:${p("sponsor")}`, `inbox:athlete:${p("riley")}`, `inbox:btg:${T}`]));
    });

    it("a message reaches everyone on the chat; a held one only the sender's side and BTG; a release then everyone — and never the words", async () => {
      const { chatId } = await openChat("post", { athleteId: p("riley") });
      await take();
      expect((await call("POST", `/deal-chats/${chatId}/messages`, p("sa"), { text: "Hello there, secret words" })).status).toBe(201);
      const [msg] = (await take()).filter((x) => x.event === "chat:changed");
      expect(msg).toMatchObject({ data: { chatId, what: "message" } });
      expect(msg!.channels).toEqual(expect.arrayContaining(sides(chatId, ["sponsor", "seller", "btg"])));

      expect((await call("POST", `/deal-chats/${chatId}/messages`, p("riley_user"), { text: "email me at riley@example.com" })).status).toBe(201);
      const held = (await take()).filter((x) => x.event === "chat:changed");
      expect(held).toHaveLength(1);
      expect(held[0]!.data).toMatchObject({ what: "held" });
      expect(held[0]!.channels.sort()).toEqual([...sides(chatId, ["seller", "btg"]), `inbox:athlete:${p("riley")}`, `inbox:btg:${T}`].sort());

      const m = await prisma.dealChatMessage.findFirstOrThrow({ where: { chatId, state: "HELD" }, select: { id: true } });
      expect((await call("POST", `/deal-chat-messages/${m.id}/release`, p("admin"))).status).toBe(200);
      const released = (await take()).find((x) => x.data?.what === "released");
      expect(released!.channels).toEqual(expect.arrayContaining(sides(chatId, ["sponsor"])));

      const everything = JSON.stringify(seen) + JSON.stringify([msg, held, released]);
      expect(everything).not.toContain("secret words");
      expect(everything).not.toContain("riley@example.com");
    });

    it("picks, amounts, the form, signatures, the order's moves and the chat closing are all events", async () => {
      const { chatId, orderId } = await openChat("post", { athleteId: p("riley") });
      await take();
      await prisma.dealChatPick.create({ data: { tenantId: T, chatId, cardKey: "usage", side: "SPONSOR", value: ["YES"], userId: p("sa") } });
      await prisma.dealChat.update({ where: { id: chatId }, data: { sponsorAmountCents: 60_000 } });
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { state: "PENDING_APPROVAL" } });
      await prisma.dealChat.update({ where: { id: chatId }, data: { state: "CLOSED" } });
      const got = await take();
      const kinds = got.map((x) => `${x.event}${x.data?.what ? `/${x.data.what}` : ""}${x.data?.state ? `/${x.data.state}` : ""}`);
      expect(kinds).toEqual(expect.arrayContaining(["chat:changed/pick", "chat:changed/amount", "chat:order/PENDING_APPROVAL", "chat:closed"]));
      expect(got.every((x) => x.data?.chatId === chatId && x.data?.orderId === orderId)).toBe(true);
    });

    it("a change that rolls back raises nothing", async () => {
      const { chatId } = await openChat("post", { athleteId: p("riley") });
      await take();
      await prisma.$transaction(async (tx) => {
        await tx.dealChat.update({ where: { id: chatId }, data: { sellerAmountCents: 1 } });
        throw new Error("roll back");
      }).catch(() => {});
      expect((await take()).filter((x) => x.data?.chatId === chatId)).toHaveLength(0);
    });

    it("a login switched off loses every live connection", async () => {
      await take();
      await prisma.user.update({ where: { id: p("an") }, data: { disabledAt: new Date(), disabledReason: "test" } });
      expect(await take()).toEqual(expect.arrayContaining([{ channels: [`user:${p("an")}`], event: "access:ended", data: {} }]));
    });
  });
});
