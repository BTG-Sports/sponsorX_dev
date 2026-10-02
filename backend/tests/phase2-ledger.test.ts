import { readdirSync, readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { transitionBody } from "./support/order-payment";
import { settleDeliveries } from "./support/delivery";

/* --------------------------------------------------------------------------
   Phase 2 batch 6, against the real API and database — the money side:

     2S0-PMO-02 (simulated) documentation/SponsorX-Phase2-Ledger-Design.md —
                its worked example is posted here and every figure asserted.
     2S5-BE-01  Rules apply in priority order; editing a rule never alters a
                closed payout.
     2S4-BE-04  Commission snapshot is created at contract time and does not
                change when commission rules are later edited.
     2S5-BE-02  Property dashboard reconciles booked revenue, ledger balance,
                paid earnings and pending earnings exactly.
     2S5-SEC-01 Immutable audit history exists for all financial and admin
                changes.
     2S7-DATA-01 Property analytics reconcile to the ledger and campaign records.
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

const { breakdownOrder, pct, NO_RULE } = await import("../src/domain/ledger-math");

describe("the sequential breakdown, as the design states it (pure)", () => {
  const r = (bps: number, fixedCents = 0) => ({ ...NO_RULE, bps, fixedCents });
  const rules = { PLATFORM_FEE: r(1500), MANAGEMENT_FEE: r(500), REFERRAL: r(200), RESERVE: r(1000), TEAM_SHARE: r(0) };
  it("reproduces the design's worked example to the cent, and every line sums to its net", () => {
    const out = breakdownOrder([
      { lineId: "banner", grossCents: 120_000, rules },
      { lineId: "clinic", grossCents: 100_000, rules, athleteId: "riley", teamShareBps: 2000 },
      { lineId: "shout", grossCents: 59_997, rules },
    ], r(290, 30));
    expect(out.map((b) => [b.netCents, b.platformFeeCents, b.managementFeeCents, b.processingCents, b.propertyShareCents, b.referralCents, b.reserveCents, b.availableCents])).toEqual([
      [120_000, 18_000, 6_000, 3_493, 92_507, 1_850, 9_251, 81_406],
      [100_000, 15_000, 5_000, 2_911, 77_089, 1_542, 7_709, 67_838],
      [59_997, 9_000, 3_000, 1_746, 46_251, 925, 4_625, 40_701],
    ]);
    expect(out[1]).toMatchObject({ teamAvailableCents: 13_568, teamReserveCents: 1_542 });
    for (const b of out) expect(b.platformFeeCents + b.managementFeeCents + b.processingCents + b.referralCents + b.reserveCents + b.availableCents).toBe(b.netCents);
    expect(out.reduce((s, b) => s + b.processingCents, 0)).toBe(8_150);
  });
  it("the last line takes the processing remainder, so no cent of it is lost to rounding", () => {
    const three = breakdownOrder(["a", "b", "c"].map((lineId) => ({ lineId, grossCents: 100, rules })), r(0, 10));
    expect(three.map((b) => b.processingCents)).toEqual([3, 3, 4]);
    expect(three.reduce((s, b) => s + b.processingCents, 0)).toBe(10);
  });
  it("rounds half up, and never lets fees exceed the sale", () => {
    expect(pct(59_997, 1500)).toBe(9_000); // 8,999.55
    expect(pct(1, 5000)).toBe(1); // 0.5
    expect(() => breakdownOrder([{ lineId: "x", grossCents: 100, rules: { ...rules, PLATFORM_FEE: r(9000, 50) } }], r(0))).toThrow(/negative/);
  });
  it("rules are read in one place only — the contract-time resolver", () => {
    /* fileURLToPath, not .pathname: the latter is "/D:/…" with %20 on Windows. */
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? (e.name === "generated" ? [] : walk(`${d}${e.name}/`)) : e.name.endsWith(".ts") ? [`${d}${e.name}`] : []);
    const readers = walk(src).filter((f) => /\.commissionRule\./.test(readFileSync(f, "utf8"))).map((f) => f.slice(src.length));
    expect(readers).toEqual(["domain/commission.ts"]);
    const callers = walk(src).filter((f) => /\bresolveRates\(/.test(readFileSync(f, "utf8"))).map((f) => f.slice(src.length)).sort();
    expect(callers).toEqual(["domain/commission.ts", "domain/ledger.ts"]);
  });
});

