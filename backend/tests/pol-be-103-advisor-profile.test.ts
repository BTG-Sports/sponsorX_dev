import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-103 — a school advisor's own Profile page.

   "An advisor opens a Profile page from the menu: their own name, email (from
   Clerk), title and phone, and their school's name, email domain and roster
   count, with the roster's last update. The advisor can set their own name,
   title and phone (audit-logged); the name then shows to their students on
   #101's page in place of the bare email. The school's name and kind are
   BTG's to change. One school only, tenant-scoped, with role tests."
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
    return id ? { clerkId: id, email: `${id}@be103-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-103 · a school advisor's Profile page", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const A = "be103_a";
  const B = "be103_b";
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

  async function clean() {
    for (const t of ["StudentCode", "AuditLog", "User", "Student", "Guardian", "RosterEntry", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN ($1, $2)`, A, B);
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: A, name: "BE103 A" }, { id: B, name: "BE103 B" }] });
    await prisma.property.createMany({ data: [
      { id: "be103_north", tenantId: A, slug: "be103-north", name: "Northside High", kind: "SCHOOL", emailDomain: "northside.k12.example" },
      { id: "be103_south", tenantId: A, slug: "be103-south", name: "Southside High", kind: "SCHOOL" },
      { id: "be103_east", tenantId: B, slug: "be103-east", name: "Eastside High", kind: "SCHOOL" },
    ] });
    await prisma.rosterEntry.createMany({ data: [
      { tenantId: A, propertyId: "be103_north", legalName: "Riley One", gradYear: 2027, createdAt: new Date("2026-11-01T10:00:00Z") },
      { tenantId: A, propertyId: "be103_north", legalName: "Alex Two", gradYear: 2026, createdAt: new Date("2026-11-10T09:30:00Z") },
      { tenantId: A, propertyId: "be103_south", legalName: "South One", createdAt: new Date("2026-11-12T00:00:00Z") },
    ] });
    await prisma.guardian.create({ data: { id: "be103_guardian", tenantId: A, legalName: "Pat Parent", email: "pat@be103.invalid", relationship: "PARENT" } });
    await prisma.student.create({ data: { id: "be103_student", tenantId: A, propertyId: "be103_north", legalName: "Alex Two", displayName: "Alex", ageBand: "18_PLUS", masthead: ["WRITER"], state: "ACTIVE" } });
    await prisma.user.createMany({ data: [
      { id: "be103_u_adv", tenantId: A, clerkId: "be103_adv", email: "advisor@northside.k12.example", roles: ["ADVISOR"], propertyId: "be103_north" },
      { id: "be103_u_adv_south", tenantId: A, clerkId: "be103_adv_south", email: "advisor@south.example", roles: ["ADVISOR"], propertyId: "be103_south" },
      { id: "be103_u_adv_b", tenantId: B, clerkId: "be103_adv_b", email: "advisor@east.example", roles: ["ADVISOR"], propertyId: "be103_east" },
      { id: "be103_u_student", tenantId: A, clerkId: "be103_student", email: "alex@be103.invalid", roles: ["STUDENT"], studentId: "be103_student", propertyId: "be103_north" },
      { id: "be103_u_guardian", tenantId: A, clerkId: "be103_guardian", email: "pat@be103.invalid", roles: ["GUARDIAN"], guardianId: "be103_guardian" },
      { id: "be103_u_btg", tenantId: A, clerkId: "be103_btg", email: "ops@be103.invalid", roles: ["BTG_ADMIN"] },
      { id: "be103_u_mgr", tenantId: A, clerkId: "be103_mgr", email: "mgr@be103.invalid", roles: ["PROPERTY_MGR"], propertyId: "be103_north" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  it("the advisor sees their own details and their school's: name, kind, email domain, roster count and last update", async () => {
    const r = await call("GET", "/advisor/profile", "be103_adv");
    expect(r.status, r.text).toBe(200);
    expect(r.json).toEqual({
      me: { name: null, jobTitle: null, phone: null, email: "advisor@northside.k12.example", signIn: "CLERK" },
      school: {
        id: "be103_north", name: "Northside High", kind: "SCHOOL", managedBy: "BTG", emailDomain: "northside.k12.example",
        roster: { count: 2, lastUpdatedAt: "2026-11-10T09:30:00.000Z" },
      },
      editable: ["name", "jobTitle", "phone"],
    });
  });

  it("the advisor sets their name, title and phone at once, audited; the same again writes nothing; null clears one", async () => {
    const r = await call("PATCH", "/advisor/profile", "be103_adv", { name: "Ms. Jordan Lee", jobTitle: "Journalism Advisor", phone: "+1 301 555 0142" });
    expect(r.status, r.text).toBe(200);
    expect(r.json.me).toMatchObject({ name: "Ms. Jordan Lee", jobTitle: "Journalism Advisor", phone: "+1 301 555 0142" });
    const audits = () => prisma.auditLog.findMany({ where: { tenantId: A, action: "advisor.profileUpdate" }, select: { entityId: true, before: true, after: true } });
    expect(await audits()).toEqual([{
      entityId: "be103_u_adv",
      before: { fullName: null, jobTitle: null, phone: null },
      after: { fullName: "Ms. Jordan Lee", jobTitle: "Journalism Advisor", phone: "+1 301 555 0142" },
    }]);

    expect((await call("PATCH", "/advisor/profile", "be103_adv", { name: "Ms. Jordan Lee" })).status).toBe(200);
    expect(await audits()).toHaveLength(1);

    const cleared = await call("PATCH", "/advisor/profile", "be103_adv", { phone: null });
    expect(cleared.json.me).toMatchObject({ name: "Ms. Jordan Lee", phone: null });
    expect(await audits()).toHaveLength(2);
  });

  it("only name, title and phone: not the school's name, kind, domain or anything else", async () => {
    for (const body of [{}, { schoolName: "X" }, { kind: "TEAM" }, { emailDomain: "x.example" }, { email: "x@y.example" }, { propertyId: "be103_south" }, { name: "   " }, { name: "x".repeat(121) }]) {
      const r = await call("PATCH", "/advisor/profile", "be103_adv", body);
      expect([400, 422], JSON.stringify(body)).toContain(r.status);
    }
    const school = await prisma.property.findUniqueOrThrow({ where: { id: "be103_north" }, select: { name: true, kind: true, emailDomain: true } });
    expect(school).toEqual({ name: "Northside High", kind: "SCHOOL", emailDomain: "northside.k12.example" });
  });

  it("the name then shows to their students beside the email", async () => {
    const r = await call("GET", "/students/me", "be103_student");
    expect(r.status, r.text).toBe(200);
    expect(r.json.advisors).toEqual([{ email: "advisor@northside.k12.example", name: "Ms. Jordan Lee" }]);
  });

  it("each advisor sees only their own school, in their own tenant", async () => {
    const south = await call("GET", "/advisor/profile", "be103_adv_south");
    expect(south.json.school).toMatchObject({ id: "be103_south", name: "Southside High", emailDomain: null, roster: { count: 1 } });
    const east = await call("GET", "/advisor/profile", "be103_adv_b");
    expect(east.json.school).toMatchObject({ id: "be103_east", roster: { count: 0, lastUpdatedAt: null } });
    /* South's edit is South's own; Northside's advisor is untouched. */
    await call("PATCH", "/advisor/profile", "be103_adv_south", { name: "Mr. South" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "be103_u_adv" }, select: { fullName: true } })).fullName).toBe("Ms. Jordan Lee");
  });

  it("a student, a guardian, a team manager and BTG staff are refused", async () => {
    for (const who of ["be103_student", "be103_guardian", "be103_mgr", "be103_btg"]) {
      expect((await call("GET", "/advisor/profile", who)).status, who).toBe(403);
      expect((await call("PATCH", "/advisor/profile", who, { name: "Intruder" })).status, who).toBe(403);
    }
  });
});
