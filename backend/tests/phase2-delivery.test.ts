import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Sellers' orders and delivery, against the real API and database.

     2S4-BE-06  A seller can read only the order lines they sell, with their
                own share and no one else's; they are emailed when a sale is
                approved and paid; the sponsor contact appears only once
                paid; a seller can never read another seller's lines or
                another tenant's orders.
     2S4-BE-07  A seller can mark only their own lines delivered, with a
                note; the sponsor can confirm or report a problem, and
                silence for 24 hours confirms; only confirmed lines can be
                paid out; a reported problem holds that line's payout until
                BTG resolves it; the order is delivered when all its lines are.
     2S4-BE-08  Overdue lines remind the seller once and appear in BTG's
                list; an order closes itself 30 days after its last line is
                confirmed and its reserve becomes payable; running the job
                twice changes nothing.

   The cast: Harbor Coffee buys from the Westfield Hawks DL (Riley Carter's
   clinic, a roster athlete's item sold by the team, 20% team share) and from
   Jordan Reed (an independent athlete). The Lakeside Lions are another team.
   The worker's sweep is called with a moved clock, for this tenant only.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@dl-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const { issueOrderTerms, placeOrderBody, TEST_BILLING } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("sellers' orders and delivery over the API", { timeout: 120_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { confirmPayment } = await import("../src/domain/payouts");
  const { sweepDeliveries, reportProblem, deliveryIssues, isOverdue, canAnswer, lineDates } = await import("../src/domain/delivery");

  const T = "dl_btg";
  const E = { hawksTenant: "", hawks: "", lionsTenant: "", lions: "", riley: "", hawksListing: "", jordanListing: "", order1: "", hawksLine1: "", jordanLine1: "" };
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;

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
  const emails = async () => (await prisma.outboxJob.findMany({ where: { name: "notify.email", tenantId: { in: await tenantsInPlay() } }, select: { payload: true } }))
    .map((j) => j.payload as { template: string; to: string; data: Record<string, string>; idempotencyKey: string });
  const lineOf = async (orderId: string, listingId: string) =>
    ((await call("GET", `/marketplace-orders/${orderId}`, "dl_buyer")).json.lines as { id: string; listingId: string }[]).find((l) => l.listingId === listingId)!.id;
  const sponsorActor = { userId: "dl_buyer", tenantId: T, roles: ["SPONSOR_ADMIN" as const], sponsorId: "dl_harbor", athleteId: null, guardianId: null, propertyId: null };
  const adminActor = { userId: "dl_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'dl\\_%@dl-test.invalid' AND "tenantId" <> $1`, T,
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
      contacts: [{ name: "Dana Brooks", email: `${manager}@dl-test.invalid`, phone: "301-555-0100", role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Amateur", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(adminActor, id, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }

  async function publish(seller: string, inventoryItemId: string, title: string) {
    const l = await call("POST", "/listings", seller, { inventoryItemId, title, description: "A 90-minute session at your venue, for up to 20 kids." });
    expect(l.status, l.text).toBe(201);
    await call("POST", `/listings/${l.json.id}/submit`, seller);
    expect((await call("POST", `/listings/${l.json.id}/decision`, "dl_admin", { decision: "APPROVE" })).json.state).toBe("PUBLISHED");
    return l.json.id as string;
  }

  /** Harbor orders the lines; BTG approves when policy holds it; optionally pays by card. */
  async function order(lines: { listingId: string; quantity: number; startsOn: string; endsOn: string }[], pay: boolean) {
    await call("POST", "/cart", "dl_buyer");
    for (const l of lines) {
      const r = await call("POST", "/cart/lines", "dl_buyer", l);
      expect(r.status, r.text).toBe(201);
    }
    const hold = (await call("POST", "/cart/reserve", "dl_buyer")).json;
    const placed = await call("POST", "/marketplace-orders", "dl_buyer", placeOrderBody(hold.id, `${T}_order_terms`));
    expect(placed.status, placed.text).toBe(201);
    if (placed.json.state === "PENDING_APPROVAL") {
      expect((await call("POST", `/marketplace-orders/${placed.json.id}/decision`, "dl_admin", { decision: "APPROVE" })).json.state).toBe("APPROVED");
    }
    if (pay) await payFor(placed.json.id);
    return placed.json.id as string;
  }
  async function payFor(orderId: string) {
    const link = await call("POST", `/marketplace-orders/${orderId}/pay`, "dl_buyer");
    expect(link.status, link.text).toBe(200);
    await call("POST", "/public/test-provider/checkout", undefined, { token: tokenOf(link.json.url), outcome: "SUCCEED" });
    const attempt = (await call("GET", `/marketplace-orders/${orderId}/payment`, "dl_buyer")).json.latest;
    expect(await confirmPayment(attempt.id)).toEqual({ confirmed: true });
  }
  const partyShare = async (lineId: string, partyType: "ATHLETE" | "PROPERTY") =>
    (await prisma.ledgerEntry.findMany({ where: { lineId, entryType: "BOOKING", partyType }, select: { creditCents: true } })).reduce((s, e) => s + e.creditCents, 0);

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Delivery BTG" } });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "dl_harbor", tenantId: T, name: "Harbor Coffee", categories: ["RESTAURANT"] },
      { id: "dl_bakery", tenantId: T, name: "Main Street Bakery", categories: ["RESTAURANT"] },
    ] });
    await prisma.sponsorContact.create({ data: { tenantId: T, sponsorId: "dl_harbor", name: "Dana Brooks", email: "dana@harbor.invalid", phone: "(301) 555-0142", isPrimary: true } });
    await prisma.athlete.create({ data: {
      id: "dl_ath_jordan", tenantId: T, slug: "dl-jordan", legalName: "Jordan Reed", displayName: "JORDAN.REED", email: "dl_jordan@dl-test.invalid",
      sport: "Basketball", stateCode: "VA", ageBand: "18_PLUS", state: "APPROVED",
    } });
    await prisma.user.createMany({ data: [
      { id: "dl_admin", tenantId: T, clerkId: "dl_admin", email: "dl_admin@dl-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "dl_finance", tenantId: T, clerkId: "dl_finance", email: "dl_finance@dl-test.invalid", roles: ["FINANCE"] },
      { id: "dl_buyer", tenantId: T, clerkId: "dl_buyer", email: "dl_buyer@dl-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dl_harbor" },
      { id: "dl_analyst", tenantId: T, clerkId: "dl_analyst", email: "dl_analyst@dl-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "dl_harbor" },
      { id: "dl_baker", tenantId: T, clerkId: "dl_baker", email: "dl_baker@dl-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "dl_bakery" },
      { id: "dl_jordan", tenantId: T, clerkId: "dl_jordan", email: "dl_jordan@dl-test.invalid", roles: ["ATHLETE"], athleteId: "dl_ath_jordan" },
    ] });
    const rule = (kind: string, bps: number, fixedCents = 0) => ({ id: `dl_${kind}`, tenantId: T, ruleKey: `dl_${kind}`, version: 1, kind, scope: "GLOBAL", bps, fixedCents, priority: 0, effectiveFrom: new Date("2026-01-01") });
    await prisma.commissionRule.createMany({ data: [rule("PLATFORM_FEE", 1500), rule("MANAGEMENT_FEE", 500), rule("PROCESSING", 290, 30), rule("REFERRAL", 200), rule("RESERVE", 1000)] });

    const hawks = await approveTeam("dl_onb_hawks", "Westfield Hawks DL", "dl_mgr");
    const lions = await approveTeam("dl_onb_lions", "Lakeside Lions", "dl_mgr2");
    Object.assign(E, { hawksTenant: hawks.tenantId, hawks: hawks.id, lionsTenant: lions.tenantId, lions: lions.id });
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await call("GET", "/me", "dl_mgr");
    await call("GET", "/me", "dl_mgr2");

    const riley = await call("POST", "/team/roster", "dl_mgr", { legalName: "Riley Carter", displayName: "RILEY.CARTER", email: "dl_riley@dl-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 });
    expect(riley.status, riley.text).toBe(201);
    E.riley = riley.json.id;
    const clinic = await call("POST", "/inventory", "dl_riley", { title: "Basketball clinic", kind: "CAMP", priceCents: 50_000, quantity: 20 });
    expect(clinic.status, clinic.text).toBe(201);
    E.hawksListing = await publish("dl_mgr", clinic.json.id, "Youth basketball clinic with Riley Carter");
    const shoot = await call("POST", "/inventory", "dl_jordan", { title: "Shooting session", kind: "CAMP", priceCents: 30_000, quantity: 20 });
    expect(shoot.status, shoot.text).toBe(201);
    E.jordanListing = await publish("dl_jordan", shoot.json.id, "Shooting session with Jordan Reed");

    E.order1 = await order([
      { listingId: E.hawksListing, quantity: 2, startsOn: at(10), endsOn: at(17) },
      { listingId: E.jordanListing, quantity: 1, startsOn: at(12), endsOn: at(13) },
    ], false);
    E.hawksLine1 = await lineOf(E.order1, E.hawksListing);
    E.jordanLine1 = await lineOf(E.order1, E.jordanListing);
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  describe("2S4-BE-06 · sellers see and are told about their sales", () => {
    it("the team and its athlete each read the line they sell, with their OWN share only", async () => {
      const team = await call("GET", "/sales", "dl_mgr");
      expect(team.status, team.text).toBe(200);
      expect(team.json.sales.map((s: { id: string }) => s.id)).toEqual([E.hawksLine1]);
      const riley = await call("GET", "/sales", "dl_riley");
      expect(riley.json.sales.map((s: { id: string }) => s.id)).toEqual([E.hawksLine1]);

      const teamShare = await partyShare(E.hawksLine1, "PROPERTY");
      const rileyShare = await partyShare(E.hawksLine1, "ATHLETE");
      expect(teamShare).toBeGreaterThan(0);
      expect(rileyShare).toBeGreaterThan(teamShare);
      expect(team.json.sales[0]).toMatchObject({
        ref: `SX-${E.order1.slice(-8).toUpperCase()}`, state: "UNPAID", shareCents: teamShare,
        sponsor: { name: "Harbor Coffee", contact: null },
        line: { title: "Youth basketball clinic with Riley Carter", quantity: 2, unit: "session", unitPriceCents: 50_000, soldBy: "Westfield Hawks DL" },
      });
      expect(riley.json.sales[0].shareCents).toBe(rileyShare);
      /* Never the other party's share, never BTG's commission, never the order's other line. */
      expect(team.text).not.toContain(String(rileyShare));
      expect(riley.text).not.toContain(String(teamShare));
      for (const t of [team.text, riley.text]) {
        expect(t).not.toMatch(/platformFee|managementFee|PLATFORM_REVENUE|processingCents|totalCents/);
        expect(t).not.toContain("Shooting session");
      }
    });

    it("an independent athlete reads only their own line; another team and the sponsor read none of these", async () => {
      const jordan = await call("GET", "/sales", "dl_jordan");
      expect(jordan.json.sales).toEqual([expect.objectContaining({ id: E.jordanLine1, shareCents: await partyShare(E.jordanLine1, "ATHLETE"), line: expect.objectContaining({ soldBy: "Jordan Reed" }) })]);
      expect(jordan.text).not.toContain("Riley");
      expect((await call("GET", "/sales", "dl_mgr2")).json.sales).toEqual([]);
      expect((await call("GET", `/sales/${E.hawksLine1}`, "dl_mgr2")).status).toBe(403);
      expect((await call("GET", `/sales/${E.hawksLine1}`, "dl_jordan")).status).toBe(403);
      expect((await call("GET", `/sales/${E.jordanLine1}`, "dl_riley")).status).toBe(403);
      for (const who of ["dl_buyer", "dl_admin", "dl_finance"]) expect((await call("GET", "/sales", who)).status, who).toBe(403);
      /* And a seller never reads the order itself, or its breakdown. */
      expect((await call("GET", `/marketplace-orders/${E.order1}`, "dl_mgr")).status).toBe(403);
      expect((await call("GET", `/marketplace-orders/${E.order1}/financials`, "dl_riley")).status).toBe(403);
    });

    it("each seller is emailed when the sale is approved — with their own lines only", async () => {
      const approved = (await emails()).filter((e) => e.template === "sale.approved");
      const to = (addr: string) => approved.find((e) => e.to === addr)!;
      expect(to("dl_mgr@dl-test.invalid").data.lines).toContain("Youth basketball clinic");
      expect(to("dl_riley@dl-test.invalid").data.lines).toContain("Youth basketball clinic");
      expect(to("dl_jordan@dl-test.invalid").data.lines).toContain("Shooting session");
      expect(to("dl_jordan@dl-test.invalid").data.lines).not.toContain("clinic");
      expect(to("dl_mgr@dl-test.invalid").data.lines).not.toContain("Shooting");
      expect(approved.some((e) => e.to.startsWith("dl_mgr2"))).toBe(false);
    });

    it("can't be marked delivered before payment; once paid, the sellers are emailed and the sponsor's contact appears", async () => {
      const early = await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_mgr", { note: "Too early" });
      expect(early.status).toBe(409);
      expect(early.json.error.message).toMatch(/once the sponsor has paid/);
      await payFor(E.order1);
      const sale = (await call("GET", `/sales/${E.hawksLine1}`, "dl_mgr")).json;
      expect(sale).toMatchObject({ state: "IN_DELIVERY", canMarkDelivered: true, sponsor: { contact: { name: TEST_BILLING.name, email: TEST_BILLING.email, phone: "(301) 555-0142" } } });
      expect(sale.paidAt).toBeTruthy();
      const paid = (await emails()).filter((e) => e.template === "sale.paid").map((e) => e.to);
      expect(paid).toEqual(expect.arrayContaining(["dl_mgr@dl-test.invalid", "dl_riley@dl-test.invalid", "dl_jordan@dl-test.invalid"]));
    });
  });

  describe("2S4-BE-07 · the seller marks it delivered; the sponsor confirms within 24 hours", () => {
    it("only the line's own sellers can mark it, and only with a note", async () => {
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_jordan", { note: "Not mine" })).status).toBe(403);
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_mgr2", { note: "Not ours" })).status).toBe(403);
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_buyer", { note: "Sponsor" })).status).toBe(403);
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_admin", { note: "BTG" })).status).toBe(403);
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_mgr", { note: "  " })).status).toBe(400);
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_mgr", { note: "ok", proofLink: "http://insecure.example" })).status).toBe(400);
      const wrongKey = await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_mgr", { note: "ok", proofKey: `t/${T}/delivery/${E.jordanLine1}/x.jpg` });
      expect(wrongKey.status).toBe(422);
      /* The photo upload is a private-bucket grant under this line's own key. */
      const grant = await call("POST", `/sales/${E.jordanLine1}/proof`, "dl_jordan", { contentType: "image/jpeg", bytes: 2048 });
      expect(grant.status, grant.text).toBe(201);
      expect(grant.json.key.startsWith(`t/${T}/delivery/${E.jordanLine1}/`)).toBe(true);
      expect((await call("POST", `/sales/${E.jordanLine1}/proof`, "dl_mgr", { contentType: "image/jpeg", bytes: 2048 })).status).toBe(403);
    });

    it("Jordan marks his line delivered: the sponsor is emailed with 24 hours to answer, and the order is in delivery", async () => {
      const r = await call("POST", `/sales/${E.jordanLine1}/delivered`, "dl_jordan", { note: "Session held, 12 kids.", proofLink: "https://instagram.example/p/1" });
      expect(r.status, r.text).toBe(200);
      const due = new Date(r.json.confirmDueAt).getTime();
      expect(due - Date.now()).toBeGreaterThan(23.9 * HOUR);
      expect(due - Date.now()).toBeLessThanOrEqual(24 * HOUR);
      expect((await call("GET", `/marketplace-orders/${E.order1}`, "dl_buyer")).json.state).toBe("IN_DELIVERY");
      expect((await call("POST", `/sales/${E.jordanLine1}/delivered`, "dl_jordan", { note: "Again" })).status).toBe(409);
      const mail = (await emails()).find((e) => e.template === "delivery.marked")!;
      expect(mail).toMatchObject({ to: "dl_buyer@dl-test.invalid", data: expect.objectContaining({ sellerName: "Jordan Reed", note: "Session held, 12 kids." }) });
      const view = (await call("GET", `/marketplace-orders/${E.order1}/deliveries`, "dl_buyer")).json.lines;
      expect(view.find((l: { lineId: string }) => l.lineId === E.jordanLine1)).toMatchObject({ state: "DELIVERED", canAnswer: true, seller: "Jordan Reed", proof: { photo: false, link: "https://instagram.example/p/1" } });
      expect(JSON.stringify(view)).not.toMatch(/shareCents|platformFee/);
      expect((await call("GET", `/deliveries/${E.jordanLine1}/proof`, "dl_buyer")).status).toBe(404);
    });

    it("staff can't mark the order fulfilled by hand while a line is unmarked or the sponsor's 24 hours are still running", async () => {
      for (const who of ["dl_admin", "dl_finance"]) {
        const r = await call("POST", `/marketplace-orders/${E.order1}/transition`, who, { to: "FULFILLED" });
        expect(r.status, `${who} ${r.text}`).toBe(409);
        expect(r.json.error.message).toMatch(/isn't settled yet/);
      }
      const line = await prisma.orderLineDelivery.findUniqueOrThrow({ where: { lineId: E.jordanLine1 }, select: { state: true, confirmedAt: true } });
      expect(line).toEqual({ state: "DELIVERED", confirmedAt: null });
    });

    it("money waits for confirmation: nothing of Jordan's is requestable until the sponsor confirms", async () => {
      expect((await call("GET", "/payouts/me", "dl_jordan")).json.totals.requestableCents).toBe(0);
      /* Not the analyst, not another sponsor, not the seller. */
      expect((await call("POST", `/deliveries/${E.jordanLine1}/confirm`, "dl_analyst")).status).toBe(403);
      expect((await call("POST", `/deliveries/${E.jordanLine1}/confirm`, "dl_baker")).status).toBe(403);
      expect((await call("POST", `/deliveries/${E.jordanLine1}/confirm`, "dl_jordan")).status).toBe(403);
      expect((await call("GET", `/marketplace-orders/${E.order1}/deliveries`, "dl_baker")).status).toBe(403);
      const ok = await call("POST", `/deliveries/${E.jordanLine1}/confirm`, "dl_buyer");
      expect(ok.json).toMatchObject({ state: "CONFIRMED" });
      expect((await call("POST", `/deliveries/${E.jordanLine1}/confirm`, "dl_buyer")).status).toBe(409);
      const me = (await call("GET", "/payouts/me", "dl_jordan")).json;
      expect(me.totals.requestableCents).toBeGreaterThan(0);
      expect(me.checks.find((c: { key: string }) => c.key === "delivered").ok).toBe(true);
      expect((await emails()).some((e) => e.template === "delivery.confirmed" && e.to === "dl_jordan@dl-test.invalid")).toBe(true);
      /* One line confirmed of two: the order is not delivered yet. */
      expect((await call("GET", `/marketplace-orders/${E.order1}`, "dl_buyer")).json.state).toBe("IN_DELIVERY");
    });

    it("Riley marks the team's line; Harbor reports a problem inside the 24 hours and the line's money is held", async () => {
      expect((await call("POST", `/sales/${E.hawksLine1}/delivered`, "dl_riley", { note: "Both clinics held, 18 kids each." })).status).toBe(200);
      expect((await call("GET", `/sales/${E.hawksLine1}`, "dl_mgr")).json).toMatchObject({ state: "DELIVERED", markedBy: "Riley Carter" });
      expect((await call("POST", `/deliveries/${E.hawksLine1}/problem`, "dl_buyer", { note: "" })).status).toBe(400);
      const p = await call("POST", `/deliveries/${E.hawksLine1}/problem`, "dl_buyer", { note: "We only saw one clinic." });
      expect(p.json).toMatchObject({ state: "PROBLEM" });
      const sent = await emails();
      expect(sent.some((e) => e.template === "delivery.problem" && e.to === "dl_admin@dl-test.invalid")).toBe(true);
      expect(sent.filter((e) => e.template === "delivery.onHold").map((e) => e.to)).toEqual(expect.arrayContaining(["dl_mgr@dl-test.invalid", "dl_riley@dl-test.invalid"]));
      for (const who of ["dl_riley", "dl_mgr"]) {
        const me = (await call("GET", "/payouts/me", who)).json;
        expect(me.totals.requestableCents, who).toBe(0);
        expect(me.checks.find((c: { key: string }) => c.key === "problem")?.ok, who).toBe(false);
      }
      /* BTG can't close the order out by hand over a reported problem. */
      const fulfil = await call("POST", `/marketplace-orders/${E.order1}/transition`, "dl_admin", { to: "FULFILLED" });
      expect(fulfil.status).toBe(409);
      expect(fulfil.json.error.message).toMatch(/Delivery issues/);
    });

    it("a problem can't be reported after the 24 hours — silence has already confirmed it (pure rules, too)", async () => {
      const id = await order([{ listingId: E.jordanListing, quantity: 1, startsOn: at(20), endsOn: at(21) }], true);
      const line = await lineOf(id, E.jordanListing);
      await call("POST", `/sales/${line}/delivered`, "dl_jordan", { note: "Done." });
      const late = new Date(Date.now() + 25 * HOUR);
      await expect(reportProblem(sponsorActor, line, "Too late", late)).rejects.toThrow(/24 hours to report a problem have passed/);
      expect(canAnswer({ state: "DELIVERED", confirmDueAt: new Date(Date.now() + HOUR) }, new Date())).toBe(true);
      expect(canAnswer({ state: "DELIVERED", confirmDueAt: new Date(Date.now() - 1) }, new Date())).toBe(false);
      expect(lineDates(new Date("2026-10-10T10:00:00Z"), new Date("2026-10-10T18:00:00Z"))).toEqual(["2026-10-10"]);
      expect(isOverdue({ state: "IN_DELIVERY", endsOn: new Date(Date.now() - 2 * DAY) }, new Date())).toBe(true);
      expect(isOverdue({ state: "DELIVERED", endsOn: new Date(Date.now() - 2 * DAY) }, new Date())).toBe(false);
      /* The sweep: silence confirms; run twice, nothing more changes. */
      expect((await sweepDeliveries(late, { tenantIds: [T] })).confirmed).toBe(1);
      expect((await sweepDeliveries(late, { tenantIds: [T] })).confirmed).toBe(0);
      expect((await call("GET", `/sales/${line}`, "dl_jordan")).json).toMatchObject({ state: "CONFIRMED", confirmedBy: "NO_ANSWER" });
      expect((await call("GET", `/marketplace-orders/${id}`, "dl_buyer")).json.state).toBe("FULFILLED");
    });

    it("BTG's desk lists the problem with the money on hold; only BTG admin reads it", async () => {
      const desk = await call("GET", "/delivery-issues", "dl_admin");
      expect(desk.status, desk.text).toBe(200);
      const p = desk.json.problems.find((x: { id: string }) => x.id === E.hawksLine1);
      expect(p).toMatchObject({
        state: "PROBLEM", seller: { name: "Riley Carter", sub: "Westfield Hawks DL" }, sponsor: { name: "Harbor Coffee" },
        sponsorMessage: { text: "We only saw one clinic." }, sellerNote: { text: "Both clinics held, 18 kids each.", proofCount: 0 },
        hold: { sellerShareCents: await partyShare(E.hawksLine1, "ATHLETE"), teamShareCents: await partyShare(E.hawksLine1, "PROPERTY"), sponsorPaidCents: 100_000 },
      });
      expect((await call("GET", `/delivery-issues/${E.hawksLine1}`, "dl_admin")).json.history.map((h: { text: string }) => h.text)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^Paid/), "Marked delivered by Riley Carter", expect.stringMatching(/^Problem reported/)]),
      );
      for (const who of ["dl_finance", "dl_mgr", "dl_riley", "dl_buyer"]) {
        expect((await call("GET", "/delivery-issues", who)).status, who).toBe(403);
        expect((await call("POST", `/delivery-issues/${E.hawksLine1}/resolve`, who, { decision: "CONFIRM", note: "x" })).status, who).toBe(403);
      }
    });

    it("BTG confirms it: the hold ends, and with every line settled the order is delivered", async () => {
      expect((await call("POST", `/delivery-issues/${E.hawksLine1}/resolve`, "dl_admin", { decision: "CONFIRM" })).status).toBe(400);
      const r = await call("POST", `/delivery-issues/${E.hawksLine1}/resolve`, "dl_admin", { decision: "CONFIRM", note: "Spoke to both sides; two clinics were held." });
      expect(r.json).toMatchObject({ state: "CONFIRMED" });
      expect((await call("POST", `/delivery-issues/${E.hawksLine1}/resolve`, "dl_admin", { decision: "REFUND", note: "again" })).status).toBe(409);
      expect((await call("GET", `/marketplace-orders/${E.order1}`, "dl_buyer")).json.state).toBe("FULFILLED");
      expect((await call("GET", "/payouts/me", "dl_riley")).json.totals.requestableCents).toBeGreaterThan(0);
      const resolved = (await emails()).filter((e) => e.template === "delivery.resolved").map((e) => e.to);
      expect(resolved).toEqual(expect.arrayContaining(["dl_buyer@dl-test.invalid", "dl_mgr@dl-test.invalid", "dl_riley@dl-test.invalid"]));
    });

    it("BTG refunds one line of two: only that line's books are reversed; the other line and the order carry on", async () => {
      const id = await order([
        { listingId: E.hawksListing, quantity: 1, startsOn: at(30), endsOn: at(31) },
        { listingId: E.jordanListing, quantity: 1, startsOn: at(30), endsOn: at(31) },
      ], true);
      const hawks = await lineOf(id, E.hawksListing);
      const jordan = await lineOf(id, E.jordanListing);
      await call("POST", `/sales/${hawks}/delivered`, "dl_mgr", { note: "Clinic held." });
      await call("POST", `/sales/${jordan}/delivered`, "dl_jordan", { note: "Session held." });
      await call("POST", `/deliveries/${hawks}/problem`, "dl_buyer", { note: "Nobody came." });
      await call("POST", `/deliveries/${jordan}/confirm`, "dl_buyer");
      expect((await call("POST", `/delivery-issues/${hawks}/resolve`, "dl_admin", { decision: "REFUND", note: "No-show confirmed; refunding the clinic." })).json.state).toBe("REFUNDED");
      const reversed = await prisma.ledgerEntry.findMany({ where: { orderId: id, entryType: "REVERSAL" }, select: { lineId: true } });
      expect(reversed.length).toBeGreaterThan(0);
      expect(new Set(reversed.map((r) => r.lineId))).toEqual(new Set([hawks]));
      expect(await prisma.ledgerEntry.count({ where: { lineId: jordan, status: "REVERSED" } })).toBe(0);
      expect((await call("GET", `/marketplace-orders/${id}`, "dl_buyer")).json.state).toBe("FULFILLED");
      expect((await call("GET", `/sales/${hawks}`, "dl_mgr")).json).toMatchObject({ state: "REFUNDED", resolution: { decision: "REFUNDED" } });
      expect((await call("GET", "/team/ledger", "dl_mgr")).json.reconciles).toBe(true);
    });

    it("BTG refunds the only line: the order's own refund — REFUNDED, every entry reversed", async () => {
      const id = await order([{ listingId: E.hawksListing, quantity: 1, startsOn: at(40), endsOn: at(41) }], true);
      const line = await lineOf(id, E.hawksListing);
      await call("POST", `/sales/${line}/delivered`, "dl_mgr", { note: "Clinic held." });
      await call("POST", `/deliveries/${line}/problem`, "dl_buyer", { note: "Wrong venue." });
      expect((await call("POST", `/delivery-issues/${line}/resolve`, "dl_admin", { decision: "REFUND", note: "Refunding." })).json.state).toBe("REFUNDED");
      expect((await call("GET", `/marketplace-orders/${id}`, "dl_buyer")).json.state).toBe("REFUNDED");
      expect(await prisma.ledgerEntry.count({ where: { orderId: id, entryType: "BOOKING", status: { not: "REVERSED" } } })).toBe(0);
    });
  });

  describe("2S4-BE-08 · delivery reminders and automatic close", () => {
    let id = "";
    let line = "";
    it("an overdue line reminds the seller and the team's manager once, and shows on BTG's desk", async () => {
      id = await order([{ listingId: E.hawksListing, quantity: 1, startsOn: at(3), endsOn: at(4) }], true);
      line = await lineOf(id, E.hawksListing);
      const later = new Date(Date.now() + 6 * DAY);
      expect((await deliveryIssues(adminActor, later)).overdue.map((o) => o.id)).toContain(line);
      expect((await sweepDeliveries(later, { tenantIds: [T] })).reminded).toBe(1);
      expect((await sweepDeliveries(later, { tenantIds: [T] })).reminded).toBe(0);
      const sent = (await emails()).filter((e) => e.template === "delivery.overdue" && e.idempotencyKey.includes(line)).map((e) => e.to);
      expect(sent.sort()).toEqual(["dl_mgr@dl-test.invalid", "dl_riley@dl-test.invalid"]);
      expect((await deliveryIssues(adminActor, later)).overdue.find((o) => o.id === line)?.remindedAt).toBeTruthy();
      /* BTG's own "Remind seller" — staff only. */
      expect((await call("POST", `/delivery-issues/${line}/remind`, "dl_mgr")).status).toBe(403);
      expect((await call("POST", `/delivery-issues/${line}/remind`, "dl_admin")).status).toBe(200);
    });

    it("30 days after its last line is confirmed the order closes itself and the reserve becomes payable — once", async () => {
      await call("POST", `/sales/${line}/delivered`, "dl_mgr", { note: "Clinic held." });
      await call("POST", `/deliveries/${line}/confirm`, "dl_buyer");
      expect((await call("GET", `/marketplace-orders/${id}`, "dl_buyer")).json.state).toBe("FULFILLED");
      expect((await sweepDeliveries(new Date(Date.now() + 29 * DAY), { tenantIds: [T] })).closed).toBe(0);
      const closing = new Date(Date.now() + 31 * DAY);
      expect((await sweepDeliveries(closing, { tenantIds: [T] })).closed).toBeGreaterThanOrEqual(1);
      expect((await call("GET", `/marketplace-orders/${id}`, "dl_buyer")).json.state).toBe("CLOSED");
      expect(await prisma.ledgerEntry.count({ where: { orderId: id, entryType: "RESERVE_RELEASE" } })).toBeGreaterThan(0);
      const again = await sweepDeliveries(closing, { tenantIds: [T] });
      expect(again).toMatchObject({ confirmed: 0, reminded: 0, closed: 0, failed: 0 });
      expect((await call("GET", "/team/ledger", "dl_mgr")).json.reconciles).toBe(true);
    });
  });
});
