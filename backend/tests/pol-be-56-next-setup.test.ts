import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-56 (app review B5) — BTG couldn't create or change a NEXT
   publication or edition from the screens: POST /publications and
   /publications/:id/editions had no caller, no route listed publications,
   and no route changed an edition's dates or threshold.

   Done when: BTG creates a publication for a school (it then appears on
   /next/apply), creates an edition, edits its dates, and cancels one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ns-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-56 · NEXT set up from the screens", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");
  const T = "ns_tenant";
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
    for (const t of ["AuditLog", "Edition", "Publication", "User", "Property"]) await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    await prisma.tenant.deleteMany({ where: { id: T } });
  }
  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "NEXT setup test tenant" } });
    await prisma.property.createMany({ data: [
      { id: "ns_school", tenantId: T, slug: "ns-eastside", name: "Eastside High", kind: "SCHOOL" },
      { id: "ns_team", tenantId: T, slug: "ns-team", name: "A Team", kind: "TEAM" },
    ] });
    await prisma.user.createMany({ data: [
      { id: "ns_admin", tenantId: T, clerkId: "ns_admin", email: "ops@ns.invalid", roles: ["BTG_ADMIN"] },
      { id: "ns_finance", tenantId: T, clerkId: "ns_finance", email: "fin@ns.invalid", roles: ["FINANCE"] },
      { id: "ns_advisor", tenantId: T, clerkId: "ns_advisor", email: "adv@ns.invalid", roles: ["ADVISOR"], propertyId: "ns_school" },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  let pubId = "";
  let editionId = "";
  const day = (d: string) => `${d}T12:00:00.000Z`;

  it("BTG sees the schools a publication may be for; a new school's publication appears on the student application", async () => {
    const before = await call("GET", "/publications", "ns_admin");
    expect(before.status).toBe(200);
    expect(before.json.schools.map((s: { id: string }) => s.id)).toEqual(["ns_school"]);
    const created = await call("POST", "/publications", "ns_admin", { name: "The Eastside Eagle", propertyId: "ns_school" });
    expect(created.status, created.text).toBe(201);
    pubId = created.json.id;
    const after = (await call("GET", "/publications", "ns_admin")).json;
    expect(after.publications).toEqual([expect.objectContaining({ id: pubId, name: "The Eastside Eagle", schoolName: "Eastside High" })]);
    /* The advisor reads their school's masthead but is offered no schools to create one for. */
    const adv = (await call("GET", "/publications", "ns_advisor")).json;
    expect(adv.publications.map((p: { id: string }) => p.id)).toEqual([pubId]);
    expect(adv.schools).toEqual([]);
  });

  it("BTG creates an edition and edits its dates and threshold while planning", async () => {
    const e = await call("POST", `/publications/${pubId}/editions`, "ns_admin", { label: "Spring 2027", closeDate: day("2027-03-01"), publishTarget: day("2027-04-01"), thresholdCents: 300_000 });
    expect(e.status, e.text).toBe(201);
    editionId = e.json.id;
    const edit = await call("PATCH", `/editions/${editionId}`, "ns_admin", { closeDate: day("2027-03-15"), thresholdCents: 250_000, label: "Spring 2027 issue" });
    expect(edit.status, edit.text).toBe(200);
    expect(edit.json).toMatchObject({ label: "Spring 2027 issue", thresholdCents: 250_000 });
    const row = await prisma.edition.findUniqueOrThrow({ where: { id: editionId }, select: { closeDate: true, thresholdCents: true } });
    expect(row.closeDate.toISOString()).toBe(day("2027-03-15"));
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "edition.update", entityId: editionId } })).toBe(1);
  });

  it("the dates must make sense; nobody but BTG edits; after selling closes they're fixed", async () => {
    expect((await call("PATCH", `/editions/${editionId}`, "ns_admin", { publishTarget: day("2027-03-01") })).status).toBe(422);
    expect((await call("PATCH", `/editions/${editionId}`, "ns_admin", { salesOpenAt: day("2027-03-20") })).status).toBe(422);
    expect((await call("PATCH", `/editions/${editionId}`, "ns_advisor", { label: "x" })).status).toBe(403);
    expect((await call("PATCH", `/editions/${editionId}`, "ns_finance", { label: "x" })).status).toBe(403);
    await prisma.edition.update({ where: { id: editionId }, data: { state: "CLOSED" } });
    const late = await call("PATCH", `/editions/${editionId}`, "ns_admin", { label: "Too late" });
    expect(late.status).toBe(409);
    expect(late.json.error.message).toMatch(/fixed now/);
  });

  it("BTG cancels an edition (CLOSED → CANCELLED, offered on the screen)", async () => {
    const r = await call("POST", `/editions/${editionId}/transition`, "ns_admin", { to: "CANCELLED" });
    expect(r.status, r.text).toBe(200);
    expect((await prisma.edition.findUniqueOrThrow({ where: { id: editionId }, select: { state: true } })).state).toBe("CANCELLED");
  });
});