const seededDb = await import("./support/seeded-db");
/* 2S4-FE-02 — every order is placed through the contract gate. */
const { issueOrderTerms, placeOrderBody } = await import("./support/order-terms");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("the money side over the API", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { resolveRates } = await import("../src/domain/commission");

  const T = "lg_btg";
  const R = "lg_rules"; // a second operator, for the priority cases
  const L: Record<string, string> = {};
  const I: Record<string, string> = {};
  const E = { tenant: "", property: "", riley: "" };
  const F = { tenant: "", property: "" };
  let orderId = "";
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
  const admin = (id: string, tenantId: string) => ({ userId: id, tenantId, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null });

  async function tenantsInPlay() {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'lg\\_%@lg-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, R,
    );
    return [T, R, ...outside.map((r) => r.id)];
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
  async function approveTeam(key: string, name: string) {
    await prisma.propertyOnboarding.create({ data: {
      id: `lg_onb_${key}`, tenantId: T, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: `lg_mgr_${key}@lg-test.invalid`, role: "GM", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(admin("lg_admin", T), `lg_onb_${key}`, "APPROVE");
    return prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
  }
  async function publish(key: string, item: Record<string, unknown>, owner = "lg_mgr_e") {
    I[key] = (await call("POST", "/inventory", owner, item)).json.id;
    L[key] = (await call("POST", "/listings", "lg_mgr_e", { inventoryItemId: I[key], title: `${item.title}`, description: "A description long enough for governance." })).json.id;
    /* 2S3-BE-06 — a clean submit goes live on its own. */
    expect((await call("POST", `/listings/${L[key]}/submit`, "lg_mgr_e")).json.state).toBe("PUBLISHED");
  }
  async function placed(lines: Array<{ key: string; quantity: number; day: number }>) {
    await call("POST", "/cart", "lg_s1_admin");
    for (const l of lines) expect((await call("POST", "/cart/lines", "lg_s1_admin", { listingId: L[l.key], quantity: l.quantity, startsOn: at(l.day), endsOn: at(l.day) })).status).toBe(201);
    const hold = (await call("POST", "/cart/reserve", "lg_s1_admin")).json;
    return (await call("POST", "/marketplace-orders", "lg_s1_admin", placeOrderBody(hold.id, `${T}_order_terms`))).json;
  }
  const dashboard = async (who = "lg_mgr_e") => (await call("GET", "/team/ledger", who)).json;
  /* Every column of every row, as the database holds them. */
  const ledgerFingerprint = async () => JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM "LedgerEntry" WHERE "tenantId" = $1 ORDER BY id`, T));
  const snapshotOf = async (id: string) => JSON.stringify(await prisma.$queryRawUnsafe(`SELECT * FROM "OrderLineFinancials" WHERE "orderId" = $1 ORDER BY "lineId"`, id));

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Ledger BTG" }, { id: R, name: "Rules operator" }] });
    await issueOrderTerms(prisma, T);
    await prisma.sponsor.createMany({ data: [
      { id: "lg_s1", tenantId: T, name: "Harbor Apparel", categories: ["APPAREL"] },
      { id: "lg_r_s1", tenantId: R, name: "Rules sponsor one", categories: ["APPAREL"] },
      { id: "lg_r_s2", tenantId: R, name: "Rules sponsor two", categories: ["APPAREL"] },
    ] });
    await prisma.user.createMany({ data: [
      { id: "lg_admin", tenantId: T, clerkId: "lg_admin", email: "lg_admin@lg-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "lg_finance", tenantId: T, clerkId: "lg_finance", email: "lg_finance@lg-test.invalid", roles: ["FINANCE"] },
      { id: "lg_s1_admin", tenantId: T, clerkId: "lg_s1_admin", email: "lg_s1_admin@lg-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "lg_s1" },
      { id: "lg_r_admin", tenantId: R, clerkId: "lg_r_admin", email: "lg_r_admin@lg-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    Object.assign(E, await approveTeam("e", "Bowie Bulldogs LG").then((p) => ({ tenant: p.tenantId, property: p.id })));
    Object.assign(F, await approveTeam("f", "Laurel Lions LG").then((p) => ({ tenant: p.tenantId, property: p.id })));
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    E.riley = (await call("POST", "/team/roster", "lg_mgr_e", { legalName: "Riley Chen", displayName: "RILEY", email: "lg_riley@lg-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 2000 })).json.id;
    await publish("banner", { title: "Courtside banner", kind: "SIGNAGE", priceCents: 120_000, quantity: 1 });
    await publish("clinic", { title: "Riley's clinic", kind: "CAMP", priceCents: 50_000, quantity: 5 }, "lg_riley");
    await publish("shout", { title: "Scoreboard shout-out", kind: "SIGNAGE", priceCents: 19_999, quantity: 100 });
    await publish("sticker", { title: "Team sticker pack", kind: "OTHER", priceCents: 5_000, quantity: 100 });
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── 2S5-BE-01 ─────────────────────────────────────────────────────────── */
  describe("2S5-BE-01 · commission rules", () => {
    it("BTG admin sets the design's simulated rates as versioned rules; nobody else may", async () => {
      const make = (body: Record<string, unknown>) => call("POST", "/commission-rules", "lg_admin", body);
      for (const body of [
        { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 1500, priority: 0, note: "SIMULATED — ledger design §5" },
        { kind: "MANAGEMENT_FEE", scope: "GLOBAL", bps: 500, priority: 0 },
        { kind: "PROCESSING", scope: "GLOBAL", bps: 290, fixedCents: 30, priority: 0 },
        { kind: "REFERRAL", scope: "PROPERTY", scopeRef: E.property, bps: 200, priority: 0, note: "Bowie referred by a partner" },
        { kind: "RESERVE", scope: "GLOBAL", bps: 1000, priority: 0 },
      ]) {
        const r = await make(body);
        expect(r.status, r.text).toBe(201);
        expect(r.json).toMatchObject({ version: 1, effectiveTo: null });
      }
      expect((await make({ kind: "PLATFORM_FEE", scope: "GLOBAL", scopeRef: "x", bps: 100, priority: 0 })).status).toBe(422);
      expect((await make({ kind: "RESERVE", scope: "GLOBAL", bps: 100, fixedCents: 5, priority: 0 })).status).toBe(422);
      expect((await call("POST", "/commission-rules", "lg_s1_admin", { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 0, priority: 99 })).status).toBe(403);
      /* "Only admin" (programme owner, 2026-09-28): Finance reads the rules, and cannot write them. */
      expect((await call("POST", "/commission-rules", "lg_finance", { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 0, priority: 99 })).status).toBe(403);
      expect((await call("GET", "/commission-rules", "lg_finance")).status).toBe(200);
      expect((await call("POST", "/commission-rules", "lg_mgr_e", { kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 0, priority: 99 })).status).toBe(403);
      expect((await call("GET", "/commission-rules", "lg_mgr_e")).status).toBe(403);
    });

    it("the highest-priority rule in effect applies; a tie goes to the latest version; a sponsor rule can outrank", async () => {
      const make = (body: Record<string, unknown>) => call("POST", "/commission-rules", "lg_r_admin", body).then((r) => { expect(r.status, r.text).toBe(201); return r.json; });
      await make({ kind: "PLATFORM_FEE", scope: "GLOBAL", bps: 1500, priority: 0 });
      await make({ kind: "PLATFORM_FEE", scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1200, priority: 5 });
      await make({ kind: "PLATFORM_FEE", scope: "PROPERTY", scopeRef: "lg_prop_x", bps: 1000, priority: 10, effectiveFrom: at(30) }); // not yet in effect
      await make({ kind: "PLATFORM_FEE", scope: "SPONSOR", scopeRef: "lg_r_s2", bps: 800, priority: 20 });
      const rate = async (ctx: Record<string, string>, when = new Date()) => (await prisma.$transaction((tx) => resolveRates(tx, R, ctx, when))).PLATFORM_FEE.bps;
      expect(await rate({ propertyKind: "TEAM", propertyId: "lg_prop_x", sponsorId: "lg_r_s1" })).toBe(1200);
      expect(await rate({ propertyKind: "SCHOOL", propertyId: "lg_prop_y", sponsorId: "lg_r_s1" })).toBe(1500);
      expect(await rate({ propertyKind: "TEAM", propertyId: "lg_prop_x", sponsorId: "lg_r_s2" })).toBe(800);
      expect(await rate({ propertyKind: "TEAM", propertyId: "lg_prop_x", sponsorId: "lg_r_s1" }, new Date(at(31)))).toBe(1000); // its window has opened
      /* Revising the team rule: the new version from now, the old one before. */
      const team = (await call("GET", "/commission-rules?current=true", "lg_r_admin")).json.rules.find((r: { scope: string }) => r.scope === "PROPERTY_KIND");
      const before = new Date();
      await new Promise((res) => setTimeout(res, 5));
      const v2 = await call("POST", `/commission-rules/${team.id}/revise`, "lg_r_admin", { bps: 1100 });
      expect(v2.json).toMatchObject({ ruleKey: team.ruleKey, version: 2, bps: 1100 });
      expect(await rate({ propertyKind: "TEAM", propertyId: "lg_prop_x", sponsorId: "lg_r_s1" })).toBe(1100);
      expect(await rate({ propertyKind: "TEAM", propertyId: "lg_prop_x", sponsorId: "lg_r_s1" }, before)).toBe(1200);
      expect((await call("POST", `/commission-rules/${team.id}/revise`, "lg_r_admin", { bps: 900 })).status).toBe(409); // only the current version
    });
  });

  /* ── 2S5-FE-01 · the preview behind the admin screen ─────────────────── */
  describe("2S5-FE-01 · previewing a sample order, with and without an unsaved rule", () => {
    it("reproduces the design's example under the rules in effect, and shows what a draft would change — writing nothing", async () => {
      const sample = {
        lines: [
          { label: "Banner", grossCents: 120_000, propertyKind: "TEAM", propertyId: E.property },
          { label: "Clinic", grossCents: 100_000, propertyKind: "TEAM", propertyId: E.property, athleteItem: true, teamShareBps: 2000 },
          { label: "Shout-out", grossCents: 59_997, propertyKind: "TEAM", propertyId: E.property },
        ],
        draft: { kind: "PLATFORM_FEE", scope: "PROPERTY_KIND", scopeRef: "TEAM", bps: 1000, priority: 5 },
      };
      const rulesBefore = await prisma.commissionRule.count({ where: { tenantId: T } });
      const r = await call("POST", "/commission-rules/preview", "lg_admin", sample);
      expect(r.status, r.text).toBe(200);
      expect(r.json.current.lines.map((l: { availableCents: number }) => l.availableCents)).toEqual([81_406, 67_838, 40_701]);
      expect(r.json.current.lines[1]).toMatchObject({ lineId: "Clinic", teamAvailableCents: 13_568 });
      expect(r.json.current.totals).toMatchObject({ netCents: 279_997, processingCents: 8_150 });
      /* The draft outranks the 15% global rule for teams: 10% instead. */
      expect(r.json.withDraft.lines[0]).toMatchObject({ platformFeeCents: 12_000 });
      expect(r.json.withDraft.lines[0].rules.PLATFORM_FEE).toMatchObject({ ruleId: "draft", bps: 1000 });
      /* A draft for schools does not touch this team's order. */
      const school = await call("POST", "/commission-rules/preview", "lg_admin", { ...sample, draft: { ...sample.draft, scopeRef: "SCHOOL" } });
      expect(school.json.withDraft.totals).toEqual(school.json.current.totals);
      expect(await prisma.commissionRule.count({ where: { tenantId: T } })).toBe(rulesBefore);
      /* Admin only. */
      expect((await call("POST", "/commission-rules/preview", "lg_finance", sample)).status).toBe(403);
      expect((await call("POST", "/commission-rules/preview", "lg_mgr_e", sample)).status).toBe(403);
    });
  });

  /* ── 2S4-BE-04 / 2S5-BE-02 ─────────────────────────────────────────────── */
  describe("2S4-BE-04 / 2S5-BE-02 · booked at contract time, reconciled exactly", () => {
    it("the design's worked example, contracted: every figure frozen, every journal balanced", async () => {
      const o = await placed([{ key: "banner", quantity: 1, day: 10 }, { key: "clinic", quantity: 2, day: 11 }, { key: "shout", quantity: 3, day: 12 }]);
      /* 2S4-BE-09 — within the sponsor's $5,000 limit: contracted (and booked) as it is placed, and waiting for payment. */
      expect(o).toMatchObject({ state: "AWAITING_PAYMENT", totalCents: 279_997, decidedBy: "system" });
      orderId = o.id;
      expect((await call("POST", `/marketplace-orders/${orderId}/decision`, "lg_admin", { decision: "APPROVE" })).status).toBe(409); // nothing for BTG to decide

      const fin = (await call("GET", `/marketplace-orders/${orderId}/financials`, "lg_finance")).json.lines;
      const byNet = new Map(fin.map((l: { netCents: number }) => [l.netCents, l]));
      expect(byNet.get(120_000)).toMatchObject({ platformFeeCents: 18_000, managementFeeCents: 6_000, processingCents: 3_493, propertyShareCents: 92_507, referralCents: 1_850, reserveCents: 9_251, availableCents: 81_406, athleteId: null });
      expect(byNet.get(100_000)).toMatchObject({ platformFeeCents: 15_000, processingCents: 2_911, propertyShareCents: 77_089, availableCents: 67_838, teamShareBps: 2000, teamAvailableCents: 13_568, teamReserveCents: 1_542, athleteId: E.riley });
      expect(byNet.get(59_997)).toMatchObject({ platformFeeCents: 9_000, managementFeeCents: 3_000, processingCents: 1_746, propertyShareCents: 46_251, referralCents: 925, reserveCents: 4_625, availableCents: 40_701 });
      expect((byNet.get(120_000) as { rules: { PLATFORM_FEE: { version: number; bps: number } } }).rules.PLATFORM_FEE).toMatchObject({ version: 1, bps: 1500 });

      /* Balanced journals: one per line, debits = credits, receivable = the order. */
      const journals = await prisma.ledgerEntry.groupBy({ by: ["journalId"], where: { orderId }, _sum: { debitCents: true, creditCents: true } });
      expect(journals).toHaveLength(3);
      for (const j of journals) expect(j._sum.debitCents).toBe(j._sum.creditCents);
      expect((await prisma.ledgerEntry.aggregate({ where: { orderId, account: "SPONSOR_RECEIVABLE" }, _sum: { debitCents: true } }))._sum.debitCents).toBe(279_997);
      const athlete = await prisma.ledgerEntry.findMany({ where: { orderId, partyType: "ATHLETE" }, select: { account: true, creditCents: true }, orderBy: { account: "asc" } });
      expect(athlete).toEqual([{ account: "ATHLETE_PAYABLE", creditCents: 54_270 }, { account: "RESERVE_HELD", creditCents: 6_167 }]);

      /* The margin is BTG's and Finance's: not the sponsor's, not the property's. */
      expect((await call("GET", `/marketplace-orders/${orderId}/financials`, "lg_s1_admin")).status).toBe(403);
      expect((await call("GET", `/marketplace-orders/${orderId}/financials`, "lg_mgr_e")).status).toBe(403);
    });

    it("the property dashboard reconciles exactly — through payment and the reserve's release", async () => {
      expect(await dashboard()).toEqual({
        currency: "USD", bookedRevenueCents: 151_093, reversedCents: 0, paidEarningsCents: 0, ledgerBalanceCents: 151_093,
        pendingEarnings: { awaitingSponsorPaymentCents: 135_675, availableCents: 0, reservedCents: 15_418, totalCents: 151_093 }, reconciles: true,
      });
      expect((await call("POST", `/marketplace-orders/${orderId}/transition`, "lg_finance", transitionBody("PAID"))).json.state).toBe("PAID");
      expect((await dashboard()).pendingEarnings).toEqual({ awaitingSponsorPaymentCents: 0, availableCents: 135_675, reservedCents: 15_418, totalCents: 151_093 });
      for (const to of ["IN_DELIVERY", "FULFILLED", "CLOSED"]) {
        if (to === "FULFILLED") await settleDeliveries(prisma, orderId);
        await call("POST", `/marketplace-orders/${orderId}/transition`, "lg_finance", { to });
      }
      const closed = await dashboard();
      expect(closed).toMatchObject({ bookedRevenueCents: 151_093, ledgerBalanceCents: 151_093, reconciles: true });
      expect(closed.pendingEarnings).toEqual({ awaitingSponsorPaymentCents: 0, availableCents: 151_093, reservedCents: 0, totalCents: 151_093 });
      /* Another property sees none of it. */
      expect(await dashboard("lg_mgr_f")).toMatchObject({ bookedRevenueCents: 0, ledgerBalanceCents: 0, reconciles: true });
    });

    it("a refund reverses what was booked — and the dashboard still reconciles", async () => {
      const small = await placed([{ key: "sticker", quantity: 2, day: 20 }]); // within the limit: policy approves it
      expect(small.state).toBe("AWAITING_PAYMENT");
      const booked = (await prisma.orderLineFinancials.findFirstOrThrow({ where: { orderId: small.id }, select: { availableCents: true, reserveCents: true } }));
      for (const to of ["PAID", "REFUNDED"]) expect((await call("POST", `/marketplace-orders/${small.id}/transition`, "lg_finance", transitionBody(to))).json.state).toBe(to);
      const d = await dashboard();
      expect(d.bookedRevenueCents).toBe(151_093 + booked.availableCents + booked.reserveCents);
      expect(d.reversedCents).toBe(booked.availableCents + booked.reserveCents);
      expect(d).toMatchObject({ ledgerBalanceCents: 151_093, reconciles: true });
      const journals = await prisma.ledgerEntry.groupBy({ by: ["journalId"], where: { orderId: small.id }, _sum: { debitCents: true, creditCents: true } });
      for (const j of journals) expect(j._sum.debitCents).toBe(j._sum.creditCents);
    });

    it("editing a rule later alters no snapshot, no entry, no dashboard — and applies to the next order", async () => {
      const snapshot = await snapshotOf(orderId);
      const entries = await ledgerFingerprint();
      const board = await dashboard();
      const platform = (await call("GET", "/commission-rules?current=true", "lg_finance")).json.rules.find((r: { kind: string }) => r.kind === "PLATFORM_FEE");
      expect((await call("POST", `/commission-rules/${platform.id}/revise`, "lg_finance", { bps: 2500 })).status).toBe(403);
      expect((await call("POST", `/commission-rules/${platform.id}/revise`, "lg_admin", { bps: 2500 })).json).toMatchObject({ version: 2, bps: 2500 });
      expect(await snapshotOf(orderId)).toBe(snapshot);
      expect(await ledgerFingerprint()).toBe(entries);
      expect(await dashboard()).toEqual(board);
      /* The next contract uses version 2. */
      const next = await placed([{ key: "sticker", quantity: 1, day: 25 }]);
      const nextFin = await prisma.orderLineFinancials.findFirstOrThrow({ where: { orderId: next.id }, select: { platformFeeCents: true, rules: true } });
      expect(nextFin.platformFeeCents).toBe(pct(5_000, 2500));
      expect((nextFin.rules as { PLATFORM_FEE: { version: number } }).PLATFORM_FEE.version).toBe(2);
    });

    it("Postgres keeps them: no rule, snapshot or entry can be rewritten, and status only moves forward", async () => {
      const ruleId = (await prisma.commissionRule.findFirstOrThrow({ where: { tenantId: T, kind: "RESERVE" }, select: { id: true } })).id;
      await expect(prisma.$executeRawUnsafe(`UPDATE "CommissionRule" SET bps = 0 WHERE id = $1`, ruleId)).rejects.toThrow(/commission_rule_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "OrderLineFinancials" SET "platformFeeCents" = 0 WHERE "orderId" = $1`, orderId)).rejects.toThrow(/order_line_financials_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET "creditCents" = "creditCents" + 1 WHERE "orderId" = $1 AND "creditCents" > 0`, orderId)).rejects.toThrow(/ledger_entry_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "LedgerEntry" SET status = 'PENDING' WHERE "orderId" = $1 AND status = 'AVAILABLE'`, orderId)).rejects.toThrow(/only moves forward/);
    });
  });

  /* ── 2S5-SEC-01 ────────────────────────────────────────────────────────── */
  describe("2S5-SEC-01 · an immutable audit history of every financial and admin change", () => {
    it("every money move is audited", async () => {
      const actions = new Set((await prisma.auditLog.findMany({ where: { tenantId: T }, select: { action: true } })).map((a) => a.action));
      for (const a of ["commission.create", "commission.revise", "marketplaceOrder.place", "marketplaceOrder.approve", "ledger.book",
        "marketplaceOrder.paid", "ledger.markPaid", "marketplaceOrder.closed", "ledger.releaseReserve", "marketplaceOrder.refunded", "ledger.reverse"]) {
        expect(actions, a).toContain(a);
      }
      const revise = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "commission.revise" }, select: { actorId: true, before: true, after: true } });
      expect(revise).toMatchObject({ actorId: "lg_admin", before: { bps: 1500, version: 1 }, after: { bps: 2500, version: 2 } });
    });

    it("the audit log cannot be rewritten or deleted", async () => {
      const row = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "commission.revise" }, select: { id: true } });
      await expect(prisma.$executeRawUnsafe(`UPDATE "AuditLog" SET action = 'x' WHERE id = $1`, row.id)).rejects.toThrow(/audit_log_append_only/);
      /* Outside a database marked for purging (this test database is), a delete is refused too. */
      await expect(prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL sponsorx.audit_purge = 'off'`);
        await tx.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE id = $1`, row.id);
      })).rejects.toThrow(/audit_log_append_only/);
      expect(await prisma.auditLog.count({ where: { id: row.id } })).toBe(1);
    });
  });

  /* ── 2S7-DATA-01 ───────────────────────────────────────────────────────── */
  describe("2S7-DATA-01 · property analytics reconcile to the ledger and the order records", () => {
    it("revenue, completion, sell-through, sponsor mix and payouts — each from its source, summing to it", async () => {
      const a = (await call("GET", "/team/analytics", "lg_mgr_e")).json;
      const d = await dashboard();
      expect(a.revenue).toMatchObject({ bookedCents: d.bookedRevenueCents, reversedCents: d.reversedCents });
      expect(a.revenue.byMonth.reduce((s: number, m: { bookedCents: number }) => s + m.bookedCents, 0)).toBe(d.bookedRevenueCents);
      expect(a.revenue.byMonth.reduce((s: number, m: { reversedCents: number }) => s + m.reversedCents, 0)).toBe(d.reversedCents);
      expect(a.sponsorMix).toEqual([{ category: "APPAREL", bookedCents: d.bookedRevenueCents }]);
      expect(a.payoutTrends.every((m: { paidCents: number }) => m.paidCents === 0)).toBe(true);

      /* Completion from the orders themselves. */
      const orders = await prisma.marketplaceOrder.findMany({ where: { tenantId: T, contractedAt: { not: null } }, select: { state: true } });
      expect(a.campaignCompletion).toEqual({
        contractedOrders: orders.length,
        completedOrders: orders.filter((o) => o.state === "CLOSED" || o.state === "FULFILLED").length,
        cancelledOrders: orders.filter((o) => o.state === "REFUNDED" || o.state === "CANCELLED").length,
        rate: orders.filter((o) => o.state === "CLOSED" || o.state === "FULFILLED").length / orders.length,
      });
      expect(a.campaignCompletion).toMatchObject({ contractedOrders: 3, completedOrders: 1, cancelledOrders: 1 });

      /* Sell-through from the contracted stock: the banner is sold out; the refunded stickers came back. */
      const st = new Map(a.sellThrough.map((s: { itemId: string }) => [s.itemId, s]));
      expect(st.get(I.banner)).toMatchObject({ stock: 1, soldUnits: 1, rate: 1 });
      expect(st.get(I.shout)).toMatchObject({ stock: 100, soldUnits: 3, rate: 0.03 });
      expect(st.get(I.sticker)).toMatchObject({ soldUnits: 1 });
      expect(a).toMatchObject({ averageCpm: null, reconciles: true });
      expect(a.averageCpmBasis).toMatch(/no impression data/);

      /* Another property's analytics hold nothing of this one's. */
      const other = (await call("GET", "/team/analytics", "lg_mgr_f")).json;
      expect(other).toMatchObject({ revenue: { bookedCents: 0 }, campaignCompletion: { contractedOrders: 0 }, sellThrough: [], sponsorMix: [] });
      expect((await call("GET", "/team/analytics", "lg_s1_admin")).status).toBe(403);
    });
  });
});
