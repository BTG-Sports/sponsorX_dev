/**
 * A real database for the seeded half of the authorisation suite —
 * P2-SEC-01, §30.
 *
 * The policy half asserts 1,152 role × resource × action pairs against the
 * matrix and needs nothing but Node. It proves the POLICY is transcribed
 * correctly. It cannot prove the *filters* work, because a scope token only
 * becomes a `where` fragment when Prisma runs it — and the failure this half
 * exists to catch is a filter that returns rows from the wrong tenant while
 * the policy above it reads perfectly.
 *
 * TO RUN THESE LOCALLY: `npm run infra:up` from the repo root brings up
 * Postgres, then `npm run prisma:migrate -w @sponsorx/backend` and the suite
 * picks the database up from DATABASE_URL automatically. Verified once on
 * 2026-09-22 against a real Postgres — all thirteen pass.
 *
 * SKIPPED, NOT FAILED, WITHOUT A DATABASE. No developer machine here runs
 * Postgres; CI does. A suite that fails locally teaches people to ignore red;
 * one that silently passes teaches them it is covered. This skips with a
 * stated reason, and CI has no reason to skip.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

let client: PrismaClient | null = null;

export function prismaForTests(): PrismaClient {
  client ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DATABASE_URL }),
  });
  return client;
}

/** Can we actually reach a migrated database? Checked once, cheaply. */
export async function databaseAvailable(): Promise<boolean> {
  if (!TEST_DATABASE_URL) return false;
  try {
    /* Not `SELECT 1` — a database that answers but has never been migrated
       would pass that and then fail every test with a confusing missing-table
       error. Reading a real table proves both. */
    await prismaForTests().tenant.count();
    return true;
  } catch {
    return false;
  }
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}

/** Fixed, prefixed ids: the seed is idempotent, and a failed run leaves rows
 *  a human can recognise and delete. */
export const T = {
  tenantA: "t_authz_a",
  tenantB: "t_authz_b",
  sponsorA: "s_authz_a",
  sponsorB: "s_authz_b",
  athleteA: "a_authz_a",
  athleteB: "a_authz_b",
  guardian: "g_authz_1",
  property: "p_authz_1",
} as const;

/**
 * Two of everything that can leak across a boundary.
 *
 * Two tenants, because cross-tenant is the leak §26 cares most about. Two
 * sponsors **inside one tenant**, because `own-sponsor` is a boundary tenant
 * scoping does not draw — a filter matching only on `tenantId` passes a
 * single-sponsor fixture and hands one sponsor another's contacts in
 * production.
 *
 * Athlete A is a minor in tenant A with a verified guardian and a property;
 * athlete B is an adult in tenant B. Every "must not see" assertion turns on
 * B being somewhere the caller cannot reach.
 */
export async function seed(): Promise<void> {
  const db = prismaForTests();
  await clean();

  await db.tenant.createMany({
    data: [
      { id: T.tenantA, name: "Authz Tenant A" },
      { id: T.tenantB, name: "Authz Tenant B" },
    ],
  });

  await db.sponsor.createMany({
    data: [
      { id: T.sponsorA, tenantId: T.tenantA, name: "Sponsor A" },
      { id: T.sponsorB, tenantId: T.tenantA, name: "Sponsor B" },
    ],
  });

  await db.sponsorContact.createMany({
    data: [
      { id: "sc_authz_a", tenantId: T.tenantA, sponsorId: T.sponsorA,
        name: "Contact A", email: "ca@example.invalid" },
      { id: "sc_authz_b", tenantId: T.tenantA, sponsorId: T.sponsorB,
        name: "Contact B", email: "cb@example.invalid" },
    ],
  });

  await db.property.create({
    data: {
      id: T.property, tenantId: T.tenantA, slug: "authz-property-one",
      name: "Property One", kind: "SCHOOL", stateCode: "MD",
    },
  });

  await db.guardian.create({
    data: {
      id: T.guardian, tenantId: T.tenantA, legalName: "Dana Reed",
      email: "dana@example.invalid", relationship: "PARENT",
      verifiedAt: new Date(),
    },
  });

  await db.athlete.createMany({
    data: [
      {
        id: T.athleteA, tenantId: T.tenantA, slug: "authz-athlete-a",
        legalName: "Athlete A", displayName: "A", email: "a@example.invalid",
        sport: "Basketball", stateCode: "MD", ageBand: "16_17",
        guardianId: T.guardian, propertyId: T.property, state: "ACTIVE",
      },
      {
        id: T.athleteB, tenantId: T.tenantB, slug: "authz-athlete-b",
        legalName: "Athlete B", displayName: "B", email: "b@example.invalid",
        sport: "Soccer", stateCode: "VA", ageBand: "18_PLUS", state: "ACTIVE",
      },
    ],
  });

  await db.athleteSocial.createMany({
    data: [
      { id: "as_authz_a", tenantId: T.tenantA, athleteId: T.athleteA,
        platform: "INSTAGRAM", handle: "a" },
      { id: "as_authz_b", tenantId: T.tenantB, athleteId: T.athleteB,
        platform: "INSTAGRAM", handle: "b" },
    ],
  });
}

export async function clean(): Promise<void> {
  const db = prismaForTests();
  const where = { tenantId: { in: [T.tenantA, T.tenantB] } };
  /* Children first — the foreign keys are RESTRICT, so a forgotten order
     fails loudly here rather than orphaning rows. */
  await db.athleteSocial.deleteMany({ where });
  await db.athleteScore.deleteMany({ where });
  await db.athleteRate.deleteMany({ where });
  await db.athlete.deleteMany({ where });
  await db.guardian.deleteMany({ where });
  await db.property.deleteMany({ where });
  await db.sponsorContact.deleteMany({ where });
  await db.sponsor.deleteMany({ where });
  await db.user.deleteMany({ where });
  await db.tenant.deleteMany({ where: { id: { in: [T.tenantA, T.tenantB] } } });
}
