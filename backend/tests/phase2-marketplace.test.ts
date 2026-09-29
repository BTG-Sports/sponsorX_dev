import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   Phase 2 batch 3, against the real API and database:

     2S2-BE-01  An athlete can create, edit and price inventory items scoped
                to their own account.
     2S2-BE-04  A team manager can see their roster and the inventory
                belonging to it, and nobody else's.
     2S3-BE-01  A verified property can create a listing but cannot publish
                it until governance rules are satisfied.
     2S2-BE-03  Accepting an offer freezes commercial terms and schedules
                deliverables; later rate-card edits do not alter it.
     2S7-BE-01  A tenant's branding is served to its portal and renders on its
                reports.

   The two outside teams are NOT seeded by hand: BTG approves their
   onboarding through the production path (2S1-BE-04), which provisions each
   tenant, its Property and its manager. Only Clerk is stubbed.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@mkt-test.invalid` } : null;
  },
}));

const { governanceProblems, canTransitionListing } = await import("../src/domain/listing-rules");
const { inventoryProblems } = await import("../src/domain/inventory");
const { hashAgreementBody } = await import("../src/domain/agreement-hash");

describe("the rules, as written (pure)", () => {
  it("an item is priced by whole cents, with a window that closes after it opens and no category both offered and refused", () => {
    expect(inventoryProblems({ priceCents: 5000 })).toEqual([]);
    expect(inventoryProblems({ priceCents: 50 })).toEqual([expect.stringMatching(/priceCents/)]);
    expect(inventoryProblems({ priceCents: 5000, categories: ["APPAREL"], restrictedCategories: ["APPAREL"] })).toEqual([expect.stringMatching(/both offered and restricted/)]);
    expect(inventoryProblems({ priceCents: 5000, availableFrom: new Date("2026-12-01"), availableUntil: new Date("2026-11-01") })).toEqual([expect.stringMatching(/availableUntil/)]);
  });

  it("the listing machine has no road from DRAFT to PUBLISHED, and ARCHIVED is terminal", () => {
    expect(canTransitionListing("DRAFT", "PUBLISHED")).toBe(false);
    expect(canTransitionListing("PENDING_APPROVAL", "PUBLISHED")).toBe(true);
    for (const to of ["DRAFT", "PENDING_APPROVAL", "PUBLISHED", "PAUSED"] as const) expect(canTransitionListing("ARCHIVED", to)).toBe(false);
    const ok = { property: { listingAccessAt: new Date() }, item: { active: true, priceCents: 5000, quantity: null, availableUntil: null }, listing: { title: "Banner", description: "A courtside banner for the season.", publishAt: null }, now: new Date() };
    expect(governanceProblems(ok)).toEqual([]);
    expect(governanceProblems({ ...ok, property: { listingAccessAt: null } })).toEqual([expect.stringMatching(/not approved/)]);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("Phase 2 marketplace over the API", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { decideOnboarding } = await import("../src/domain/onboarding");

  const T = "mkt_btg";      // BTG's tenant: operates the teams
  const X = "mkt_other";    // an unrelated operator: operates nothing here
  /* The real CAMPAIGN_ORDER v1 wording's fingerprint, so GET /offers/:id serves its text. */
  const HASH = hashAgreementBody(readFileSync(new URL("../agreements/CAMPAIGN_ORDER.v1.txt", import.meta.url), "utf8"));
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  const E = { tenant: "", property: "" };
  const F = { tenant: "", property: "" };
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
  const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString();

  async function tenantsInPlay(): Promise<string[]> {
    const outside = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM "Tenant" WHERE "operatorTenantId" = $1
       UNION SELECT "tenantId" FROM "User" WHERE email LIKE 'mkt\\_%@mkt-test.invalid' AND "tenantId" NOT IN ($1, $2)`, T, X,
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

  /** BTG approves a team's onboarding through the production path. */
  async function approveTeam(onboardingId: string, name: string, manager: string, stateCode = "MD") {
    await prisma.propertyOnboarding.create({ data: {
      id: onboardingId, tenantId: T, orgType: "TEAM", orgName: name, stateCode, state: "PENDING_REVIEW",
      contacts: [{ name: "Casey Moore", email: `${manager}@mkt-test.invalid`, role: "General manager", primary: true }],
      details: { legalEntityName: `${name} LLC`, league: "MD Youth", sport: "Basketball" },
      payoutAcknowledgedAt: new Date(), termsAcceptedAt: new Date(), submittedAt: new Date(),
    } });
    const admin = { userId: "mkt_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
    const approved = await decideOnboarding(admin, onboardingId, "APPROVE");
    const p = await prisma.property.findUniqueOrThrow({ where: { id: approved.propertyId! }, select: { id: true, tenantId: true } });
    return { tenant: p.tenantId, property: p.id };
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: T, name: "Marketplace BTG" }, { id: X, name: "Unrelated operator" }] });
    await prisma.sponsor.create({ data: { id: "mkt_sponsor", tenantId: T, name: "Rosa's Tacos", categories: ["FAST_FOOD"] } });
    await prisma.athlete.createMany({ data: [
      { id: "mkt_ath", tenantId: T, slug: "mkt-ath", legalName: "Jordan Reed", displayName: "JORDAN", email: "mkt_athlete@mkt-test.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "mkt_ath2", tenantId: T, slug: "mkt-ath2", legalName: "Sam Lee", displayName: "SAM", email: "mkt_athlete2@mkt-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" },
      { id: "mkt_ath_draft", tenantId: T, slug: "mkt-ath-draft", legalName: "Pat Kim", displayName: "PAT", email: "mkt_drafter@mkt-test.invalid", sport: "Soccer", stateCode: "MD", ageBand: "18_PLUS", state: "DRAFT" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "mkt_admin", tenantId: T, clerkId: "mkt_admin", email: "mkt_admin@mkt-test.invalid", roles: ["BTG_ADMIN"] },
      { id: "mkt_cm", tenantId: T, clerkId: "mkt_cm", email: "mkt_cm@mkt-test.invalid", roles: ["CAMPAIGN_MGR"] },
      { id: "mkt_sponsor_admin", tenantId: T, clerkId: "mkt_sponsor_admin", email: "mkt_sponsor_admin@mkt-test.invalid", roles: ["SPONSOR_ADMIN"], sponsorId: "mkt_sponsor" },
      { id: "mkt_athlete", tenantId: T, clerkId: "mkt_athlete", email: "mkt_athlete@mkt-test.invalid", roles: ["ATHLETE"], athleteId: "mkt_ath" },
      { id: "mkt_athlete2", tenantId: T, clerkId: "mkt_athlete2", email: "mkt_athlete2@mkt-test.invalid", roles: ["ATHLETE"], athleteId: "mkt_ath2" },
      { id: "mkt_drafter", tenantId: T, clerkId: "mkt_drafter", email: "mkt_drafter@mkt-test.invalid", roles: ["ATHLETE"], athleteId: "mkt_ath_draft" },
      /* The NEXT pilot pattern: a PROPERTY_MGR inside BTG's own tenant. */
      { id: "mkt_btg_pm", tenantId: T, clerkId: "mkt_btg_pm", email: "mkt_btg_pm@mkt-test.invalid", roles: ["PROPERTY_MGR"] },
      { id: "mkt_x_admin", tenantId: X, clerkId: "mkt_x_admin", email: "mkt_x_admin@mkt-test.invalid", roles: ["BTG_ADMIN"] },
    ] });
    await prisma.nilJob.create({ data: { id: "mkt_job", tenantId: T, name: "Game-day post", baseLow: 10_000, baseHigh: 20_000, sellLow: 20_000, sellHigh: 40_000, sellFloorEmerging: 15_000, sellFloorCreator: 20_000, sellFloorPremium: 30_000 } });
    await prisma.athleteRate.create({ data: { tenantId: T, athleteId: "mkt_ath", jobId: "mkt_job", amount: 20_000 } });
    await prisma.campaign.create({ data: { id: "mkt_campaign", tenantId: T, sponsorId: "mkt_sponsor", name: "Fall tacos", budget: 500_000, startDate: new Date(), endDate: new Date(Date.now() + 90 * 864e5), state: "STAFFING" } });
    await prisma.agreement.create({ data: { id: "mkt_order_terms", tenantId: T, kind: "CAMPAIGN_ORDER", version: 1, bodyHash: HASH, effectiveAt: new Date("2026-01-01") } });
    Object.assign(E, await approveTeam("mkt_onb_e", "Bowie Bulldogs", "mkt_mgr_e"));
    Object.assign(F, await approveTeam("mkt_onb_f", "Laurel Lions", "mkt_mgr_f"));
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  /* ── 2S2-BE-01 ─────────────────────────────────────────────────────────── */
  let athleteItem = "";

  describe("2S2-BE-01 · athlete inventory", () => {
    it("an athlete creates, edits and prices their own items", async () => {
      const made = await call("POST", "/inventory", "mkt_athlete", {
        title: "Game-day Instagram post", kind: "SOCIAL_POST", jobId: "mkt_job", priceCents: 25_000, quantity: 4,
        availableFrom: inDays(1), availableUntil: inDays(60), categories: ["APPAREL", "FOOTWEAR"], restrictedCategories: ["ALCOHOL"],
        packageRules: { minQuantity: 1, maxQuantity: 2 },
      });
      expect(made.status).toBe(201);
      expect(made.json).toMatchObject({ athleteId: "mkt_ath", propertyId: null, priceCents: 25_000, version: 1 });
      athleteItem = made.json.id;

      const repriced = await call("PATCH", `/inventory/${athleteItem}`, "mkt_athlete", { priceCents: 30_000, title: "Game-day post + story" });
      expect(repriced.json).toMatchObject({ priceCents: 30_000, title: "Game-day post + story", version: 2 });
      const trail = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "inventory.reprice", entityId: athleteItem }, select: { actorId: true, before: true, after: true } });
      expect(trail).toMatchObject({ actorId: "mkt_athlete", before: { priceCents: 25_000 }, after: { priceCents: 30_000, version: 2 } });

      /* Refused: a category both offered and restricted; a price under $1; naming an owner at all. */
      expect((await call("PATCH", `/inventory/${athleteItem}`, "mkt_athlete", { restrictedCategories: ["APPAREL"] })).status).toBe(422);
      expect((await call("POST", "/inventory", "mkt_athlete", { title: "x", kind: "OTHER", priceCents: 50 })).status).toBe(400);
      expect((await call("POST", "/inventory", "mkt_athlete", { title: "x", kind: "OTHER", priceCents: 500, athleteId: "mkt_ath2" })).status).toBe(400);
    });

    it("scoped to their own account — another athlete neither sees nor reprices it", async () => {
      expect((await call("GET", "/inventory", "mkt_athlete")).json.items.map((i: { id: string }) => i.id)).toEqual([athleteItem]);
      expect((await call("GET", "/inventory", "mkt_athlete2")).json.items).toEqual([]);
      expect((await call("GET", `/inventory/${athleteItem}`, "mkt_athlete2")).status).toBe(403);
      expect((await call("PATCH", `/inventory/${athleteItem}`, "mkt_athlete2", { priceCents: 100 })).status).toBe(403);
      expect((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: athleteItem }, select: { priceCents: true } })).priceCents).toBe(30_000);
      /* BTG reads, and does not set an athlete's prices. */
      expect((await call("GET", `/inventory/${athleteItem}`, "mkt_admin")).status).toBe(200);
      expect((await call("PATCH", `/inventory/${athleteItem}`, "mkt_admin", { priceCents: 100 })).status).toBe(403);
      /* An athlete not yet approved cannot sell. */
      expect((await call("POST", "/inventory", "mkt_drafter", { title: "x", kind: "OTHER", priceCents: 500 })).status).toBe(409);
    });
  });

  /* ── 2S2-BE-04 ─────────────────────────────────────────────────────────── */
  let rileyId = "";
  let rileyItem = "";
  let teamItem = "";

  describe("2S2-BE-04 · the team roster", () => {
    it("a team manager builds a roster in the team's own tenant, and sees it with the inventory belonging to it", async () => {
      const added = await call("POST", "/team/roster", "mkt_mgr_e", {
        legalName: "Riley Chen", displayName: "RILEY", email: "mkt_riley@mkt-test.invalid", sport: "Basketball", ageBand: "18_PLUS", teamShareBps: 1500,
      });
      expect(added.status).toBe(201);
      rileyId = added.json.id;
      expect(await prisma.athlete.findUniqueOrThrow({ where: { id: rileyId }, select: { tenantId: true, propertyId: true, state: true } }))
        .toEqual({ tenantId: E.tenant, propertyId: E.property, state: "APPROVED" });

      /* Riley signs in to the team's tenant and prices her own item; the manager adds the team's. */
      expect((await call("GET", "/me", "mkt_riley")).json).toMatchObject({ tenantId: E.tenant, roles: ["ATHLETE"] });
      rileyItem = (await call("POST", "/inventory", "mkt_riley", { title: "Camp appearance", kind: "APPEARANCE", priceCents: 50_000 })).json.id;
      const made = await call("POST", "/inventory", "mkt_mgr_e", { title: "Courtside banner, 2026 season", kind: "SIGNAGE", priceCents: 120_000, quantity: 2 });
      expect(made.json).toMatchObject({ propertyId: E.property, athleteId: null });
      teamItem = made.json.id;

      const roster = (await call("GET", "/team/roster", "mkt_mgr_e")).json;
      expect(roster.property).toMatchObject({ id: E.property, name: "Bowie Bulldogs" });
      expect(roster.athletes).toEqual([expect.objectContaining({ id: rileyId, teamShareBps: 1500, inventory: [expect.objectContaining({ id: rileyItem })] })]);
      expect(roster.inventory.map((i: { id: string }) => i.id)).toEqual([teamItem]);
      expect((await call("PATCH", `/team/roster/${rileyId}`, "mkt_mgr_e", { teamShareBps: 2000 })).json.teamShareBps).toBe(2000);
      /* The manager reads a roster athlete's item but does not reprice it — it is hers. */
      expect((await call("GET", `/inventory/${rileyItem}`, "mkt_mgr_e")).status).toBe(200);
      expect((await call("PATCH", `/inventory/${rileyItem}`, "mkt_mgr_e", { priceCents: 100 })).status).toBe(403);
    });

    it("and nobody else's — another team, another tenant's athletes, BTG's own", async () => {
      const other = (await call("GET", "/team/roster", "mkt_mgr_f")).json;
      expect(other.property.id).toBe(F.property);
      expect(other.athletes).toEqual([]);
      expect(other.inventory).toEqual([]);
      expect(JSON.stringify(other)).not.toMatch(/RILEY|Courtside|Camp appearance/);
      for (const id of [teamItem, rileyItem, athleteItem]) expect((await call("GET", `/inventory/${id}`, "mkt_mgr_f")).status, id).toBe(403);
      expect((await call("PATCH", `/team/roster/${rileyId}`, "mkt_mgr_f", { teamShareBps: 0 })).status).toBe(403);
      expect((await call("GET", "/team/roster", "mkt_athlete")).status).toBe(403); // not a manager
      /* BTG operates both teams, so it reads their inventory — an unrelated operator does not. */
      expect((await call("GET", `/inventory/${teamItem}`, "mkt_admin")).status).toBe(200);
      expect((await call("GET", `/inventory/${teamItem}`, "mkt_x_admin")).status).toBe(403);
    });
  });

  /* ── 2S3-BE-01 ─────────────────────────────────────────────────────────── */
  let listingId = "";

  describe("2S3-BE-01 · listings and governance", () => {
    it("a verified property creates a listing — and cannot publish it until governance is satisfied", async () => {
      const made = await call("POST", "/listings", "mkt_mgr_e", { inventoryItemId: teamItem, title: "Courtside banner" });
      expect(made.status).toBe(201);
      expect(made.json.state).toBe("DRAFT");
      expect(made.json.blockers).toEqual([expect.stringMatching(/description/)]);
      listingId = made.json.id;

      /* No road to PUBLISHED from here: not by submitting an ungoverned draft, not by transition, not by decision. */
      const early = await call("POST", `/listings/${listingId}/submit`, "mkt_mgr_e");
      expect(early.status).toBe(422);
      expect(early.text).toMatch(/description/);
      expect((await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PUBLISHED" })).status).toBe(409);
      expect((await call("POST", `/listings/${listingId}/decision`, "mkt_admin", { decision: "APPROVE" })).status).toBe(409);

      await call("PATCH", `/listings/${listingId}`, "mkt_mgr_e", { description: "Two courtside banners for every 2026 home game." });
      expect((await call("POST", `/listings/${listingId}/submit`, "mkt_mgr_e")).json.state).toBe("PENDING_APPROVAL");
      /* The property cannot approve itself. */
      expect((await call("POST", `/listings/${listingId}/decision`, "mkt_mgr_e", { decision: "APPROVE" })).status).toBe(403);
      /* BTG sees it in the queue of the tenants it operates; an unrelated operator cannot act on it. */
      const queue = (await call("GET", "/listings?state=PENDING_APPROVAL", "mkt_admin")).json.listings;
      expect(queue.map((l: { id: string }) => l.id)).toContain(listingId);
      expect((await call("POST", `/listings/${listingId}/decision`, "mkt_x_admin", { decision: "APPROVE" })).status).toBe(403);

      const approved = await call("POST", `/listings/${listingId}/decision`, "mkt_admin", { decision: "APPROVE" });
      expect(approved.json).toMatchObject({ state: "PUBLISHED", blockers: [] });
      expect(approved.json.publishedAt).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { tenantId: T, action: "listing.approve", entityId: listingId } })).toBe(1);
    });

    it("a published price cannot move under a buyer — pause first; resuming re-checks governance", async () => {
      expect((await call("PATCH", `/inventory/${teamItem}`, "mkt_mgr_e", { priceCents: 150_000 })).status).toBe(409);
      expect((await call("PATCH", `/listings/${listingId}`, "mkt_mgr_e", { title: "Changed live" })).status).toBe(409);
      await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PAUSED" });
      expect((await call("PATCH", `/inventory/${teamItem}`, "mkt_mgr_e", { priceCents: 150_000 })).json.version).toBe(2);
      expect((await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PUBLISHED" })).json.state).toBe("PUBLISHED");

      /* A suspended property: nothing new, and a paused listing cannot come back. */
      await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PAUSED" });
      const admin = { userId: "mkt_admin", tenantId: T, roles: ["BTG_ADMIN" as const], sponsorId: null, athleteId: null, guardianId: null, propertyId: null };
      await decideOnboarding(admin, "mkt_onb_e", "SUSPEND", "Chargeback under review.");
      const resumed = await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PUBLISHED" });
      expect(resumed.status).toBe(422);
      expect(resumed.text).toMatch(/not approved to list/);
      expect((await call("POST", "/listings", "mkt_mgr_e", { inventoryItemId: rileyItem, title: "Camp" })).status).toBe(409);
      await decideOnboarding(admin, "mkt_onb_e", "REINSTATE");
      expect((await call("POST", `/listings/${listingId}/transition`, "mkt_mgr_e", { to: "PUBLISHED" })).json.state).toBe("PUBLISHED");
    });

    it("changes requested go back to DRAFT with the note; only the property's own items; one live listing per item", async () => {
      const camp = await call("POST", "/listings", "mkt_mgr_e", { inventoryItemId: rileyItem, title: "Summer camp appearance", description: "Riley runs a two-hour clinic at your venue." });
      expect(camp.status).toBe(201); // a roster athlete's item
      await call("POST", `/listings/${camp.json.id}/submit`, "mkt_mgr_e");
      expect((await call("POST", `/listings/${camp.json.id}/decision`, "mkt_admin", { decision: "REQUEST_CHANGES" })).status).toBe(422); // needs a note
      const sent = await call("POST", `/listings/${camp.json.id}/decision`, "mkt_admin", { decision: "REQUEST_CHANGES", notes: "Say which ages the clinic suits." });
      expect(sent.json).toMatchObject({ state: "DRAFT", reviewNotes: "Say which ages the clinic suits." });

      expect((await call("POST", "/listings", "mkt_mgr_e", { inventoryItemId: rileyItem, title: "Twice" })).status).toBe(409);
      expect((await call("POST", "/listings", "mkt_mgr_f", { inventoryItemId: teamItem, title: "Stolen" })).status).toBe(403);
      expect((await call("POST", "/listings", "mkt_mgr_e", { inventoryItemId: athleteItem, title: "Not ours" })).status).toBe(403);
      expect((await call("GET", `/listings/${listingId}`, "mkt_mgr_f")).status).toBe(403);
      /* A BTG-tenant property manager — no approved onboarding — cannot list at all. */
      expect((await call("POST", "/listings", "mkt_btg_pm", { inventoryItemId: teamItem, title: "x" })).status).toBe(403);
    });
  });

  /* ── 2S2-BE-03 ─────────────────────────────────────────────────────────── */
  describe("2S2-BE-03 · the formal offer", () => {
    const offer = () => ({
      campaignId: "mkt_campaign", athleteId: "mkt_ath", jobId: "mkt_job", inventoryItemId: athleteItem,
      /* Pay at the athlete's own item price (repriced to $300 above) — never below it (2S3-BE-03). */
      brief: "Wear the new Rosa's jersey on game day and post twice.", compensation: 30_000, sellPrice: 60_000,
      deliverables: [{ title: "Game-day feed post", dueDate: inDays(14) }, { title: "Story with link", dueDate: inDays(21) }],
      usageRights: "Organic social, 90 days", exclusivityDays: 30, disclosures: ["#ad", "Paid partnership with Rosa's Tacos"], expiresAt: inDays(7),
    });

    it("accepting freezes the terms and schedules the deliverables — and later rate-card edits do not alter it", async () => {
      expect((await call("POST", "/offers", "mkt_cm", { ...offer(), sellPrice: 30_000 })).status).toBe(422); // below the margin floor
      const made = await call("POST", "/offers", "mkt_cm", offer());
      expect(made.status).toBe(201);
      const id = made.json.id as string;
      /* A DRAFT is staff's working copy — the athlete sees it only once sent. */
      expect((await call("GET", `/offers/${id}`, "mkt_athlete")).status).toBe(403);
      expect((await call("GET", "/offers", "mkt_athlete")).json.offers.map((o: { id: string }) => o.id)).not.toContain(id);
      const sent = (await call("POST", `/offers/${id}/send`, "mkt_cm")).json;
      expect(sent.state).toBe("SENT");
      expect(sent.termsHash).toMatch(/^[0-9a-f]{64}$/);

      /* The athlete sees the terms, not the margin. */
      const mine = await call("GET", `/offers/${id}`, "mkt_athlete");
      expect(mine.json.compensation).toBe(30_000);
      expect(mine.json).not.toHaveProperty("sellPrice");
      /* …with the sponsor named and the agreement the acceptance signs (2S2-FE-03). */
      expect(mine.json.sponsorName).toEqual(expect.any(String));
      expect(mine.json.agreement).toMatchObject({ id: "mkt_order_terms", version: 1, bodyHash: HASH, body: expect.any(String) });
      expect(mine.json.agreement.body.length).toBeGreaterThan(100);
      expect((await call("GET", `/offers/${id}`, "mkt_athlete2")).status).toBe(403);
      expect((await call("POST", `/offers/${id}/respond`, "mkt_athlete2", { decision: "ACCEPT" })).status).toBe(403);

      const evidence = { agreementId: "mkt_order_terms", bodyHashShown: HASH };
      expect((await call("POST", `/offers/${id}/respond`, "mkt_athlete", { decision: "ACCEPT", termsHashShown: "0".repeat(64), ...evidence })).status).toBe(409);
      const accepted = await call("POST", `/offers/${id}/respond`, "mkt_athlete", { decision: "ACCEPT", termsHashShown: sent.termsHash, ...evidence });
      expect(accepted.status).toBe(200);
      expect(accepted.json.state).toBe("ACCEPTED");

      /* The order exists, accepted, at the offer's figures; each line is a scheduled deliverable; the earning is raised. */
      const order = await prisma.campaignOrder.findUniqueOrThrow({
        where: { id: accepted.json.orderId },
        select: { state: true, compensation: true, sellPrice: true, usageRights: true, exclusivity: true, acceptanceId: true, deliverables: { select: { title: true, dueDate: true, state: true }, orderBy: { dueDate: "asc" } }, earning: { select: { state: true, gross: true } } },
      });
      expect(order).toMatchObject({ state: "ACCEPTED", compensation: 30_000, sellPrice: 60_000, usageRights: "Organic social, 90 days", exclusivity: "30 days", earning: { state: "PENDING", gross: 30_000 } });
      expect(order.acceptanceId).not.toBeNull();
      expect(order.deliverables.map((d) => [d.title, d.dueDate.toISOString().slice(0, 10), d.state])).toEqual([
        ["Game-day feed post", inDays(14).slice(0, 10), "NOT_STARTED"], ["Story with link", inDays(21).slice(0, 10), "NOT_STARTED"],
      ]);
      const snapshot = accepted.json.termsSnapshot;
      expect(snapshot).toMatchObject({ termsHash: sent.termsHash, orderId: accepted.json.orderId, terms: { compensation: 30_000, disclosures: ["#ad", "Paid partnership with Rosa's Tacos"] } });
      /* The margin stays off the athlete side — the snapshot's line included. */
      expect(JSON.stringify(accepted.json)).not.toContain("sellPrice");
      expect((await call("GET", `/offers/${id}`, "mkt_athlete")).json.termsSnapshot.line).toEqual({});

      /* Later: the rate card moves and the athlete reprices the item. The offer and the order do not. */
      await prisma.athleteRate.create({ data: { tenantId: T, athleteId: "mkt_ath", jobId: "mkt_job", amount: 35_000, version: 2 } });
      expect((await call("PATCH", `/inventory/${athleteItem}`, "mkt_athlete", { priceCents: 90_000 })).status).toBe(200);
      const after = (await call("GET", `/offers/${id}`, "mkt_cm")).json;
      expect(after).toMatchObject({ compensation: 30_000, sellPrice: 60_000, termsHash: sent.termsHash });
      expect(after.termsSnapshot).toEqual({ ...snapshot, line: { sellPrice: 60_000 } });
      expect((await prisma.campaignOrder.findUniqueOrThrow({ where: { id: accepted.json.orderId }, select: { compensation: true } })).compensation).toBe(30_000);

      /* And Postgres refuses a change to accepted terms, whoever tries. */
      await expect(prisma.$executeRawUnsafe(`UPDATE "Offer" SET compensation = 1 WHERE id = $1`, id)).rejects.toThrow(/offer_terms_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "Offer" SET "termsSnapshot" = '{}' WHERE id = $1`, id)).rejects.toThrow(/offer_terms_immutable/);
      await expect(prisma.$executeRawUnsafe(`UPDATE "Offer" SET state = 'DECLINED' WHERE id = $1`, id)).rejects.toThrow(/offer_terms_immutable/);
      expect((await call("POST", `/offers/${id}/respond`, "mkt_athlete", { decision: "DECLINE" })).status).toBe(409);
    });

    it("a sent offer's terms are fixed before acceptance too; decline and withdraw close it", async () => {
      const second = (await call("POST", "/offers", "mkt_cm", { ...offer(), athleteId: "mkt_ath2", inventoryItemId: null })).json.id as string;
      await call("POST", `/offers/${second}/send`, "mkt_cm");
      await expect(prisma.$executeRawUnsafe(`UPDATE "Offer" SET brief = 'changed' WHERE id = $1`, second)).rejects.toThrow(/offer_terms_immutable/);
      expect((await call("POST", `/offers/${second}/respond`, "mkt_athlete2", { decision: "DECLINE" })).json.state).toBe("DECLINED");

      const third = (await call("POST", "/offers", "mkt_cm", { ...offer(), athleteId: "mkt_ath2", inventoryItemId: null })).json.id as string;
      await call("POST", `/offers/${third}/send`, "mkt_cm");
      expect((await call("POST", `/offers/${third}/withdraw`, "mkt_cm")).json.state).toBe("WITHDRAWN");
      expect((await call("POST", `/offers/${third}/respond`, "mkt_athlete2", { decision: "ACCEPT" })).status).toBe(409);
      /* An item that is not the athlete's cannot be offered against. */
      expect((await call("POST", "/offers", "mkt_cm", { ...offer(), athleteId: "mkt_ath2", inventoryItemId: athleteItem })).status).toBe(422);
      /* Staff make offers; athletes and sponsors do not. */
      expect((await call("POST", "/offers", "mkt_athlete", offer())).status).toBe(403);
      expect((await call("POST", "/offers", "mkt_sponsor_admin", offer())).status).toBe(403);
    });
  });

  /* ── 2S7-BE-01 ─────────────────────────────────────────────────────────── */
  describe("2S7-BE-01 · tenant branding", () => {
    it("an outside organisation sets its own branding; everyone in its tenant is served it, and nobody else", async () => {
      const logo = await call("POST", "/branding/logo", "mkt_mgr_e", { contentType: "image/png", bytes: PNG.length });
      expect(logo.status).toBe(201);
      expect(logo.json.logoKey.startsWith(`branding/${E.tenant}/logo-`)).toBe(true);
      expect(new URL(logo.json.uploadUrl).pathname.startsWith("/sponsorx-public/branding/")).toBe(true);
      expect((await call("POST", "/branding/logo", "mkt_mgr_e", { contentType: "image/svg+xml", bytes: 10 })).status).toBe(400);

      const set = await call("PUT", "/branding", "mkt_mgr_e", {
        displayName: "Bowie Bulldogs", logoKey: logo.json.logoKey, primaryColor: "#7A0019", accentColor: "#FFCC33",
        reportFooter: "Bowie Bulldogs Basketball · partners@bowiebulldogs.example", customDomain: "Partners.BowieBulldogs.example",
      });
      expect(set.status).toBe(200);
      expect(set.json).toMatchObject({ displayName: "Bowie Bulldogs", primaryColor: "#7A0019", customDomain: "partners.bowiebulldogs.example" });
      expect(set.json.logoUrl).toBe(`http://localhost:9000/sponsorx-public/${logo.json.logoKey}`);

      /* Served to the portal: every signed-in user of that tenant — the manager and a roster athlete. */
      expect((await call("GET", "/branding", "mkt_riley")).json).toEqual({ ...set.json, canEdit: false });
      /* canEdit says up front who gets the form (2S7-FE-03). */
      expect((await call("GET", "/branding", "mkt_mgr_e")).json.canEdit).toBe(true);
      expect((await call("GET", "/branding", "mkt_btg_pm")).json.canEdit).toBe(false);
      /* Nobody else's: the other team is served its own (none yet), BTG its own. */
      expect((await call("GET", "/branding", "mkt_mgr_f")).json.displayName).toBeNull();
      expect((await call("GET", "/branding", "mkt_admin")).json.displayName).toBeNull();

      /* Refused: another tenant's logo key, a bad colour, a taken or a SponsorX domain, a BTG-tenant property manager. */
      expect((await call("PUT", "/branding", "mkt_mgr_f", { logoKey: logo.json.logoKey })).status).toBe(422);
      expect((await call("PUT", "/branding", "mkt_mgr_f", { primaryColor: "red;} body{display:none" })).status).toBe(400);
      expect((await call("PUT", "/branding", "mkt_mgr_f", { customDomain: "partners.bowiebulldogs.example" })).status).toBe(409);
      expect((await call("PUT", "/branding", "mkt_mgr_f", { customDomain: "lions.sponsorx.net" })).status).toBe(422);
      expect((await call("PUT", "/branding", "mkt_btg_pm", { displayName: "Hijacked BTG" })).status).toBe(403);
      expect((await call("PUT", "/branding", "mkt_riley", { displayName: "Riley's" })).status).toBe(403);
    });

    it("renders on the tenant's reports — the rendered PDF and screen 12's payload", async () => {
      const { handleRenderReport } = await import("../worker/jobs/render-report.mts");
      const { renderPdf } = await import("../src/domain/report-render");
      await call("PUT", "/branding", "mkt_admin", { displayName: "BTG Sports Group", primaryColor: "#0B3D91", accentColor: "#E4002B", reportFooter: "Prepared by BTG SponsorX" });
      await prisma.tenantBranding.update({ where: { tenantId: T }, data: { logoKey: `branding/${T}/logo-test.png` } });

      let html = "";
      const puts: Buffer[] = [];
      const logos: string[] = [];
      const out = await handleRenderReport({
        db: prisma, put: async (_k, body) => { puts.push(body); },
        logo: async (key) => { logos.push(key); return PNG; },
        pdf: async (h) => { html = h; return renderPdf(h); },
      }, { tenantId: T, campaignId: "mkt_campaign", trigger: "REQUESTED", requestedBy: "mkt_admin" });
      expect(out.status).toBe("rendered");
      expect(logos).toEqual([`branding/${T}/logo-test.png`]);
      expect(html).toContain(`<img src="data:image/png;base64,${PNG.toString("base64")}"`);
      expect(html).toContain("<b>BTG Sports Group</b>");
      expect(html).toContain("h1{color:#0B3D91}");
      expect(html).toContain("h2{color:#E4002B}");
      expect(html).toMatch(/data-brand="footer"[^>]*>Prepared by BTG SponsorX</);
      expect(puts[0]!.subarray(0, 5).toString()).toBe("%PDF-");

      /* Screen 12 is given the same branding to render. */
      const screen = (await call("GET", "/campaigns/mkt_campaign/report", "mkt_sponsor_admin")).json;
      expect(screen.branding).toMatchObject({ displayName: "BTG Sports Group", primaryColor: "#0B3D91", reportFooter: "Prepared by BTG SponsorX" });
    }, 60_000);
  });
});
