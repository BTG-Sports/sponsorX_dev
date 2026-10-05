import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/* --------------------------------------------------------------------------
   2S8-QA-01 — the Clerk address is fetched only when it is needed.

   authenticateClerkRequest used to call Clerk's Backend API (users.getUser)
   on EVERY request, for an address that is only read when no User row is
   linked to the Clerk id yet (the first sign-in's claim). A page that makes a
   handful of API calls spent Clerk's rate limit on lookups nobody read, and
   the E2E run hit Clerk's 429 ("GET /api/v1/me failed with 429"). The
   address now travels unfetched, and resolveActor asks for it only when the
   Clerk id matches no row.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("resolveActor — the Clerk address is fetched only for an identity no row knows", async () => {
  const { prisma } = await import("../src/db/client");
  const { resolveActor } = await import("../src/auth/actor");

  const T = "rale_tenant";

  async function clean() {
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Lazy email tenant" } });
    await prisma.user.createMany({ data: [
      { id: "rale_linked", tenantId: T, clerkId: "rale_clerk_linked", email: "linked@rale-test.invalid", roles: ["BTG_ADMIN"] },
      /* Provisioned ahead of time, waiting for its first sign-in to claim it. */
      { id: "rale_waiting", tenantId: T, clerkId: "invite:rale_waiting", email: "waiting@rale-test.invalid", roles: ["SPONSOR_ADMIN"] },
    ] });
  });

  afterAll(clean);

  it("a linked Clerk id resolves without ever asking for the address", async () => {
    const email = vi.fn(async () => "linked@rale-test.invalid");
    const actor = await resolveActor("rale_clerk_linked", email);
    expect(actor).toMatchObject({ userId: "rale_linked", tenantId: T, roles: ["BTG_ADMIN"] });
    expect(email).not.toHaveBeenCalled();
  });

  it("an unlinked Clerk id fetches the address once, and claims the row it names", async () => {
    const email = vi.fn(async () => "waiting@rale-test.invalid");
    const actor = await resolveActor("rale_clerk_new", email);
    expect(actor).toMatchObject({ userId: "rale_waiting", tenantId: T, roles: ["SPONSOR_ADMIN"] });
    expect(email).toHaveBeenCalledTimes(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: "rale_waiting" }, select: { clerkId: true } })).clerkId).toBe("rale_clerk_new");

    /* From now on it is linked: no further lookups. */
    const again = vi.fn(async () => "waiting@rale-test.invalid");
    await resolveActor("rale_clerk_new", again);
    expect(again).not.toHaveBeenCalled();
  });

  it("an unlinked identity with no address is still unprovisioned; a plain string still works", async () => {
    await expect(resolveActor("rale_clerk_nobody", async () => null)).rejects.toMatchObject({ status: 403 });
    await expect(resolveActor("rale_clerk_nobody", null)).rejects.toMatchObject({ status: 403 });
    expect((await resolveActor("rale_clerk_linked", "ignored@rale-test.invalid")).userId).toBe("rale_linked");
  });
});
