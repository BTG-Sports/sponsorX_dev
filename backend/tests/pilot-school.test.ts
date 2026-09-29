import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   The NEXT pilot school — P9-OPS-01, spec §3.

   "The pilot school exists as a Property, its advisor has a login, and it
   appears in the property portal."

   The worker's own seed SQL writes the school and its advisor; the advisor
   then signs in through the production identity path (claim by email on
   first sign-in) and asks the real API which property is theirs. The
   property portal's page is still on fixtures — wiring it to this read is
   frontend work, recorded on the tracker row.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
/* Clerk is not under test: the caller's identity comes from headers. What
   happens after — the email claim, roles, tenant, scope — is production. */
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? `${id}@pilot-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-OPS-01 · the pilot school and its advisor", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { PILOT_SCHOOL, TENANT_ID, seedPilotSchool } = await import("../worker/jobs/seed-environment.mts");
  const { createApp } = await import("../src/app");

  const OTHER = "ps_other_tenant";
  let createdTenant = false;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";

  const get = (path: string, clerk: string, email?: string) =>
    fetch(`${base}/api/v1${path}`, {
      headers: { "x-test-clerk": clerk, ...(email ? { "x-test-email": email } : {}) },
    });

  async function clean() {
    await prisma.user.deleteMany({
      where: { id: { in: [PILOT_SCHOOL.advisorUserId, "ps_admin", "ps_forged", "ps_unlinked"] } },
    });
    await prisma.rosterEntry.deleteMany({ where: { propertyId: PILOT_SCHOOL.propertyId } });
    await prisma.property.deleteMany({ where: { id: PILOT_SCHOOL.propertyId } });
    await prisma.tenant.deleteMany({ where: { id: OTHER } });
    if (createdTenant) await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  }

  beforeAll(async () => {
    await clean();
    createdTenant = !(await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true } }));
    if (createdTenant) await prisma.tenant.create({ data: { id: TENANT_ID, name: "BTG Sports Group" } });
    await prisma.tenant.create({ data: { id: OTHER, name: "Another tenant" } });

    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      /* Twice: the worker runs it on every boot, so it must be idempotent. */
      expect((await seedPilotSchool(client, TENANT_ID)).created).toBe(true);
      expect((await seedPilotSchool(client, TENANT_ID)).created).toBe(false);
    } finally {
      client.release();
      await pool.end();
    }

    await prisma.user.createMany({
      data: [
        { id: "ps_admin", tenantId: TENANT_ID, clerkId: "ps_admin", email: "ps_admin@x.invalid", roles: ["BTG_ADMIN"] },
        { id: "ps_unlinked", tenantId: TENANT_ID, clerkId: "ps_unlinked", email: "ps_unlinked@x.invalid", roles: ["PROPERTY_MGR"] },
        /* A property manager in ANOTHER tenant whose link points at the
           pilot school — the cross-tenant case the scope must refuse. */
        { id: "ps_forged", tenantId: OTHER, clerkId: "ps_forged", email: "ps_forged@x.invalid",
          roles: ["PROPERTY_MGR"], propertyId: PILOT_SCHOOL.propertyId },
      ],
    });

    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("the school exists as a Property of kind SCHOOL", async () => {
    const school = await prisma.property.findUniqueOrThrow({
      where: { id: PILOT_SCHOOL.propertyId }, select: { tenantId: true, kind: true, name: true, slug: true },
    });
    expect(school).toEqual({ tenantId: TENANT_ID, kind: "SCHOOL", name: "Northside High School", slug: "northside-high" });
  });

  it("its advisor has a login: first sign-in claims the seeded account, as that school's manager", async () => {
    const res = await get("/me", "clerk_real_advisor", PILOT_SCHOOL.advisorEmail);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      userId: PILOT_SCHOOL.advisorUserId, tenantId: TENANT_ID,
      roles: ["PROPERTY_MGR"], propertyId: PILOT_SCHOOL.propertyId,
    });
    /* The placeholder is gone — the real Clerk identity now owns the row. */
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: PILOT_SCHOOL.advisorUserId }, select: { clerkId: true },
    });
    expect(row.clerkId).toBe("clerk_real_advisor");
  });

  it("and the property portal's read gives the advisor their school", async () => {
    const res = await get("/properties/mine", "clerk_real_advisor");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      property: {
        id: PILOT_SCHOOL.propertyId, slug: "northside-high", name: "Northside High School",
        kind: "SCHOOL", city: "Bowie", stateCode: "MD",
      },
    });
  });

  it("nobody else is handed a school: unlinked, staff, or a link forged from another tenant", async () => {
    for (const who of ["ps_unlinked", "ps_admin", "ps_forged"]) {
      const res = await get("/properties/mine", who);
      expect(res.status, who).toBe(404);
      expect(await res.text(), who).not.toContain("Northside");
    }
  });
});

/* --------------------------------------------------------------------------
   Walkthrough personas — worker/jobs/seed-personas.mts.

   Every persona's first sign-in claims its seeded row through the production
   identity path and lands with the right roles and link, and each story
   starts with the hand-over it promises: Riley in the review queue, Jordan in
   the advisor's queue, Maya's featured profile public, the edition selling.
   Kept in this file because the personas hang off the pilot school, and a
   second file cleaning the same fixed ids in parallel would race this one.
   -------------------------------------------------------------------------- */
describe.skipIf(!hasDatabase)("walkthrough personas · every login works and every story has its hand-over", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { PILOT_SCHOOL, TENANT_ID, seedPilotSchool } = await import("../worker/jobs/seed-environment.mts");
  const { PERSONAS, HAWKS, HARBOR, BOWIE, RILEY, MAYA, JORDAN, EDITION, EDITION_SLOTS, MARKETPLACE_ITEMS, seedPersonas } =
    await import("../worker/jobs/seed-personas.mts");
  const { createApp } = await import("../src/app");

  let createdTenant = false;
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const get = (path: string, clerk: string, email?: string) =>
    fetch(`${base}/api/v1${path}`, {
      headers: { "x-test-clerk": clerk, ...(email ? { "x-test-email": email } : {}) },
    });
  const clerkOf = (userId: string) => `clerk_${userId}`;

  async function clean() {
    await prisma.user.deleteMany({ where: { id: { in: [...PERSONAS.map((p) => p.userId), PILOT_SCHOOL.advisorUserId] } } });
    await prisma.adSlot.deleteMany({ where: { editionId: EDITION.editionId } });
    await prisma.edition.deleteMany({ where: { id: EDITION.editionId } });
    await prisma.publication.deleteMany({ where: { id: EDITION.publicationId } });
    await prisma.student.deleteMany({ where: { id: JORDAN.studentId } });
    await prisma.athlete.deleteMany({ where: { id: { in: [RILEY.athleteId, MAYA.athleteId] } } });
    await prisma.guardian.deleteMany({ where: { id: { in: [JORDAN.guardianId, MAYA.guardianId] } } });
    await prisma.sponsor.deleteMany({ where: { id: { in: [HARBOR.sponsorId, BOWIE.sponsorId] } } });
    await prisma.listing.deleteMany({ where: { propertyId: HAWKS.propertyId } });
    await prisma.inventoryItem.deleteMany({ where: { id: { in: MARKETPLACE_ITEMS.map(([id]) => id) } } });
    await prisma.propertyOnboarding.deleteMany({ where: { id: { in: ["seed_onb_hawks", "seed_onb_baysox"] } } });
    await prisma.property.deleteMany({ where: { id: HAWKS.propertyId } });
    await prisma.rosterEntry.deleteMany({ where: { propertyId: PILOT_SCHOOL.propertyId } });
    await prisma.property.deleteMany({ where: { id: PILOT_SCHOOL.propertyId } });
    if (createdTenant) await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  }

  beforeAll(async () => {
    await clean();
    createdTenant = !(await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true } }));
    if (createdTenant) await prisma.tenant.create({ data: { id: TENANT_ID, name: "BTG Sports Group" } });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await seedPilotSchool(client, TENANT_ID);
      /* Twice: it runs on every worker boot. */
      expect((await seedPersonas(client, TENANT_ID)).usersCreated).toBe(PERSONAS.length);
      expect((await seedPersonas(client, TENANT_ID)).usersCreated).toBe(0);
    } finally {
      client.release();
      await pool.end();
    }
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("uses only Clerk test addresses, and the school id the environment seed uses", () => {
    for (const p of PERSONAS) expect(p.email, p.who).toMatch(/^[a-z.]+\+clerk_test@example\.com$/);
    expect(new Set(PERSONAS.map((p) => p.email)).size).toBe(PERSONAS.length);
    expect(PERSONAS.find((p) => p.userId === "seed_user_p_patel")?.propertyId).toBe(PILOT_SCHOOL.propertyId);
  });

  it("every persona's first sign-in claims its row, with its roles and its link", async () => {
    for (const p of PERSONAS) {
      const res = await get("/me", clerkOf(p.userId), p.email);
      expect(res.status, p.who).toBe(200);
      expect(await res.json(), p.who).toMatchObject({
        userId: p.userId, tenantId: TENANT_ID, roles: p.roles,
        sponsorId: p.sponsorId ?? null, propertyId: p.propertyId ?? null, studentId: p.studentId ?? null,
      });
      /* /me does not echo the athlete and guardian links; the claimed row does. */
      expect(await prisma.user.findUniqueOrThrow({
        where: { id: p.userId }, select: { clerkId: true, athleteId: true, guardianId: true },
      }), p.who).toEqual({ clerkId: clerkOf(p.userId), athleteId: p.athleteId ?? null, guardianId: p.guardianId ?? null });
    }
  });

  it("marketplace story: Riley's application waits in the network manager's queue", async () => {
    const res = await get("/applications?limit=100", clerkOf("seed_user_p_network"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(RILEY.athleteId);
  });

  it("NEXT story: Jordan waits in Ms. Patel's queue, and only there", async () => {
    const mine = await get("/students", clerkOf("seed_user_p_patel"));
    expect(mine.status).toBe(200);
    expect(await mine.text()).toContain(JORDAN.studentId);
    /* The Hawks' manager is not Northside's advisor. */
    const other = await get("/students", clerkOf("seed_user_p_hawks"));
    expect(await other.text()).not.toContain(JORDAN.studentId);
  });

  it("NEXT story: the Fall 2026 edition is selling, every slot open, visible to Northside's student", async () => {
    const res = await get(`/editions/${EDITION.editionId}/slots`, clerkOf("seed_user_p_jordan"));
    expect(res.status).toBe(200);
    const body = await res.text();
    for (const [slotCode] of EDITION_SLOTS) expect(body).toContain(slotCode);
    expect(await prisma.adSlot.count({ where: { editionId: EDITION.editionId, campaignId: null } })).toBe(EDITION_SLOTS.length);
    expect((await prisma.edition.findUniqueOrThrow({ where: { id: EDITION.editionId }, select: { state: true } })).state).toBe("SELLING");
  });

  it("marketplace story: the Hawks' listing is live for Harbor Coffee, and the Bay Sox wait for BTG's review", async () => {
    const search = await get("/marketplace/search", clerkOf("seed_user_p_harbor"));
    expect(search.status).toBe(200);
    expect(await search.text()).toContain("seed_lst_hawks_signage");
    /* The Hawks may list (approved, with access) — their team inventory is theirs. */
    const inv = await get("/team/inventory", clerkOf("seed_user_p_hawks"));
    expect(inv.status).toBe(200);
    for (const [id] of MARKETPLACE_ITEMS) expect(await inv.clone().text()).toContain(id);
    const queue = await get("/onboarding", clerkOf("seed_user_p_admin"));
    expect(queue.status).toBe(200);
    const q = (await queue.json()) as { onboardings: Array<{ id: string; missing: string[] }> };
    expect(q.onboardings.find((o) => o.id === "seed_onb_baysox")).toBeDefined();
  });

  it("NEXT story: Maya's featured profile is public, ready to be claimed", async () => {
    const res = await fetch(`${base}/api/v1/public/athletes/${MAYA.slug}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ slug: MAYA.slug, featured: true, claimable: true });
  });
});
