import { afterAll, beforeAll, describe, expect, it } from "vitest";

/* --------------------------------------------------------------------------
   P3-BE-15 — "approving creates no duplicate", under concurrency.

   The holder check in ensureLogin and the insert after it are a
   check-then-insert, and `User.email` has no unique constraint. Two
   transactions provisioning the same address — one parent entered once per
   child, approved at the same moment — could both pass the check and both
   insert. A sign-in then claims one row (`findFirst`) and the other is never
   reachable.

   The race is forced, not hoped for: the first transaction provisions and
   is HELD OPEN (its row inserted but uncommitted) while the second starts.
   Without the advisory lock the second sees no holder and inserts a
   duplicate; with it, the second waits for the first to commit and then
   reports "address-in-use".
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";

const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P3-BE-15 · two concurrent provisionings of one address make one login", async () => {
  const { prisma } = await import("../src/db/client");
  const { provisionGuardianLoginIn } = await import("../src/domain/athlete-login");

  const T = "alr_tenant";
  const ADDRESS = "alr.parent@login-race.invalid";
  const actor = { userId: null, tenantId: T, roles: [] } as unknown as Parameters<typeof provisionGuardianLoginIn>[1];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function clean() {
    await prisma.user.deleteMany({ where: { tenantId: T } });
    await prisma.auditLog.deleteMany({ where: { tenantId: T } });
    await prisma.guardian.deleteMany({ where: { tenantId: T } });
    await prisma.tenant.deleteMany({ where: { id: T } });
  }

  beforeAll(async () => {
    await clean();
    await prisma.tenant.create({ data: { id: T, name: "Login race tenant" } });
    // The same parent, entered once per child — two Guardian rows, one address.
    await prisma.guardian.createMany({ data: [
      { id: "alr_grd_1", tenantId: T, legalName: "Pat Parent", email: ADDRESS, relationship: "PARENT" },
      { id: "alr_grd_2", tenantId: T, legalName: "Pat Parent", email: ADDRESS.toUpperCase(), relationship: "PARENT" },
    ] });
  });

  afterAll(clean);

  it("the second waits for the first, then reports address-in-use — never a second row", async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));

    const first = prisma.$transaction(async (tx) => {
      const out = await provisionGuardianLoginIn(tx, actor, "alr_grd_1");
      await held; // inserted, not committed
      return out;
    }, { timeout: 20_000 });

    await sleep(400); // the first has inserted its row by now
    const second = prisma.$transaction((tx) => provisionGuardianLoginIn(tx, actor, "alr_grd_2"), { timeout: 20_000 });
    await sleep(400); // the second is past its own start — blocked on the lock, or (without it) done
    release();

    const outcomes = await Promise.all([first, second]);
    expect(outcomes).toEqual(["created", "address-in-use"]);
    expect(await prisma.user.count({ where: { email: { equals: ADDRESS, mode: "insensitive" } } })).toBe(1);
  });
});
