import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   POL-BE-76 (app review §6) — a NEXT applicant was never told anything.
   Done when: each decision emails the applicant; the desk shows the login
   outcome.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: `${id}@ae-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("POL-BE-76 · a NEXT applicant is told each decision", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  const T = "ae_tenant";
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
  const mails = async (to: string) =>
    (await prisma.outboxJob.findMany({ where: { tenantId: T, name: "notify.email" }, select: { payload: true }, orderBy: { createdAt: "asc" } }))
      .map((j) => j.payload as { template: string; to: string; data: Record<string, string> })
      .filter((m) => m.to === to);
  const apply = async (displayName: string, email: string | null) => {
    const r = await call("POST", "/public/students/applications", null, {
      schoolSlug: "ae-eastside", legalName: `${displayName} Legal`, displayName, ageBand: "18_PLUS", masthead: ["WRITER"], ...(email ? { email } : {}),
    });
    expect(r.status, r.text).toBe(201);
    return r.json.id as string;
  };
  const toReview = async (id: string) => {
    const s = await prisma.student.findFirstOrThrow({ where: { id }, select: { state: true } });
    if (s.state === "SUBMITTED") expect((await call("POST", `/students/${id}/transition`, "ae_advisor", { to: "UNDER_REVIEW" })).status).toBe(200);
  };

  async function clean() {
    for (const t of ["StudentCode", "OutboxJob", "SyncTask", "AuditLog", "Publication", "User", "Student", "Guardian", "Property"]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, T);
    }
    await prisma.user.deleteMany({ where: { email: { in: ["taken@ae.invalid"] } } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Applicant emails test tenant" } });
    await prisma.property.create({ data: { id: "ae_school", tenantId: T, slug: "ae-eastside", name: "Eastside High", kind: "SCHOOL" } });
    await prisma.user.createMany({ data: [
      { id: "ae_advisor", tenantId: T, clerkId: "ae_advisor", email: "adv@ae.invalid", roles: ["ADVISOR"], propertyId: "ae_school" },
      /* An address another SponsorX login already holds. */
      { id: "ae_other", tenantId: T, clerkId: "ae_other", email: "taken@ae.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server?.close(); await clean(); });

  it("applying sends 'we got your application'", async () => {
    await apply("Rae", "rae@ae.invalid");
    const got = await mails("rae@ae.invalid");
    expect(got.map((m) => m.template)).toEqual(["student.received"]);
    expect(got[0]!.data).toMatchObject({ studentName: "Rae", schoolName: "Eastside High" });
  });

  it("an approval emails how to sign in, and the desk shows the login was made", async () => {
    const id = (await prisma.student.findFirstOrThrow({ where: { tenantId: T, displayName: "Rae" }, select: { id: true } })).id;
    await toReview(id);
    const r = await call("POST", `/students/${id}/transition`, "ae_advisor", { to: "APPROVED" });
    expect(r.status, r.text).toBe(200);
    const approved = (await mails("rae@ae.invalid")).find((m) => m.template === "student.approved")!;
    expect(approved.data.signInUrl).toMatch(/\/login$/);
    expect(approved.data.email).toBe("rae@ae.invalid");
    expect((await call("GET", `/students/${id}`, "ae_advisor")).json.login).toBe("invited");
  });

  it("an address already used by another login gets no sign-in steps, and the desk says why", async () => {
    const id = await apply("Sam", "taken@ae.invalid");
    await toReview(id);
    expect((await call("POST", `/students/${id}/transition`, "ae_advisor", { to: "APPROVED" })).status).toBe(200);
    const approved = (await mails("taken@ae.invalid")).find((m) => m.template === "student.approved")!;
    expect(approved.data.signInUrl).toBe("");
    expect(approved.data.waitingLine).toMatch(/already used by another SponsorX login/);
    expect((await call("GET", `/students/${id}`, "ae_advisor")).json.login).toBe("address-in-use");
  });

  it("no address: no email, and the desk says there's no login", async () => {
    const id = await apply("Noor", null);
    await toReview(id);
    expect((await call("POST", `/students/${id}/transition`, "ae_advisor", { to: "APPROVED" })).status).toBe(200);
    expect((await call("GET", `/students/${id}`, "ae_advisor")).json.login).toBe("no-email");
  });

  it("changes asked and a decline each email the advisor's note", async () => {
    const a = await apply("Ivy", "ivy@ae.invalid");
    await toReview(a);
    expect((await call("POST", `/students/${a}/transition`, "ae_advisor", { to: "CHANGES_REQUESTED", reviewerNotes: "Add the roles you want." })).status).toBe(200);
    const changes = (await mails("ivy@ae.invalid")).find((m) => m.template === "student.changesRequested")!;
    expect(changes.data).toMatchObject({ note: "Add the roles you want.", schoolName: "Eastside High" });
    expect(changes.data.applyUrl).toMatch(/\/next\/apply$/);

    const b = await apply("Ola", "ola@ae.invalid");
    await toReview(b);
    expect((await call("POST", `/students/${b}/transition`, "ae_advisor", { to: "REJECTED", reviewerNotes: "The team is full this term." })).status).toBe(200);
    expect((await mails("ola@ae.invalid")).find((m) => m.template === "student.declined")!.data.note).toBe("The team is full this term.");
  });

  it("only an approved student carries a login status on the desk", async () => {
    const rows = (await call("GET", "/students?page=1&size=50", "ae_advisor")).json.students as Array<{ displayName: string; login: string | null }>;
    expect(rows.find((s) => s.displayName === "Ivy")?.login).toBeNull();
    expect(rows.find((s) => s.displayName === "Rae")?.login).toBe("invited");
  });
});
