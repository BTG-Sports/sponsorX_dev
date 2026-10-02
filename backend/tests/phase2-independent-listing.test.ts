import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { settleDeliveries } from "./support/delivery";

/* --------------------------------------------------------------------------
   2S3-BE-05 — independent athletes list their own items, against the real
   API and database. Done when:

     An approved athlete with no team can submit their own item, BTG can
     approve it, a sponsor can find, cart and order it, and the split pays
     the athlete as the only payee; a roster athlete still cannot list around
     their team; scope and tenant tests cover the new seller.

   The cast: Jordan Reed — an approved athlete with no team — sells a $500
   clinic. Riley is on the Hawks' roster. Pat isn't approved yet. Sam is
   another independent athlete, and Lee is one in another marketplace.
   A TEAM_SHARE rule of 25% is in force on purpose: it must never reach
   Jordan's sale, because there is no team to pay.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ind-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
/* 2S4-FE-02 — every order is placed through the contract gate. */
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("2S3-BE-05 · an athlete with no team sells their own item", { timeout: 90_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment, confirmPayoutPaid, sendPayout } = await import("../src/domain/payouts");

  const T = "ind_btg";
  const X = "ind_other";
  const E = { tenant: "", property: "", riley: "", item: "", listing: "", order: "", rileyItem: "", hawksListing: "" };
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
  const tokenOf = (url: string) => new URL(url).searchParams.get("t")!;
  const walk = async (id: string, states: string[]) => {
    for (const to of states) {
      if (to === "FULFILLED") await settleDeliveries(prisma, id);
      const r = await call("POST", `/marketplace-orders/${id}/transition`, "ind_admin", { to });
      expect(r.status, r.text).toBe(200);
    }
  };
  const search = async (who: string, q = "clinic") =>
    ((await call("GET", `/marketplace/search?q=${q}`, who)).json.results as { id: string; seller: { type: string; name: string } }[]);
  const clinic = { title: "Shooting clinic with Jordan Reed", description: "A 90-minute shooting clinic at your venue, for up to 20 kids." };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'ind\\_%@ind-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, X,
    );
    return [T, X, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    await prisma.$executeRawUnsafe(`DELETE FROM "PayoutLine" WHERE "payoutId" IN (SELECT id FROM "Payout" WHERE "tenantId" = ANY($1::text[]))`, ids);
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

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Independent BTG" }, { id: X, name: "Another marketplace" }] });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "ind_harbor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] },
      { id: "ind_x_sponsor", tenantId: X, name: "Elsewhere Bakery", categories: ["RESTAURANT"] },
    ] });
    const athlete = (id: string, tenantId: string, legalName: string, displayName: string, state: "ACTIVE" | "APPROVED" | "DRAFT", stateCode = "MD") =>
      ({ id, tenantId, slug: id.replace(/_/g, "-"), legalName, displayName, email: `${id}@ind-test.invalid`, sport: "Basketball", stateCode, ageBand: "18_PLUS", state });
    await prisma.athlete.createMany({ data: [
      athlete("ind_ath_jordan", T, "Jordan Reed", "JORDAN.REED", "APPROVED", "VA"),
      athlete("ind_ath_sam", T, "Sam Lee", "SAM.LEE", "ACTIVE"),
      athlete("ind_ath_pat", T, "Pat Kim", "PAT.KIM", "DRAFT"),
      athlete("ind_ath_lee", X, "Lee Park", "LEE.PARK", "ACTIVE"),
    ] });
    await prisma.user.createMany({ data: [
      { id: "ind_admin", tenantId: T, clerkId: "ind_admin", email: "ind_admin@ind-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "ind_buyer", tenantId: T, clerkId: "ind_buyer", email: "ind_buyer@ind-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "ind_harbor" },
      { id: "ind_x_buyer", tenantId: X, clerkId: "ind_x_buyer", email: "ind_x_buyer@ind-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "ind_x_sponsor" },
      { id: "ind_jordan", tenantId: T, clerkId: "ind_jordan", email: "ind_jordan@ind-test.invalid", roles: ["ATHLETE"], athleteId: "ind_ath_jordan" },
      { id: "ind_sam", tenantId: T, clerkId: "ind_sam", email: "ind_sam@ind-test.invalid", roles: ["ATHLETE"], athleteId: "ind_ath_sam" },
      { id: "ind_pat", tenantId: T, clerkId: "ind_pat", email: "ind_pat@ind-test.invalid", roles: ["ATHLETE"], athleteId: "ind_ath_pat" },
      { id: "ind_lee", tenantId: X, clerkId: "ind_lee", email: "ind_lee@ind-test.invalid", roles: ["ATHLETE"], athleteId: "ind_ath_lee" },
    ] });
    /* The walkthrough's sample rates, plus a 25% TEAM_SHARE default that must not touch Jordan. */
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `ind_${kind}`, tenantId: T, ruleKey: `ind_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [
      rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000), rule("TEAM_SHARE", 2500),
    ] });
    /* The Hawks — a team BTG approved, with Riley on its roster. */
    await prisma.propertyOnboarding.create({ data: {
      id: "ind_onb", tenantId: T, orgType: "TEAM", orgName: "Westfield Hawks IL", stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Dana Brooks", email: "ind_mgr@ind-test.invalid", phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: "Westfield Hawks IL LLC", league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding({ userId: "ind_admin", tenantId: T, roles: ["BTG_ADMIN"], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }, "ind_onb", "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    Object.assign(E, { tenant: p.tenantId, property: p.id });

    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "ind_mgr");
    const riley = await call("POST", "/team/roster", "ind_mgr", { legalName: "Riley Carter", displayName: "RILEY.CARTER", email: "ind_riley@ind-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    const rileyItem = await call("POST", "/inventory", "ind_riley", { title: "Riley's camp", kind: "CAMP", priceCents: 40_000, quantity: 3 });
    expect(rileyItem.status, rileyItem.text).toBe(201);
    E.rileyItem = rileyItem.json.id;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("an approved athlete with no team lists their own item", () => {
    it("Jordan creates the item and a DRAFT listing of it — Jordan is the seller, there is no property", async () => {
      const item = await call("POST", "/inventory", "ind_jordan", { title: "Shooting clinic", kind: "CAMP", priceCents: 50_000, quantity: 4 });
      expect(item.status, item.text).toBe(201);
      E.item = item.json.id;
      const made = await call("POST", "/listings", "ind_jordan", { inventoryItemId: E.item, ...clinic });
      expect(made.status, made.text).toBe(201);
      expect(made.json).toMatchObject({
        state: "DRAFT", propertyId: null, sellerAthleteId: "ind_ath_jordan", propertyName: null,
        seller: { type: "ATHLETE", id: "ind_ath_jordan", name: "JORDAN.REED" }, blockers: [],
      });
      E.listing = made.json.id;
      /* One live listing per item still holds. */
      expect((await call("POST", "/listings", "ind_jordan", { inventoryItemId: E.item, ...clinic })).status).toBe(409);
    });

    it("Jordan edits and submits it; the checks pass, so it goes live on its own (2S3-BE-06)", async () => {
      expect((await call("PATCH", `/listings/${E.listing}`, "ind_jordan", { visibility: "PUBLIC" })).status).toBe(200);
      const sub = await call("POST", `/listings/${E.listing}/submit`, "ind_jordan");
      expect(sub.status, sub.text).toBe(200);
      expect(sub.json).toMatchObject({ state: "PUBLISHED", publishedBy: "AUTOMATIC", hold: null });
      /* The seller never decides: BTG's decision route stays BTG's. */
      expect((await call("POST", `/listings/${E.listing}/decision`, "ind_jordan", { decision: "APPROVE" })).status).toBe(403);
    });

    it("BTG sees it among the listings published automatically", async () => {
      const auto = (await call("GET", "/listings/auto-published", "ind_admin")).json.listings as { id: string; seller: { type: string } }[];
      expect(auto).toContainEqual(expect.objectContaining({ id: E.listing, seller: expect.objectContaining({ type: "ATHLETE" }) }));
      expect((await call("GET", "/listings/auto-published", "ind_jordan")).status).toBe(403);
    });
  });

  describe("a roster athlete still cannot list around their team", () => {
    it("Riley is refused, and told their team lists it", async () => {
      const r = await call("POST", "/listings", "ind_riley", { inventoryItemId: E.rileyItem, title: "Riley's camp", description: "A two-day camp at your venue, up to 30 kids." });
      expect(r.status).toBe(409);
      expect(r.json.error.message).toMatch(/on a team — Westfield Hawks IL lists your items/);
    });

    it("the team's listing of Riley's item is the team's: Riley can read it but not edit, submit, pause or archive it", async () => {
      const made = await call("POST", "/listings", "ind_mgr", { inventoryItemId: E.rileyItem, title: "Riley's camp", description: "A two-day camp at your venue, up to 30 kids." });
      expect(made.status, made.text).toBe(201);
      expect(made.json.seller).toMatchObject({ type: "PROPERTY", id: E.property, name: "Westfield Hawks IL" });
      E.hawksListing = made.json.id;
      expect((await call("GET", `/listings/${E.hawksListing}`, "ind_riley")).status).toBe(200);
      expect((await call("PATCH", `/listings/${E.hawksListing}`, "ind_riley", { title: "Mine now" })).status).toBe(403);
      expect((await call("POST", `/listings/${E.hawksListing}/submit`, "ind_riley")).status).toBe(403);
      expect((await call("POST", `/listings/${E.hawksListing}/transition`, "ind_riley", { to: "ARCHIVED" })).status).toBe(403);
    });

    it("an athlete who joins a team stops being sold as an independent seller", async () => {
      /* Sam lists and is approved, then joins the Hawks. */
      const item = (await call("POST", "/inventory", "ind_sam", { title: "Sam's clinic", kind: "CAMP", priceCents: 30_000, quantity: 2 })).json;
      const l = (await call("POST", "/listings", "ind_sam", { inventoryItemId: item.id, title: "Clinic with Sam Lee", description: "A one-hour clinic at your venue, up to 15 kids." })).json;
      /* 2S3-BE-06 — a clean submit goes live on its own. */
      expect((await call("POST", `/listings/${l.id}/submit`, "ind_sam")).json.state).toBe("PUBLISHED");
      expect((await search("ind_buyer", "Sam")).map((r) => r.id)).toEqual([l.id]);
      await prisma.athlete.update({ where: { id: "ind_ath_sam" }, data: { propertyId: E.property } });
      try {
        expect(await search("ind_buyer", "Sam")).toEqual([]);
        const add = await call("POST", "/cart/lines", "ind_buyer", { listingId: l.id, quantity: 1, startsOn: at(30), endsOn: at(31) });
        expect(add.status).not.toBe(201);
        const got = (await call("GET", `/listings/${l.id}`, "ind_sam")).json;
        expect(got.blockers).toContainEqual(expect.stringMatching(/on a team/));
        expect((await call("POST", "/listings", "ind_sam", { inventoryItemId: item.id, ...clinic })).status).toBe(409);
      } finally {
        await prisma.athlete.update({ where: { id: "ind_ath_sam" }, data: { propertyId: null } });
      }
    });
  });

  describe("only an approved athlete, only their own item", () => {
    it("an athlete BTG hasn't approved cannot list", async () => {
      const own = await prisma.inventoryItem.create({ data: { tenantId: T, athleteId: "ind_ath_pat", title: "Pat's session", kind: "OTHER", priceCents: 10_000 }, select: { id: true } });
      const r = await call("POST", "/listings", "ind_pat", { inventoryItemId: own.id, ...clinic });
      expect(r.status).toBe(409);
      expect(r.json.error.message).toMatch(/BTG has approved/);
    });

    it("another athlete can't list, edit or submit Jordan's item; nor can a team manager or sponsor", async () => {
      expect((await call("POST", "/listings", "ind_sam", { inventoryItemId: E.item, ...clinic })).status).toBe(403);
      expect((await call("POST", "/listings", "ind_mgr", { inventoryItemId: E.item, ...clinic })).status).toBe(403);
      expect((await call("POST", "/listings", "ind_buyer", { inventoryItemId: E.item, ...clinic })).status).toBe(403);
      for (const who of ["ind_sam", "ind_mgr", "ind_buyer", "ind_lee"]) {
        expect((await call("PATCH", `/listings/${E.listing}`, who, { title: "Taken" })).status, who).toBe(403);
        expect((await call("POST", `/listings/${E.listing}/transition`, who, { to: "PAUSED" })).status, who).toBe(403);
      }
      expect((await call("GET", `/listings/${E.listing}`, "ind_sam")).status).toBe(403);
      expect((await call("GET", `/listings/${E.listing}`, "ind_mgr")).status).toBe(403);
      /* An athlete in another marketplace can't list an item of this one. */
      expect((await call("POST", "/listings", "ind_lee", { inventoryItemId: E.item, ...clinic })).status).toBe(403);
    });

    it("the database refuses a listing with two sellers, or none", async () => {
      await expect(prisma.listing.create({ data: { tenantId: T, propertyId: E.property, sellerAthleteId: "ind_ath_jordan", inventoryItemId: E.rileyItem, title: "x" } })).rejects.toThrow();
      await expect(prisma.listing.create({ data: { tenantId: T, inventoryItemId: E.rileyItem, title: "x" } })).rejects.toThrow();
    });
  });

  describe("a sponsor finds, carts and orders it", () => {
    it("search shows it with Jordan as the seller, filtered by the athlete's state — and not to another marketplace", async () => {
      const found = await search("ind_buyer");
      expect(found).toContainEqual(expect.objectContaining({ id: E.listing, seller: { type: "ATHLETE", id: "ind_ath_jordan", name: "JORDAN.REED" }, property: null }));
      expect((await call("GET", "/marketplace/search?q=clinic&stateCode=VA", "ind_buyer")).json.results.map((r: { id: string }) => r.id)).toEqual([E.listing]);
      expect((await call("GET", "/marketplace/search?q=clinic&stateCode=MD", "ind_buyer")).json.results.map((r: { id: string }) => r.id)).not.toContain(E.listing);
      expect(await search("ind_x_buyer")).toEqual([]);
      expect((await call("GET", `/listings/${E.listing}`, "ind_x_buyer")).status).toBe(403);
    });

    it("carts it (the line names Jordan), holds it and orders $1,000 — the line is Jordan's, not a team's", async () => {
      await call("POST", "/cart", "ind_buyer");
      const line = await call("POST", "/cart/lines", "ind_buyer", { listingId: E.listing, quantity: 2, startsOn: at(10), endsOn: at(17) });
      expect(line.status, line.text).toBe(201);
      const cart = (await call("GET", "/cart", "ind_buyer")).json.cart;
      expect(cart.lines).toEqual([expect.objectContaining({ listingId: E.listing, sellerName: "JORDAN.REED", propertyName: null, lineTotalCents: 100_000 })]);
      const hold = await call("POST", "/cart/reserve", "ind_buyer");
      expect(hold.status, hold.text).toBe(201);
      const placed = await call("POST", "/marketplace-orders", "ind_buyer", placeOrderBody(hold.json.id, `${T}_order_terms`));
      expect(placed.status, placed.text).toBe(201);
      expect(placed.json).toMatchObject({ state: "PENDING_APPROVAL", totalCents: 100_000 });
      expect(placed.json.lines).toEqual([expect.objectContaining({ propertyId: null, sellerAthleteId: "ind_ath_jordan" })]);
      E.order = placed.json.id;
    });
  });

  describe("the split pays the athlete as the only payee", () => {
    it("BTG approves; the frozen split gives the team nothing, whatever the TEAM_SHARE rule says", async () => {
      const ok = await call("POST", `/marketplace-orders/${E.order}/decision`, "ind_admin", { decision: "APPROVE" });
      expect(ok.status, ok.text).toBe(200);
      const [f] = await prisma.orderLineFinancials.findMany({ where: { orderId: E.order }, select: { netCents: true, platformFeeCents: true, managementFeeCents: true, processingCents: true, propertyShareCents: true, referralCents: true, reserveCents: true, availableCents: true, athleteId: true, teamShareBps: true, teamAvailableCents: true, teamReserveCents: true } });
      /* $1,000: fees $150 + $50, processing $29.30 → $770.70 share; referral 2% $15.41, reserve 10% $77.07. */
      expect(f).toMatchObject({
        netCents: 100_000, platformFeeCents: 15_000, managementFeeCents: 5_000, processingCents: 2_930,
        propertyShareCents: 77_070, referralCents: 1_541, reserveCents: 7_707, availableCents: 67_822,
        athleteId: "ind_ath_jordan", teamShareBps: 0, teamAvailableCents: 0, teamReserveCents: 0,
      });
      const entries = await prisma.ledgerEntry.findMany({ where: { orderId: E.order, entryType: "BOOKING" }, select: { account: true, partyType: true, partyId: true, creditCents: true, debitCents: true } });
      expect(entries.filter((e) => e.partyType === "PROPERTY")).toEqual([]);
      expect(entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ account: "ATHLETE_PAYABLE", partyType: "ATHLETE", partyId: "ind_ath_jordan", creditCents: 67_822 }),
        expect.objectContaining({ account: "RESERVE_HELD", partyType: "ATHLETE", partyId: "ind_ath_jordan", creditCents: 7_707 }),
      ]));
      expect(entries.reduce((s, e) => s + e.debitCents - e.creditCents, 0)).toBe(0);
    });

    it("the split preview agrees: an independent athlete's line has no team share", async () => {
      const r = await call("POST", "/commission-rules/preview", "ind_admin", { lines: [
        { label: "Jordan", grossCents: 100_000, independentAthlete: true },
        { label: "Riley", grossCents: 100_000, athleteItem: true, teamShareBps: 2000 },
      ] });
      expect(r.status, r.text).toBe(200);
      const [jordan, riley] = r.json.current.lines;
      expect(jordan).toMatchObject({ teamShareBps: 0, teamAvailableCents: 0, teamReserveCents: 0 });
      expect(riley.teamShareBps).toBe(2000);
    });

    it("Harbor pays, it is delivered, and Jordan is paid their $678.22 — then the $77.07 reserve on close", async () => {
      const pay = await call("POST", `/marketplace-orders/${E.order}/pay`, "ind_buyer");
      expect(pay.status, pay.text).toBe(200);
      await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(pay.json.url), outcome: "SUCCEED" });
      const attempt = (await call("GET", `/marketplace-orders/${E.order}/payment`, "ind_buyer")).json.latest;
      expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
      await walk(E.order, ["IN_DELIVERY", "FULFILLED"]);

      const link = (await call("POST", "/payouts/account/link", "ind_jordan", {})).json;
      await call("POST", "/public/test-provider/account", undefined, { token: tokenOf(link.url), outcome: "READY" });
      const me = (await call("GET", "/payouts/me", "ind_jordan")).json;
      expect(me.totals).toMatchObject({ requestableCents: 67_822, heldCents: 7_707 });
      expect(me.orders[0]).toMatchObject({ orderId: E.order, shareCents: 75_529 });

      const made = (await call("POST", "/payouts", "ind_jordan")).json.payouts[0];
      expect(made).toMatchObject({ payeeType: "ATHLETE", payeeId: "ind_ath_jordan", amountCents: 67_822 });
      await call("POST", `/payouts/${made.id}/decision`, "ind_admin", { decision: "APPROVE" });
      await sendPayout(made.id);
      expect(await confirmPayoutPaid(made.id)).toEqual({ paid: true });

      await walk(E.order, ["CLOSED"]);
      const rest = (await call("POST", "/payouts", "ind_jordan")).json.payouts[0];
      expect(rest.amountCents).toBe(7_707);
      await call("POST", `/payouts/${rest.id}/decision`, "ind_admin", { decision: "APPROVE" });
      await sendPayout(rest.id);
      await confirmPayoutPaid(rest.id);
      expect((await call("GET", "/payouts/me", "ind_jordan")).json.totals).toMatchObject({ paidOutCents: 75_529, requestableCents: 0, heldCents: 0 });
      /* Nobody else was owed anything from this order. */
      expect(await prisma.payout.count({ where: { tenantId: T, payeeType: "PROPERTY" } })).toBe(0);
    });
  });
});
