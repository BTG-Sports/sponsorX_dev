import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-104 — a team's own details page (property portal).

   "The property manager sees all of it on one page. Identity fields that
   matter for matching and conflicts go to BTG review before they take effect;
   cosmetic and contact fields save at once and are audit-logged. Email,
   password and MFA stay in Clerk. Own-property only, with role tests."

   Phase 2 automation (owner, 2026-11-18): an identity change takes effect at
   once when every safety check passes, and waits for BTG with the reasons
   when one fails.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/rate-limit")>()),
  limit: async () => {},
}));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@be104-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-104 · a team's own details page", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const { normalizeBusinessName } = await import("../src/domain/business-name-rules");

  const T = "be104_tenant";
  const p = (s: string) => `${T}_${s}`;
  const TEAM = p("hawks");
  const ORG = p("hawks_org");
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, who: string, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { "x-test-clerk": who, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const mgr = p("mgr");
  const btg = p("btg");
  const details = { legalEntityName: "Bowie Hawks LLC", league: "AAU 17U", sport: "Basketball" };

  async function wipe() {
    const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.columns WHERE column_name = 'tenantId' AND table_schema = 'public'`,
    );
    for (let pass = 0; pass < 5; pass++) {
      for (const { table_name } of tables) {
        await prisma.$executeRawUnsafe(`DELETE FROM "${table_name}" WHERE "tenantId" = $1`, T).catch(() => {});
      }
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }
  const property = () => prisma.property.findUniqueOrThrow({ where: { id: TEAM }, select: { name: true, city: true, stateCode: true, description: true } });
  const org = () => prisma.propertyOnboarding.findUniqueOrThrow({ where: { id: ORG }, select: { orgName: true, nameKey: true, stateCode: true, details: true, contacts: true } });
  const decideAll = async () => {
    for (const c of (await call("GET", "/property-profile-changes", btg)).json.changes as Array<{ id: string }>) {
      await call("POST", `/property-profile-changes/${c.id}/reject`, btg, { reason: "Clearing for the next test." });
    }
  };

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "BE104" } });
    await prisma.property.createMany({ data: [
      { id: TEAM, tenantId: T, slug: "be104-hawks", name: "Bowie Hawks", kind: "TEAM", city: "Bowie", stateCode: "MD", zohoId: "be104-zoho-hawks" },
      { id: p("eagles"), tenantId: T, slug: "be104-eagles", name: "Laurel Ospreys", kind: "TEAM", city: "Laurel", stateCode: "MD" },
    ] });
    await prisma.propertyOnboarding.createMany({ data: [
      {
        id: ORG, tenantId: T, state: "APPROVED", orgType: "TEAM", orgName: "Bowie Hawks", nameKey: normalizeBusinessName("Bowie Hawks"), stateCode: "MD", propertyId: TEAM,
        details, contacts: [{ name: "Sam Coach", email: "sam@hawks.example", phone: "+1 301 555 0100", role: "Director", primary: true }],
      },
      {
        id: p("eagles_org"), tenantId: T, state: "APPROVED", orgType: "TEAM", orgName: "Laurel Ospreys", nameKey: normalizeBusinessName("Laurel Ospreys"), stateCode: "MD", propertyId: p("eagles"),
        details: { legalEntityName: "Laurel Ospreys Inc", league: "AAU", sport: "Basketball" }, contacts: [],
      },
    ] });
    for (const [id, kind] of [["rights", "RIGHTS_PROOF"], ["id", "IDENTITY"]] as const) {
      await prisma.onboardingDocument.create({ data: { id: p(id), tenantId: T, onboardingId: ORG, kind, filename: `${id}.pdf`, contentType: "application/pdf", bytes: 10, r2Key: `be104/${id}`, uploadedAt: new Date() } });
    }
    await prisma.sponsor.create({ data: { id: p("sponsor"), tenantId: T, name: "Some Sponsor" } });
    await prisma.athlete.create({ data: { id: p("ath"), tenantId: T, slug: "be104-ath", legalName: "Ath Lete", displayName: "Ath", email: "ath@be104.invalid", sport: "Basketball", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE" } });
    const users: Array<[string, string, Record<string, string>]> = [
      ["mgr", "PROPERTY_MGR", { propertyId: TEAM }], ["other_mgr", "PROPERTY_MGR", { propertyId: p("eagles") }],
      ["btg", "BTG_ADMIN", {}], ["network", "NETWORK_MGR", {}], ["sponsor_admin", "SPONSOR_ADMIN", { sponsorId: p("sponsor") }],
      ["athlete", "ATHLETE", { athleteId: p("ath") }], ["advisor", "ADVISOR", { propertyId: TEAM }],
    ];
    for (const [id, role, link] of users) {
      await prisma.user.create({ data: { id: p(id), tenantId: T, clerkId: p(id), email: `${p(id)}@be104-test.invalid`, roles: [role as never], ...link } });
    }
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    server?.close();
    await wipe();
  });

  it("the manager sees the team's details, the main contact, themselves and their notification settings", async () => {
    const r = await call("GET", "/property/profile", mgr);
    expect(r.status, r.text).toBe(200);
    expect(r.json.property).toEqual({
      id: TEAM, name: "Bowie Hawks", kind: "TEAM", kindManagedBy: "BTG", city: "Bowie", stateCode: "MD", details, description: null,
      contact: { name: "Sam Coach", email: "sam@hawks.example", phone: "+1 301 555 0100" },
    });
    expect(r.json.me).toEqual({ name: null, jobTitle: null, phone: null, email: `${mgr}@be104-test.invalid`, signIn: "CLERK" });
    expect(r.json.pendingChange).toBeNull();
    expect(r.json.notificationPreferences.length).toBeGreaterThan(0);
  });

  it("the description, the contact's name and phone, and the manager's own details save at once, audited", async () => {
    const r = await call("PATCH", "/property/profile", mgr, { description: "17U travel basketball out of Bowie, MD.", contactName: "Sam Rivera", contactPhone: "+1 301 555 0199" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.property).toMatchObject({ description: "17U travel basketball out of Bowie, MD.", contact: { name: "Sam Rivera", email: "sam@hawks.example", phone: "+1 301 555 0199" } });
    const me = await call("PATCH", "/property/profile/me", mgr, { name: "Jordan Park", jobTitle: "Team Manager", phone: "+1 301 555 0123" });
    expect(me.json.me).toMatchObject({ name: "Jordan Park", jobTitle: "Team Manager", phone: "+1 301 555 0123" });
    const audits = await prisma.auditLog.findMany({ where: { tenantId: T, action: { in: ["property.profileUpdate", "property.managerUpdate"] } }, select: { action: true, before: true, after: true } });
    expect(audits.map((a) => a.action).sort()).toEqual(["property.managerUpdate", "property.profileUpdate"]);
    expect(audits.find((a) => a.action === "property.profileUpdate")).toMatchObject({
      before: { description: null, contact: { name: "Sam Coach", phone: "+1 301 555 0100" } },
      after: { description: "17U travel basketball out of Bowie, MD.", contact: { name: "Sam Rivera", phone: "+1 301 555 0199" } },
    });
    /* The contact's email isn't this page's to change, nor the type. */
    expect((await call("PATCH", "/property/profile", mgr, { contactEmail: "x@y.example" })).status).toBe(400);
    expect((await call("POST", "/property/profile/change", mgr, { kind: "SCHOOL" })).status).toBe(400);
  });

  it("a change that passes every check takes effect at once — the property, its sign-up and Zoho for the name", async () => {
    const r = await call("POST", "/property/profile/change", mgr, { name: "Bowie Hawks Elite", city: "Upper Marlboro", details: { ...details, league: "AAU 16U" } });
    expect(r.status, r.text).toBe(201);
    expect(r.json.pendingChange).toBeNull();
    expect(r.json.lastDecision).toMatchObject({ status: "APPROVED", autoApproved: true, holdReasons: [] });
    expect(await property()).toMatchObject({ name: "Bowie Hawks Elite", city: "Upper Marlboro", stateCode: "MD" });
    expect(await org()).toMatchObject({ orgName: "Bowie Hawks Elite", nameKey: normalizeBusinessName("Bowie Hawks Elite"), details: { ...details, league: "AAU 16U" } });
    const jobs = await prisma.outboxJob.findMany({ where: { tenantId: T, name: "zoho.renameProperty" }, select: { payload: true } });
    expect(jobs.map((j) => j.payload)).toEqual([expect.objectContaining({ propertyId: TEAM })]);
    expect((await call("GET", "/property-profile-changes", btg)).json.changes).toHaveLength(0);
    expect((await call("POST", "/property/profile/change", mgr, { city: "Upper Marlboro" })).status).toBe(422);
    expect((await call("POST", "/property/profile/change", mgr, { stateCode: "ZZ" })).status).toBe(422);
    expect((await call("POST", "/property/profile/change", mgr, { details: { sport: "Basketball" } })).status).toBe(422);
  });

  it("each failed check holds the change for BTG with its reason", async () => {
    const held = async (body: unknown, reason: string) => {
      const r = await call("POST", "/property/profile/change", mgr, body);
      expect(r.status, r.text).toBe(201);
      expect(r.json.pendingChange.holdReasons, JSON.stringify(body)).toEqual([expect.stringContaining(reason)]);
      await decideAll();
    };
    await held({ name: "Laurel Ospreys" }, 'Another organisation already holds the name "Laurel Ospreys"');
    await held({ name: "Bowie Hawks Escort Service" }, "restricted word");
    await held({ details: { ...details, league: "AAU 16U", legalEntityName: "Hawks Holdings LLC" } }, "legal entity name");
    await held({ stateCode: "CA" }, "Missing for the new state: Business registration (CA)");
    expect(await property()).toMatchObject({ name: "Bowie Hawks Elite", stateCode: "MD" });

    /* An offer out on the team's inventory: a sponsor is buying it as described. */
    await prisma.inventoryItem.create({ data: { id: p("item"), tenantId: T, propertyId: TEAM, title: "Courtside banner", kind: "OTHER", priceCents: 50_000 } });
    await prisma.nilJob.create({ data: { id: p("job"), tenantId: T, name: "Post", baseLow: 1, baseHigh: 2, sellLow: 2, sellHigh: 4, sellFloorEmerging: 1, sellFloorCreator: 2, sellFloorPremium: 3 } });
    await prisma.campaign.create({ data: { id: p("camp"), tenantId: T, sponsorId: p("sponsor"), name: "Camp", budget: 1000, startDate: new Date("2026-11-01"), endDate: new Date("2027-01-31"), state: "STAFFING" } });
    await prisma.offer.create({ data: {
      id: p("offer"), tenantId: T, campaignId: p("camp"), athleteId: p("ath"), jobId: p("job"), inventoryItemId: p("item"), brief: "b",
      compensation: 100, sellPrice: 200, deliverables: [], usageRights: "90 days", expiresAt: new Date("2026-12-31"), state: "SENT",
    } });
    await held({ city: "Annapolis" }, "an offer out on your inventory");
    await prisma.offer.update({ where: { id: p("offer") }, data: { state: "DECLINED" } });

    /* Not in good standing. */
    await prisma.property.update({ where: { id: TEAM }, data: { payoutsHeldAt: new Date() } });
    await held({ city: "Annapolis" }, "payouts are held");
    await prisma.property.update({ where: { id: TEAM }, data: { payoutsHeldAt: null } });
  });

  it("a held change waits one at a time; BTG's approval makes it real, and the manager reads a rejection", async () => {
    const asked = await call("POST", "/property/profile/change", mgr, { stateCode: "CA" });
    const id = asked.json.pendingChange.id as string;
    expect((await call("GET", "/property/profile", mgr)).json.pendingChange).toMatchObject({ status: "PENDING", changes: { stateCode: "CA" }, before: { stateCode: "MD" } });
    expect((await call("POST", "/property/profile/change", mgr, { city: "Somewhere" })).status).toBe(409);

    expect((await call("GET", "/property-profile-changes", p("network"))).status).toBe(200);
    expect((await call("POST", `/property-profile-changes/${id}/approve`, p("network"))).status).toBe(403);
    const ok = await call("POST", `/property-profile-changes/${id}/approve`, btg);
    expect(ok.status, ok.text).toBe(200);
    expect(await property()).toMatchObject({ stateCode: "CA" });
    expect((await org()).stateCode).toBe("CA");
    expect((await call("POST", `/property-profile-changes/${id}/reject`, btg, { reason: "late" })).status).toBe(409);

    const again = await call("POST", "/property/profile/change", mgr, { name: "Laurel Ospreys" });
    const no = await call("POST", `/property-profile-changes/${again.json.pendingChange.id}/reject`, btg, { reason: "That's another team's name." });
    expect(no.status).toBe(200);
    expect((await call("GET", "/property/profile", mgr)).json.lastDecision).toMatchObject({ status: "REJECTED", reason: "That's another team's name." });
  });

  it("two BTG answers to the same change settle once", async () => {
    const asked = await call("POST", "/property/profile/change", mgr, { stateCode: "NY" });
    const id = asked.json.pendingChange.id as string;
    const [a, b] = await Promise.all([
      call("POST", `/property-profile-changes/${id}/approve`, btg),
      call("POST", `/property-profile-changes/${id}/reject`, btg, { reason: "No." }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it("another team's manager, an athlete, a sponsor, an advisor and BTG staff are refused the page", async () => {
    for (const who of [p("athlete"), p("sponsor_admin"), p("advisor"), btg, p("network")]) {
      expect((await call("GET", "/property/profile", who)).status, who).toBe(403);
      expect((await call("PATCH", "/property/profile", who, { description: "x" })).status, who).toBe(403);
      expect((await call("POST", "/property/profile/change", who, { city: "x" })).status, who).toBe(403);
    }
    for (const who of [mgr, p("athlete"), p("sponsor_admin")]) {
      expect((await call("GET", "/property-profile-changes", who)).status, who).toBe(403);
    }
    const theirs = await call("GET", "/property/profile", p("other_mgr"));
    expect(theirs.json.property).toMatchObject({ id: p("eagles"), name: "Laurel Ospreys", contact: null });
    expect((await call("PATCH", "/property/profile", p("other_mgr"), { contactName: "X" })).status).toBe(422);
    await call("PATCH", "/property/profile", p("other_mgr"), { description: "Eagles." });
    expect((await property()).description).toBe("17U travel basketball out of Bowie, MD.");
  });
});
