import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { transitionBody } from "./support/order-payment";

/* --------------------------------------------------------------------------
   2S4-BE-15 — Deal Chat in the order flow; 2S4-BE-17 — its tests and switch.
   Feature spec documentation/SponsorX-Deal-Chat-Feature.md §3.5–§3.8, §4, §7, §8.

     - DEAL_CHAT on: every order placed goes IN_CHAT (no seller step), and
       cannot be paid until every seller's agreement is signed by both.
     - The final amount is agreed like a card; when the last agreement is
       signed it becomes the price of the seller's lines, in proportion, and
       the buyer fee is worked out again. Below the listed price, or above
       the sponsor's limit, it waits for BTG with the reason.
     - Either side calls the deal off before payment, with a reason; with two
       sellers it ends the whole order.
     - Not signed by both within 10 working days: cancelled, with a last
       warning 2 working days before.
     - Only the parties, a minor's guardian for a minor, and at-once actions
       settle once. DEAL_CHAT off: today's flow.

   Against the real API and database.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@dco-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S4-BE-15 / 2S4-BE-17 · Deal Chat in the order flow", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { env } = await import("../src/config/env");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { sweepDealChats } = await import("../src/domain/deal-chat");
  const { signingDeadline } = await import("../src/domain/deal-chat-rules");
  const { sponsorQuote } = await import("../src/domain/cart");

  const T = "dco_btg";
  const TERMS = `${T}_order_terms`;
  const L: Record<string, string> = {};
  const E = { tenant: "", property: "" };
  const KID = { "x-sponsorx-ward": "dco_ath_kid" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let day = 10;
  const dealChatWas = env.DEAL_CHAT;

  type Res = { status: number; text: string; json: ReturnType<typeof JSON.parse> };
  const call = async (method: string, path: string, clerk?: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res> => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", "user-agent": "dco-test", ...(clerk ? { "x-test-clerk": clerk } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'dco\\_%@dco-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 7; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }
  const mails = async (template: string) => {
    const rows = await prisma.outboxJob.findMany({
      where: { name: "notify.email", tenantId: { in: await tenantsInPlay() }, payload: { path: ["template"], equals: template } },
      select: { payload: true }, orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.payload as { to: string; data: Record<string, string>; idempotencyKey: string });
  };
  const ref = (id: string) => `SX-${id.slice(-8).toUpperCase()}`;
  const live = (orderId: string) => prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: `${orderId}:` }, releasedAt: null } });
  const audits = (action: string, entityId: string) => prisma.auditLog.count({ where: { action, entityId } });

  async function publish(key: string, item: Record<string, unknown>, owner = "dco_mgr") {
    const made = await call("POST", "/inventory", owner, item);
    expect(made.status, made.text).toBe(201);
    const listing = await call("POST", "/listings", owner, { inventoryItemId: made.json.id, title: `${item.title}`, description: "A description long enough for governance." });
    expect(listing.status, listing.text).toBe(201);
    L[key] = listing.json.id;
    expect((await call("POST", `/listings/${L[key]}/submit`, owner)).json.state).toBe("PUBLISHED");
  }
  async function order(sponsor: string, lines: Array<{ key: string; quantity: number }>) {
    const d = (day += 2);
    await call("POST", "/cart", sponsor);
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", sponsor, { listingId: L[l.key], quantity: l.quantity, startsOn: at(d), endsOn: at(d) });
      expect(r.status, r.text).toBe(201);
    }
    const hold = await call("POST", "/cart/reserve", sponsor);
    expect(hold.status, hold.text).toBe(201);
    const placed = await call("POST", "/marketplace-orders", sponsor, placeOrderBody(hold.json.id, TERMS));
    expect(placed.status, placed.text).toBe(201);
    return placed.json;
  }
  const orderOf = async (id: string, who = "dco_s1_admin") => (await call("GET", `/marketplace-orders/${id}`, who)).json;
  /** The order's chats, by seller key. */
  async function chatsOf(orderId: string, who = "dco_s1_admin") {
    const r = await call("GET", `/deal-chats?orderId=${orderId}`, who);
    expect(r.status, r.text).toBe(200);
    const out: Record<string, string> = {};
    for (const c of r.json as Array<{ id: string }>) {
      const full = await prisma.dealChat.findUniqueOrThrow({ where: { id: c.id }, select: { sellerKey: true } });
      out[full.sellerKey.startsWith("property:") ? "team" : full.sellerKey.endsWith("dco_ath_jo") ? "jo" : "kid"] = c.id;
    }
    return out;
  }
  /** Both sides pick each card's first answer. */
  async function agreeCards(chatId: string, sponsor: string, seller: string, sellerHeaders: Record<string, string> = {}) {
    const v = (await call("GET", `/deal-chats/${chatId}`, sponsor)).json;
    for (const c of v.status.cards as Array<{ key: string; multi: boolean; answers: Array<{ value: string }> }>) {
      const value = c.multi ? [c.answers[0]!.value] : c.answers[0]!.value;
      expect((await call("PUT", `/deal-chats/${chatId}/picks/${c.key}`, sponsor, { value })).status).toBe(200);
      const r = await call("PUT", `/deal-chats/${chatId}/picks/${c.key}`, seller, { value }, sellerHeaders);
      expect(r.status, r.text).toBe(200);
    }
    return v.status.amount.originalCents as number;
  }
  const amount = (chatId: string, who: string, amountCents: number, headers: Record<string, string> = {}) =>
    call("PUT", `/deal-chats/${chatId}/amount`, who, { amountCents }, headers);
  /** Cards and the amount agreed: the form is out. Returns its id. */
  async function agree(chatId: string, seller: string, cents?: number, sellerHeaders: Record<string, string> = {}) {
    const original = await agreeCards(chatId, "dco_s1_admin", seller, sellerHeaders);
    expect((await amount(chatId, "dco_s1_admin", cents ?? original)).status).toBe(200);
    const v = await amount(chatId, seller, cents ?? original, sellerHeaders);
    expect(v.status, v.text).toBe(200);
    expect(v.json.status.allGreen).toBe(true);
    return v.json.agreement.id as string;
  }
  async function sign(agreementId: string, who: string, headers: Record<string, string> = {}) {
    const a = await call("GET", `/deal-agreements/${agreementId}`, who, undefined, headers);
    expect(a.status, a.text).toBe(200);
    return call("POST", `/deal-agreements/${agreementId}/sign`, who, { bodyHashShown: a.json.bodyHash }, headers);
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Deal Chat order BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "dco_s1", tenantId: T, name: "Lantern Goods DCO", categories: ["APPAREL"] },
      { id: "dco_s2", tenantId: T, name: "Quay Outfitters DCO", categories: ["APPAREL"] },
    ] });
    await prisma.guardian.create({ data: { id: "dco_g", tenantId: T, legalName: "Mara Quinn", email: "dco_guardian@dco-test.invalid", relationship: "PARENT", verifiedAt: new Date(), emailConfirmedAt: new Date() } });
    const athlete = (id: string, legalName: string, displayName: string, extra: Record<string, unknown> = {}) =>
      ({ id, tenantId: T, slug: id.replace(/_/g, "-"), legalName, displayName, email: `${id}@dco-test.invalid`, sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "APPROVED" as const, emailConfirmedAt: new Date(), ...extra });
    await prisma.athlete.createMany({ data: [
      athlete("dco_ath_jo", "Jo Marsh", "JO.MARSH.DCO"),
      athlete("dco_ath_kid", "Kit Quinn", "KIT.QUINN.DCO", { ageBand: null, birthDate: new Date(Date.now() - 16 * 365.25 * 864e5), guardianId: "dco_g", state: "ACTIVE" }),
    ] });
    await prisma.user.createMany({ data: [
      { id: "dco_admin", tenantId: T, clerkId: "dco_admin", email: "dco_admin@dco-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "dco_finance", tenantId: T, clerkId: "dco_finance", email: "dco_finance@dco-test.invalid", roles: ["FINANCE"] },
      { id: "dco_sales", tenantId: T, clerkId: "dco_sales", email: "dco_sales@dco-test.invalid", roles: ["SALES"] },
      { id: "dco_s1_admin", tenantId: T, clerkId: "dco_s1_admin", email: "dco_s1_admin@dco-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dco_s1" },
      { id: "dco_s1_analyst", tenantId: T, clerkId: "dco_s1_analyst", email: "dco_s1_analyst@dco-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "dco_s1" },
      { id: "dco_s2_admin", tenantId: T, clerkId: "dco_s2_admin", email: "dco_s2_admin@dco-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dco_s2" },
      { id: "dco_jo", tenantId: T, clerkId: "dco_jo", email: "dco_jo@dco-test.invalid", roles: ["ATHLETE"], athleteId: "dco_ath_jo" },
      { id: "dco_kid", tenantId: T, clerkId: "dco_kid", email: "dco_kid@dco-test.invalid", roles: ["ATHLETE"], athleteId: "dco_ath_kid" },
      { id: "dco_guardian", tenantId: T, clerkId: "dco_guardian", email: "dco_guardian@dco-test.invalid", roles: ["GUARDIAN"], guardianId: "dco_g" },
    ] });
    await prisma.propertyOnboarding.create({ data: {
      id: "dco_onb", tenantId: T, orgType: "TEAM", orgName: "DCO Harbor Hawks", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Sky Ortega", email: "dco_mgr@dco-test.invalid", phone: "301-555-0109", role: "General manager", primary: true }],
      details: { legalEntityName: "DCO Harbor Hawks LLC", league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "dco_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "dco_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "dco_mgr");

    await publish("banner", { title: "Courtside banner DCO", kind: "SIGNAGE", priceCents: 100_000, quantity: 50 });
    await publish("poster", { title: "Concourse poster DCO", kind: "SIGNAGE", priceCents: 10_000, quantity: 100 });
    await publish("vip", { title: "VIP table DCO", kind: "TICKETS", priceCents: 50_000, quantity: 30, packageRules: { requiresApproval: true } });
    await publish("clinic", { title: "Jo's shooting clinic DCO", kind: "CAMP", priceCents: 30_000, quantity: 20, packageRules: { requiresApproval: true } }, "dco_jo");
    await prisma.inventoryItem.create({ data: { id: "dco_item_kid", tenantId: T, athleteId: "dco_ath_kid", title: "Kit's skills camp DCO", kind: "CAMP", priceCents: 20_000, quantity: 10, packageRules: { requiresApproval: true } } });
    await prisma.listing.create({ data: { id: "dco_list_kid", tenantId: T, sellerAthleteId: "dco_ath_kid", inventoryItemId: "dco_item_kid", title: "Kit's skills camp DCO", description: "A youth skills camp, two hours, up to 20 kids.", state: "PUBLISHED", publishedAt: new Date() } });
    L.kid = "dco_list_kid";
  });

  afterAll(async () => {
    env.DEAL_CHAT = dealChatWas;
    server?.close();
    await clean();
  });

  it("switch off: today's flow — no chat, approved within the limit, straight to payment", async () => {
    env.DEAL_CHAT = false;
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }]);
    expect(o).toMatchObject({ state: "AWAITING_PAYMENT", decidedBy: "system", waitingOn: "PAYMENT" });
    expect((await call("GET", `/deal-chats?orderId=${o.id}`, "dco_s1_admin")).json).toEqual([]);
    /* A listing that asks its seller still asks, as before. */
    const asks = await order("dco_s1_admin", [{ key: "vip", quantity: 1 }]);
    expect(asks).toMatchObject({ state: "PENDING_SELLER", waitingOn: "SELLER" });
    env.DEAL_CHAT = true;
  });

  it("switch on: the order is IN_CHAT — no seller step, nothing to pay, the sponsor calls it off in the chat", async () => {
    const o = await order("dco_s1_admin", [{ key: "vip", quantity: 1 }]);
    expect(o).toMatchObject({ state: "IN_CHAT", waitingOn: "DEAL_CHAT", sellerApprovals: [], contractedAt: null });
    expect(new Date(o.deadlineAt).toISOString()).toBe(signingDeadline(new Date(o.createdAt), env.DEAL_CHAT_SIGNING_WORKING_DAYS).deadline.toISOString());
    expect(await live(o.id)).toBeGreaterThan(0);
    const { team } = await chatsOf(o.id);
    expect(team).toBeTruthy();
    expect((await mails("dealChat.opened")).filter((m) => m.data.orderRef === ref(o.id)).map((m) => m.to).sort())
      .toEqual(["dco_mgr@dco-test.invalid", "dco_s1_admin@dco-test.invalid"]);
    /* The payment gate: the server refuses, whatever the button shows. */
    const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "dco_s1_admin");
    expect(pay.status).toBe(409);
    expect(pay.text).toMatch(/isn't signed by both sides yet/);
    const byHand = await call("POST", `/marketplace-orders/${o.id}/transition`, "dco_finance", transitionBody("PAID"));
    expect(byHand.status).toBe(409);
    expect(await prisma.paymentAttempt.count({ where: { orderId: o.id } })).toBe(0);
    const cancel = await call("POST", `/marketplace-orders/${o.id}/transition`, "dco_s1_admin", { to: "CANCELLED" });
    expect(cancel.status).toBe(409);
    expect(cancel.text).toMatch(/Call the deal off in the chat/);
    expect((await orderOf(o.id)).state).toBe("IN_CHAT");
  });

  it("the agreed amount becomes the price, spread across the seller's lines in proportion; fees again; payment opens", async () => {
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }, { key: "poster", quantity: 1 }]);
    const { team } = await chatsOf(o.id);
    const original = await agreeCards(team!, "dco_s1_admin", "dco_mgr");
    expect(original).toBe(110_000);
    /* The amount is locked once both match. */
    expect((await amount(team!, "dco_s1_admin", 132_000)).json.status.amount).toMatchObject({ sponsorCents: 132_000, sellerCents: null, agreed: false });
    const v = await amount(team!, "dco_mgr", 132_000);
    expect(v.json.status.amount).toMatchObject({ agreed: true, agreedCents: 132_000 });
    expect((await amount(team!, "dco_mgr", 140_000)).status).toBe(409);
    const formId = v.json.agreement.id as string;
    const form = (await call("GET", `/deal-agreements/${formId}`, "dco_s1_admin")).json;
    expect(form).toMatchObject({ amountCents: 132_000, originalAmountCents: 110_000 });
    expect(form.body).toContain("$1,320.00, agreed by both sides (the order's original amount was $1,100.00).");

    expect((await sign(formId, "dco_s1_admin")).status).toBe(200);
    expect((await call("POST", `/marketplace-orders/${o.id}/pay`, "dco_s1_admin")).status).toBe(409);
    expect((await sign(formId, "dco_mgr")).status).toBe(200);

    const after = await orderOf(o.id);
    const quote = sponsorQuote(132_000);
    expect(after).toMatchObject({ state: "AWAITING_PAYMENT", decidedBy: "system", subtotalCents: 132_000, feesCents: quote.feesCents, totalCents: quote.totalCents, requiresApproval: false });
    expect(after.contractedAt).not.toBeNull();
    const lines = Object.fromEntries((after.lines as Array<{ title: string; lineTotalCents: number }>).map((l) => [l.title, l.lineTotalCents]));
    expect(lines).toEqual({ "Courtside banner DCO": 120_000, "Concourse poster DCO": 12_000 });
    /* Fixed again from approval on. */
    await expect(prisma.marketplaceOrderLine.update({ where: { id: after.lines[0].id }, data: { lineTotalCents: 1 } })).rejects.toThrow(/never rewritten/);
    /* Payment opens. */
    const pay = await call("POST", `/marketplace-orders/${o.id}/pay`, "dco_s1_admin");
    expect(pay.status, pay.text).toBe(200);
    expect(await audits("marketplaceOrder.dealSigned", o.id)).toBe(1);
  });

  it("below the listed price, or above the sponsor's limit, waits for BTG with the reason", async () => {
    const low = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }]);
    const lowForm = await agree((await chatsOf(low.id)).team!, "dco_mgr", 90_000);
    await sign(lowForm, "dco_s1_admin");
    await sign(lowForm, "dco_mgr");
    const held = await orderOf(low.id);
    expect(held).toMatchObject({ state: "PENDING_APPROVAL", requiresApproval: true, waitingOn: "BTG", contractedAt: null, subtotalCents: 90_000 });
    expect(held.approvalReasons).toEqual(["$900.00 agreed with DCO Harbor Hawks is below the listed price of $1,000.00"]);
    expect((await mails("order.heldForBtg")).some((m) => m.data.orderRef === ref(low.id))).toBe(true);
    const ok = await call("POST", `/marketplace-orders/${low.id}/decision`, "dco_admin", { decision: "APPROVE" });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json).toMatchObject({ state: "AWAITING_PAYMENT", totalCents: sponsorQuote(90_000).totalCents });

    const high = await order("dco_s2_admin", [{ key: "banner", quantity: 1 }]);
    const chat = (await chatsOf(high.id, "dco_s2_admin")).team!;
    const v = (await call("GET", `/deal-chats/${chat}`, "dco_s2_admin")).json;
    for (const c of v.status.cards as Array<{ key: string; multi: boolean; answers: Array<{ value: string }> }>) {
      const value = c.multi ? [c.answers[0]!.value] : c.answers[0]!.value;
      await call("PUT", `/deal-chats/${chat}/picks/${c.key}`, "dco_s2_admin", { value });
      await call("PUT", `/deal-chats/${chat}/picks/${c.key}`, "dco_mgr", { value });
    }
    await amount(chat, "dco_s2_admin", 600_000);
    const formId = (await amount(chat, "dco_mgr", 600_000)).json.agreement.id;
    await sign(formId, "dco_s2_admin");
    await sign(formId, "dco_mgr");
    const over = await orderOf(high.id, "dco_s2_admin");
    expect(over.state).toBe("PENDING_APPROVAL");
    expect(over.approvalReasons).toEqual([`${sponsorQuote(600_000).totalCents === 600_000 ? "$6,000.00" : `$${(sponsorQuote(600_000).totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`} is above Quay Outfitters DCO's limit of $5,000.00`]);
  });

  it("two sellers: the order moves on only when both agreements are signed; one calling off ends it for both", async () => {
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }, { key: "clinic", quantity: 1 }]);
    const chats = await chatsOf(o.id);
    expect(Object.keys(chats).sort()).toEqual(["jo", "team"]);
    const teamForm = await agree(chats.team!, "dco_mgr");
    const joForm = await agree(chats.jo!, "dco_jo");
    await sign(teamForm, "dco_s1_admin");
    await sign(teamForm, "dco_mgr");
    expect((await orderOf(o.id)).state).toBe("IN_CHAT");
    await sign(joForm, "dco_s1_admin");
    await sign(joForm, "dco_jo");
    expect((await orderOf(o.id)).state).toBe("AWAITING_PAYMENT");

    const off = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }, { key: "clinic", quantity: 1 }]);
    const offChats = await chatsOf(off.id);
    expect((await call("POST", `/deal-chats/${offChats.jo}/call-off`, "dco_jo", { reason: "" })).status).toBe(400);
    const r = await call("POST", `/deal-chats/${offChats.jo}/call-off`, "dco_jo", { reason: "I'm injured and can't run the clinic." });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ state: "CLOSED", calledOff: { side: "SELLER", reason: "I'm injured and can't run the clinic." } });
    expect(await orderOf(off.id)).toMatchObject({ state: "CANCELLED", cancelReason: "CALLED_OFF" });
    expect(await live(off.id)).toBe(0);
    expect((await call("GET", `/deal-chats/${offChats.team}`, "dco_mgr")).json.state).toBe("CLOSED");
    const told = (await mails("dealChat.calledOff")).filter((m) => m.data.orderRef === ref(off.id));
    expect(told.map((m) => m.to).sort()).toEqual(["dco_mgr@dco-test.invalid", "dco_s1_admin@dco-test.invalid"]);
    expect(told[0]!.data.reason).toBe("I'm injured and can't run the clinic.");
    /* Ended: read-only, and calling off again is refused. */
    expect((await call("POST", `/deal-chats/${offChats.team}/call-off`, "dco_s1_admin", { reason: "again" })).status).toBe(409);
    expect(await audits("dealChat.callOff", offChats.jo!)).toBe(1);
  });

  it("for a minor only the guardian confirms the amount, signs or calls the deal off", async () => {
    const o = await order("dco_s1_admin", [{ key: "kid", quantity: 1 }]);
    const { kid } = await chatsOf(o.id);
    await agreeCards(kid!, "dco_s1_admin", "dco_kid");
    expect((await amount(kid!, "dco_s1_admin", 20_000)).status).toBe(200);
    expect((await amount(kid!, "dco_kid", 20_000)).status).toBe(403);
    expect((await call("POST", `/deal-chats/${kid}/call-off`, "dco_kid", { reason: "No" })).status).toBe(403);
    const g = await amount(kid!, "dco_guardian", 20_000, KID);
    expect(g.status, g.text).toBe(200);
    const formId = g.json.agreement.id as string;
    expect((await sign(formId, "dco_kid")).status).toBe(403);
    await sign(formId, "dco_s1_admin");
    expect((await sign(formId, "dco_guardian", KID)).status).toBe(200);
    expect((await orderOf(o.id)).state).toBe("AWAITING_PAYMENT");
    const audit = await prisma.auditLog.findFirst({ where: { action: "dealChat.amount", entityId: kid!, actorId: "dco_guardian" }, select: { after: true } });
    expect(audit?.after).toMatchObject({ actingForAthleteId: "dco_ath_kid" });
  });

  it("only the order's parties: another sponsor, another seller and a non-party role are refused; BTG reads only", async () => {
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }]);
    const { team } = await chatsOf(o.id);
    for (const who of ["dco_s2_admin", "dco_jo", "dco_finance", "dco_sales"]) {
      expect((await call("GET", `/deal-chats/${team}`, who)).status, who).toBe(403);
      expect((await amount(team!, who, 100_000)).status, who).toBe(403);
      expect((await call("POST", `/deal-chats/${team}/call-off`, who, { reason: "x" })).status, who).toBe(403);
    }
    expect((await call("GET", `/deal-chats/${team}`, "dco_admin")).status).toBe(200);
    expect((await amount(team!, "dco_admin", 100_000)).status).toBe(403);
    expect((await call("POST", `/deal-chats/${team}/call-off`, "dco_admin", { reason: "x" })).status).toBe(403);
    /* The sponsor's analyst reads, but neither confirms nor calls off. */
    expect((await call("GET", `/deal-chats/${team}`, "dco_s1_analyst")).status).toBe(200);
    expect((await amount(team!, "dco_s1_analyst", 100_000)).status).toBe(403);
    expect((await orderOf(o.id)).state).toBe("IN_CHAT");
  });

  it("at once: two accepts settle one exchange, two amount confirmations post one form, two signatures approve the order once", async () => {
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }]);
    const { team } = await chatsOf(o.id);
    const offer = await call("POST", `/deal-chats/${team}/offers`, "dco_mgr", { text: "We hang it a day early at no charge." });
    const x = offer.json.exchanges[0];
    const accepts = await Promise.all([
      call("POST", `/deal-chats/${team}/exchanges/${x.id}/accept`, "dco_s1_admin", { messageId: x.latestMessageId }),
      call("POST", `/deal-chats/${team}/exchanges/${x.id}/accept`, "dco_mgr", { messageId: x.latestMessageId }),
    ]);
    expect(accepts.map((r) => r.status)).toEqual([200, 200]);
    expect((await prisma.dealChatExchange.findUniqueOrThrow({ where: { id: x.id }, select: { state: true } })).state).toBe("AGREED");
    expect(await audits("dealChat.accept", x.id)).toBe(2);

    await agreeCards(team!, "dco_s1_admin", "dco_mgr");
    const both = await Promise.all([amount(team!, "dco_s1_admin", 100_000), amount(team!, "dco_mgr", 100_000)]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.dealAgreement.count({ where: { orderId: o.id } })).toBe(1);
    const formId = (await prisma.dealAgreement.findFirstOrThrow({ where: { orderId: o.id }, select: { id: true } })).id;
    const [a, b] = await Promise.all([
      call("GET", `/deal-agreements/${formId}`, "dco_s1_admin"), call("GET", `/deal-agreements/${formId}`, "dco_mgr"),
    ]);
    const signs = await Promise.all([
      call("POST", `/deal-agreements/${formId}/sign`, "dco_s1_admin", { bodyHashShown: a.json.bodyHash }),
      call("POST", `/deal-agreements/${formId}/sign`, "dco_mgr", { bodyHashShown: b.json.bodyHash }),
    ]);
    expect(signs.map((r) => r.status)).toEqual([200, 200]);
    expect((await orderOf(o.id)).state).toBe("AWAITING_PAYMENT");
    expect(await audits("marketplaceOrder.approve", o.id)).toBe(1);

    /* Two sellers' last signatures landing together: approved once. */
    const two = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }, { key: "clinic", quantity: 1 }]);
    const chats = await chatsOf(two.id);
    const tf = await agree(chats.team!, "dco_mgr");
    const jf = await agree(chats.jo!, "dco_jo");
    await sign(tf, "dco_s1_admin");
    await sign(jf, "dco_s1_admin");
    const last = await Promise.all([sign(tf, "dco_mgr"), sign(jf, "dco_jo")]);
    expect(last.map((r) => r.status)).toEqual([200, 200]);
    expect((await orderOf(two.id)).state).toBe("AWAITING_PAYMENT");
    expect(await audits("marketplaceOrder.approve", two.id)).toBe(1);
    expect(await audits("marketplaceOrder.dealSigned", two.id)).toBe(1);
  });

  it("not signed by both in 10 working days: a last warning 2 working days before, then cancelled and both sides told", async () => {
    const o = await order("dco_s1_admin", [{ key: "banner", quantity: 1 }]);
    const { team } = await chatsOf(o.id);
    const placed = (await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: o.id }, select: { createdAt: true } })).createdAt;
    const { deadline, warnAt } = signingDeadline(placed, env.DEAL_CHAT_SIGNING_WORKING_DAYS);
    const tenantIds = await tenantsInPlay();
    const sweep = (now: Date) => sweepDealChats(now, { tenantIds });
    const mine = async (template: string) => (await mails(template)).filter((m) => m.data.orderRef === ref(o.id));

    await sweep(new Date(warnAt.getTime() - 60_000));
    expect(await mine("dealChat.lastWarning")).toHaveLength(0);
    await sweep(warnAt);
    const warned = await mine("dealChat.lastWarning");
    expect(warned.map((m) => m.to).sort()).toEqual(["dco_mgr@dco-test.invalid", "dco_s1_admin@dco-test.invalid"]);
    expect(warned[0]!.data.deadline).toBe(deadline.toISOString().slice(0, 10));
    await sweep(new Date(warnAt.getTime() + 3_600_000));
    expect(await mine("dealChat.lastWarning")).toHaveLength(2);
    expect((await orderOf(o.id)).state).toBe("IN_CHAT");

    await sweep(deadline);
    expect(await orderOf(o.id)).toMatchObject({ state: "CANCELLED", cancelReason: "NOT_SIGNED" });
    expect(await live(o.id)).toBe(0);
    expect((await mine("dealChat.expired")).map((m) => m.to).sort()).toEqual(["dco_mgr@dco-test.invalid", "dco_s1_admin@dco-test.invalid"]);
    expect((await call("GET", `/deal-chats/${team}`, "dco_mgr")).json.state).toBe("CLOSED");
  });
});
