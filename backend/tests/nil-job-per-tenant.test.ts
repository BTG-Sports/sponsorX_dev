import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   P8-BE-01 — each tenant holds its own NIL job catalogue. A job id ("SX-02")
   is unique within its tenant, not across the database (the finding in
   documentation/SponsorX-Phase1-Acceptance.md, criterion 2). Two tenants
   each hold SX-02 at their own price; each reads and prices from its own;
   and the database refuses a rate pointing at another tenant's job.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P8-BE-01 · a NIL job catalogue per tenant", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { listJobs } = await import("../src/domain/catalogue");
  const { setAthleteRate } = await import("../src/domain/athlete-rate");
  const { seedCatalogue } = await import("../worker/jobs/seed-catalogue.mts");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");

  const A = "njt_a", B = "njt_b", ONLY_A = "njt_only_a";
  const actor = (tenantId: string, role = "BTG_ADMIN") =>
    ({ userId: `njt_${tenantId}`, tenantId, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null }) as unknown as Actor;
  const pool = new pg.Pool({ connectionString: seededDb.TEST_DATABASE_URL, max: 1 });

  async function clean() {
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.$executeRawUnsafe(`DELETE FROM "AthleteRate" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.$executeRawUnsafe(`DELETE FROM "Athlete" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.$executeRawUnsafe(`DELETE FROM "SponsorPackage" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.$executeRawUnsafe(`DELETE FROM "NilJob" WHERE "tenantId" IN ($1, $2)`, A, B);
    await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id IN ($1, $2)`, A, B);
  }
  beforeAll(async () => {
    await clean();
    for (const t of [A, B]) {
      await prisma.tenant.create({ data: { id: t, name: `NIL jobs ${t}` } });
      await prisma.athlete.create({ data: {
        id: `${t}_ath`, tenantId: t, slug: `${t}-ath`, legalName: "Ava", displayName: "Ava Cruz", email: `ava@${t}.invalid`, sport: "Soccer", city: "X", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", tier: "CREATOR",
      }, select: { id: true } });
    }
    /* The loader seeds both tenants: the second no longer lands on the first's rows. */
    await seedCatalogue(pool, A);
    await seedCatalogue(pool, B);
    /* B prices SX-02 its own way; A keeps the published band. A job only A holds. */
    await prisma.nilJob.update({ where: { tenantId_id: { tenantId: B, id: "SX-02" } }, data: { name: "B's own SX-02", sellLow: 1, sellHigh: 2 } });
    const sx02 = NIL_JOBS.find((j) => j.id === "SX-02")!;
    await prisma.nilJob.create({ data: { ...sx02, id: ONLY_A, tenantId: A } });
  });
  afterAll(async () => {
    await clean();
    await pool.end();
  });

  it("both tenants hold the full catalogue, each under its own key", async () => {
    for (const t of [A, B]) {
      expect((await prisma.nilJob.findMany({ where: { tenantId: t, id: { startsWith: "SX-" } }, select: { id: true }, orderBy: { id: "asc" } })).map((j) => j.id))
        .toEqual(NIL_JOBS.map((j) => j.id).sort());
    }
  });

  it("each tenant reads its own price for the same job id", async () => {
    const sx02 = NIL_JOBS.find((j) => j.id === "SX-02")!;
    expect((await listJobs(actor(A))).find((j) => j.id === "SX-02")).toMatchObject({ name: sx02.name, sellLow: sx02.sellLow, sellHigh: sx02.sellHigh });
    expect((await listJobs(actor(B))).find((j) => j.id === "SX-02")).toMatchObject({ name: "B's own SX-02", sellLow: 1, sellHigh: 2 });
    expect((await listJobs(actor(B))).map((j) => j.id)).not.toContain(ONLY_A);
  });

  it("re-seeding one tenant leaves the other's prices alone", async () => {
    await seedCatalogue(pool, A);
    expect(await prisma.nilJob.findUnique({ where: { tenantId_id: { tenantId: B, id: "SX-02" } }, select: { sellLow: true } })).toEqual({ sellLow: 1 });
  });

  it("a rate is set against the athlete's own tenant's job; another tenant's job is unknown", async () => {
    expect(await setAthleteRate(actor(B), `${B}_ath`, "SX-02", 40_000)).toMatchObject({ jobId: "SX-02", amount: 40_000, version: 1 });
    await expect(setAthleteRate(actor(B), `${B}_ath`, ONLY_A, 40_000)).rejects.toThrow();
  });

  it("the database refuses a rate pointing at another tenant's job", async () => {
    await expect(prisma.athleteRate.create({ data: { tenantId: B, athleteId: `${B}_ath`, jobId: ONLY_A, amount: 1, version: 1 } }))
      .rejects.toThrow(/foreign key|Foreign key/);
  });
});
