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

    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
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
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
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

  it("NEXT story: the Fall 2026 edition is selling, every slot open, visible to Northside's advisor", async () => {
    /* P9-BE-20 — only an ACTIVE student reads the school's editions; Jordan
       is still waiting in the advisor's queue, so Jordan is refused. */
    expect((await get(`/editions/${EDITION.editionId}/slots`, clerkOf("seed_user_p_jordan"))).status).toBe(403);
    const res = await get(`/editions/${EDITION.editionId}/slots`, clerkOf("seed_user_p_patel"));
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

/* --------------------------------------------------------------------------
   2S8-QA-05 — the walkthrough seed on a database real people already use.

   The seed skipped only rows whose id it had written before. A real applicant
   called Riley Carter holds the global slug `riley-carter`, and the seed then
   failed on Athlete_slug_key — and took the whole boot seed with it. Now a
   slug held by another row gives the persona the next free one; a login
   address held by another user skips that persona's login. Each is logged,
   and the other person's row is never touched. Same file as the personas
   above, because both use the seed's fixed ids.
   -------------------------------------------------------------------------- */
describe.skipIf(!hasDatabase)("walkthrough seed · runs on a database where its slugs and addresses are taken", async () => {
  const pg = (await import("pg")).default;
  const { prisma } = await import("../src/db/client");
  const { PILOT_SCHOOL, TENANT_ID, seedPilotSchool } = await import("../worker/jobs/seed-environment.mts");
  const { PERSONAS, HAWKS, HARBOR, BOWIE, RILEY, MAYA, JORDAN, EDITION, MARKETPLACE_ITEMS, seedPersonas } =
    await import("../worker/jobs/seed-personas.mts");

  const STRANGER = { athlete: "ps_stranger_riley", property: "ps_stranger_hawks", user: "ps_stranger_maya_login" } as const;
  const mayaEmail = PERSONAS.find((p) => p.userId === "seed_user_p_maya")!.email;
  let createdTenant = false;

  async function clean() {
    await prisma.user.deleteMany({ where: { id: { in: [...PERSONAS.map((p) => p.userId), PILOT_SCHOOL.advisorUserId, STRANGER.user] } } });
    await prisma.adSlot.deleteMany({ where: { editionId: EDITION.editionId } });
    await prisma.edition.deleteMany({ where: { id: EDITION.editionId } });
    await prisma.publication.deleteMany({ where: { id: EDITION.publicationId } });
    await prisma.student.deleteMany({ where: { id: JORDAN.studentId } });
    await prisma.athlete.deleteMany({ where: { id: { in: [RILEY.athleteId, MAYA.athleteId, STRANGER.athlete] } } });
    await prisma.guardian.deleteMany({ where: { id: { in: [JORDAN.guardianId, MAYA.guardianId] } } });
    await prisma.sponsor.deleteMany({ where: { id: { in: [HARBOR.sponsorId, BOWIE.sponsorId] } } });
    await prisma.listing.deleteMany({ where: { propertyId: HAWKS.propertyId } });
    await prisma.inventoryItem.deleteMany({ where: { id: { in: MARKETPLACE_ITEMS.map(([id]) => id) } } });
    await prisma.propertyOnboarding.deleteMany({ where: { id: { in: ["seed_onb_hawks", "seed_onb_baysox"] } } });
    await prisma.property.deleteMany({ where: { id: { in: [HAWKS.propertyId, STRANGER.property] } } });
    await prisma.rosterEntry.deleteMany({ where: { propertyId: PILOT_SCHOOL.propertyId } });
    await prisma.property.deleteMany({ where: { id: PILOT_SCHOOL.propertyId } });
    if (createdTenant) await prisma.tenant.deleteMany({ where: { id: TENANT_ID } });
  }

  const logged: string[] = [];
  let firstRun = -1;
  let secondRun = -1;

  beforeAll(async () => {
    await clean();
    createdTenant = !(await prisma.tenant.findUnique({ where: { id: TENANT_ID }, select: { id: true } }));
    if (createdTenant) await prisma.tenant.create({ data: { id: TENANT_ID, name: "BTG Sports Group" } });
    /* Real people, there first: an applicant called Riley Carter, a team that
       took the Hawks' slug, and someone already signed in with Maya's address. */
    await prisma.athlete.create({ data: {
      id: STRANGER.athlete, tenantId: TENANT_ID, slug: RILEY.slug, legalName: "Riley Carter", displayName: "Riley Carter",
      email: "riley.carter@ps-stranger.invalid", sport: "Soccer", stateCode: "VA",
    } });
    await prisma.property.create({ data: { id: STRANGER.property, tenantId: TENANT_ID, slug: HAWKS.slug, name: "Westfield Hawks Soccer", kind: "TEAM", city: "Westfield", stateCode: "NJ" } });
    await prisma.user.create({ data: { id: STRANGER.user, tenantId: TENANT_ID, clerkId: "ps_stranger_clerk", email: mayaEmail, roles: ["SPONSOR_ADMIN"] } });

    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(" ")); });
    const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await seedPilotSchool(client, TENANT_ID);
      firstRun = (await seedPersonas(client, TENANT_ID)).usersCreated;
      secondRun = (await seedPersonas(client, TENANT_ID)).usersCreated;
    } finally {
      client.release();
      await pool.end();
      spy.mockRestore();
    }
  });

  afterAll(clean);

  it("completes, twice, creating every login but the one whose address is taken", () => {
    expect(firstRun).toBe(PERSONAS.length - 1);
    expect(secondRun).toBe(0);
  });

  it("Riley's persona takes the next free slug; the real Riley Carter keeps theirs, untouched", async () => {
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: RILEY.athleteId }, select: { slug: true, state: true } }))
      .toEqual({ slug: `${RILEY.slug}-2`, state: "SUBMITTED" });
    expect(await prisma.athlete.findUniqueOrThrow({ where: { id: STRANGER.athlete }, select: { slug: true, legalName: true, sport: true } }))
      .toEqual({ slug: RILEY.slug, legalName: "Riley Carter", sport: "Soccer" });
    /* Maya's slug was free, so it is hers as before. */
    expect((await prisma.athlete.findUniqueOrThrow({ where: { id: MAYA.athleteId }, select: { slug: true } })).slug).toBe(MAYA.slug);
  });

  it("the Hawks take the next free slug too, and the other team is untouched", async () => {
    expect((await prisma.property.findUniqueOrThrow({ where: { id: HAWKS.propertyId }, select: { slug: true } })).slug).toBe(`${HAWKS.slug}-2`);
    expect(await prisma.property.findUniqueOrThrow({ where: { id: STRANGER.property }, select: { slug: true, name: true } }))
      .toEqual({ slug: HAWKS.slug, name: "Westfield Hawks Soccer" });
  });

  it("Maya's login is skipped, not merged into the account that already holds her address", async () => {
    expect(await prisma.user.findUnique({ where: { id: "seed_user_p_maya" }, select: { id: true } })).toBeNull();
    expect(await prisma.user.findMany({ where: { email: mayaEmail }, select: { id: true, roles: true } }))
      .toEqual([{ id: STRANGER.user, roles: ["SPONSOR_ADMIN"] }]);
  });

  it("says what it did in the log", () => {
    expect(logged.filter((l) => l.includes(`Athlete slug "${RILEY.slug}" is held by another row`) && l.includes(`"${RILEY.slug}-2"`))).toHaveLength(1);
    expect(logged.filter((l) => l.includes(`Property slug "${HAWKS.slug}" is held by another row`))).toHaveLength(1);
    /* Once per run: the address is still taken the second time. */
    expect(logged.filter((l) => l.includes("persona seed_user_p_maya skipped"))).toHaveLength(2);
  });
});
