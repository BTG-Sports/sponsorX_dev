import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Phase 2 batch 5, against the real API and database:

     2S3-BE-02  A package can be created, priced and purchased as a single line.
     2S4-BE-02  Reservations prevent overselling and expired reservations
                release inventory automatically.
     2S4-BE-03  Order states enforce correctly; an unapproved order cannot
                contract inventory.
     2S4-BE-05  An order requiring approval holds inventory without
                contracting it, and releases on rejection.
     2S7-INT-01 Zoho contains linked Account, Contact and Deal data for
                external marketplace transactions.

   The outside team is provisioned by BTG approving its onboarding; every
   listing is published by BTG's approval through the API. Zoho is the fake
   org every other sync test uses (tests/support/fake-zoho.ts).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@mo-test.invalid` } : null;
  },
}));

const { canTransitionMarketplaceOrder, approvalReasons } = await import("../src/domain/marketplace-order-rules");

describe("the order machine and the approval policy, as written (pure)", () => {
  it("names its illegal moves", () => {
    expect(canTransitionMarketplaceOrder("PENDING_APPROVAL", "AWAITING_PAYMENT")).toBe(false); // no payment before approval
    expect(canTransitionMarketplaceOrder("PAID", "CANCELLED")).toBe(false); // after payment, a refund
    expect(canTransitionMarketplaceOrder("PAID", "REFUNDED")).toBe(true);
    for (const to of ["APPROVED", "PAID", "CANCELLED", "REFUNDED"] as const) expect(canTransitionMarketplaceOrder("CLOSED", to)).toBe(false);
  });
  it("holds for approval at $1,000, a first order, or a listing that asks", () => {
    const base = { thresholdCents: 100_000, priorFulfilledOrders: 3, listingsAsking: [] as string[] };
    expect(approvalReasons({ ...base, totalCents: 99_999 })).toEqual([]);
    expect(approvalReasons({ ...base, totalCents: 100_000 })).toEqual([expect.stringMatching(/\$1000\.00/)]);
    expect(approvalReasons({ ...base, totalCents: 500, priorFulfilledOrders: 0 })).toEqual(["the sponsor's first marketplace order"]);
    expect(approvalReasons({ ...base, totalCents: 500, listingsAsking: ["VIP suite"] })).toEqual(['"VIP suite" asks for approval']);
  });
  it("the worker sweeps holds every minute and pushes contracted orders to Zoho", () => {
    const worker = readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8");
    expect(worker).toMatch(/holdTimer = setInterval\(\(\) => \{\s*void expireReservations\(prisma\)/);
    expect(worker).toMatch(/"zoho\.pushMarketplaceOrder",\s*async \(\[job\]\) =>\s*zohoLog\("zoho\.pushMarketplaceOrder", await handlePushMarketplaceOrder/);
  });
});

const seededDb = await import("./support/seeded-db");
/* 2S4-FE-02 — every order is placed through the contract gate. */
const { issueOrderTerms, ORDER_TERMS_HASH, TEST_BILLING } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("Phase 2 orders over the API", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { expireReservations } = await import("../src/domain/reservation");
  const { handlePushMarketplaceOrder } = await import("../worker/jobs/zoho-sync.mts");
  const { FakeZoho } = await import("./support/fake-zoho");

  const T = "mo_btg";
  const L: Record<string, string> = {};
  const I: Record<string, string> = {};
  const E = { tenant: "", property: "", manager: "", terms: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const call = async (method: string, path: string, clerk?: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { "content-type": "application/json", ...(clerk ? { "x-test-clerk": clerk } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
  const codes = (r: { json: { error?: { reasons?: Array<{ code: string }> } } | null }) => (r.json?.error?.reasons ?? []).map((x) => x.code);
  const live = (itemId: string) => prisma.inventoryCommitment.findMany({
    where: { inventoryItemId: itemId, releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { source: true, quantity: true, contracted: true },
  });

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'mo\\_%@mo-test.invalid' AND "tenantId" <> $1`, T,
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

  async function publish(key: string, item: Record<string, unknown>, owner = "mo_mgr") {
    const made = await call("POST", "/inventory", owner, item);
    expect(made.status, made.text).toBe(201);
    I[key] = made.json.id;
    L[key] = (await call("POST", "/listings", "mo_mgr", { inventoryItemId: I[key], title: `${item.title}`, description: "A description long enough for governance." })).json.id;
    await call("POST", `/listings/${L[key]}/submit`, "mo_mgr");
    expect((await call("POST", `/listings/${L[key]}/decision`, "mo_admin", { decision: "APPROVE" })).json.state).toBe("PUBLISHED");
  }
  /** A sponsor's cart with these lines, reserved. */
  async function held(sponsor: string, lines: Array<{ key: string; quantity: number; from?: number; to?: number }>) {
    await call("POST", "/cart", sponsor);
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", sponsor, { listingId: L[l.key], quantity: l.quantity, startsOn: at(l.from ?? 10), endsOn: at(l.to ?? 11) });
      expect(r.status, r.text).toBe(201);
    }
    const reserved = await call("POST", "/cart/reserve", sponsor);
    expect(reserved.status, reserved.text).toBe(201);
    return reserved.json as { id: string; expiresAt: string; state: string };
  }
  /* What checkout does (2S4-FE-02): read the live hold's terms and billing
     prefill, then place with the hash of the text shown and the contact confirmed. */
  const accepted = (reservationId: string, checkout: { terms: { id: string; bodyHash: string } | null; billingContact: { name: string; email: string } | null }) => ({
    reservationId, agreementId: checkout.terms!.id, bodyHashShown: checkout.terms!.bodyHash, billing: checkout.billingContact ?? TEST_BILLING,
  });
  const order = async (sponsor: string, lines: Parameters<typeof held>[1]) => {
    const hold = await held(sponsor, lines);
    const read = (await call("GET", `/reservations/${hold.id}`, sponsor)).json;
    expect(read.orderId).toBeNull();
    const r = await call("POST", "/marketplace-orders", sponsor, accepted(hold.id, read.checkout));
    expect(r.status, r.text).toBe(201);
    /* A converted hold names its order (2S4-FE-02). */
    expect((await call("GET", `/reservations/${hold.id}`, sponsor)).json).toMatchObject({ state: "CONVERTED", orderId: r.json.id });
    return r.json;
  };
  const walk = async (id: string, states: string[]) => {
    for (const to of states) expect((await call("POST", `/marketplace-orders/${id}/transition`, "mo_finance", { to })).json.state).toBe(to);
  };

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Orders BTG" } });
    E.terms = await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "mo_s1", tenantId: T, name: "Harbor Apparel", categories: ["APPAREL"] },
      { id: "mo_s2", tenantId: T, name: "Bay Outfitters", categories: ["APPAREL"] },
    ] });
    await prisma.sponsorContact.create({ data: { id: "mo_s1_contact", tenantId: T, sponsorId: "mo_s1", name: "Morgan Hale", email: "morgan@harbor.invalid", isPrimary: true } });
    await prisma.user.createMany({ data: [
      { id: "mo_admin", tenantId: T, clerkId: "mo_admin", email: "mo_admin@mo-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "mo_finance", tenantId: T, clerkId: "mo_finance", email: "mo_finance@mo-test.invalid", roles: ["FINANCE"] },
      { id: "mo_s1_admin", tenantId: T, clerkId: "mo_s1_admin", email: "mo_s1_admin@mo-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "mo_s1" },
      { id: "mo_s1_analyst", tenantId: T, clerkId: "mo_s1_analyst", email: "mo_s1_analyst@mo-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "mo_s1" },
      { id: "mo_s2_admin", tenantId: T, clerkId: "mo_s2_admin", email: "mo_s2_admin@mo-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "mo_s2" },
    ] });
    await prisma.propertyOnboarding.create({ data: {
      id: "mo_onb", tenantId: T, orgType: "TEAM", orgName: "Bowie Bulldogs", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: "mo_mgr@mo-test.invalid", phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: "Bowie Bulldogs LLC", league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "mo_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "mo_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    E.manager = (await call("GET", "/me", "mo_mgr")).json.userId;
    await call("POST", "/team/roster", "mo_mgr", { legalName: "Riley Chen", displayName: "RILEY", email: "mo_riley@mo-test.invalid", sport: "Basketball", ageBand: "18_PLUS" });
    await publish("poster", { title: "Arena poster — last one", kind: "SIGNAGE", priceCents: 40_000, quantity: 1 });
    await publish("sticker", { title: "Scoreboard shout-out", kind: "SIGNAGE", priceCents: 20_000, quantity: 100 });
    await publish("vip", { title: "VIP courtside", kind: "TICKETS", priceCents: 10_000, quantity: 10, packageRules: { requiresApproval: true } });
    await publish("clinic", { title: "Riley's clinic", kind: "CAMP", priceCents: 50_000, quantity: 5 }, "mo_riley");
    I.board = (await call("POST", "/inventory", "mo_mgr", { title: "Scoreboard ad", kind: "SIGNAGE", priceCents: 20_000, quantity: 10 })).json.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── 2S3-BE-02 ─────────────────────────────────────────────────────────── */
  describe("2S3-BE-02 · packages and bundles", () => {
    it("a package is created from the owner's items, priced as one, and refused when malformed", async () => {
      const made = await call("POST", "/inventory", "mo_mgr", {
        title: "Game-night package", kind: "PACKAGE", priceCents: 60_000, quantity: 3,
        components: [{ itemId: I.board, quantity: 2 }, { itemId: I.clinic, quantity: 1 }], // the team's own, and a roster athlete's
      });
      expect(made.status, made.text).toBe(201);
      expect(made.json).toMatchObject({ kind: "PACKAGE", priceCents: 60_000, quantity: 3 });
      expect(made.json.components.map((c: { quantity: number; component: { id: string } }) => [c.component.id, c.quantity]).sort())
        .toEqual([[I.board, 2], [I.clinic, 1]].sort());
      I.package = made.json.id;

      expect((await call("POST", "/inventory", "mo_mgr", { title: "Empty", kind: "PACKAGE", priceCents: 1_000 })).status).toBe(422);
      expect((await call("POST", "/inventory", "mo_mgr", { title: "Nested", kind: "PACKAGE", priceCents: 1_000, components: [{ itemId: I.package, quantity: 1 }] })).status).toBe(422);
      expect((await call("POST", "/inventory", "mo_mgr", { title: "Not a package", kind: "SIGNAGE", priceCents: 1_000, components: [{ itemId: I.board, quantity: 1 }] })).status).toBe(422);
      expect((await call("POST", "/inventory", "mo_riley", { title: "Not hers", kind: "PACKAGE", priceCents: 1_000, components: [{ itemId: I.board, quantity: 1 }] })).status).toBe(403);
      expect((await call("PATCH", `/inventory/${I.package}`, "mo_mgr", { components: [] })).status).toBe(422);
    });

    it("is listed and bought as a single line — and takes its parts with it", async () => {
      L.package = (await call("POST", "/listings", "mo_mgr", { inventoryItemId: I.package, title: "Game-night package", description: "Two scoreboard ads and Riley's clinic, one price." })).json.id;
      await call("POST", `/listings/${L.package}/submit`, "mo_mgr");
      await call("POST", `/listings/${L.package}/decision`, "mo_admin", { decision: "APPROVE" });
      expect((await call("GET", "/marketplace/search?kind=PACKAGE", "mo_s2_admin")).json.results.map((r: { id: string }) => r.id)).toEqual([L.package]);

      await call("POST", "/cart", "mo_s2_admin");
      const line = await call("POST", "/cart/lines", "mo_s2_admin", { listingId: L.package, quantity: 2, startsOn: at(20), endsOn: at(21) });
      expect(line.status).toBe(201);
      expect(line.json.lines).toEqual([expect.objectContaining({ listingId: L.package, quantity: 2, unitPriceCents: 60_000, lineTotalCents: 120_000 })]);
      const hold = (await call("POST", "/cart/reserve", "mo_s2_admin")).json;
      expect(hold.state).toBe("HELD");
      /* One line held the package and its parts: 2 packages, 4 scoreboard ads, 2 clinics. */
      expect((await live(I.package!)).map((c) => c.quantity)).toEqual([2]);
      expect((await live(I.board!)).map((c) => c.quantity)).toEqual([4]);
      expect((await live(I.clinic!)).map((c) => c.quantity)).toEqual([2]);
      /* So the parts cannot be sold twice: 3 clinics are left, not 5. */
      await call("POST", "/cart", "mo_s1_admin");
      const over = await call("POST", "/cart/lines", "mo_s1_admin", { listingId: L.clinic, quantity: 4, startsOn: at(20), endsOn: at(21) });
      expect(codes(over)).toEqual(["QUANTITY_OVERRUN"]);
      expect(over.text).toMatch(/3 left of 5/);
      /* And the package cannot be sold once a part has run out, though the package itself has stock. */
      await prisma.inventoryCommitment.create({ data: { tenantId: E.tenant, inventoryItemId: I.clinic!, quantity: 3, startsOn: new Date(at(1)), endsOn: new Date(at(2)), source: "RESERVATION", sourceId: "mo_other_hold" } });
      const short = await call("POST", "/cart/lines", "mo_s1_admin", { listingId: L.package, quantity: 1, startsOn: at(20), endsOn: at(21) });
      expect(codes(short)).toEqual(["QUANTITY_OVERRUN"]);
      expect(short.text).toMatch(/in the package, Riley's clinic: 0 left of 5/);
      await prisma.inventoryCommitment.updateMany({ where: { sourceId: "mo_other_hold" }, data: { releasedAt: new Date() } });
      await call("POST", `/reservations/${hold.id}/release`, "mo_s2_admin");
      await prisma.cart.updateMany({ where: { tenantId: T, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    });
  });

  /* ── 2S4-BE-02 ─────────────────────────────────────────────────────────── */
  describe("2S4-BE-02 · reservations", () => {
    it("a hold takes the stock for fifteen minutes, all or nothing, and freezes the cart", async () => {
      const hold = await held("mo_s1_admin", [{ key: "poster", quantity: 1 }, { key: "sticker", quantity: 3 }]);
      const minutes = (new Date(hold.expiresAt).getTime() - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(14);
      expect(minutes).toBeLessThanOrEqual(15);
      expect(await live(I.poster!)).toEqual([{ source: "RESERVATION", quantity: 1, contracted: false }]);
      /* The last poster is held: nobody else can buy it … */
      await call("POST", "/cart", "mo_s2_admin");
      expect(codes(await call("POST", "/cart/lines", "mo_s2_admin", { listingId: L.poster, quantity: 1, startsOn: at(10), endsOn: at(11) }))).toEqual(["QUANTITY_OVERRUN"]);
      /* … and the held cart cannot change under the hold. */
      expect((await call("POST", "/cart/lines", "mo_s1_admin", { listingId: L.vip, quantity: 1, startsOn: at(10), endsOn: at(11) })).status).toBe(409);
      /* Reserving again returns the same hold, not a second one. */
      expect((await call("POST", "/cart/reserve", "mo_s1_admin")).json.id).toBe(hold.id);
      /* The cart names its live hold (2S4-FE-01). */
      expect((await call("GET", "/cart", "mo_s1_admin")).json.cart.activeReservation).toEqual({ id: hold.id, expiresAt: hold.expiresAt });

      /* All or nothing: a cart with one line that cannot be held holds nothing. */
      await call("POST", "/cart/lines", "mo_s2_admin", { listingId: L.sticker, quantity: 1, startsOn: at(10), endsOn: at(11) });
      const stickersBefore = (await live(I.sticker!)).length;
      await prisma.cartLine.create({ data: { tenantId: T, cartId: (await prisma.cart.findFirstOrThrow({ where: { sponsorId: "mo_s2", state: "ACTIVE" }, select: { id: true } })).id, listingId: L.poster!, quantity: 1, startsOn: new Date(at(10)), endsOn: new Date(at(11)), unitPriceCents: 40_000 } });
      const refused = await call("POST", "/cart/reserve", "mo_s2_admin");
      expect(refused.status).toBe(409);
      expect(codes(refused)).toEqual(["QUANTITY_OVERRUN"]);
      expect((await live(I.sticker!)).length).toBe(stickersBefore);
      await call("POST", `/reservations/${hold.id}/release`, "mo_s1_admin");
      await prisma.cart.updateMany({ where: { tenantId: T, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    });

    it("prevents overselling when two sponsors reserve the last unit at the same instant", async () => {
      for (const s of ["mo_s1_admin", "mo_s2_admin"]) {
        await call("POST", "/cart", s);
        expect((await call("POST", "/cart/lines", s, { listingId: L.poster, quantity: 1, startsOn: at(10), endsOn: at(11) })).status).toBe(201);
      }
      const [a, b] = await Promise.all([call("POST", "/cart/reserve", "mo_s1_admin"), call("POST", "/cart/reserve", "mo_s2_admin")]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect((await live(I.poster!)).reduce((s, c) => s + c.quantity, 0)).toBe(1);
      const winner = a.status === 201 ? a.json : b.json;
      L.raceWinner = a.status === 201 ? "mo_s1_admin" : "mo_s2_admin";
      L.raceHold = winner.id;
    });

    it("an expired hold releases its stock automatically — at once, and the sweep records it", async () => {
      const loser = L.raceWinner === "mo_s1_admin" ? "mo_s2_admin" : "mo_s1_admin";
      /* Fifteen minutes pass. Nothing runs. */
      await prisma.reservation.update({ where: { id: L.raceHold }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await prisma.inventoryCommitment.updateMany({ where: { sourceId: { startsWith: `${L.raceHold}:` } }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(await live(I.poster!)).toEqual([]);
      expect((await call("GET", `/reservations/${L.raceHold}`, L.raceWinner)).json.state).toBe("EXPIRED");
      /* The other sponsor can have it now, before any sweep has run. */
      const theirs = await call("POST", "/cart/reserve", loser);
      expect(theirs.status, theirs.text).toBe(201);
      /* An expired hold cannot become an order. */
      expect((await call("POST", "/marketplace-orders", L.raceWinner, { reservationId: L.raceHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH, billing: TEST_BILLING })).status).toBe(409);
      /* The sweep marks it, releases its rows, and a second pass finds nothing. */
      expect((await expireReservations(prisma)).expired).toBeGreaterThanOrEqual(1);
      expect((await prisma.reservation.findUniqueOrThrow({ where: { id: L.raceHold }, select: { state: true } })).state).toBe("EXPIRED");
      expect(await prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: `${L.raceHold}:` }, releasedAt: null } })).toBe(0);
      expect((await expireReservations(prisma)).expired).toBe(0);
      await call("POST", `/reservations/${theirs.json.id}/release`, loser);
      expect(await live(I.poster!)).toEqual([]);
      await prisma.cart.updateMany({ where: { tenantId: T, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    });
  });

  /* ── 2S4-BE-03 / 2S4-BE-05 ─────────────────────────────────────────────── */
  let approvedId = "";

  describe("2S4-BE-03 / 2S4-BE-05 · the order, its machine and BTG's gate", () => {
    it("an order held for approval keeps its stock without contracting it — and rejection releases it", async () => {
      const o = await order("mo_s1_admin", [{ key: "poster", quantity: 1 }]);
      expect(o).toMatchObject({ state: "PENDING_APPROVAL", requiresApproval: true, subtotalCents: 40_000, feesCents: 0, totalCents: 40_000, currency: "USD", contractedAt: null });
      expect(o.approvalReasons).toEqual(["the sponsor's first marketplace order"]);
      expect(await live(I.poster!)).toEqual([{ source: "ORDER", quantity: 1, contracted: false }]);
      /* Held: nobody else can buy the poster while BTG decides … */
      await call("POST", "/cart", "mo_s2_admin");
      expect(codes(await call("POST", "/cart/lines", "mo_s2_admin", { listingId: L.poster, quantity: 1, startsOn: at(10), endsOn: at(11) }))).toEqual(["QUANTITY_OVERRUN"]);
      /* … and nothing can contract it but the decision. */
      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_finance", { to: "AWAITING_PAYMENT" })).status).toBe(409);
      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_admin", { to: "APPROVED" })).status).toBe(400);
      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "mo_s1_admin", { decision: "APPROVE" })).status).toBe(403);
      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "mo_finance", { decision: "APPROVE" })).status).toBe(403);
      expect((await live(I.poster!))[0]!.contracted).toBe(false);

      expect((await call("POST", `/marketplace-orders/${o.id}/decision`, "mo_admin", { decision: "REJECT" })).status).toBe(422); // needs a note
      const rejected = await call("POST", `/marketplace-orders/${o.id}/decision`, "mo_admin", { decision: "REJECT", notes: "The property has a sponsor conflict that week." });
      expect(rejected.json).toMatchObject({ state: "CANCELLED", decidedBy: "mo_admin" });
      expect(await live(I.poster!)).toEqual([]);
      expect((await call("POST", "/cart/lines", "mo_s2_admin", { listingId: L.poster, quantity: 1, startsOn: at(10), endsOn: at(11) })).status).toBe(201);
      await prisma.cart.updateMany({ where: { tenantId: T, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    });

    it("BTG's approval contracts it; the machine then walks it, and refuses what the document names", async () => {
      const o = await order("mo_s1_admin", [{ key: "sticker", quantity: 2 }, { key: "clinic", quantity: 1 }]);
      expect(o).toMatchObject({ state: "PENDING_APPROVAL", subtotalCents: 90_000, totalCents: 90_000 });
      expect(o.lines.map((l: { title: string; lineTotalCents: number }) => [l.title, l.lineTotalCents]).sort()).toEqual([["Riley's clinic", 50_000], ["Scoreboard shout-out", 40_000]]);
      const ok = await call("POST", `/marketplace-orders/${o.id}/decision`, "mo_admin", { decision: "APPROVE" });
      expect(ok.json).toMatchObject({ state: "APPROVED", decidedBy: "mo_admin" });
      expect(ok.json.contractedAt).not.toBeNull();
      expect((await live(I.clinic!)).filter((c) => c.source === "ORDER")).toEqual([{ source: "ORDER", quantity: 1, contracted: true }]);
      approvedId = o.id;
      expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "zoho.pushMarketplaceOrder", payload: { equals: { orderId: o.id } } } })).toBe(1);

      /* The figures are fixed now — Postgres refuses, whoever tries. */
      await expect(prisma.$executeRawUnsafe(`UPDATE "MarketplaceOrder" SET "totalCents" = 1, "subtotalCents" = 1 WHERE id = $1`, o.id)).rejects.toThrow(/marketplace_order_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "MarketplaceOrderLine" SET quantity = 9 WHERE "orderId" = $1`, o.id)).rejects.toThrow(/marketplace_order_line_immutable/);

      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_s1_admin", { to: "PAID" })).status).toBe(403); // a sponsor only cancels
      await walk(o.id, ["AWAITING_PAYMENT", "PAID"]);
      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_finance", { to: "CANCELLED" })).status).toBe(409); // after payment, a refund
      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_s1_admin", { to: "CANCELLED" })).status).toBe(409);
      await walk(o.id, ["IN_DELIVERY", "FULFILLED", "CLOSED"]);
      expect((await call("POST", `/marketplace-orders/${o.id}/transition`, "mo_finance", { to: "REFUNDED" })).status).toBe(409); // CLOSED is terminal
      expect(await prisma.auditLog.count({ where: { tenantId: T, entity: "MarketplaceOrder", entityId: o.id } })).toBeGreaterThanOrEqual(7);
    });

    it("policy approves what it has no reason to hold — and holds what it does", async () => {
      /* The sponsor now has a fulfilled order; a small one needs nobody. */
      const small = await order("mo_s1_admin", [{ key: "sticker", quantity: 1 }]);
      expect(small).toMatchObject({ state: "APPROVED", requiresApproval: false, approvalReasons: [], decidedBy: "system" });
      expect(small.contractedAt).not.toBeNull();
      const systemAudit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entityId: small.id, action: "marketplaceOrder.approve" }, select: { actorId: true } });
      expect(systemAudit.actorId).toBeNull(); // policy's decision, not the sponsor's
      /* $1,000 or more waits for BTG; so does a listing that asks. */
      const big = await order("mo_s1_admin", [{ key: "sticker", quantity: 5 }]);
      expect(big).toMatchObject({ state: "PENDING_APPROVAL", totalCents: 100_000 });
      expect(big.approvalReasons).toEqual([expect.stringMatching(/at or above \$1000\.00/)]);
      const vip = await order("mo_s1_admin", [{ key: "vip", quantity: 1 }]);
      expect(vip.approvalReasons).toEqual(['"VIP courtside" asks for approval']);
      /* The sponsor may cancel before paying; the stock comes back. */
      expect((await call("POST", `/marketplace-orders/${vip.id}/transition`, "mo_s1_admin", { to: "CANCELLED" })).json.state).toBe("CANCELLED");
      expect((await live(I.vip!)).length).toBe(0);
      /* A refund after payment releases too. */
      await walk(small.id, ["AWAITING_PAYMENT", "PAID", "REFUNDED"]);
      expect((await prisma.inventoryCommitment.count({ where: { sourceId: { startsWith: `${small.id}:` }, releasedAt: null } }))).toBe(0);
    });

    it("orders are the sponsor's own; the analyst reads, another sponsor cannot", async () => {
      expect((await call("GET", `/marketplace-orders/${approvedId}`, "mo_s1_analyst")).status).toBe(200);
      expect((await call("GET", `/marketplace-orders/${approvedId}`, "mo_s2_admin")).status).toBe(403);
      expect((await call("POST", `/marketplace-orders/${approvedId}/transition`, "mo_s2_admin", { to: "CANCELLED" })).status).toBe(403);
      expect((await call("GET", "/marketplace-orders?state=PENDING_APPROVAL", "mo_admin")).json.orders.length).toBeGreaterThanOrEqual(1);
      expect((await call("GET", "/marketplace-orders", "mo_mgr")).status).toBe(403);
    });
  });

  /* ── 2S4-FE-02 ─────────────────────────────────────────────────────────── */
  describe("2S4-FE-02 · the contract gate — terms accepted, billing confirmed, or no order", () => {
    it("a live hold carries the order terms (the real v1 text and its hash) and the billing prefill", async () => {
      const hold = await held("mo_s1_admin", [{ key: "sticker", quantity: 1, from: 40, to: 41 }]);
      L.gateHold = hold.id;
      const read = (await call("GET", `/reservations/${hold.id}`, "mo_s1_admin")).json;
      expect(read.checkout).toMatchObject({
        sponsorName: "Harbor Apparel",
        billingContact: { name: "Morgan Hale", email: "morgan@harbor.invalid" },
        terms: { id: E.terms, kind: "MARKETPLACE_ORDER", version: 1, bodyHash: ORDER_TERMS_HASH },
      });
      expect(read.checkout.terms.body).toMatch(/^DRAFT — NOT COUNSEL-APPROVED/);
      /* The analyst reads the same hold and terms — placing is the admin's (below). */
      expect((await call("GET", `/reservations/${hold.id}`, "mo_s1_analyst")).json.checkout.terms.id).toBe(E.terms);
    });

    it("placing without the acceptance, or without a billing contact, is a 422 — and the hold is untouched", async () => {
      const without = await call("POST", "/marketplace-orders", "mo_s1_admin", { reservationId: L.gateHold });
      expect(without.status, without.text).toBe(422);
      expect(without.text).toMatch(/Accept the order terms/);
      const noBilling = await call("POST", "/marketplace-orders", "mo_s1_admin", { reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH });
      expect(noBilling.status, noBilling.text).toBe(422);
      expect(noBilling.text).toMatch(/billing contact's name/);
      /* A card number in the PO box is refused: SponsorX never takes one. */
      const card = await call("POST", "/marketplace-orders", "mo_s1_admin", {
        reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH, billing: { ...TEST_BILLING, reference: "4242 4242 4242 4242" },
      });
      expect(card.status, card.text).toBe(422);
      expect(card.text).toMatch(/not a card number/);
      expect((await call("GET", `/reservations/${L.gateHold}`, "mo_s1_admin")).json.state).toBe("HELD");
      expect(await prisma.marketplaceOrder.count({ where: { reservationId: L.gateHold } })).toBe(0);
    });

    it("a tampered hash, or terms that are not the ones in force, are refused — and nothing is recorded", async () => {
      const before = await prisma.agreementAcceptance.count({ where: { tenantId: T } });
      const tampered = await call("POST", "/marketplace-orders", "mo_s1_admin", {
        reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: `sha256:${"0".repeat(64)}`, billing: TEST_BILLING,
      });
      expect(tampered.status, tampered.text).toBe(409);
      expect(tampered.text).toMatch(/agreement text has changed/);
      /* An agreement that is not the tenant's current MARKETPLACE_ORDER terms (here, another kind). */
      await prisma.agreement.create({ data: { id: "mo_other_terms", tenantId: T, kind: "PROPERTY_TERMS", version: 1, bodyHash: ORDER_TERMS_HASH, effectiveAt: new Date("2026-01-01") } });
      const other = await call("POST", "/marketplace-orders", "mo_s1_admin", { reservationId: L.gateHold, agreementId: "mo_other_terms", bodyHashShown: ORDER_TERMS_HASH, billing: TEST_BILLING });
      expect(other.status, other.text).toBe(409);
      /* A version issued since checkout loaded: the old acceptance is refused. */
      await prisma.agreement.create({ data: { id: "mo_terms_v2", tenantId: T, kind: "MARKETPLACE_ORDER", version: 2, bodyHash: "sha256:v2-not-yet-written", effectiveAt: new Date("2026-02-01") } });
      const stale = await call("POST", "/marketplace-orders", "mo_s1_admin", { reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH, billing: TEST_BILLING });
      expect(stale.status, stale.text).toBe(409);
      /* v2 has no servable text, so checkout shows no terms rather than the wrong ones. */
      expect((await call("GET", `/reservations/${L.gateHold}`, "mo_s1_admin")).json.checkout.terms).toBeNull();
      await prisma.agreement.delete({ where: { id: "mo_terms_v2" } });
      await prisma.agreement.delete({ where: { id: "mo_other_terms" } });
      expect(await prisma.agreementAcceptance.count({ where: { tenantId: T } })).toBe(before);
      expect((await call("GET", `/reservations/${L.gateHold}`, "mo_s1_admin")).json.state).toBe("HELD");
    });

    it("accepted: the acceptance and billing snapshot are stored with the order, in its transaction, audited — and fixed", async () => {
      const r = await call("POST", "/marketplace-orders", "mo_s1_admin", {
        reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH,
        billing: { name: "  Accounts Payable ", email: "ap@harbor.invalid", reference: "PO-7781" },
      });
      expect(r.status, r.text).toBe(201);
      expect(r.json).toMatchObject({
        reservationId: L.gateHold, billingName: "Accounts Payable", billingEmail: "ap@harbor.invalid", billingReference: "PO-7781",
        acceptance: { userId: "mo_s1_admin", bodyHash: ORDER_TERMS_HASH, user: { email: "mo_s1_admin@mo-test.invalid" }, agreement: { kind: "MARKETPLACE_ORDER", version: 1 } },
      });
      const acceptance = await prisma.agreementAcceptance.findUniqueOrThrow({ where: { id: r.json.acceptanceId }, select: { agreementId: true, userId: true, bodyHash: true, ip: true, userAgent: true } });
      expect(acceptance).toMatchObject({ agreementId: E.terms, userId: "mo_s1_admin", bodyHash: ORDER_TERMS_HASH });
      expect(acceptance.ip).not.toBe("");
      const placed = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, entityId: r.json.id, action: "marketplaceOrder.place" }, select: { actorId: true, after: true } });
      expect(placed.actorId).toBe("mo_s1_admin");
      expect(placed.after).toMatchObject({ reservationId: L.gateHold, acceptanceId: r.json.acceptanceId, terms: { kind: "MARKETPLACE_ORDER", version: 1, bodyHash: ORDER_TERMS_HASH } });
      expect(await prisma.auditLog.count({ where: { tenantId: T, entity: "Agreement", entityId: E.terms, action: "agreement.accept" } })).toBeGreaterThanOrEqual(1);
      /* BTG's view carries the same record. */
      expect((await call("GET", `/marketplace-orders/${r.json.id}`, "mo_admin")).json).toMatchObject({ billingEmail: "ap@harbor.invalid", acceptance: { userId: "mo_s1_admin" } });
      /* The snapshot is fixed: Postgres refuses a rewrite, whatever the state. */
      await expect(prisma.$executeRawUnsafe(`UPDATE "MarketplaceOrder" SET "billingEmail" = 'x@y.invalid' WHERE id = $1`, r.json.id)).rejects.toThrow(/marketplace_order_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "MarketplaceOrder" SET "acceptanceId" = NULL, "billingName" = NULL, "billingEmail" = NULL, "billingReference" = NULL WHERE id = $1`, r.json.id)).rejects.toThrow(/marketplace_order_immutable/);
      /* … and a row cannot carry a billing contact without an acceptance. */
      await expect(prisma.$executeRawUnsafe(
        `INSERT INTO "MarketplaceOrder" (id, "tenantId", "sponsorId", "reservationId", "subtotalCents", "feesCents", "totalCents", "requiresApproval", "approvalReasons", "billingName", "billingEmail", "updatedAt")
         VALUES ('mo_bad', $1, 'mo_s1', 'mo_no_hold', 0, 0, 0, false, '{}', 'X', 'x@y.invalid', now())`, T,
      )).rejects.toThrow(/contract_gate_check/);
      /* Placed once: the hold is converted, a second placement is refused. */
      expect((await call("POST", "/marketplace-orders", "mo_s1_admin", { reservationId: L.gateHold, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH, billing: TEST_BILLING })).status).toBe(409);
      await call("POST", `/marketplace-orders/${r.json.id}/transition`, "mo_s1_admin", { to: "CANCELLED" });
    });

    it("another sponsor's hold cannot be placed with valid terms; an analyst cannot place at all", async () => {
      const hold = await held("mo_s1_admin", [{ key: "sticker", quantity: 1, from: 42, to: 43 }]);
      const body = { reservationId: hold.id, agreementId: E.terms, bodyHashShown: ORDER_TERMS_HASH, billing: TEST_BILLING };
      expect((await call("POST", "/marketplace-orders", "mo_s2_admin", body)).status).toBe(403);
      expect((await call("POST", "/marketplace-orders", "mo_s1_analyst", body)).status).toBe(403);
      await call("POST", `/reservations/${hold.id}/release`, "mo_s1_admin");
      await prisma.cart.updateMany({ where: { tenantId: T, state: "ACTIVE" }, data: { state: "EXPIRED" } });
    });
  });

  /* ── 2S7-INT-01 ────────────────────────────────────────────────────────── */
  describe("2S7-INT-01 · the contracted order in Zoho, linked", () => {
    it("the sponsor's Account and Contact, the property's own Account and manager, and the Deal linking them", async () => {
      const zoho = new FakeZoho();
      const deps = { db: prisma, zoho: () => zoho as never };
      const out = await handlePushMarketplaceOrder(deps, { tenantId: T, orderId: approvedId });
      expect(out).toMatchObject({ status: "pushed", action: "insert" });

      const sponsorAccount = zoho.bySponsorXId("Accounts", "mo_s1")!;
      const propertyAccount = zoho.bySponsorXId("Accounts", `property:${E.property}`)!;
      expect(sponsorAccount).toMatchObject({ Account_Name: "Harbor Apparel", Account_Type: "Customer" });
      expect(propertyAccount).toMatchObject({ Account_Name: "Bowie Bulldogs", Account_Type: "Partner", Billing_State: "MD" });
      expect(zoho.bySponsorXId("Contacts", "mo_s1_contact")).toMatchObject({ Last_Name: "Morgan Hale", Account_Name: { id: sponsorAccount.id } });
      expect(zoho.bySponsorXId("Contacts", `user:${E.manager}`)).toMatchObject({
        Last_Name: "Casey Moore", Email: "mo_mgr@mo-test.invalid", Phone: "301-555-0100", Title: "General manager", Account_Name: { id: propertyAccount.id },
      });
      const deal = zoho.bySponsorXId("Deals", `mkt-order:${approvedId}`)!;
      expect(deal).toMatchObject({
        Amount: 900, Stage: "Closed Won", Type: "New Business",
        Account_Name: { id: sponsorAccount.id }, Contact_Name: { id: zoho.bySponsorXId("Contacts", "mo_s1_contact")!.id },
      });
      expect(String(deal.Description)).toContain(`Bowie Bulldogs (Account ${propertyAccount.id})`);
      expect(String(deal.Description)).toContain("Riley's clinic ×1");

      /* SponsorX keeps the links. */
      expect(await prisma.property.findUniqueOrThrow({ where: { id: E.property }, select: { zohoId: true, zohoContactId: true } }))
        .toEqual({ zohoId: propertyAccount.id, zohoContactId: zoho.bySponsorXId("Contacts", `user:${E.manager}`)!.id });
      expect((await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: approvedId }, select: { zohoDealId: true } })).zohoDealId).toBe(deal.id);

      /* Redelivered: nothing is duplicated — only the Stage is re-sent. */
      const writes = zoho.writes.length;
      await handlePushMarketplaceOrder(deps, { tenantId: T, orderId: approvedId });
      expect(zoho.writes.slice(writes)).toEqual([expect.objectContaining({ op: "update", module: "Deals", record: { SponsorX_ID: `mkt-order:${approvedId}`, Stage: "Closed Won" } })]);
      expect(zoho.all("Deals")).toHaveLength(1);
      expect(zoho.all("Accounts")).toHaveLength(2);
    });

    it("a refund moves the Deal to Closed Lost; an order not yet contracted never reaches Zoho", async () => {
      const zoho = new FakeZoho();
      const deps = { db: prisma, zoho: () => zoho as never };
      const refunded = await prisma.marketplaceOrder.findFirstOrThrow({ where: { tenantId: T, state: "REFUNDED" }, select: { id: true } });
      await handlePushMarketplaceOrder(deps, { tenantId: T, orderId: refunded.id });
      expect(zoho.bySponsorXId("Deals", `mkt-order:${refunded.id}`)).toMatchObject({ Stage: "Closed Lost", Type: "Existing Business" });
      const pending = await prisma.marketplaceOrder.findFirstOrThrow({ where: { tenantId: T, state: "PENDING_APPROVAL" }, select: { id: true } });
      expect(await handlePushMarketplaceOrder(deps, { tenantId: T, orderId: pending.id })).toMatchObject({ status: "skipped" });
      expect(zoho.bySponsorXId("Deals", `mkt-order:${pending.id}`)).toBeUndefined();
      /* Every move of a contracted order is queued for Zoho. */
      expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "zoho.pushMarketplaceOrder", payload: { equals: { orderId: refunded.id } } } })).toBeGreaterThanOrEqual(4);
    });
  });
});
