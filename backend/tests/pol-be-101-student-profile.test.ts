import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-101 — a NEXT student's own profile (found in staging practice,
   2026-11-17: a signed-in student had no page showing their own details).

   Done when: GET /students/me answers the caller's own record — and only to
   a STUDENT login, only for the record that login is linked to, in its own
   tenant; PATCH /students/me changes the display name and nothing else,
   validated and audited; another student's record, another tenant's and
   every non-student role are refused (§30). No date of birth, email or
   guardian detail reaches the response.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
/* The contract imports the env through the student domain; without a database the HTTP half skips. */
process.env.DATABASE_URL ??= "postgresql://test@localhost/test";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sp-test.invalid` } : null;
  },
}));

const { StudentDisplayNameInput } = await import("../src/contracts/student");

describe("POL-BE-101 · the display name a student may set (contract)", () => {
  const parse = (body: unknown) => StudentDisplayNameInput.safeParse(body);

  it("trims and accepts an ordinary name, an accented one and one with an emoji", () => {
    expect(parse({ displayName: "  Riley J  " })).toMatchObject({ success: true, data: { displayName: "Riley J" } });
    expect(parse({ displayName: "Zoë Ångström" }).success).toBe(true);
    expect(parse({ displayName: "Sam 📸" }).success).toBe(true);
    expect(parse({ displayName: "R2" }).success).toBe(true);
  });

  it("refuses empty, blank, one character, over 60, no letter or number, and hidden characters", () => {
    for (const displayName of ["", "   ", "R", "x".repeat(61), "!!!", "Riley\nSmith", "Ri​ley", "Ri‮yel", "Riley\u0000"]) {
      expect(parse({ displayName }).success, JSON.stringify(displayName)).toBe(false);
    }
    expect(parse({ displayName: "x".repeat(60) }).success).toBe(true);
  });

  it("takes the display name and nothing else — no id, no legal name, no school, no year", () => {
    for (const extra of [{ id: "s_other" }, { studentId: "s_other" }, { legalName: "X" }, { gradYear: 2030 }, { propertyId: "p" }, { masthead: ["EDITOR"] }, { birthDate: "2000-01-01" }, { guardianId: "g" }]) {
      expect(parse({ displayName: "Riley", ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    expect(parse({}).success).toBe(false);
    expect(parse({ displayName: 42 }).success).toBe(false);
  });
});

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-101 · GET and PATCH /students/me, on the path a request takes", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const A = "sp_tenant_a";
  const B = "sp_tenant_b";
  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = async (method: string, path: string, clerk: string | null, body?: unknown) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method, headers: { ...(clerk ? { "x-test-clerk": clerk } : {}), "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  const nameOf = async (id: string) =>
    (await prisma.student.findFirstOrThrow({ where: { id }, select: { displayName: true } })).displayName;
  const audits = (id: string) =>
    prisma.auditLog.findMany({ where: { entity: "Student", entityId: id, action: "student.displayNameUpdate" }, select: { tenantId: true, actorId: true, before: true, after: true } });

  async function clean() {
    for (const t of ["StudentCode", "AuditLog", "User", "Student", "Guardian", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" IN ($1, $2)`, A, B);
    }
    await prisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.createMany({ data: [{ id: A, name: "Student profile test A" }, { id: B, name: "Student profile test B" }] });
    await prisma.property.createMany({ data: [
      { id: "sp_school", tenantId: A, slug: "sp-northside", name: "Northside High", kind: "SCHOOL" },
      { id: "sp_school2", tenantId: A, slug: "sp-southside", name: "Southside High", kind: "SCHOOL" },
      { id: "sp_school_b", tenantId: B, slug: "sp-eastside", name: "Eastside High", kind: "SCHOOL" },
    ] });
    await prisma.guardian.create({ data: { id: "sp_guardian", tenantId: A, legalName: "Pat Parent", email: "pat@sp.invalid", relationship: "PARENT" } });
    await prisma.student.createMany({ data: [
      /* a minor, approved, waiting on an unverified guardian */
      { id: "sp_minor", tenantId: A, propertyId: "sp_school", legalName: "Riley Legal", displayName: "Riley", email: "riley@sp.invalid", gradYear: 2028, birthDate: new Date("2011-02-03"), masthead: ["WRITER", "SALES"], state: "APPROVED", guardianId: "sp_guardian", reviewerNotes: "internal note" },
      { id: "sp_adult", tenantId: A, propertyId: "sp_school", legalName: "Alex Adult", displayName: "Alex", ageBand: "18_PLUS", gradYear: 2026, masthead: ["EDITOR"], state: "ACTIVE" },
      { id: "sp_other", tenantId: A, propertyId: "sp_school", legalName: "Other Student", displayName: "Other", ageBand: "18_PLUS", masthead: ["WRITER"], state: "ACTIVE" },
      { id: "sp_left", tenantId: A, propertyId: "sp_school", legalName: "Left Student", displayName: "Gone", ageBand: "18_PLUS", masthead: ["WRITER"], state: "INACTIVE", leftAt: new Date() },
      /* a tenant-A student nobody in tenant A is signed in as */
      { id: "sp_orphan", tenantId: A, propertyId: "sp_school", legalName: "Orphan Legal", displayName: "Orphan", ageBand: "18_PLUS", masthead: ["WRITER"], state: "ACTIVE" },
      { id: "sp_b_student", tenantId: B, propertyId: "sp_school_b", legalName: "Bee Legal", displayName: "Bee", ageBand: "18_PLUS", masthead: ["WRITER"], state: "ACTIVE" },
    ] });
    await prisma.studentCode.create({ data: { tenantId: A, studentId: "sp_adult", code: "spCode_Adult1" } });
    await prisma.user.createMany({ data: [
      { id: "sp_u_minor", tenantId: A, clerkId: "sp_minor", email: "riley@sp.invalid", roles: ["STUDENT"], studentId: "sp_minor", propertyId: "sp_school" },
      { id: "sp_u_adult", tenantId: A, clerkId: "sp_adult", email: "alex@sp.invalid", roles: ["STUDENT"], studentId: "sp_adult", propertyId: "sp_school" },
      { id: "sp_u_other", tenantId: A, clerkId: "sp_other", email: "other@sp.invalid", roles: ["STUDENT"], studentId: "sp_other", propertyId: "sp_school" },
      { id: "sp_u_left", tenantId: A, clerkId: "sp_left", email: "left@sp.invalid", roles: ["STUDENT"], studentId: "sp_left", propertyId: "sp_school" },
      { id: "sp_u_nolink", tenantId: A, clerkId: "sp_nolink", email: "nolink@sp.invalid", roles: ["STUDENT"], propertyId: "sp_school" },
      { id: "sp_u_adv", tenantId: A, clerkId: "sp_adv", email: "advisor@sp.invalid", roles: ["ADVISOR"], propertyId: "sp_school" },
      { id: "sp_u_adv_off", tenantId: A, clerkId: "sp_adv_off", email: "off@sp.invalid", roles: ["ADVISOR"], propertyId: "sp_school", disabledAt: new Date(), disabledReason: "left" },
      { id: "sp_u_adv_2", tenantId: A, clerkId: "sp_adv_2", email: "south@sp.invalid", roles: ["ADVISOR"], propertyId: "sp_school2" },
      { id: "sp_u_admin", tenantId: A, clerkId: "sp_admin", email: "ops@sp.invalid", roles: ["BTG_ADMIN"] },
      { id: "sp_u_guardian", tenantId: A, clerkId: "sp_guard", email: "pat@sp.invalid", roles: ["GUARDIAN"], guardianId: "sp_guardian" },
      { id: "sp_u_adv_b", tenantId: B, clerkId: "sp_adv_b", email: "advb@sp.invalid", roles: ["ADVISOR"], propertyId: "sp_school_b" },
      /* tenant B's login, wrongly linked to tenant A's student */
      { id: "sp_u_cross", tenantId: B, clerkId: "sp_cross", email: "cross@sp.invalid", roles: ["STUDENT"], studentId: "sp_orphan", propertyId: "sp_school_b" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  it("a minor reads their own profile: names, year, school, roles, state, guardian status, the advisor's email", async () => {
    const r = await call("GET", "/students/me", "sp_minor");
    expect(r.status, r.text).toBe(200);
    expect(r.json).toEqual({
      id: "sp_minor", legalName: "Riley Legal", displayName: "Riley", gradYear: 2028,
      school: { name: "Northside High" }, masthead: ["WRITER", "SALES"], state: "APPROVED", leftAt: null,
      code: null, minor: true, guardian: { linked: true, verified: false },
      /* the school's active advisor only — not the disabled one, not another school's */
      advisors: [{ email: "advisor@sp.invalid", name: null }],
      editable: ["displayName"],
    });
    /* nothing about the guardian but the status; no DOB, email or reviewer's notes */
    for (const leak of ["Pat Parent", "pat@sp.invalid", "2011", "riley@sp.invalid", "internal note", "birthDate", "ageBand"]) {
      expect(r.text).not.toContain(leak);
    }
  });

  it("an adult reads their code and no guardian; the guardian shows verified once BTG verifies", async () => {
    const adult = await call("GET", "/students/me", "sp_adult");
    expect(adult.json).toMatchObject({ id: "sp_adult", code: "spCode_Adult1", minor: false, guardian: null });
    await prisma.guardian.update({ where: { id: "sp_guardian" }, data: { verifiedAt: new Date() }, select: { id: true } });
    expect((await call("GET", "/students/me", "sp_minor")).json.guardian).toEqual({ linked: true, verified: true });
  });

  it("the student changes their display name: trimmed, spaces collapsed, effective at once, audited", async () => {
    const r = await call("PATCH", "/students/me", "sp_adult", { displayName: "  Alex   J.  " });
    expect(r.status, r.text).toBe(200);
    expect(r.json).toMatchObject({ id: "sp_adult", displayName: "Alex J.", legalName: "Alex Adult" });
    expect(await nameOf("sp_adult")).toBe("Alex J.");
    expect(await audits("sp_adult")).toEqual([
      { tenantId: A, actorId: "sp_u_adult", before: { displayName: "Alex" }, after: { displayName: "Alex J." } },
    ]);
    /* the same name again writes and audits nothing */
    expect((await call("PATCH", "/students/me", "sp_adult", { displayName: "Alex J." })).status).toBe(200);
    expect(await audits("sp_adult")).toHaveLength(1);
  });

  it("refuses an invalid display name and changes nothing", async () => {
    for (const displayName of ["", "  ", "A", "y".repeat(61), "???", "Al​ex"]) {
      const r = await call("PATCH", "/students/me", "sp_adult", { displayName });
      expect(r.status, JSON.stringify(displayName)).toBe(400);
    }
    expect(await nameOf("sp_adult")).toBe("Alex J.");
  });

  it("another student's record is refused: no id in the body, no other student's row read or written", async () => {
    const r = await call("PATCH", "/students/me", "sp_adult", { displayName: "Hijack", studentId: "sp_other" });
    expect(r.status).toBe(400);
    const r2 = await call("PATCH", "/students/me", "sp_adult", { displayName: "Hijack", id: "sp_other" });
    expect(r2.status).toBe(400);
    expect(await nameOf("sp_other")).toBe("Other");
    expect(await nameOf("sp_adult")).toBe("Alex J.");
    /* there is no PATCH on another student's id, and their GET is refused as before */
    expect((await call("PATCH", "/students/sp_other", "sp_adult", { displayName: "Hijack" })).status).toBe(404);
    expect((await call("GET", "/students/sp_other", "sp_adult")).status).toBe(403);
    expect(await audits("sp_other")).toHaveLength(0);
  });

  it("cross-tenant is refused: a login in tenant B linked to tenant A's student reaches nothing", async () => {
    expect((await call("GET", "/students/me", "sp_cross")).status).toBe(403);
    expect((await call("PATCH", "/students/me", "sp_cross", { displayName: "Cross" })).status).toBe(403);
    expect(await nameOf("sp_orphan")).toBe("Orphan");
    expect(await audits("sp_orphan")).toHaveLength(0);
  });

  it("non-student roles are refused, even those who may read the student another way", async () => {
    for (const who of ["sp_adv", "sp_admin", "sp_guard", "sp_adv_b"]) {
      expect((await call("GET", "/students/me", who)).status, `${who} GET`).toBe(403);
      expect((await call("PATCH", "/students/me", who, { displayName: "Renamed" })).status, `${who} PATCH`).toBe(403);
    }
    expect((await call("GET", "/students/me", null)).status).toBe(401);
    expect((await call("PATCH", "/students/me", null, { displayName: "Renamed" })).status).toBe(401);
    expect(await nameOf("sp_minor")).toBe("Riley");
  });

  it("a STUDENT login with no linked record is refused; one who has left can read but not change", async () => {
    expect((await call("GET", "/students/me", "sp_nolink")).status).toBe(403);
    expect((await call("PATCH", "/students/me", "sp_nolink", { displayName: "Nobody" })).status).toBe(403);
    expect((await call("GET", "/students/me", "sp_left")).json).toMatchObject({ state: "INACTIVE" });
    const r = await call("PATCH", "/students/me", "sp_left", { displayName: "Back" });
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("student_profile_locked");
    expect(await nameOf("sp_left")).toBe("Gone");
  });

  it("the advisor sees the new display name on their desk; the legal name is untouched", async () => {
    const s = (await call("GET", "/students/sp_adult", "sp_adv")).json;
    expect(s).toMatchObject({ displayName: "Alex J.", legalName: "Alex Adult", gradYear: 2026, masthead: ["EDITOR"] });
  });
});
