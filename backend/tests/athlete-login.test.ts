import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   P3-BE-15 — an approved athlete, and a linked guardian, get a login.

   "An approved applicant signs in with the email they applied with and lands
   in the athlete portal as that athlete; a linked guardian signs in as that
   guardian; approving creates no duplicate and never takes over an address
   another account already uses; it commits in the same transaction as the
   decision."

   Against real Postgres, through the production identity path: approval runs
   the real domain function, then the athlete and guardian "sign in" (the
   first request claims the provisioned row by email) and the API answers as
   them. The takeover, duplicate and rollback clauses are asserted in
   application.review.test.ts, where a failure can be injected.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

vi.mock("../src/lib/rate-limit", () => ({ limit: async () => {} }));
vi.mock("../src/auth/clerk", () => ({
  authenticateClerkRequest: async (req: { get: (h: string) => string | undefined }) => {
    const id = req.get("x-test-clerk");
    return id ? { clerkId: id, email: req.get("x-test-email") ?? null } : null;
  },
}));

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P3-BE-15 · approval gives the athlete, and a linked guardian, a login", async () => {
  const { prisma } = await import("../src/db/client");
  const { approveApplication } = await import("../src/domain/application-review");
  const { linkGuardian } = await import("../src/domain/guardian");
  const { createApp } = await import("../src/app");

  const T = "al_tenant";
  const reviewer = { userId: "al_reviewer", tenantId: T, roles: ["NETWORK_MGR" as const] };
  const admin = { userId: "al_admin", tenantId: T, roles: ["BTG_ADMIN" as const] };
  const ADULT = { id: "al_ath_adult", email: "al.adult@login-test.invalid" };
  const MINOR = { id: "al_ath_minor", email: "al.minor@login-test.invalid" };
  const LATE = { id: "al_ath_late", email: "al.late@login-test.invalid" };
  const GUARDIAN = { id: "al_grd", email: "al.parent@login-test.invalid" };
  const LATE_GUARDIAN_EMAIL = "al.late.parent@login-test.invalid";

  let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
  let base = "";
  const get = (path: string, clerk: string, email?: string) =>
    fetch(`${base}/api/v1${path}`, { headers: { "x-test-clerk": clerk, ...(email ? { "x-test-email": email } : {}) } });

  async function clean() {
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.outboxJob.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.athlete.deleteMany({ where: { tenantId: T } });
    await prisma.guardian.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Login test tenant" } });
    await prisma.user.createMany({
      data: [
        { id: reviewer.userId, tenantId: T, clerkId: "al_reviewer", email: "al.reviewer@login-test.invalid", roles: ["NETWORK_MGR"] },
        { id: admin.userId, tenantId: T, clerkId: "al_admin", email: "al.admin@login-test.invalid", roles: ["BTG_ADMIN"] },
      ],
    });
    await prisma.guardian.create({
      data: { id: GUARDIAN.id, tenantId: T, legalName: "Pat Parent", email: GUARDIAN.email, relationship: "PARENT" },
      select: { id: true },
    });
    const athlete = (a: { id: string; email: string }, minor: boolean, guardianId: string | null) => ({
      id: a.id, tenantId: T, slug: a.id, legalName: `Test ${a.id}`, displayName: a.id.toUpperCase(), email: a.email,
      sport: "Basketball", state: "UNDER_REVIEW" as const, guardianId,
      birthDate: new Date(minor ? "2010-05-01" : "2004-05-01"), ageBand: minor ? "16_17" : "18_PLUS",
    });
    await prisma.athlete.createMany({
      data: [athlete(ADULT, false, null), athlete(MINOR, true, GUARDIAN.id), athlete(LATE, true, null)],
    });
    server = createApp().listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r)); // a host makes the bind async
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server?.close();
    await clean();
  });

  it("before approval, the applicant's sign-in finds no SponsorX account", async () => {
    const res = await get("/me", "clerk_al_adult", ADULT.email);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("unprovisioned");
  });

  it("after approval, the applicant signs in with the email they applied with and lands as that athlete", async () => {
    const out = await approveApplication(reviewer, ADULT.id);
    expect(out).toMatchObject({ state: "APPROVED", login: { athlete: "created", guardian: null } });

    const me = await get("/me", "clerk_al_adult", ADULT.email);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ tenantId: T, roles: ["ATHLETE"] });
    const profile = await get("/athletes/me", "clerk_al_adult");
    expect(profile.status).toBe(200);
    expect(await profile.text()).toContain(ADULT.id);
  });

  it("a minor's linked guardian gets a login too, and signs in as that guardian", async () => {
    const out = await approveApplication(reviewer, MINOR.id);
    expect(out.login).toEqual({ athlete: "created", guardian: "created" });

    const me = await get("/me", "clerk_al_parent", GUARDIAN.email);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ tenantId: T, roles: ["GUARDIAN"] });
    expect(await prisma.user.findFirstOrThrow({ where: { clerkId: "clerk_al_parent" }, select: { guardianId: true } }))
      .toEqual({ guardianId: GUARDIAN.id });
  });

  it("a guardian linked AFTER approval gets their login then", async () => {
    expect((await approveApplication(reviewer, LATE.id)).login).toEqual({ athlete: "created", guardian: null });
    const { guardianId } = await linkGuardian(admin, LATE.id, {
      legalName: "Lee Late", email: LATE_GUARDIAN_EMAIL, relationship: "PARENT",
    });
    const me = await get("/me", "clerk_al_late_parent", LATE_GUARDIAN_EMAIL);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ roles: ["GUARDIAN"] });
    expect(await prisma.user.findFirstOrThrow({ where: { clerkId: "clerk_al_late_parent" }, select: { guardianId: true } }))
      .toEqual({ guardianId });
  });

  it("every login provisioned is audited, one row each", async () => {
    const rows = await prisma.auditLog.findMany({ where: { tenantId: T, action: "user.provision" }, select: { entityId: true } });
    expect(rows).toHaveLength(5);
  });
});
