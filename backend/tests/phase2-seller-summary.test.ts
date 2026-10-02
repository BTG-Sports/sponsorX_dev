import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The athlete portal home's marketplace reads, against the real API and
   database — 2S2-FE-01 and 2S3-FE-03.

     GET /sales/summary         the seller's own items, listings by state,
                                lines and units sold / awaiting payment,
                                orders waiting for their answer, and the
                                next sold lines with dates ahead — counted
                                in Postgres, own rows only; 403 to anyone
                                who sells nothing.
     GET /payouts/me  byState   every payout by state, counted in Postgres —
                                not over the 50 the list carries (and
                                paidOutCents with it).
     GET /marketplace-orders/:id  each line names its seller: the team, or
                                the independent athlete (2S3-FE-03).

   The cast: Harbor Coffee (SS) buys from Jordan Reed SS (an independent
   athlete) and from the Westfield Hawks SS (Riley Cole SS's clinic, a
   roster athlete's item the team sells). The Lakeside Lions SS sell nothing.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ss-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("the seller's summary, payouts by state and order-line sellers", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment } = await import("../src/domain/payouts");

  const T = "ss_btg";
  const E = { hawks: "", lionsTenant: "", riley: "", jordanListing: "", askListing: "", hawksListing: "", order1: "", order2: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const DAY = 86_400_000;

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * DAY).toISOString();
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const adminActor = { userId: "ss_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'ss\\_%@ss-test.invalid' AND "tenantId" <> $1`, T,
    );
    return [T, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 8; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function approveTeam(id: string, name: string, manager: string) {
    await prisma.propertyOnboarding.create({ data: {
      id, tenantId: T, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: `${manager}@ss-test.invalid`, phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }

  async function item(seller: string, body: Record<string, unknown>) {
    const r = await call("POST", "/inventory", seller, { kind: "CAMP", priceCents: 30_000, quantity: 20, ...body });
    expect(r.status, r.text).toBe(201);
    return r.json.id as string;
  }
  async function listing(seller: string, inventoryItemId: string, title: string, submit = true) {
    const l = await call("POST", "/listings", seller, { inventoryItemId, title, description: "A 90-minute session at your venue, for up to 20 kids." });
    expect(l.status, l.text).toBe(201);
    if (submit) expect((await call("POST", `/listings/${l.json.id}/submit`, seller)).json.state).toBe("PUBLISHED");
    return l.json.id as string;
  }

  async function order(lines: { listingId: string; quantity: number; startsOn: string; endsOn: string }[]) {
    await call("POST", "/cart", "ss_buyer");
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", "ss_buyer", l);
      expect(r.status, r.text).toBe(201);
    }
    const cart = await call("GET", "/cart", "ss_buyer");
    const hold = (await call("POST", "/cart/reserve", "ss_buyer")).json;
    const placed = await call("POST", "/marketplace-orders", "ss_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    expect(placed.status, placed.text).toBe(201);
    if (placed.json.state === "PENDING_APPROVAL") {
      expect((await call("POST", `/marketplace-orders/${placed.json.id}/decision`, "ss_admin", { decision: "APPROVE" })).json.state).toBe("APPROVED");
    }
    return { id: placed.json.id as string, cart: cart.json.cart };
  }
  async function payFor(orderId: string) {
    const link = await call("POST", `/marketplace-orders/${orderId}/pay`, "ss_buyer");
    expect(link.status, link.text).toBe(200);
    await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(link.json.url), outcome: "SUCCEED" });
    const attempt = (await call("GET", `/marketplace-orders/${orderId}/payment`, "ss_buyer")).json.latest;
    expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
  }

  let firstCart: { lines: Array<{ title: string; propertyName: string | null; sellerName: string | null }> } = { lines: [] };

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Seller Summary BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.create({ data: { id: "ss_harbor", tenantId: T, name: "Harbor Coffee SS", categories: ["RESTAURANT"] } });
    await prisma.athlete.create({ data: {
      id: "ss_ath_jordan", tenantId: T, slug: "ss-jordan", legalName: "Jordan Reed SS", displayName: "JORDAN.REED.SS", email: "ss_jordan@ss-test.invalid",
      sport: "Basketball", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "ss_admin", tenantId: T, clerkId: "ss_admin", email: "ss_admin@ss-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ss_buyer", tenantId: T, clerkId: "ss_buyer", email: "ss_buyer@ss-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "ss_harbor" },
      { id: "ss_jordan", tenantId: T, clerkId: "ss_jordan", email: "ss_jordan@ss-test.invalid", roles: ["ATHLETE"], athleteId: "ss_ath_jordan" },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `ss_${kind}`, tenantId: T, ruleKey: `ss_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });

    const hawks = await approveTeam("ss_onb_hawks", "Westfield Hawks SS", "ss_mgr");
    const lions = await approveTeam("ss_onb_lions", "Lakeside Lions SS", "ss_mgr2");
    Object.assign(E, { hawks: hawks.id, lionsTenant: lions.tenantId });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "ss_mgr");
    await call("GET", "/me", "ss_mgr2");

    const riley = await call("POST", "/team/roster", "ss_mgr", { legalName: "Riley Cole SS", displayName: "RILEY.COLE.SS", email: "ss_riley@ss-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    E.hawksListing = await listing("ss_mgr", await item("ss_riley", { title: "Basketball clinic SS", priceCents: 50_000 }), "Youth clinic with Riley Cole SS");

    /* Jordan: one live, one asking to approve each order, one draft, one held for BTG, and one item never listed (inactive). */
    E.jordanListing = await listing("ss_jordan", await item("ss_jordan", { title: "Shooting session SS" }), "Shooting session with Jordan Reed SS");
    E.askListing = await listing("ss_jordan", await item("ss_jordan", { title: "Private workout SS", packageRules: { requiresApproval: true } }), "Private workout with Jordan Reed SS");
    await listing("ss_jordan", await item("ss_jordan", { title: "Autograph session SS", kind: "AUTOGRAPH" }), "Autograph session SS", false);
    const held = await listing("ss_jordan", await item("ss_jordan", { title: "Camp day SS" }), "Camp day SS", false);
    await prisma.listing.update({ where: { id: held }, data: { state: "PENDING_APPROVAL" } });
    const idle = await item("ss_jordan", { title: "Old item SS" });
    await prisma.inventoryItem.update({ where: { id: idle }, data: { active: false } });

    /* Order 1: Jordan 2 units (12 days out) and the Hawks 3 units (20 days out); approved, not yet paid. */
    const o1 = await order([
      { listingId: E.jordanListing, quantity: 2, startsOn: at(12), endsOn: at(13) },
      { listingId: E.hawksListing, quantity: 3, startsOn: at(20), endsOn: at(22) },
    ]);
    E.order1 = o1.id;
    firstCart = o1.cart;
    /* Order 2: asks Jordan first — waiting for his answer. */
    E.order2 = (await order([{ listingId: E.askListing, quantity: 1, startsOn: at(30), endsOn: at(30) }])).id;

    /* Jordan's payouts: 52 paid (more than the 50 the list carries) and one requested. */
    await prisma.payout.createMany({ data: [
      ...Array.from({ length: 52 }, (_, i) => ({
        tenantId: T, payeeType: "ATHLETE", payeeId: "ss_ath_jordan", payeeTenantId: T, amountCents: 100, state: "PAID",
        requestedAt: new Date(Date.now() - (60 - i) * DAY), paidAt: new Date(Date.now() - (59 - i) * DAY),
      })),
      { tenantId: T, payeeType: "ATHLETE", payeeId: "ss_ath_jordan", payeeTenantId: T, amountCents: 700, state: "REQUESTED" },
    ] });
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S2-FE-01 · GET /sales/summary", () => {
    it("an independent athlete: their items, listings by state, the sale awaiting payment, the next line and the order waiting on them", async () => {
      const r = await call("GET", "/sales/summary", "ss_jordan");
      expect(r.status, r.text).toBe(200);
      expect(r.json).toMatchObject({
        items: { total: 5, active: 4 },
        listings: { live: 2, held: 1, draft: 1, paused: 0, ended: 0, total: 4 },
        sold: { lines: 0, units: 0 },
        awaitingPayment: { lines: 1, units: 2 },
        approvalsWaiting: 1,
        upcoming: { total: 1 },
      });
      expect(r.json.upcoming.lines).toEqual([expect.objectContaining({
        orderId: E.order1, ref: `SX-${E.order1.slice(-8).toUpperCase()}`, state: "UNPAID", sponsorName: "Harbor Coffee SS",
        title: "Shooting session with Jordan Reed SS", quantity: 2, startsOn: at(12).slice(0, 10),
      })]);
      /* Never the team's line, never money. */
      expect(r.text).not.toContain("Riley");
      expect(r.text).not.toMatch(/Cents/);
    });

    it("once paid, the line counts as sold — units included — and stays upcoming until its dates pass", async () => {
      await payFor(E.order1);
      const r = await call("GET", "/sales/summary", "ss_jordan");
      expect(r.json).toMatchObject({ sold: { lines: 1, units: 2 }, awaitingPayment: { lines: 0, units: 0 }, upcoming: { total: 1 } });
      expect(r.json.upcoming.lines[0]).toMatchObject({ state: "IN_DELIVERY" });
    });

    it("the team and its roster athlete each count the team's sale; another team counts nothing", async () => {
      const team = await call("GET", "/sales/summary", "ss_mgr");
      expect(team.status, team.text).toBe(200);
      expect(team.json).toMatchObject({ items: { total: 1 }, listings: { live: 1, total: 1 }, sold: { lines: 1, units: 3 }, approvalsWaiting: 0, upcoming: { total: 1 } });
      expect(team.text).not.toContain("Jordan");
      const riley = await call("GET", "/sales/summary", "ss_riley");
      expect(riley.json).toMatchObject({ items: { total: 1 }, listings: { live: 1 }, sold: { lines: 1, units: 3 } });
      const lions = await call("GET", "/sales/summary", "ss_mgr2");
      expect(lions.json).toMatchObject({ items: { total: 0 }, listings: { total: 0 }, sold: { lines: 0, units: 0 }, upcoming: { total: 0, lines: [] } });
    });

    it("anyone who sells nothing is refused", async () => {
      for (const who of ["ss_buyer", "ss_admin"]) expect((await call("GET", "/sales/summary", who)).status, who).toBe(403);
      expect((await call("GET", "/sales/summary")).status).toBe(401);
    });
  });

  describe("2S2-FE-01 · GET /payouts/me counts every payout by state", () => {
    it("52 paid and 1 requested — counted in Postgres, though the list carries 50", async () => {
      const r = await call("GET", "/payouts/me", "ss_jordan");
      expect(r.status, r.text).toBe(200);
      expect(r.json.payouts).toHaveLength(50);
      expect(r.json.byState).toEqual({
        REQUESTED: { count: 1, amountCents: 700 }, APPROVED: { count: 0, amountCents: 0 }, SENDING: { count: 0, amountCents: 0 },
        PAID: { count: 52, amountCents: 5200 }, REJECTED: { count: 0, amountCents: 0 }, FAILED: { count: 0, amountCents: 0 },
      });
      expect(r.json.totals.paidOutCents).toBe(5200);
      /* Another payee's are never in it. */
      expect((await call("GET", "/payouts/me", "ss_riley")).json.byState.PAID).toEqual({ count: 0, amountCents: 0 });
    });
  });

  describe("2S3-FE-03 · the sponsor reads who sells each line", () => {
    it("the cart names an athlete seller with no property; the order names each line's seller", async () => {
      const jordanLine = firstCart.lines.find((l) => l.title.includes("Jordan"))!;
      expect(jordanLine).toMatchObject({ propertyName: null, sellerName: "JORDAN.REED.SS" });
      expect(firstCart.lines.find((l) => l.title.includes("Riley"))).toMatchObject({ propertyName: "Westfield Hawks SS", sellerName: "Westfield Hawks SS" });

      const o = await call("GET", `/marketplace-orders/${E.order1}`, "ss_buyer");
      expect(o.status, o.text).toBe(200);
      const by = (listingId: string) => o.json.lines.find((l: { listingId: string }) => l.listingId === listingId);
      expect(by(E.jordanListing)).toMatchObject({ propertyId: null, sellerAthleteId: "ss_ath_jordan", seller: { type: "ATHLETE", id: "ss_ath_jordan", name: "JORDAN.REED.SS" } });
      expect(by(E.hawksListing)).toMatchObject({ propertyId: E.hawks, seller: { type: "PROPERTY", id: E.hawks, name: "Westfield Hawks SS" } });
      /* BTG's queue reads the same view. */
      const btg = await call("GET", `/marketplace-orders/${E.order2}`, "ss_admin");
      expect(btg.json.lines[0].seller).toMatchObject({ type: "ATHLETE", name: "JORDAN.REED.SS" });
    });
  });
});
