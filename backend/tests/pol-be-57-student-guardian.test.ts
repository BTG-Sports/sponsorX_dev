import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-57 (app review B6) — an under-18 student could never join the
   masthead: activation waits for a verified guardian, but the guardian got
   no email and no screen called POST /guardians/:id/verify.

   Done when: a minor's application emails the guardian; BTG verifies the
   guardian from the desk; the advisor then adds the student to the masthead
   (or, approved already, the student joins on the verify).
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@sg-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-57 · a minor student's guardian", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "sg_tenant";
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
  async function clean() {
    for (const t of ["StudentCode", "OutboxJob", "SyncTask", "AuditLog", "Publication", "User", "Student", "Guardian", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.tenant.deleteMany({ where: { id: T } });
  }
  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Student guardian test tenant" } });
    await prisma.property.create({ data: { id: "sg_school", tenantId: T, slug: "sg-westside", name: "Westside High", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: "sg_admin", tenantId: T, clerkId: "sg_admin", email: "ops@sg.invalid", roles: ["BTG_ADMIN"] },
      { id: "sg_advisor", tenantId: T, clerkId: "sg_advisor", email: "adv@sg.invalid", roles: ["ADVISOR"], propertyId: "sg_school" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  let studentId = "";
  let guardianId = "";

  it("a minor's application emails the guardian they named, saying BTG will verify them", async () => {
    const r = await call("POST", "/public/students/applications", null, {
      schoolSlug: "sg-westside", legalName: "Riley Legal", displayName: "Riley", birthDate: "2011-02-03", masthead: ["WRITER"],
      guardian: { legalName: "Pat Parent", email: "Pat@Parent.invalid", relationship: "PARENT" },
    });
    expect(r.status, r.text).toBe(201);
    studentId = r.json.id;
    const mail = (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string> })
      .filter((p) => p.template === "student.guardianNotice");
    expect(mail.map((m) => m.to)).toEqual(["pat@parent.invalid"]);
    expect(mail[0]!.data).toMatchObject({ guardianName: "Pat Parent", studentName: "Riley", schoolName: "Westside High" });
    expect(mail[0]!.data.contactUrl).toMatch(/\/contact\?topic=guardianship$/);
  });

  it("the advisor's read shows the guardian, not verified; an adult applicant's guardian notice is never sent", async () => {
    const list = (await call("GET", "/students?page=1", "sg_advisor")).json;
    const s = list.students.find((x: { id: string }) => x.id === studentId);
    expect(s.guardian).toMatchObject({ legalName: "Pat Parent", relationship: "PARENT", verifiedAt: null });
    guardianId = s.guardian.id;
    await call("POST", "/public/students/applications", null, { schoolSlug: "sg-westside", legalName: "Adult L", displayName: "Adult", ageBand: "18_PLUS", masthead: ["WRITER"] });
    expect(await prisma.outboxJob.count({ where: { tenantId: T, name: "notify.email", payload: { path: ["template"], equals: "student.guardianNotice" } } })).toBe(1);
  });

  it("the advisor approves; the student waits for the guardian; only BTG verifies, and the student joins the masthead", async () => {
    expect((await call("POST", `/students/${studentId}/transition`, "sg_advisor", { to: "APPROVED" })).status).toBe(200);
    const blocked = await call("POST", `/students/${studentId}/transition`, "sg_advisor", { to: "ACTIVE" });
    expect(blocked.status).toBe(409);
    expect((await call("POST", `/guardians/${guardianId}/verify`, "sg_advisor")).status).toBe(403);
    const v = await call("POST", `/guardians/${guardianId}/verify`, "sg_admin");
    expect(v.status, v.text).toBe(200);
    expect((await prisma.student.findUniqueOrThrow({ where: { id: studentId }, select: { state: true } })).state).toBe("ACTIVE");
  });
});
