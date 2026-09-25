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
