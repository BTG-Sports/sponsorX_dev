import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Phase 2 batch 4, against the real API and database:

     2S2-BE-02  A restricted category blocks listing purchase and campaign
                offer for the overlapping date range.
     2S3-BE-03  Availability check correctly rejects date overlap, quantity
                overrun, category conflict and sub-floor pricing.
     2S3-BE-04  Search returns only inventory visible to the requesting
                sponsor and tenant.
     2S3-SEC-01 Cross-tenant marketplace search tests pass.
     2S4-BE-01  Sponsor can add, remove and update cart lines; the cart
                expires cleanly.

   Every team is provisioned by an operator approving its onboarding through
   the production path; every listing is published by that operator's
   approval through the API. "Listing purchase" is the cart line — the only
   purchase step that exists — and it runs the availability check.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@pu-test.invalid` } : null;
  },
}));

const { availabilityReasons } = await import("../src/domain/availability");
const { overlaps } = await import("../src/domain/restrictions");

describe("the availability rules, one per refusal (pure)", () => {
  const item = { id: "i", tenantId: "t", athleteId: null, propertyId: "p", priceCents: 10_000, quantity: 3, availableFrom: new Date("2027-01-01"), availableUntil: new Date("2027-06-30"), restrictedCategories: ["ALCOHOL"], packageRules: { maxQuantity: 2, exclusive: true }, active: true };
  const ask = { quantity: 1, startsOn: new Date("2027-02-01"), endsOn: new Date("2027-02-10"), categories: ["APPAREL"], unitPriceCents: 10_000 };
  const codes = (...a: Parameters<typeof availabilityReasons>) => availabilityReasons(...a).map((r) => r.code);

  it("clear when nothing stands in the way", () => expect(codes(item, [], [], ask)).toEqual([]));
  it("date overlap on an exclusive item", () => expect(codes(item, [{ quantity: 1, startsOn: new Date("2027-02-05"), endsOn: new Date("2027-02-20") }], [], ask)).toEqual(["DATE_OVERLAP"]));
  it("quantity overrun — stock, and the package's maximum", () => {
    expect(codes(item, [{ quantity: 2, startsOn: new Date("2027-04-01"), endsOn: new Date("2027-04-02") }], [], { ...ask, quantity: 2 })).toEqual(["QUANTITY_OVERRUN"]);
    expect(codes({ ...item, quantity: null }, [], [], { ...ask, quantity: 3 })).toEqual(["QUANTITY_OVERRUN"]);
  });
  it("category conflict — the item's own, and the owner's restriction", () => {
    expect(codes(item, [], [], { ...ask, categories: ["ALCOHOL"] })).toEqual(["CATEGORY_CONFLICT"]);
    expect(codes(item, [], ["APPAREL"], ask)).toEqual(["CATEGORY_CONFLICT"]);
  });
  it("sub-floor pricing", () => expect(codes(item, [], [], { ...ask, unitPriceCents: 9_999 })).toEqual(["SUB_FLOOR"]));
  it("outside the window, and a buyer with no category", () => {
    expect(codes(item, [], [], { ...ask, endsOn: new Date("2027-07-02") })).toEqual(["OUT_OF_WINDOW"]);
    expect(codes(item, [], [], { ...ask, categories: [] })).toEqual(["NO_CATEGORY"]);
  });
  it("windows are whole days: two bookings on the same day clash, whatever their times", () => {
    expect(codes(item, [{ quantity: 1, startsOn: new Date("2027-02-10T09:00:00Z"), endsOn: new Date("2027-02-10T10:00:00Z") }], [], { ...ask, startsOn: new Date("2027-02-10T15:00:00Z"), endsOn: new Date("2027-02-10T16:00:00Z") })).toEqual(["DATE_OVERLAP"]);
    expect(codes(item, [{ quantity: 1, startsOn: new Date("2027-02-09T09:00:00Z"), endsOn: new Date("2027-02-09T23:00:00Z") }], [], { ...ask, startsOn: new Date("2027-02-10T00:00:00Z"), endsOn: new Date("2027-02-10T01:00:00Z") })).toEqual([]);
  });
  it("open-ended restriction windows overlap everything on their open side", () => {
    expect(overlaps({ startsOn: null, endsOn: null }, { startsOn: new Date(), endsOn: new Date() })).toBe(true);
    expect(overlaps({ startsOn: new Date("2027-03-01"), endsOn: null }, { startsOn: new Date("2027-01-01"), endsOn: new Date("2027-02-01") })).toBe(false);
  });
});

describe("every cart line is a checked purchase (static)", () => {
  it("only cart.ts writes cart lines, and every write there follows the availability check", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    /* fileURLToPath, not .pathname: the latter is "/D:/…" with %20 on Windows. */
    const src = fileURLToPath(new URL("../src/", import.meta.url));
    const files = (d: string): string[] => readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return p.includes("generated") ? [] : statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
    });
    const writers = files(src).filter((f) => /cartLine\.(create|update|upsert|createMany|updateMany)\(/.test(readFileSync(f, "utf8")));
    expect(writers.map((f) => f.slice(src.length).replaceAll("\\", "/"))).toEqual(["domain/cart.ts"]);
    const cart = readFileSync(join(src, "domain/cart.ts"), "utf8");
    for (const m of cart.matchAll(/cartLine\.(create|update)\(/g)) {
      const before = cart.slice(0, m.index);
      const fn = before.slice(before.lastIndexOf("export async function"));
      expect(fn, `a cart line ${m[1]} without the availability check`).toMatch(/checkListing\([\s\S]*if \(!check\.ok\) throw new UnavailableError/);
    }
    /* The worker sweeps expired carts. */
    expect(readFileSync(new URL("../worker/index.mts", import.meta.url), "utf8")).toMatch(/cartTimer = setInterval\(\(\) => \{\s*void expireCarts\(prisma\)/);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("Phase 2 purchase path over the API", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");
  const { expireCarts } = await import("../src/domain/cart");

  const T = "pu_btg";
  const X = "pu_other";
  const HASH = "p".repeat(64);
  const L: Record<string, string> = {};
  const I: Record<string, string> = {};
  const team: Record<string, { tenant: string; property: string }> = {};
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
  const codes = (r: { json: { error?: { reasons?: Array<{ code: string }> } } | null; text: string }) => (r.json?.error?.reasons ?? []).map((x) => x.code);
  const admin = (id: string, tenantId: string) => ({ userId: id, tenantId, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null });

  async function tenantsInPlay(): Promise<string[]> {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" IN ($1, $2)
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'pu\\_%@pu-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, X,
    );
    return [T, X, ...outside.map((r) => r.id)];
  }
  async function clean() {
    const ids = await tenantsInPlay();
    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 6; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = ANY($1::text[])`, ids).catch(() => {});
      }
    }
    await prisma.tenant.updateMany({ where: { id: { in: ids } }, data: { operatorTenantId: null } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  }

  async function approveTeam(key: string, operator: string, operatorAdmin: string, name: string) {
    await prisma.propertyOnboarding.create({ data: {
      id: `pu_onb_${key}`, tenantId: operator, orgType: "TEAM", orgName: name, stateCode: "MD", state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: `pu_mgr_${key}@pu-test.invalid`, role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const approved = await decideOnboarding(admin(operatorAdmin, operator), `pu_onb_${key}`, "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    team[key] = { tenant: p.tenantId, property: p.id };
  }

  /** Item → listing → submit → the operator approves: live, through the API. */
  async function publish(key: string, mgr: string, operatorAdmin: string, item: Record<string, unknown>, listing: Record<string, unknown> = {}, owner = mgr) {
    const made = await call("POST", "/inventory", owner, item);
    expect(made.status, made.text).toBe(201);
    I[key] = made.json.id;
    const l = await call("POST", "/listings", mgr, { inventoryItemId: I[key], title: `${item.title}`, description: "A description long enough for governance.", ...listing });
    expect(l.status, l.text).toBe(201);
    L[key] = l.json.id;
    /* 2S3-BE-06 — a clean submit goes live on its own. */
    expect((await call("POST", `/listings/${L[key]}/submit`, mgr)).json.state).toBe("PUBLISHED");
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Purchase BTG" }, { id: X, name: "Purchase other operator" }] });
    await prisma.sponsor.createMany({ data: [
      { id: "pu_s1", tenantId: T, name: "Harbor Apparel", categories: ["APPAREL"] },
      { id: "pu_s2", tenantId: T, name: "Bayside Brewing", categories: ["ALCOHOL", "GAMBLING"] },
      { id: "pu_s0", tenantId: T, name: "No Category Co" },
      { id: "pu_food", tenantId: T, name: "Rosa's Tacos", categories: ["FAST_FOOD"] },
      { id: "pu_food2", tenantId: T, name: "Burger Barn", categories: ["FAST_FOOD"] },
      { id: "pu_sx", tenantId: X, name: "Elsewhere Apparel", categories: ["APPAREL"] },
    ] });
    await prisma.athlete.createMany({ data: [
      { id: "pu_ath", tenantId: T, slug: "pu-ath", legalName: "Jordan Reed", displayName: "JORDAN", email: "pu_athlete@pu-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "pu_ath2", tenantId: T, slug: "pu-ath2", legalName: "Sam Lee", displayName: "SAM", email: "pu_athlete2@pu-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "pu_admin", tenantId: T, clerkId: "pu_admin", email: "pu_admin@pu-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "pu_cm", tenantId: T, clerkId: "pu_cm", email: "pu_cm@pu-test.invalid", roles: ["CAMPAIGN_MGR", "NETWORK_MGR"] },
      { id: "pu_s1_admin", tenantId: T, clerkId: "pu_s1_admin", email: "pu_s1_admin@pu-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "pu_s1" },
      { id: "pu_s1_analyst", tenantId: T, clerkId: "pu_s1_analyst", email: "pu_s1_analyst@pu-test.invalid", roles: ["SPONSOR_ANALYST"], sponsorId: "pu_s1" },
      { id: "pu_s2_admin", tenantId: T, clerkId: "pu_s2_admin", email: "pu_s2_admin@pu-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "pu_s2" },
      { id: "pu_s0_admin", tenantId: T, clerkId: "pu_s0_admin", email: "pu_s0_admin@pu-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "pu_s0" },
      { id: "pu_athlete", tenantId: T, clerkId: "pu_athlete", email: "pu_athlete@pu-test.invalid", roles: ["ATHLETE"], athleteId: "pu_ath" },
      { id: "pu_athlete2", tenantId: T, clerkId: "pu_athlete2", email: "pu_athlete2@pu-test.invalid", roles: ["ATHLETE"], athleteId: "pu_ath2" },
      { id: "pu_x_admin", tenantId: X, clerkId: "pu_x_admin", email: "pu_x_admin@pu-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "pu_sx_admin", tenantId: X, clerkId: "pu_sx_admin", email: "pu_sx_admin@pu-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "pu_sx" },
    ] });
    await prisma.nilJob.create({ data: { id: "pu_job", tenantId: T, name: "Post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.agreement.create({ data: { id: "pu_terms", tenantId: T, kind: "CAMPAIGN_ORDER", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") } });
    await prisma.campaign.createMany({ data: [
      { id: "pu_c_now", tenantId: T, sponsorId: "pu_food", name: "Tacos now", budget: 1_000_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * 864e5), state: "STAFFING" },
      { id: "pu_c_later", tenantId: T, sponsorId: "pu_food", name: "Tacos later", budget: 1_000_000, startDate: new Date(Date.now() + 50 * 864e5), endDate: new Date(Date.now() + 80 * 864e5), state: "STAFFING" },
      { id: "pu_c_rival", tenantId: T, sponsorId: "pu_food2", name: "Burgers", budget: 1_000_000, startDate: new Date(), endDate: new Date(Date.now() + 20 * 864e5), state: "STAFFING" },
      { id: "pu_c_apparel", tenantId: T, sponsorId: "pu_s1", name: "Apparel", budget: 1_000_000, startDate: new Date(), endDate: new Date(Date.now() + 20 * 864e5), state: "STAFFING" },
    ] });

    await approveTeam("e", T, "pu_admin", "Bowie Bulldogs PU");
    await approveTeam("f", T, "pu_admin", "Laurel Lions PU");
    await approveTeam("g", X, "pu_x_admin", "Far Away FC");
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    await call("POST", "/team/roster", "pu_mgr_e", { legalName: "Riley Chen", displayName: "RILEY", email: "pu_riley@pu-test.invalid", sport: "Basketball", ageBand: "18_PLUS" });
    await publish("banner", "pu_mgr_e", "pu_admin", { title: "Courtside banner", kind: "SIGNAGE", priceCents: 120_000, quantity: 2, availableFrom: at(1), availableUntil: at(120), categories: ["APPAREL", "ALCOHOL"], packageRules: { exclusive: true } });
    /* A roster athlete's own item — she prices it, the team lists it. */
    await publish("clinic", "pu_mgr_e", "pu_admin", { title: "Riley's shooting clinic", kind: "CAMP", priceCents: 50_000, quantity: 3, packageRules: { maxQuantity: 2 } }, {}, "pu_riley");
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── 2S2-BE-02 ─────────────────────────────────────────────────────────── */
  describe("2S2-BE-02 · a restricted category blocks the offer and the purchase, for the overlapping dates", () => {
    it("the listing purchase: a team's league rule, only for its dates", async () => {
      const rule = await call("POST", "/restrictions", "pu_mgr_e", { category: "GAMBLING", type: "LEAGUE_RULE", startsOn: at(30), endsOn: at(60), reason: "MD Youth league: no gambling brands in season" });
      expect(rule.status).toBe(201);
      expect(rule.json).toMatchObject({ propertyId: team.e!.property, athleteId: null });
      await call("POST", "/cart", "pu_s2_admin");
      const blocked = await call("POST", "/cart/lines", "pu_s2_admin", { listingId: L.banner, quantity: 1, startsOn: at(40), endsOn: at(45) });
      expect(blocked.status).toBe(409);
      expect(codes(blocked)).toEqual(["CATEGORY_CONFLICT"]);
      expect(blocked.text).toMatch(/GAMBLING/);
      /* The same team's rule covers its roster athlete's item. */
      expect(codes(await call("POST", "/cart/lines", "pu_s2_admin", { listingId: L.clinic, quantity: 1, startsOn: at(50), endsOn: at(51) }))).toEqual(["CATEGORY_CONFLICT"]);
      /* Outside the rule's dates the same purchase goes through. */
      expect((await call("POST", "/cart/lines", "pu_s2_admin", { listingId: L.banner, quantity: 1, startsOn: at(70), endsOn: at(75) })).status).toBe(201);
    });

    it("the campaign offer: an athlete's restriction, only for its dates", async () => {
      expect((await call("POST", "/restrictions", "pu_athlete", { category: "FAST_FOOD", type: "PROHIBITED", startsOn: at(10), endsOn: at(40), reason: "Training-camp nutrition deal" })).status).toBe(201);
      const offer = (campaignId: string, due: number, extra: Record<string, unknown> = {}) => ({
        campaignId, athleteId: "pu_ath", jobId: "pu_job", brief: "Post on game day.", compensation: 20_000, sellPrice: 40_000,
        deliverables: [{ title: "Post", dueDate: at(due) }], usageRights: "Organic, 90 days", disclosures: ["#ad"], expiresAt: at(7), ...extra,
      });
      const blocked = await call("POST", "/offers", "pu_cm", offer("pu_c_now", 14));
      expect(blocked.status).toBe(409);
      expect(blocked.text).toMatch(/FAST_FOOD/);
      expect((await call("POST", "/offers", "pu_cm", offer("pu_c_later", 60))).status).toBe(201);
      /* And the Phase 1 invitation asks the same question. */
      const invite = await call("POST", "/campaigns/pu_c_now/invitations", "pu_cm", { athleteId: "pu_ath", jobId: "pu_job", offered: 20_000 });
      expect(invite.status).toBe(409);
      expect(invite.text).toMatch(/FAST_FOOD/);
    });

    it("an accepted offer's exclusivity blocks the sponsor's rivals — and the athlete cannot remove it", async () => {
      const sent = async (campaignId: string, athleteId: string, extra: Record<string, unknown> = {}) => {
        const o = await call("POST", "/offers", "pu_cm", {
          campaignId, athleteId, jobId: "pu_job", brief: "Exclusive partner.", compensation: 20_000, sellPrice: 40_000,
          deliverables: [{ title: "Post", dueDate: at(10) }], usageRights: "Organic, 90 days", disclosures: ["#ad"], expiresAt: at(7), ...extra,
        });
        expect(o.status, o.text).toBe(201);
        return (await call("POST", `/offers/${o.json.id}/send`, "pu_cm")).json;
      };
      const exclusive = await sent("pu_c_now", "pu_ath2", { exclusivityDays: 30 });
      expect((await call("POST", `/offers/${exclusive.id}/respond`, "pu_athlete2", { decision: "ACCEPT", termsHashShown: exclusive.termsHash, agreementId: "pu_terms", bodyHashShown: HASH })).json.state).toBe("ACCEPTED");
      const rows = (await call("GET", "/restrictions", "pu_athlete2")).json.restrictions;
      expect(rows).toEqual([expect.objectContaining({ category: "FAST_FOOD", type: "EXCLUSIVITY", sourceOfferId: exclusive.id })]);

      const rival = await call("POST", "/offers", "pu_cm", {
        campaignId: "pu_c_rival", athleteId: "pu_ath2", jobId: "pu_job", brief: "Rival.", compensation: 20_000, sellPrice: 40_000,
        deliverables: [{ title: "Post", dueDate: at(12) }], usageRights: "Organic", disclosures: [], expiresAt: at(7),
      });
      expect(rival.status).toBe(409);
      expect(rival.text).toMatch(/exclusivity/i);
      /* A different category is untouched. */
      expect((await call("POST", "/offers", "pu_cm", { campaignId: "pu_c_apparel", athleteId: "pu_ath2", jobId: "pu_job", brief: "Hoodie.", compensation: 20_000, sellPrice: 40_000, deliverables: [{ title: "Post", dueDate: at(12) }], usageRights: "Organic", disclosures: [], expiresAt: at(7) })).status).toBe(201);
      expect((await call("DELETE", `/restrictions/${rows[0].id}`, "pu_athlete2")).status).toBe(409);
    });

    it("the owner and BTG manage restrictions; nobody else", async () => {
      expect((await call("GET", "/restrictions", "pu_athlete2")).json.restrictions.every((r: { athleteId: string }) => r.athleteId === "pu_ath2")).toBe(true);
      expect((await call("POST", "/restrictions", "pu_athlete2", { athleteId: "pu_ath", category: "CRYPTO", type: "PROHIBITED" })).status).toBe(403);
      const riley = (await prisma.user.findFirstOrThrow({ where: { email: "pu_riley@pu-test.invalid" }, select: { athleteId: true } })).athleteId!;
      expect((await call("POST", "/restrictions", "pu_mgr_f", { athleteId: riley, category: "CRYPTO", type: "PROHIBITED" })).status).toBe(403);
      expect((await call("POST", "/restrictions", "pu_mgr_e", { athleteId: riley, category: "CRYPTO", type: "PROHIBITED" })).status).toBe(201);
      expect((await call("POST", "/restrictions", "pu_admin", { propertyId: team.e!.property, category: "TOBACCO_VAPE", type: "LEAGUE_RULE" })).status).toBe(201);
      expect((await call("POST", "/restrictions", "pu_x_admin", { propertyId: team.e!.property, category: "TOBACCO_VAPE", type: "LEAGUE_RULE" })).status).toBe(403);
      expect((await call("POST", "/restrictions", "pu_mgr_e", { category: "CRYPTO", type: "EXCLUSIVITY" })).status).toBe(400);
      /* A sponsor's categories are BTG's to set, not the sponsor's. */
      expect((await call("PUT", "/sponsors/pu_s0/categories", "pu_s0_admin", { categories: ["APPAREL"] })).status).toBe(403);
    });
  });

  /* ── 2S3-BE-03 ─────────────────────────────────────────────────────────── */
  describe("2S3-BE-03 · the availability check, through the paths that buy", () => {
    it("rejects date overlap on an exclusive item", async () => {
      /* A hold on the banner, as a reservation will write one (2S4-BE-02). */
      await prisma.inventoryCommitment.create({ data: { tenantId: team.e!.tenant, inventoryItemId: I.banner!, quantity: 1, startsOn: new Date(at(10)), endsOn: new Date(at(20)), source: "RESERVATION", sourceId: "pu_hold_1" } });
      await call("POST", "/cart", "pu_s1_admin");
      const clash = await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.banner, quantity: 1, startsOn: at(15), endsOn: at(25) });
      expect(clash.status).toBe(409);
      expect(codes(clash)).toEqual(["DATE_OVERLAP"]);
      /* And through the offer path, on a commitment an accepted offer wrote. */
      const item = (await call("POST", "/inventory", "pu_athlete2", { title: "Signing session", kind: "AUTOGRAPH", priceCents: 20_000, packageRules: { exclusive: true } })).json.id;
      const draft = (extra: Record<string, unknown>) => call("POST", "/offers", "pu_cm", {
        campaignId: "pu_c_apparel", athleteId: "pu_ath2", jobId: "pu_job", inventoryItemId: item, brief: "Signing.", compensation: 20_000, sellPrice: 40_000,
        deliverables: [{ title: "Signing", dueDate: at(15) }], usageRights: "Event only", disclosures: [], expiresAt: at(7), ...extra,
      });
      const first = (await draft({})).json;
      const sentFirst = (await call("POST", `/offers/${first.id}/send`, "pu_cm")).json;
      expect((await call("POST", `/offers/${first.id}/respond`, "pu_athlete2", { decision: "ACCEPT", termsHashShown: sentFirst.termsHash, agreementId: "pu_terms", bodyHashShown: HASH })).status).toBe(200);
      const second = await draft({});
      expect(second.status).toBe(409);
      expect(codes(second)).toEqual(["DATE_OVERLAP"]);
    });

    it("rejects quantity overrun — the package's maximum, and what is left", async () => {
      const over = await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.clinic, quantity: 3, startsOn: at(5), endsOn: at(6) });
      expect(codes(over)).toEqual(["QUANTITY_OVERRUN"]);
      await prisma.inventoryCommitment.create({ data: { tenantId: team.e!.tenant, inventoryItemId: I.clinic!, quantity: 2, startsOn: new Date(at(1)), endsOn: new Date(at(2)), source: "RESERVATION", sourceId: "pu_hold_2" } });
      const left = await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.clinic, quantity: 2, startsOn: at(5), endsOn: at(6) });
      expect(codes(left)).toEqual(["QUANTITY_OVERRUN"]);
      expect(left.text).toMatch(/1 left of 3/);
      /* A released hold no longer counts. */
      await prisma.inventoryCommitment.updateMany({ where: { sourceId: "pu_hold_2" }, data: { releasedAt: new Date() } });
      expect((await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.clinic, quantity: 2, startsOn: at(5), endsOn: at(6) })).status).toBe(201);
    });

    it("rejects category conflict — the item's own restricted categories", async () => {
      await publish("dry", "pu_mgr_e", "pu_admin", { title: "Family night tickets", kind: "TICKETS", priceCents: 5_000, quantity: 100, restrictedCategories: ["ALCOHOL"] });
      await prisma.cart.updateMany({ where: { sponsorId: "pu_s2", state: "ACTIVE" }, data: { expiresAt: new Date(Date.now() + 864e5) } });
      const r = await call("POST", "/cart/lines", "pu_s2_admin", { listingId: L.dry, quantity: 1, startsOn: at(5), endsOn: at(5) });
      expect(r.status).toBe(409);
      expect(codes(r)).toEqual(["CATEGORY_CONFLICT"]);
      /* The check itself refuses it, whoever asks. */
      const { checkListing } = await import("../src/domain/availability");
      const direct = await checkListing(prisma, L.dry!, { quantity: 1, startsOn: new Date(at(5)), endsOn: new Date(at(5)), categories: ["ALCOHOL"] });
      expect(direct.reasons.map((x) => x.code)).toEqual(["CATEGORY_CONFLICT"]);
    });

    it("rejects sub-floor pricing — paying an athlete below their own price", async () => {
      const item = (await call("POST", "/inventory", "pu_athlete2", { title: "Hoodie shoot", kind: "SOCIAL_POST", priceCents: 50_000 })).json.id;
      const cheap = await call("POST", "/offers", "pu_cm", {
        campaignId: "pu_c_apparel", athleteId: "pu_ath2", jobId: "pu_job", inventoryItemId: item, brief: "Shoot.", compensation: 30_000, sellPrice: 60_000,
        deliverables: [{ title: "Shoot", dueDate: at(12) }], usageRights: "Organic", disclosures: [], expiresAt: at(7),
      });
      expect(cheap.status).toBe(409);
      expect(codes(cheap)).toEqual(["SUB_FLOOR"]);
    });

    it("and says why for the rest: outside the window, a buyer with no category, a listing not live", async () => {
      expect(codes(await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.banner, quantity: 1, startsOn: at(100), endsOn: at(130) }))).toEqual(["OUT_OF_WINDOW"]);
      await call("POST", "/cart", "pu_s0_admin");
      expect(codes(await call("POST", "/cart/lines", "pu_s0_admin", { listingId: L.banner, quantity: 1, startsOn: at(70), endsOn: at(71) }))).toEqual(["NO_CATEGORY"]);
    });
  });

  /* ── 2S3-BE-04 / 2S3-SEC-01 ────────────────────────────────────────────── */
  describe("2S3-BE-04 · search returns only what this sponsor, in this marketplace, may buy", () => {
    const ids = async (clerk: string, q = "") => {
      const r = await call("GET", `/marketplace/search${q}`, clerk);
      expect(r.status, r.text).toBe(200);
      return (r.json.results as Array<{ id: string }>).map((x) => x.id);
    };

    it("setup: every state a listing can be in, across two marketplaces", async () => {
      await publish("private", "pu_mgr_e", "pu_admin", { title: "Private suite night", kind: "TICKETS", priceCents: 90_000 }, { visibility: "PRIVATE" });
      await publish("paused", "pu_mgr_e", "pu_admin", { title: "Paused poster", kind: "SIGNAGE", priceCents: 10_000 });
      await call("POST", `/listings/${L.paused}/transition`, "pu_mgr_e", { to: "PAUSED" });
      await publish("later", "pu_mgr_e", "pu_admin", { title: "Playoff banner", kind: "SIGNAGE", priceCents: 200_000 }, { publishAt: at(5) });
      const draftItem = (await call("POST", "/inventory", "pu_mgr_e", { title: "Draft thing", kind: "OTHER", priceCents: 1_000 })).json.id;
      L.draft = (await call("POST", "/listings", "pu_mgr_e", { inventoryItemId: draftItem, title: "Draft thing" })).json.id;
      await publish("laurel", "pu_mgr_f", "pu_admin", { title: "Laurel scoreboard", kind: "SIGNAGE", priceCents: 30_000 });
      await publish("far", "pu_mgr_g", "pu_x_admin", { title: "Far Away jersey patch", kind: "SIGNAGE", priceCents: 40_000 });
      /* Laurel is then suspended: its live listing drops out of every catalogue. */
      await decideOnboarding(admin("pu_admin", T), "pu_onb_f", "SUSPEND", "Chargeback under review.");
    });

    it("a sponsor sees the live, public listings of its own marketplace — and nothing else", async () => {
      const s1 = await ids("pu_s1_admin");
      expect(s1.sort()).toEqual([L.banner, L.clinic, L.dry].sort());
      for (const hidden of [L.private, L.paused, L.later, L.draft, L.laurel, L.far]) expect(s1).not.toContain(hidden);
      /* The other operator's sponsor sees only its own marketplace. */
      expect(await ids("pu_sx_admin")).toEqual([L.far]);
    });

    it("two sponsors see different catalogues — restricted against their category, it is not shown", async () => {
      const s2 = await ids("pu_s2_admin");
      expect(s2).toContain(L.banner);
      expect(s2).not.toContain(L.dry); // the item refuses ALCOHOL
      /* An owner's restriction in force today hides the owner's listings from that category. */
      await call("POST", "/restrictions", "pu_mgr_e", { category: "ALCOHOL", type: "LEAGUE_RULE", reason: "No alcohol, all season" });
      expect(await ids("pu_s2_admin")).toEqual([]);
      expect((await ids("pu_s1_admin")).length).toBe(3);
    });

    it("filters narrow within what is visible, and never widen it", async () => {
      expect(await ids("pu_s1_admin", "?kind=CAMP")).toEqual([L.clinic]);
      expect(await ids("pu_s1_admin", "?q=courtside")).toEqual([L.banner]);
      expect(await ids("pu_s1_admin", "?maxPrice=60000")).toEqual(expect.arrayContaining([L.clinic, L.dry]));
      expect(await ids("pu_s1_admin", "?sport=basketball")).toEqual([L.clinic]);
      expect(await ids("pu_s1_admin", "?q=suite")).toEqual([]); // the private listing is not found by name either
    });

    it("the result carries no athlete's personal data", async () => {
      const r = await call("GET", "/marketplace/search?kind=CAMP", "pu_s1_admin");
      expect(r.json.results[0].athlete).toEqual({ displayName: "RILEY", sport: "Basketball", position: null });
      expect(r.text).not.toMatch(/Riley Chen|pu_riley@|legalName|email/);
    });
  });

  describe("2S3-SEC-01 · no listing leaks across tenants or visibility", () => {
    it("the listing itself is refused where search would not show it", async () => {
      for (const id of [L.private, L.paused, L.later, L.draft, L.laurel, L.far]) {
        expect((await call("GET", `/listings/${id}`, "pu_s1_admin")).status, id).toBe(403);
      }
      expect((await call("GET", `/listings/${L.banner}`, "pu_s1_admin")).status).toBe(200);
      expect((await call("GET", `/listings/${L.banner}`, "pu_sx_admin")).status).toBe(403);
    });

    it("only buyers and their operator search; the rest are refused", async () => {
      for (const who of ["pu_mgr_e", "pu_riley", "pu_athlete"]) expect((await call("GET", "/marketplace/search", who)).status, who).toBe(403);
      /* The operator sees what its buyers see — live listings only, its own marketplace only. */
      const ops = (await call("GET", "/marketplace/search", "pu_admin")).json.results.map((x: { id: string }) => x.id);
      expect(ops).not.toContain(L.far);
      expect(ops).not.toContain(L.draft);
      expect((await call("GET", "/marketplace/search", "pu_x_admin")).json.results.map((x: { id: string }) => x.id)).toEqual([L.far]);
    });

    it("a sponsor cannot put another marketplace's, or a hidden, listing in its cart", async () => {
      for (const id of [L.far, L.private, L.draft]) {
        expect((await call("POST", "/cart/lines", "pu_s1_admin", { listingId: id, quantity: 1, startsOn: at(70), endsOn: at(71) })).status, id).toBe(403);
      }
    });
  });

  /* ── 2S4-BE-01 ─────────────────────────────────────────────────────────── */
  describe("2S4-BE-01 · the cart", () => {
    it("a sponsor adds, updates and removes lines; each write is checked and priced at the listing", async () => {
      await prisma.brandRestriction.deleteMany({ where: { propertyId: team.e!.property, category: "ALCOHOL" } });
      const cart = (await call("GET", "/cart", "pu_s1_admin")).json.cart;
      expect(cart).toMatchObject({ currency: "USD", state: "ACTIVE" });
      expect(new Date(cart.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600e3);
      const clinicLine = cart.lines.find((l: { listingId: string }) => l.listingId === L.clinic);
      expect(clinicLine).toMatchObject({ quantity: 2, unitPriceCents: 50_000, lineTotalCents: 100_000 });

      const added = await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.banner, quantity: 1, startsOn: at(30), endsOn: at(35) });
      expect(added.status).toBe(201);
      expect(added.json.totalCents).toBe(220_000);
      expect((await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.banner, quantity: 1, startsOn: at(40), endsOn: at(41) })).status).toBe(409); // already in it

      const down = await call("PATCH", `/cart/lines/${clinicLine.id}`, "pu_s1_admin", { quantity: 1 });
      expect(down.json.totalCents).toBe(170_000);
      const over = await call("PATCH", `/cart/lines/${clinicLine.id}`, "pu_s1_admin", { quantity: 3 });
      expect(codes(over)).toEqual(["QUANTITY_OVERRUN"]);
      expect((await call("GET", "/cart", "pu_s1_admin")).json.cart.totalCents).toBe(170_000); // unchanged by the refusal

      const bannerLine = added.json.lines.find((l: { listingId: string }) => l.listingId === L.banner);
      expect((await call("DELETE", `/cart/lines/${bannerLine.id}`, "pu_s1_admin")).json.totalCents).toBe(50_000);
      expect(await prisma.auditLog.count({ where: { tenantId: T, entity: "Cart", entityId: cart.id } })).toBeGreaterThanOrEqual(4);
    });

    it("the organisation's own cart only: the analyst reads it, nobody else touches it", async () => {
      const mine = (await call("GET", "/cart", "pu_s1_analyst")).json.cart;
      expect(mine.sponsorId).toBe("pu_s1");
      expect((await call("POST", "/cart/lines", "pu_s1_analyst", { listingId: L.banner, quantity: 1, startsOn: at(30), endsOn: at(35) })).status).toBe(403);
      const line = mine.lines[0].id as string;
      expect((await call("PATCH", `/cart/lines/${line}`, "pu_s2_admin", { quantity: 1 })).status).toBe(403);
      expect((await call("DELETE", `/cart/lines/${line}`, "pu_s2_admin")).status).toBe(403);
      expect((await call("GET", "/cart", "pu_sx_admin")).json.cart).toBeNull();
      expect((await call("GET", "/cart", "pu_mgr_e")).status).toBe(403);
    });

    it("the cart expires cleanly — gone on read, closed by the sweep, and a fresh one opens", async () => {
      const before = (await call("GET", "/cart", "pu_s1_admin")).json.cart;
      /* A day passes with no change. */
      await prisma.cart.update({ where: { id: before.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await call("GET", "/cart", "pu_s1_admin")).json.cart).toBeNull();
      expect((await prisma.cart.findUniqueOrThrow({ where: { id: before.id }, select: { state: true } })).state).toBe("EXPIRED");
      expect((await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.banner, quantity: 1, startsOn: at(30), endsOn: at(35) })).status).toBe(409);
      const fresh = await call("POST", "/cart", "pu_s1_admin");
      expect(fresh.status).toBe(201);
      expect(fresh.json.id).not.toBe(before.id);
      expect(fresh.json.lines).toEqual([]);
      /* Nothing was held, so nothing is left behind: the item is exactly as available as before. */
      expect((await call("POST", "/cart/lines", "pu_s1_admin", { listingId: L.clinic, quantity: 2, startsOn: at(5), endsOn: at(6) })).status).toBe(201);

      /* The worker's sweep: the carts past expiry, once, and no others. */
      const live = await prisma.cart.findFirstOrThrow({ where: { sponsorId: "pu_s2", state: "ACTIVE" }, select: { id: true } });
      const later = new Date(Date.now() + 25 * 3600e3);
      /* Narrowed to this file's sponsors: other files' carts are live in parallel. */
      const mine = { sponsorId: { startsWith: "pu_" } };
      const first = await expireCarts(prisma, later, mine);
      expect(first.expired).toBeGreaterThanOrEqual(2);
      expect((await prisma.cart.findUniqueOrThrow({ where: { id: live.id }, select: { state: true, expiredAt: true } })))
        .toEqual({ state: "EXPIRED", expiredAt: later });
      expect((await expireCarts(prisma, later, mine)).expired).toBe(0);
      expect(await prisma.cartLine.count({ where: { cartId: live.id } })).toBeGreaterThan(0); // history kept, read-only
    });
  });
});
