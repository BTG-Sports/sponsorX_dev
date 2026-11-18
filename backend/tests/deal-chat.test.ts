import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S4-BE-16 — Deal Chat between an order's sponsor and one seller.

   The pure half: what holds a message for BTG, the dollar figures, working
   days, and where a deal stands (cards agreed and locked, offers waiting,
   whose turn, all green).

   Then against a real database: one chat per seller on an order; only the
   order's parties read and write it and BTG reads it; picks agree on a match
   and are then locked; offers run Reply / Accept / Decline and agree on two
   accepts of the latest message, a reply clearing them; the form is posted
   once everything is green and signing checks it again; held messages reach
   BTG and not the other side until released, or are kept back with a reason;
   reports reach BTG; a minor's accept comes only from the guardian; the
   money nudge; unread email after 15 minutes; reminders after 2 working days.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@chat-test.invalid` } : null;
  },
}));

const { addWorkingDays, cardAgreed, contactReasons, dealStatus, dollarFigures } = await import("../src/domain/deal-chat-rules");

describe("2S4-BE-16 · the plain rules", () => {
  it("contact details and outside payment hold a message; ordinary deal talk doesn't", () => {
    expect(contactReasons("email me at riley.park@gmail.com")).toEqual(["An email address"]);
    expect(contactReasons("riley (at) gmail (dot) com")).toEqual(["An email address"]);
    expect(contactReasons("call 555-123-4567")).toEqual(["A phone number"]);
    expect(contactReasons("text +1 (555) 123 4567 tonight")).toEqual(["A phone number"]);
    expect(contactReasons("DM me @riley_park")).toEqual(["A social media handle"]);
    expect(contactReasons("see https://example.com/deal")).toEqual(["An outside link"]);
    expect(contactReasons("my linktr.ee is fine but paypal.me/riley")).toContain("Payment outside SponsorX");
    expect(contactReasons("just Venmo me")).toEqual(["Payment outside SponsorX"]);
    expect(contactReasons("send it to $RileyPark")).toEqual(["Payment outside SponsorX"]);
    expect(contactReasons("Yes to paid ads, but only Instagram, and $200 more. Post on 2026-12-01.")).toEqual([]);
    expect(contactReasons("I'll do 2 posts for $1,150.00 by Friday")).toEqual([]);
  });

  it("finds the dollar figures an agreed exchange names", () => {
    expect(dollarFigures("Can we do $150? Or $ 1,200.50, or 300 dollars, or 50 USD")).toEqual(["$150", "$ 1,200.50", "300 dollars", "50 USD"]);
    expect(dollarFigures("Instagram only")).toEqual([]);
  });

  it("working days skip the weekend", () => {
    const fri = new Date("2026-11-20T10:00:00Z");
    expect(addWorkingDays(fri, 2).toISOString()).toBe("2026-11-24T10:00:00.000Z"); // Fri + 2 → Tue
    expect(addWorkingDays(new Date("2026-11-17T10:00:00Z"), 2).toISOString()).toBe("2026-11-19T10:00:00.000Z");
  });

  it("a card is agreed only on matching picks, whatever order a tick-all card was ticked in", () => {
    expect(cardAgreed(["YES"], ["YES"])).toBe(true);
    expect(cardAgreed(["YES"], ["NO"])).toBe(false);
    expect(cardAgreed(["YES"], undefined)).toBe(false);
    expect(cardAgreed(["X", "TIKTOK"], ["TIKTOK", "X"])).toBe(true);
    expect(cardAgreed(["X"], ["X", "TIKTOK"])).toBe(false);
  });

  it("where the deal stands: whose turn, what's open, all green", () => {
    const agreedAmount = { originalCents: 50_000, sponsorCents: 50_000, sellerCents: 50_000 };
    const base = { forms: ["PLACEMENT"] as const, exchanges: [], heldCount: 0, agreement: null, amount: agreedAmount };
    const keys = ["APPROVAL_FIRST", "EXCLUSIVITY", "MATERIALS", "PERIOD_AS_LISTED"];
    const both = (v: string) => keys.flatMap((k) => (["SPONSOR", "SELLER"] as const).map((side) => ({ cardKey: k, side, value: [v] })));

    const fresh = dealStatus({ ...base, picks: [], amount: { originalCents: 50_000, sponsorCents: null, sellerCents: null } });
    expect(fresh).toMatchObject({ agreedCount: 0, cardCount: 4, allGreen: false, turn: ["SPONSOR", "SELLER"] });
    expect(fresh.notYet).toContain("the final amount isn't confirmed by both sides yet");

    /* 2S4-BE-15 — the final amount: agreed only when both sides' match. */
    const cardsDone = { ...base, picks: both("YES") };
    expect(dealStatus({ ...cardsDone, amount: { originalCents: 50_000, sponsorCents: 50_000, sellerCents: null } })).toMatchObject({ allGreen: false, turn: ["SELLER"] });
    const apart = dealStatus({ ...cardsDone, amount: { originalCents: 50_000, sponsorCents: 50_000, sellerCents: 60_000 } });
    expect(apart).toMatchObject({ allGreen: false, notYet: ["your amounts don't match"], turn: ["SPONSOR", "SELLER"] });
    expect(apart.amount).toMatchObject({ agreed: false, agreedCents: null });
    expect(dealStatus({ ...cardsDone, amount: { originalCents: 50_000, sponsorCents: 60_000, sellerCents: 60_000 } }).amount).toMatchObject({ agreed: true, agreedCents: 60_000 });

    const sponsorDone = dealStatus({ ...base, picks: both("YES").filter((p) => p.side === "SPONSOR") });
    expect(sponsorDone.turn).toEqual(["SELLER"]);

    const green = dealStatus({ ...base, picks: both("YES") });
    expect(green).toMatchObject({ agreedCount: 4, allGreen: true, notYet: [], turn: [] });

    /* An offer still open: not green; the side that didn't write the latest message is up. */
    const offer = { id: "x1", cardKey: "MATERIALS", state: "OPEN", latest: { id: "m1", side: "SELLER" as const, held: false }, sponsorAcceptedMessageId: null, sellerAcceptedMessageId: null, texts: [] };
    const open = dealStatus({ ...base, picks: both("YES"), exchanges: [offer] });
    expect(open).toMatchObject({ allGreen: false, notYet: ["1 offer still open"], turn: ["SPONSOR"] });
    /* The sponsor accepted: now the author must accept too. */
    expect(dealStatus({ ...base, picks: both("YES"), exchanges: [{ ...offer, sponsorAcceptedMessageId: "m1" }] }).turn).toEqual(["SELLER"]);
    /* Held for BTG. */
    const held = dealStatus({ ...base, picks: both("YES"), exchanges: [{ ...offer, latest: { ...offer.latest, held: true } }], heldCount: 1 });
    expect(held.turn).toEqual(["BTG"]);
    expect(held.notYet).toContain("1 message waiting for a BTG check");

    /* The money nudge comes from agreed exchanges only. */
    const agreed = { ...offer, state: "AGREED", texts: ["Yes, for $150 more"] };
    expect(dealStatus({ ...base, picks: both("YES"), exchanges: [agreed, { ...offer, id: "x2", texts: ["$999"] }] }).moneyFigures).toEqual(["$150"]);

    /* With the form out, whoever hasn't signed. */
    expect(dealStatus({ ...base, picks: both("YES"), agreement: { id: "a", state: "OPEN", sponsorSigned: true, sellerSigned: false } }).turn).toEqual(["SELLER"]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-16 · Deal Chat, end to end", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const chat = await import("../src/domain/deal-chat");
  const { signDealAgreement } = await import("../src/domain/deal-agreement");
  type Actor = import("../src/auth/actor").Actor;

  const T = "dch_tenant_a";
  const OTHER = "dch_tenant_b";
  const p = (s: string) => `${T}_${s}`;
  const DAY = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * DAY);

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, "user-agent": "chat-test", ...(body ? { "content-type": "application/json" } : {}) },
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

  const user = async (id: string, roles: string[], extra: Record<string, unknown> = {}, tenant = T) =>
    prisma.user.create({ data: { id, tenantId: tenant, clerkId: id, email: `${id}@chat-test.invalid`, roles, ...extra } as never });

  let orderSeq = 0;
  async function order(lines: Array<{ item: string; athleteId?: string; propertyId?: string; total?: number }>) {
    const id = p(`ord${orderSeq++}`);
    await prisma.reservation.create({ data: { id: `${id}_res`, tenantId: T, sponsorId: p("sponsor"), cartId: `${id}_cart`, expiresAt: inDays(1) } });
    await prisma.marketplaceOrder.create({ data: {
      id, tenantId: T, sponsorId: p("sponsor"), reservationId: `${id}_res`, state: "IN_CHAT", createdBy: p("sa"),
      subtotalCents: 0, feesCents: 0, totalCents: 0, requiresApproval: false, approvalReasons: [],
      lines: { create: lines.map((l, i) => ({
        id: `${id}_l${i}`, tenantId: T, listingId: `${id}_lst${i}`, inventoryItemId: p(l.item), itemTenantId: T,
        propertyId: l.propertyId ?? null, sellerAthleteId: l.athleteId ?? null, title: `Item ${l.item}`, quantity: 1,
        startsOn: inDays(10), endsOn: inDays(12), unitPriceCents: l.total ?? 50_000, lineTotalCents: l.total ?? 50_000,
      })) },
    } });
    return id;
  }
  /** Open the order's chats as placing does, and return them by seller key. */
  async function chatsFor(orderId: string, now = new Date()) {
    await prisma.$transaction((tx) => chat.openDealChats(tx, orderId, now));
    const rows = await prisma.dealChat.findMany({ where: { tenantId: T, orderId }, select: { id: true, sellerKey: true } });
    return Object.fromEntries(rows.map((r) => [r.sellerKey, r.id]));
  }

  const actor = (o: Partial<Actor>): Actor => ({ userId: "x", tenantId: T, roles: [], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...o });
  const sponsor = actor({ userId: p("sa"), roles: ["SPONSOR_ADMIN"], sponsorId: p("sponsor") });
  const analyst = actor({ userId: p("an"), roles: ["SPONSOR_ANALYST"], sponsorId: p("sponsor") });
  const rival = actor({ userId: p("rival_sa"), roles: ["SPONSOR_ADMIN"], sponsorId: p("rival") });
  const riley = actor({ userId: p("riley_user"), roles: ["ATHLETE"], athleteId: p("riley") });
  const jordanSelf = actor({ userId: p("jordan_user"), roles: ["ATHLETE"], athleteId: p("jordan") });
  const guardian = actor({ userId: p("sam_user"), roles: ["ATHLETE"], athleteId: p("jordan"), guardianId: p("sam"), actingFor: { athleteId: p("jordan"), guardianId: p("sam") } } as Partial<Actor>);
  const manager = actor({ userId: p("mgr"), roles: ["PROPERTY_MGR"], propertyId: p("hawks") });
  const btg = actor({ userId: p("admin"), roles: ["BTG_ADMIN"] });
  const otherBtg = actor({ userId: `${OTHER}_admin`, tenantId: OTHER, roles: ["BTG_ADMIN"] });

  const PLACEMENT = ["APPROVAL_FIRST", "EXCLUSIVITY", "MATERIALS", "PERIOD_AS_LISTED"];
  const CONTENT_PICKS: Record<string, string | string[]> = {
    APPROVAL_FIRST: "YES", EXCLUSIVITY: "NO", REUSE: "YES", PAID_ADS: "NO", USAGE_PERIOD: "90_DAYS", PLATFORMS: ["TIKTOK", "INSTAGRAM"], CHANGES: "YES",
  };
  const pickAll = async (who: Actor, id: string, picks: Record<string, string | string[]>) => {
    for (const [k, v] of Object.entries(picks)) await chat.pickDealCard(who, id, k, { value: v });
  };
  /** 2S4-BE-15 — both sides confirm the same final amount. */
  const agreeAmount = async (id: string, seller: Actor, cents: number) => {
    await chat.confirmDealAmount(sponsor, id, { amountCents: cents });
    return chat.confirmDealAmount(seller, id, { amountCents: cents });
  };
  const emails = async (template: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string })
      .filter((j) => j.template === template);

  beforeAll(async () => {
    await wipe();
    for (const t of [T, OTHER]) await prisma.tenant.create({ data: { id: t, name: `DCH ${t}` } });
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "Harbor Coffee", categories: [] } });
    await prisma.sponsor.create({ data: { id: p("rival"), tenantId: T, name: "Rival Roasters", categories: [] } });
    await prisma.guardian.create({ data: { id: p("sam"), tenantId: T, legalName: "Sam Lee", email: "sam@chat-test.invalid", relationship: "PARENT", verifiedAt: new Date() } as never });
    await prisma.athlete.create({ data: { id: p("riley"), tenantId: T, slug: p("riley"), legalName: "Riley Park", displayName: "Riley P", sport: "Soccer", ageBand: "18_PLUS", state: "ACTIVE" } });
    await prisma.athlete.create({ data: {
      id: p("jordan"), tenantId: T, slug: p("jordan"), legalName: "Jordan Lee", displayName: "Jordan L", sport: "Soccer", ageBand: "16_17",
      birthDate: new Date(Date.now() - 16 * 365 * DAY), majorityAge: 18, state: "ACTIVE", guardianId: p("sam"),
    } as never });
    await prisma.property.create({ data: { id: p("hawks"), tenantId: T, slug: p("hawks"), name: "Westfield Hawks", kind: "TEAM" } as never });
    const owned = { post: { athleteId: p("riley") }, visit: { athleteId: p("jordan") }, banner: { propertyId: p("hawks") } };
    for (const [id, kind] of [["post", "SOCIAL_POST"], ["visit", "APPEARANCE"], ["banner", "SIGNAGE"]] as const) {
      await prisma.inventoryItem.create({ data: { id: p(id), tenantId: T, title: id, kind, priceCents: 50_000, categories: [], active: true, ...owned[id] } });
    }
    await user(p("sa"), ["SPONSOR_ADMIN"], { sponsorId: p("sponsor") });
    await user(p("an"), ["SPONSOR_ANALYST"], { sponsorId: p("sponsor") });
    await user(p("rival_sa"), ["SPONSOR_ADMIN"], { sponsorId: p("rival") });
    await user(p("riley_user"), ["ATHLETE"], { athleteId: p("riley") });
    await user(p("jordan_user"), ["ATHLETE"], { athleteId: p("jordan") });
    await user(p("sam_user"), ["GUARDIAN"], { guardianId: p("sam") });
    await user(p("mgr"), ["PROPERTY_MGR"], { propertyId: p("hawks") });
    await user(p("admin"), ["BTG_ADMIN"]);
    await user(`${OTHER}_admin`, ["BTG_ADMIN"], {}, OTHER);
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as import("node:net").AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("one chat per seller, each with its own forms; both sides emailed a link", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }, { item: "banner", propertyId: p("hawks") }]);
    const ids = await chatsFor(o);
    expect(Object.keys(ids).sort()).toEqual([`athlete:${p("riley")}`, `property:${p("hawks")}`]);
    const rows = await prisma.dealChat.findMany({ where: { tenantId: T, orderId: o }, select: { sellerKey: true, forms: true, lineIds: true, athleteTenantId: true, propertyTenantId: true }, orderBy: { sellerKey: "asc" } });
    expect(rows[0]).toMatchObject({ forms: ["CONTENT"], lineIds: [`${o}_l0`], athleteTenantId: T });
    expect(rows[1]).toMatchObject({ forms: ["PLACEMENT"], lineIds: [`${o}_l1`], propertyTenantId: T });
    /* Opening twice makes no second chat. */
    await chatsFor(o);
    expect(await prisma.dealChat.count({ where: { tenantId: T, orderId: o } })).toBe(2);
    const opened = (await emails("dealChat.opened")).filter((e) => e.data.orderRef && e.idempotencyKey.includes(ids[`athlete:${p("riley")}`]!));
    expect(opened.map((e) => e.to).sort()).toEqual([`${p("riley_user")}@chat-test.invalid`, `${p("sa")}@chat-test.invalid`]);
  });

  it("only the order's parties read and write; BTG reads; nobody else", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const id = (await chatsFor(o))[`property:${p("hawks")}`]!;
    await chat.postDealChatMessage(sponsor, id, { text: "Hello team" });
    await chat.postDealChatMessage(manager, id, { text: "Hi Harbor" });
    expect((await chat.readDealChat(analyst, id)).messages.map((m) => m.body)).toEqual(["Hello team", "Hi Harbor"]);
    expect((await chat.readDealChat(btg, id)).yourSide).toBeNull();
    await expect(chat.readDealChat(rival, id)).rejects.toThrow();
    await expect(chat.readDealChat(riley, id)).rejects.toThrow();
    await expect(chat.readDealChat(otherBtg, id)).rejects.toThrow();
    await expect(chat.postDealChatMessage(analyst, id, { text: "x" })).rejects.toThrow();
    await expect(chat.postDealChatMessage(btg, id, { text: "x" })).rejects.toThrow();
    await expect(chat.postDealChatMessage(rival, id, { text: "x" })).rejects.toThrow();
    /* Through the API. */
    expect((await call("GET", `/deal-chats/${id}`, p("mgr"))).status).toBe(200);
    expect((await call("GET", `/deal-chats/${id}`, p("rival_sa"))).status).toBe(403);
    expect((await call("POST", `/deal-chats/${id}/messages`, p("admin"), { text: "BTG here" })).status).toBe(403);
    const listed = await call("GET", `/deal-chats?orderId=${o}`, p("sa"));
    expect(listed.json.map((c: { id: string }) => c.id)).toEqual([id]);
    /* A message's words never change. */
    const m = await prisma.dealChatMessage.findFirstOrThrow({ where: { tenantId: T, chatId: id }, select: { id: true } });
    await expect(prisma.dealChatMessage.update({ where: { id: m.id }, data: { body: "edited" } })).rejects.toThrow(/cannot be changed/);
  });

  it("cards agree on matching picks and are then locked; the form posts once all green; signing checks again", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks"), total: 80_000 }]);
    const id = (await chatsFor(o))[`property:${p("hawks")}`]!;
    for (const k of PLACEMENT) await chat.pickDealCard(sponsor, id, k, { value: "YES" });
    let v = await chat.pickDealCard(manager, id, "APPROVAL_FIRST", { value: "NO" });
    expect(v.status.cards.find((c) => c.key === "APPROVAL_FIRST")).toMatchObject({ sponsor: ["YES"], seller: ["NO"], agreed: false });
    /* Not agreed yet, so either side may change. */
    v = await chat.pickDealCard(manager, id, "APPROVAL_FIRST", { value: "YES" });
    expect(v.status.cards.find((c) => c.key === "APPROVAL_FIRST")!.agreed).toBe(true);
    /* Agreed: locked for both. */
    await expect(chat.pickDealCard(manager, id, "APPROVAL_FIRST", { value: "NO" })).rejects.toThrow(/can't be changed/);
    await expect(chat.pickDealCard(sponsor, id, "APPROVAL_FIRST", { value: "NO" })).rejects.toThrow(/can't be changed/);
    /* Questions this deal doesn't ask, and answers a card doesn't offer. */
    await expect(chat.pickDealCard(sponsor, id, "PAID_ADS", { value: "YES" })).rejects.toThrow(/doesn't ask/);
    await expect(chat.pickDealCard(sponsor, id, "MATERIALS", { value: "MAYBE" })).rejects.toThrow(/isn't one of/);
    expect(v.agreement).toBeNull();

    for (const k of PLACEMENT.slice(1)) v = await chat.pickDealCard(manager, id, k, { value: "YES" });
    /* 2S4-BE-15 — every card agreed, but the final amount isn't yet. */
    expect(v.status).toMatchObject({ allGreen: false, agreedCount: 4, amount: { originalCents: 80_000, agreed: false } });
    expect(v.agreement).toBeNull();
    await chat.confirmDealAmount(sponsor, id, { amountCents: 80_000 });
    v = await chat.confirmDealAmount(manager, id, { amountCents: 90_000 });
    expect(v.status.notYet).toEqual(["your amounts don't match"]);
    v = await chat.confirmDealAmount(manager, id, { amountCents: 80_000 });
    expect(v.status).toMatchObject({ allGreen: true, agreedCount: 4, turn: ["SPONSOR", "SELLER"], amount: { agreed: true, agreedCents: 80_000 } });
    await expect(chat.confirmDealAmount(sponsor, id, { amountCents: 70_000 })).rejects.toThrow(/agreed the amount/);
    expect(v.agreement).not.toBeNull();
    const form = await prisma.dealAgreement.findUniqueOrThrow({ where: { id: v.agreement!.id }, select: { state: true, body: true, bodyHash: true, amountCents: true } });
    expect(form).toMatchObject({ state: "OPEN", amountCents: 80_000 });
    expect(form.body).toContain("The Sponsor supplies the artwork or materials.");
    /* Everything is agreed: no new offers. */
    await expect(chat.makeDealOffer(sponsor, id, { text: "One more thing" })).rejects.toThrow(/form is out/);

    /* Signing checks the chat again: something held for BTG stops it. */
    await chat.postDealChatMessage(manager, id, { text: "Call me on 555 123 4567" });
    const sign = (a: Actor) => signDealAgreement(a, v.agreement!.id, { bodyHashShown: form.bodyHash, ip: "127.0.0.1", userAgent: "chat-test" });
    await expect(sign(sponsor)).rejects.toThrow(/Not everything in the Deal Chat is agreed yet: 1 message waiting for a BTG check/);
    const held = (await chat.listDealChatReviews(btg)).find((r) => r.chatId === id)!;
    await chat.keepBackDealChatMessage(btg, held.messageId, { reason: "Phone numbers stay off SponsorX." });
    await sign(sponsor);
    await sign(manager);
    expect((await prisma.dealAgreement.findUniqueOrThrow({ where: { id: v.agreement!.id }, select: { state: true } })).state).toBe("SIGNED");
    expect((await chat.readDealChat(sponsor, id)).status.turn).toEqual([]);
  });

  it("offers: Reply clears accepts; agreed on two accepts of the latest message; word for word in the agreement", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const id = (await chatsFor(o))[`athlete:${p("riley")}`]!;
    await pickAll(sponsor, id, { ...CONTENT_PICKS, PAID_ADS: "NO" });
    await pickAll(riley, id, { ...CONTENT_PICKS, PAID_ADS: "YES" });
    let v = await chat.makeDealOffer(riley, id, { text: "Yes to paid ads, but only Instagram, and $200 more.", cardKey: "PAID_ADS" });
    const x = v.exchanges[0]!;
    expect(v.status.openExchanges[0]!.waitingOn).toBe("SPONSOR");
    v = await chat.replyToDealOffer(sponsor, id, x.id, { text: "Instagram only is fine. Can we do $150?" });
    const afterReply = v.exchanges[0]!.latestMessageId!;
    v = await chat.acceptDealOffer(riley, id, x.id, { messageId: afterReply });
    expect(v.exchanges[0]).toMatchObject({ sellerAccepted: true, sponsorAccepted: false, state: "OPEN" });
    /* A new reply clears both accepts. */
    v = await chat.replyToDealOffer(riley, id, x.id, { text: "$150 works if I approve each ad first." });
    const latest = v.exchanges[0]!.latestMessageId!;
    expect(v.exchanges[0]).toMatchObject({ sellerAccepted: false, sponsorAccepted: false });
    /* Accepting an older message is refused. */
    await expect(chat.acceptDealOffer(sponsor, id, x.id, { messageId: afterReply })).rejects.toThrow(/changed since you read it/);
    await chat.acceptDealOffer(sponsor, id, x.id, { messageId: latest });
    await expect(chat.acceptDealOffer(sponsor, id, x.id, { messageId: latest })).rejects.toThrow(/already accepted/);
    v = await chat.acceptDealOffer(riley, id, x.id, { messageId: latest });
    expect(v.exchanges[0]!.state).toBe("AGREED");
    /* The card is still settled by the picks. */
    expect(v.status.allGreen).toBe(false);
    expect(v.agreement).toBeNull();
    v = await chat.pickDealCard(sponsor, id, "PAID_ADS", { value: "YES" });
    expect(v.status.allGreen).toBe(false);
    v = await agreeAmount(id, riley, 50_000);
    expect(v.status.allGreen).toBe(true);
    expect(v.moneyNudge).toBe("Your agreed terms mention $200, $150. Is $500.00 still right?");
    const body = (await prisma.dealAgreement.findUniqueOrThrow({ where: { id: v.agreement!.id }, select: { body: true } })).body;
    expect(body).toContain("Special term 1 (on: May the Sponsor use it in paid ads?):");
    expect(body).toContain("] Yes to paid ads, but only Instagram, and $200 more.");
    expect(body).toContain("] $150 works if I approve each ad first.");
    expect(body).toContain("- The content is posted on Instagram and TikTok.");
  });

  it("Decline ends the offer and the card is open again", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const id = (await chatsFor(o))[`property:${p("hawks")}`]!;
    const v1 = await chat.makeDealOffer(sponsor, id, { text: "We bring the banner", cardKey: "MATERIALS" });
    const v2 = await chat.declineDealOffer(manager, id, v1.exchanges[0]!.id);
    expect(v2.exchanges[0]!.state).toBe("DECLINED");
    expect(v2.status.openExchanges).toEqual([]);
    await expect(chat.acceptDealOffer(manager, id, v1.exchanges[0]!.id, { messageId: v1.exchanges[0]!.latestMessageId })).rejects.toThrow(/declined/);
  });

  it("held messages reach BTG, not the other side, until released; kept back with a reason the sender reads", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const id = (await chatsFor(o))[`athlete:${p("riley")}`]!;
    await chat.postDealChatMessage(riley, id, { text: "DM me @riley_park" });
    await chat.postDealChatMessage(riley, id, { text: "or riley@example.com" });
    const sponsorView = await chat.readDealChat(sponsor, id);
    expect(sponsorView.messages).toEqual([]);
    const own = await chat.readDealChat(riley, id);
    expect(own.messages.map((m) => m.state)).toEqual(["HELD", "HELD"]);
    expect(own.messages[0]!.heldReasons).toBeUndefined(); // the reasons are BTG's
    const desk = (await chat.listDealChatReviews(btg)).filter((r) => r.chatId === id);
    expect(desk.map((r) => r.heldReasons)).toEqual([["A social media handle"], ["An email address"]]);
    expect((await emails("dealChat.forReview")).some((e) => e.to === `${p("admin")}@chat-test.invalid`)).toBe(true);
    /* Only BTG reaches the desk. */
    await expect(chat.listDealChatReviews(sponsor)).rejects.toThrow();
    await expect(chat.releaseDealChatMessage(riley, desk[0]!.messageId)).rejects.toThrow();
    await expect(chat.releaseDealChatMessage(otherBtg, desk[0]!.messageId)).rejects.toThrow();

    await chat.releaseDealChatMessage(btg, desk[0]!.messageId);
    await chat.keepBackDealChatMessage(btg, desk[1]!.messageId, { reason: "Email addresses stay off SponsorX." });
    expect((await chat.readDealChat(sponsor, id)).messages.map((m) => m.body)).toEqual(["DM me @riley_park"]);
    const after = await chat.readDealChat(riley, id);
    expect(after.messages[1]).toMatchObject({ state: "KEPT_BACK", keptBackReason: "Email addresses stay off SponsorX." });
    expect((await emails("dealChat.keptBack")).map((e) => e.to)).toContain(`${p("riley_user")}@chat-test.invalid`);
    await expect(chat.keepBackDealChatMessage(btg, desk[1]!.messageId, { reason: "again" })).rejects.toThrow(/isn't waiting/);
    await expect(chat.keepBackDealChatMessage(btg, desk[0]!.messageId, { reason: "" })).rejects.toThrow(/reason/);

    /* A held offer can't be answered until it is cleared. */
    const v = await chat.makeDealOffer(riley, id, { text: "Venmo me $100 and we're done" });
    await expect(chat.replyToDealOffer(sponsor, id, v.exchanges[0]!.id, { text: "?" })).rejects.toThrow(/BTG check/);
    const heldOffer = (await chat.listDealChatReviews(btg)).find((r) => r.chatId === id)!;
    await chat.keepBackDealChatMessage(btg, heldOffer.messageId, { reason: "Payment stays on SponsorX." });
    expect((await chat.readDealChat(riley, id)).exchanges[0]!.state).toBe("DECLINED");
  });

  it("either side reports a message; it reaches BTG's desk", async () => {
    const o = await order([{ item: "post", athleteId: p("riley") }]);
    const id = (await chatsFor(o))[`athlete:${p("riley")}`]!;
    const v = await chat.postDealChatMessage(riley, id, { text: "That price is an insult" });
    const mid = v.messages[0]!.id;
    await expect(chat.reportDealChatMessage(rival, mid, { reason: "x" })).rejects.toThrow();
    await chat.reportDealChatMessage(analyst, mid, { reason: "Rude" });
    const item = (await chat.listDealChatReviews(btg)).find((r) => r.messageId === mid)!;
    expect(item).toMatchObject({ reported: true, reportReason: "Rude", state: "VISIBLE" });
    expect((await chat.readDealChat(btg, id)).messages[0]).toMatchObject({ reported: true });
    await chat.releaseDealChatMessage(btg, mid);
    expect((await chat.listDealChatReviews(btg)).some((r) => r.messageId === mid)).toBe(false);
    expect((await chat.readDealChat(sponsor, id)).messages.map((m) => m.body)).toEqual(["That price is an insult"]);
  });

  it("for a minor only the guardian accepts an offer; the minor may talk and pick", async () => {
    const o = await order([{ item: "visit", athleteId: p("jordan") }]);
    const id = (await chatsFor(o))[`athlete:${p("jordan")}`]!;
    await chat.pickDealCard(jordanSelf, id, "TRAVEL", { value: "YES" });
    const v = await chat.makeDealOffer(sponsor, id, { text: "We'll cover travel up to $300", cardKey: "TRAVEL" });
    const x = v.exchanges[0]!;
    expect((await chat.readDealChat(jordanSelf, id)).mayAccept).toBe(false);
    await expect(chat.acceptDealOffer(jordanSelf, id, x.id, { messageId: x.latestMessageId })).rejects.toThrow();
    expect((await chat.readDealChat(guardian, id)).mayAccept).toBe(true);
    const after = await chat.acceptDealOffer(guardian, id, x.id, { messageId: x.latestMessageId });
    expect(after.exchanges[0]!.sellerAccepted).toBe(true);
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: T, action: "dealChat.accept", entityId: x.id }, select: { actorId: true, after: true } });
    expect(audit).toMatchObject({ actorId: p("sam_user"), after: expect.objectContaining({ actingForAthleteId: p("jordan") }) });
  });

  it("unread messages are emailed once, after 15 minutes", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const id = (await chatsFor(o))[`property:${p("hawks")}`]!;
    await chat.postDealChatMessage(sponsor, id, { text: "Hello" });
    await chat.postDealChatMessage(sponsor, id, { text: "Are you there?" });
    const first = (await prisma.dealChatMessage.findFirstOrThrow({ where: { tenantId: T, chatId: id }, select: { createdAt: true }, orderBy: { createdAt: "asc" } })).createdAt;
    const sweep = (now: Date) => chat.sweepDealChats(now, { tenantIds: [T] });
    const mine = async () => (await emails("dealChat.unread")).filter((e) => e.idempotencyKey.includes(id));
    await sweep(new Date(first.getTime() + 5 * 60_000));
    expect(await mine()).toHaveLength(0);
    await sweep(new Date(first.getTime() + 16 * 60_000));
    expect(await mine()).toHaveLength(1);
    expect((await mine())[0]).toMatchObject({ to: `${p("mgr")}@chat-test.invalid`, data: expect.objectContaining({ count: "2" }) });
    await sweep(new Date(first.getTime() + 30 * 60_000));
    expect(await mine()).toHaveLength(1);
    /* Read: nothing more to send. */
    await chat.markDealChatRead(manager, id);
    expect((await chat.readDealChat(manager, id)).unread).toBe(0);
  });

  it("whoever's turn it is is reminded after every 2 working days of silence", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const t0 = new Date("2026-11-16T09:00:00Z"); // a Monday
    const id = (await chatsFor(o, t0))[`property:${p("hawks")}`]!;
    const sweep = (now: Date) => chat.sweepDealChats(now, { tenantIds: [T] });
    const mine = async () => (await emails("dealChat.reminder")).filter((e) => e.idempotencyKey.includes(id));
    await sweep(new Date("2026-11-17T12:00:00Z"));
    expect(await mine()).toHaveLength(0);
    /* Wednesday: nobody has picked, so both sides are up. */
    await sweep(new Date("2026-11-18T09:30:00Z"));
    expect((await mine()).map((e) => e.to).sort()).toEqual([`${p("mgr")}@chat-test.invalid`, `${p("sa")}@chat-test.invalid`]);
    /* The next waits another 2 working days: Friday. */
    await sweep(new Date("2026-11-19T12:00:00Z"));
    expect(await mine()).toHaveLength(2);
    await sweep(new Date("2026-11-20T10:00:00Z"));
    expect(await mine()).toHaveLength(4);
  });

  it("an ended order's chat closes and is read-only", async () => {
    const o = await order([{ item: "banner", propertyId: p("hawks") }]);
    const id = (await chatsFor(o))[`property:${p("hawks")}`]!;
    await prisma.marketplaceOrder.update({ where: { id: o }, data: { state: "CANCELLED" } });
    await expect(chat.postDealChatMessage(sponsor, id, { text: "Hello?" })).rejects.toThrow(/read-only/);
    await chat.sweepDealChats(new Date(), { tenantIds: [T] });
    expect((await prisma.dealChat.findUniqueOrThrow({ where: { id }, select: { state: true } })).state).toBe("CLOSED");
    expect((await chat.readDealChat(sponsor, id)).state).toBe("CLOSED");
  });

  it("every action is audited", async () => {
    const actions = (await prisma.auditLog.findMany({ where: { tenantId: T, action: { startsWith: "dealChat." } }, select: { action: true } })).map((a) => a.action);
    for (const a of ["dealChat.open", "dealChat.message", "dealChat.pick", "dealChat.offer", "dealChat.reply", "dealChat.accept", "dealChat.decline", "dealChat.report", "dealChat.release", "dealChat.keepBack", "dealChat.formPosted", "dealChat.close"]) {
      expect(actions, a).toContain(a);
    }
  });
});
