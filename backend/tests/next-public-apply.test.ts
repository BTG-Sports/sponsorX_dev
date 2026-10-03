import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P9-FE-06 — "A real student application is created and reaches the advisor
   desk; a minor's guardian is captured on the existing rule." Plus what the
   public NEXT pages read (P1-FE-24/25) and the gap the athlete walkthrough
   found, closed for students too: approval gives the student, and a linked
   guardian, a login.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? `${id}@np-test.invalid` } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P9-FE-06 · the public student application, and what NEXT's public pages read", async () => {
  const { prisma } = await import("../src/db/client");
  const { createApp } = await import("../src/app");

  // Not "np_tenant": notification-preferences.test.ts owns that id, and the
  // two files run in parallel — each one's wipe() deleted the other's tenant
  // mid-run, failing whichever seeded second (Tenant_pkey). One id per file.
  const T = "npa_tenant";
  const SCHOOL = { id: "np_school", slug: "np-high" };
  const OTHER = { id: "np_school_other", slug: "np-no-next" };
  const ADVISOR = "np_advisor";

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const call = (method: string, path: string, body?: unknown, who?: { clerk: string; email?: string }) =>
    fetch(`${base}/api/v1${path}`, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(who ? { "x-test-clerk": who.clerk, ...(who.email ? { "x-test-email": who.email } : {}) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  async function wipe() {
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.student.deleteMany({ where: { tenantId: T } });
    await prisma.guardian.deleteMany({ where: { tenantId: T } });
    await prisma.edition.deleteMany({ where: { tenantId: T } });
    await prisma.publication.deleteMany({ where: { tenantId: T } });
    await prisma.property.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await wipe();
    await prisma.tenant.create({ data: { id: T, name: "NEXT public test" } });
    await prisma.property.createMany({ data: [
      { id: SCHOOL.id, tenantId: T, slug: SCHOOL.slug, name: "NP High School", kind: "SCHOOL", city: "Bowie", stateCode: "MD" },
      { id: OTHER.id, tenantId: T, slug: OTHER.slug, name: "NP Not On Next", kind: "SCHOOL", city: "Laurel", stateCode: "MD" },
    ] });
    await prisma.publication.create({ data: { id: "np_pub", tenantId: T, propertyId: SCHOOL.id, name: "NP Sports" } });
    await prisma.edition.createMany({ data: [
      { id: "np_ed_live", tenantId: T, publicationId: "np_pub", label: "Spring 2026", closeDate: new Date("2026-03-01"), publishTarget: new Date("2026-04-01"), thresholdCents: 100, state: "PUBLISHED_DIGITAL" },
      { id: "np_ed_selling", tenantId: T, publicationId: "np_pub", label: "Fall 2026", closeDate: new Date("2026-11-01"), publishTarget: new Date("2026-12-01"), thresholdCents: 100, state: "SELLING" },
    ] });
    await prisma.user.create({ data: { id: ADVISOR, tenantId: T, clerkId: ADVISOR, email: "np.advisor@np-test.invalid", roles: ["ADVISOR"], propertyId: SCHOOL.id } });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await wipe();
  });

  const minor = {
    schoolSlug: SCHOOL.slug, legalName: "Jo Minor", displayName: "Jo M.", email: "jo.minor@np-test.invalid",
    gradYear: 2028, birthDate: "2010-03-14", masthead: ["WRITER", "PHOTOGRAPHER"],
  };

  it("the school picker lists only schools that have adopted NEXT — name and place only", async () => {
    const res = await call("GET", "/public/next/schools");
    expect(res.status).toBe(200);
    const { schools } = (await res.json()) as { schools: Array<Record<string, unknown>> };
    const ours = schools.filter((s) => String(s.slug).startsWith("np-"));
    expect(ours).toEqual([{ slug: SCHOOL.slug, name: "NP High School", city: "Bowie", stateCode: "MD" }]);
  });

  it("the landing lists only published editions", async () => {
    const res = await call("GET", "/public/next/editions");
    const { editions } = (await res.json()) as { editions: Array<{ id: string; school: { slug: string } | null }> };
    const ours = editions.filter((e) => e.id.startsWith("np_"));
    expect(ours.map((e) => e.id)).toEqual(["np_ed_live"]);
    expect(ours[0]?.school?.slug).toBe(SCHOOL.slug);
  });

  it("a student under 18 without a guardian is refused, and nothing is created", async () => {
    const res = await call("POST", "/public/students/applications", minor);
    expect(res.status).toBe(422);
    expect(await prisma.student.count({ where: { tenantId: T } })).toBe(0);
  });

  it("with a guardian, the application lands SUBMITTED with the guardian captured", async () => {
    const res = await call("POST", "/public/students/applications", {
      ...minor, guardian: { legalName: "Ana Minor", email: "ana.minor@np-test.invalid", relationship: "PARENT" },
    });
    expect(res.status).toBe(201);
    const out = (await res.json()) as { id: string; state: string; guardianRequired: boolean };
    expect(out).toMatchObject({ state: "SUBMITTED", guardianRequired: true });
    const row = await prisma.student.findUniqueOrThrow({
      where: { id: out.id }, select: { propertyId: true, guardian: { select: { legalName: true, email: true, verifiedAt: true } } },
    });
    expect(row).toEqual({ propertyId: SCHOOL.id, guardian: { legalName: "Ana Minor", email: "ana.minor@np-test.invalid", verifiedAt: null } });
  });

  it("an adult applies without a guardian", async () => {
    const res = await call("POST", "/public/students/applications", {
      ...minor, legalName: "Al Adult", displayName: "Al A.", email: "al.adult@np-test.invalid", birthDate: "2007-01-02",
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { guardianRequired: boolean }).guardianRequired).toBe(false);
  });

  /* The bypass: with neither a birthDate nor an ageBand the age is unknown,
     and an unknown age used to be read as an adult — no guardian asked for.
     Now refused before anything is created, as the athlete intake does. */
  it("an application with no birthDate and no ageBand is refused — an unknown age is never an adult", async () => {
    const { birthDate: _omit, ...noAge } = minor;
    const before = await prisma.student.count({ where: { tenantId: T } });
    for (const body of [noAge, { ...noAge, birthDate: null, ageBand: null }]) {
      const res = await call("POST", "/public/students/applications", { ...body, email: "no.age@np-test.invalid" });
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).toMatch(/birthDate or ageBand/);
    }
    expect(await prisma.student.count({ where: { tenantId: T } })).toBe(before);
  });

  it("a birthDate in the future or before 1900 is refused", async () => {
    for (const birthDate of ["2999-01-01", "1899-12-31"]) {
      const res = await call("POST", "/public/students/applications", { ...minor, birthDate, email: "bad.date@np-test.invalid" });
      expect(res.status).toBe(400);
    }
  });

  it("a school that hasn't adopted NEXT can still be applied to only if it is a school — not an unknown slug", async () => {
    const res = await call("POST", "/public/students/applications", { ...minor, schoolSlug: "np-does-not-exist", guardian: { legalName: "X", email: "x@np-test.invalid", relationship: "PARENT" } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("the applications reach the school's advisor desk", async () => {
    const res = await call("GET", "/students", undefined, { clerk: ADVISOR });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Jo Minor");
    expect(text).toContain("Al Adult");
  });

  it("the advisor's approval gives the student, and the guardian, a login", async () => {
    const jo = await prisma.student.findFirstOrThrow({ where: { tenantId: T, legalName: "Jo Minor" }, select: { id: true, guardianId: true, state: true, reviewReasons: true } });
    /* P9-BE-20 — picked up on submit; with no roster at this school it waits for the advisor, saying why. */
    expect(jo).toMatchObject({ state: "UNDER_REVIEW", reviewReasons: ["Your school has no roster on file"] });
    const r = await call("POST", `/students/${jo.id}/transition`, { to: "APPROVED" }, { clerk: ADVISOR });
    expect(r.status).toBe(200);
    /* A minor whose guardian is not verified stays APPROVED — the gate is unchanged. */
    expect(((await r.json()) as { state: string }).state).toBe("APPROVED");
    const me = await call("GET", "/me", undefined, { clerk: "clerk_np_jo", email: "jo.minor@np-test.invalid" });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ tenantId: T, roles: ["STUDENT"], studentId: jo.id, propertyId: SCHOOL.id });
    const parent = await call("GET", "/me", undefined, { clerk: "clerk_np_ana", email: "ana.minor@np-test.invalid" });
    expect(parent.status).toBe(200);
    expect(await parent.json()).toMatchObject({ roles: ["GUARDIAN"] });
    expect(await prisma.user.findFirstOrThrow({ where: { clerkId: "clerk_np_ana" }, select: { guardianId: true } })).toEqual({ guardianId: jo.guardianId });
  });
});
