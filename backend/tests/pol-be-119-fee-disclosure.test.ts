import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-119 — the marketplace side, against the real API and database.

   The partnership agreement: "Before campaign acceptance, disclose the
   applicable transaction fee, fee payer and processing costs in writing. If a
   fee applies, identify it in the signed campaign order. Any change requires
   written acceptance before it applies to that order."

     - the sponsor's checkout carries the statement; placing checks its hash;
     - the order's rates are frozen at placement — a rule revised before BTG's
       approval never reaches it, and the ledger books what was disclosed;
     - a seller accepts the order's statement; an order whose rates differ
       from those the seller accepted for the listing asks the seller first;
     - a listing submitted with its statement is not asked again.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@lg-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-119 · fee statements on the marketplace", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const env = (await import("../src/config/env")).env as unknown as { FEE_STATEMENT_REQUIRED: boolean };

  const T = "fd_btg";
  const L: Record<string, string> = {};
  const E = { tenant: "", property: "" };
  const RULES: Record<string, string> = {};
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  let orderId = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const admin = (id: string, tenantId: string) => ({ userId: id, tenantId, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null });
  const OTHER_HASH = `sha256:${"0".repeat(64)}`;

  async function clean() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'fd\\_%@lg-test.invalid' AND "tenantId" <> $1`, T,
    );
    const ids = [T, ...outside.map((r) => r.id)];
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
  async function approveTeam() {
    await prisma.propertyOnboarding.create({ data: {
      id: "fd_onb_e", tenantId: T, orgType: "TEAM", orgName: "Bowie Bulldogs FD", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: "fd_mgr_e@lg-test.invalid", role: "GM", primary: true }],
      details: { legalEntityName: "Bowie Bulldogs FD LLC", league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(admin("fd_admin", T), "fd_onb_e", "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }
  async function draftListing(key: string, item: Record<string, unknown>) {
    const itemId = (await call("POST", "/inventory", "fd_mgr_e", item)).json.id;
    L[key] = (await call("POST", "/listings", "fd_mgr_e", { inventoryItemId: itemId, title: `${item.title}`, description: "A description long enough for governance." })).json.id;
  }
  async function checkout(key: string, day: number) {
    await call("POST", "/cart", "fd_s1_admin");
    expect((await call("POST", "/cart/lines", "fd_s1_admin", { listingId: L[key], quantity: 1, startsOn: at(day), endsOn: at(day) })).status).toBe(201);
    const hold = (await call("POST", "/cart/reserve", "fd_s1_admin")).json;
    const read = (await call("GET", `/reservations/${hold.id}`, "fd_s1_admin")).json;
    return { holdId: hold.id as string, checkout: read.checkout };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Fee disclosure BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.create({ data: { id: "fd_s1", tenantId: T, name: "Harbor Apparel FD", categories: ["APPAREL"] } });
    await prisma.user.createMany({ data: [
      { id: "fd_admin", tenantId: T, clerkId: "fd_admin", email: "fd_admin@lg-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "fd_s1_admin", tenantId: T, clerkId: "fd_s1_admin", email: "fd_s1_admin@lg-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "fd_s1" },
    ] });
    Object.assign(E, await approveTeam().then((p) => ({ tenant: p.tenantId, property: p.id })));
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    /* Submitted before any commission rule exists, and before the switch: accepted, not shown. */
    await draftListing("banner", { title: "Courtside banner", kind: "SIGNAGE", priceCents: 120_000, quantity: 5 });
    expect((await call("POST", `/listings/${L.banner}/submit`, "fd_mgr_e")).json.state).toBe("PUBLISHED");
    for (const body of [
      { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 1500, priority: 0 },
      { kind: "PROCESSING", scope: "GLOBAL", bps: 290, fixedCents: 30, priority: 0 },
      { kind: "RESERVE", scope: "GLOBAL", bps: 1000, priority: 0 },
    ]) {
      const r = await call("POST", "/commission-rules", "fd_admin", body);
      expect(r.status, r.text).toBe(201);
      RULES[body.kind] = r.json.id;
    }
  });

  afterAll(async () => {
    env.FEE_STATEMENT_REQUIRED = false;
    server?.close();
    await clean();
  });

  it("the listing's acceptance was recorded, not shown, before the switch", async () => {
    const row = await prisma.listing.findUniqueOrThrow({ where: { id: L.banner }, select: { feeAcceptance: true } });
    expect(row.feeAcceptance).toMatchObject({ record: { shown: false, statement: { audience: "SELLER", context: "LISTING" } } });
  });

  it("checkout shows the sponsor's statement; placing with another is refused, without one too once required", async () => {
    const { holdId, checkout: c } = await checkout("banner", 10);
    expect(c.feeStatement).toMatchObject({
      audience: "SPONSOR", context: "MARKETPLACE_ORDER", fees: [], youPayCents: 120_000,
      processing: { rateBps: 290, fixedCents: 30, amountCents: 3_510, payer: "SELLER" },
    });
    expect(c.feeStatement.text).toContain("Processing cost: 2.9% + 30¢ per order — $35.10, paid by the seller, out of the sale. Nothing is added for you.");
    expect(c.feeStatementHash).toMatch(/^sha256:[0-9a-f]{64}$/);

    const wrong = await call("POST", "/marketplace-orders", "fd_s1_admin", { ...placeOrderBody(holdId, `${T}_order_terms`), feeStatementHash: OTHER_HASH });
    expect(wrong.status).toBe(409);
    expect(wrong.json.error).toMatchObject({ code: "fee_statement_changed", feeStatementHash: c.feeStatementHash, feeStatement: { audience: "SPONSOR" } });

    env.FEE_STATEMENT_REQUIRED = true;
    const none = await call("POST", "/marketplace-orders", "fd_s1_admin", placeOrderBody(holdId, `${T}_order_terms`));
    expect(none.status).toBe(409);
    expect(none.json.error.code).toBe("fee_statement_required");

    const ok = await call("POST", "/marketplace-orders", "fd_s1_admin", { ...placeOrderBody(holdId, `${T}_order_terms`), feeStatementHash: c.feeStatementHash });
    expect(ok.status, ok.text).toBe(201);
    orderId = ok.json.id;
    /* The banner's seller accepted its listing with no rules in force: these rates differ, so the seller is asked. */
    expect(ok.json.state).toBe("PENDING_SELLER");
    const row = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, select: { feeTerms: true, lines: { select: { id: true } } } });
    const terms = row.feeTerms as { sponsor: { hash: string; shown: boolean }; lines: Record<string, { rules: { PLATFORM_FEE: { bps: number } } }>; processing: { bps: number } };
    expect(terms.sponsor).toMatchObject({ hash: c.feeStatementHash, shown: true });
    expect(Object.keys(terms.lines)).toEqual(row.lines.map((l) => l.id));
    expect(terms.lines[row.lines[0]!.id]!.rules.PLATFORM_FEE.bps).toBe(1500);
    const placed = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "marketplaceOrder.place", entityId: orderId }, select: { after: true } });
    expect(placed.after).toMatchObject({ feeStatement: { hash: c.feeStatementHash, shown: true }, feeAsks: ["Courtside banner"] });
  });

  it("the fee terms can't be rewritten once frozen", async () => {
    await expect(prisma.marketplaceOrder.update({ where: { id: orderId }, data: { feeTerms: { v: 1 } } })).rejects.toThrow(/fee terms are fixed once disclosed/);
  });

  it("a rule revised after placement never reaches the order: the seller is shown, accepts and is booked at the frozen rate", async () => {
    const revised = await call("POST", `/commission-rules/${RULES.PLATFORM_FEE}/revise`, "fd_admin", { bps: 2000 });
    expect(revised.status, revised.text).toBeLessThan(300);

    const list = (await call("GET", "/seller-approvals", "fd_mgr_e")).json.approvals as Array<{ id: string; canAnswer: boolean; feeStatement: { audience: string; text: string[]; fees: Array<{ kind: string; amountCents: number; payer: string }>; youReceiveCents: number; reserveCents: number }; feeStatementHash: string }>;
    const mine = list.find((a) => a.canAnswer)!;
    expect(mine.feeStatement.audience).toBe("SELLER");
    expect(mine.feeStatement.fees).toEqual([expect.objectContaining({ kind: "PLATFORM_FEE", amountCents: 18_000, payer: "SELLER" })]);
    /* 120,000 − 18,000 − 3,510 = 98,490; reserve 10% = 9,849; available 88,641. */
    expect(mine.feeStatement).toMatchObject({ reserveCents: 9_849, youReceiveCents: 88_641 });
    expect(mine.feeStatement.text).toContain("Platform fee: 15% — $180.00, paid by you, out of the sale.");

    const none = await call("POST", `/seller-approvals/${mine.id}/decision`, "fd_mgr_e", { decision: "ACCEPT" });
    expect(none.status).toBe(409);
    expect(none.json.error.code).toBe("fee_statement_required");
    const ok = await call("POST", `/seller-approvals/${mine.id}/decision`, "fd_mgr_e", { decision: "ACCEPT", feeStatementHash: mine.feeStatementHash });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.feeStatementHash).toBe(mine.feeStatementHash);
    expect((await prisma.orderSellerApproval.findUniqueOrThrow({ where: { id: mine.id }, select: { feeStatement: true } })).feeStatement).toMatchObject({ shown: true, hash: mine.feeStatementHash });

    const fin = await prisma.orderLineFinancials.findMany({ where: { orderId }, select: { platformFeeCents: true, processingCents: true, reserveCents: true, availableCents: true } });
    expect(fin).toEqual([{ platformFeeCents: 18_000, processingCents: 3_510, reserveCents: 9_849, availableCents: 88_641 }]);
  });

  it("a listing is submitted with its own statement; refused without it; its orders then go ahead without asking", async () => {
    await draftListing("sticker", { title: "Team sticker pack", kind: "OTHER", priceCents: 5_000, quantity: 100 });
    const read = (await call("GET", `/listings/${L.sticker}`, "fd_mgr_e")).json;
    /* Today's rates: the revised 20% platform fee. */
    expect(read.feeStatement).toMatchObject({ audience: "SELLER", context: "LISTING" });
    expect(read.feeStatement.text).toContain("Platform fee: 20% — $10.00, paid by you, out of the sale.");
    expect(read.feeAccepted).toBeNull();
    /* A sponsor browsing the listing isn't shown the seller's fees. */
    expect((await call("GET", `/listings/${L.sticker}`, "fd_s1_admin")).json.feeStatement).toBeUndefined();

    const none = await call("POST", `/listings/${L.sticker}/submit`, "fd_mgr_e", {});
    expect(none.status).toBe(409);
    expect(none.json.error.code).toBe("fee_statement_required");
    const ok = await call("POST", `/listings/${L.sticker}/submit`, "fd_mgr_e", { feeStatementHash: read.feeStatementHash });
    expect(ok.status, ok.text).toBe(200);
    expect(ok.json.state).toBe("PUBLISHED");

    /* A live listing re-accepts its fees without pausing (the banner, submitted before any rule). */
    const banner = (await call("GET", `/listings/${L.banner}`, "fd_mgr_e")).json;
    expect((await call("POST", `/listings/${L.banner}/accept-fees`, "fd_mgr_e", { feeStatementHash: OTHER_HASH })).status).toBe(409);
    expect((await call("POST", `/listings/${L.banner}/accept-fees`, "fd_s1_admin", { feeStatementHash: banner.feeStatementHash })).status).toBe(403);
    const reaccepted = await call("POST", `/listings/${L.banner}/accept-fees`, "fd_mgr_e", { feeStatementHash: banner.feeStatementHash });
    expect(reaccepted.status, reaccepted.text).toBe(200);
    expect((await call("GET", `/listings/${L.banner}`, "fd_mgr_e")).json.feeAccepted).toMatchObject({ hash: banner.feeStatementHash });

    const { holdId, checkout: c } = await checkout("sticker", 12);
    const placed = await call("POST", "/marketplace-orders", "fd_s1_admin", { ...placeOrderBody(holdId, `${T}_order_terms`), feeStatementHash: c.feeStatementHash });
    expect(placed.status, placed.text).toBe(201);
    expect(placed.json.state).not.toBe("PENDING_SELLER");

    const again = await checkout("banner", 14);
    const bannerOrder = await call("POST", "/marketplace-orders", "fd_s1_admin", { ...placeOrderBody(again.holdId, `${T}_order_terms`), feeStatementHash: again.checkout.feeStatementHash });
    expect(bannerOrder.status, bannerOrder.text).toBe(201);
    expect(bannerOrder.json.state).not.toBe("PENDING_SELLER");
  });
});
