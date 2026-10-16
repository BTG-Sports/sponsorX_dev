import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "../src/auth/actor";

/* --------------------------------------------------------------------------
   P8-QA-01 — Phase 1 acceptance (documentation/SponsorX-Phase1-Acceptance.md).
   Criterion 2: "Admin can configure SX jobs and individual athlete rates."
   The rate rules are tested in b2b4 and offer-desk; this is the admin act
   itself, end to end: BTG sets an athlete's rate for an SX job, a change is a
   new version, the card reads the newest, and nobody else may set one.
   -------------------------------------------------------------------------- */

process.env.CLERK_SECRET_KEY ??= "sk_test_x";
process.env.CLERK_PUBLISHABLE_KEY ??= "pk_test_x";
const seededDb = await import("./support/seeded-db");
const hasDatabase = await seededDb.databaseAvailable();

describe.skipIf(!hasDatabase)("P8-QA-01 · criterion 2: BTG sets an athlete's rate for an SX job", { timeout: 60_000 }, async () => {
  const { prisma } = await import("../src/db/client");
  const { setAthleteRate, readRateCard } = await import("../src/domain/athlete-rate");
  const { NIL_JOBS } = await import("../src/domain/nil-jobs");
  const { ForbiddenError } = await import("../src/auth/errors");

  /* NilJob ids ("SX-02") are unique across the database: the catalogue lives in whichever tenant seeded it first. */
  let T = "p1a_t";
  let ownTenant = false;
  const actor = (role: string, extra: Record<string, unknown> = {}) =>
    ({ userId: `p1a_${role}`, tenantId: T, roles: [role], sponsorId: null, athleteId: null, guardianId: null, propertyId: null, ...extra }) as unknown as Actor;

  async function clean() {
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "entityId" IN (SELECT id FROM "AthleteRate" WHERE "athleteId" = 'p1a_ath')`);
    await prisma.$executeRawUnsafe(`DELETE FROM "AthleteRate" WHERE "athleteId" = 'p1a_ath'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Athlete" WHERE id = 'p1a_ath'`);
    if (ownTenant) {
      await prisma.$executeRawUnsafe(`DELETE FROM "NilJob" WHERE "tenantId" = $1`, T);
      await prisma.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1`, T);
    }
  }
  beforeAll(async () => {
    const held = await prisma.nilJob.findFirst({ where: { id: "SX-02" }, select: { tenantId: true } });
    if (held) T = held.tenantId;
    else {
      ownTenant = true;
      await prisma.tenant.create({ data: { id: T, name: "Phase 1 acceptance" } });
      await prisma.nilJob.createMany({ data: NIL_JOBS.map((j) => ({ ...j, tenantId: T })) });
    }
    await clean();
    await prisma.athlete.create({ data: {
      id: "p1a_ath", tenantId: T, slug: "p1a-ath", legalName: "Ava", displayName: "Ava Cruz", email: "ava@p1a.invalid", sport: "Soccer", city: "X", stateCode: "MD", ageBand: "18_PLUS", state: "ACTIVE", tier: "CREATOR",
    }, select: { id: true } });
  });
  afterAll(clean);

  it("the seven SX jobs are the catalogue every tenant prices from", async () => {
    expect((await prisma.nilJob.findMany({ where: { tenantId: T }, select: { id: true }, orderBy: { id: "asc" } })).map((j) => j.id))
      .toEqual(["SX-01", "SX-02", "SX-03", "SX-04", "SX-05", "SX-06", "SX-07"]);
  });

  it("BTG sets a rate; changing it is a new version; the card reads the newest; the floor it implies is rate × 1.4; audited", async () => {
    const admin = actor("BTG_ADMIN");
    const v1 = await setAthleteRate(admin, "p1a_ath", "SX-02", 40_000);
    expect(v1).toMatchObject({ jobId: "SX-02", amount: 40_000, version: 1, tier: "CREATOR", impliedMinimumSellPrice: 56_000 });
    const v2 = await setAthleteRate(actor("NETWORK_MGR"), "p1a_ath", "SX-02", 45_000);
    expect(v2.version).toBe(2);
    const card = await readRateCard(admin, "p1a_ath");
    expect(JSON.stringify(card)).toContain("45000");
    expect(JSON.stringify(card)).not.toContain("40000");
    expect(await prisma.auditLog.count({ where: { tenantId: T, action: "rate.set", entity: "AthleteRate", entityId: { in: (await prisma.athleteRate.findMany({ where: { athleteId: "p1a_ath" }, select: { id: true } })).map((r) => r.id) } } })).toBe(2);
  });

  it("nobody else sets rates: a campaign manager reads them, a sponsor never", async () => {
    await expect(setAthleteRate(actor("CAMPAIGN_MGR"), "p1a_ath", "SX-02", 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setAthleteRate(actor("SPONSOR_ADMIN", { sponsorId: "x" }), "p1a_ath", "SX-02", 1)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
