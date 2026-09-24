/**
 * Environment seed — P2-OPS-05, Guide §10.
 *
 * Railway preview environments start with an empty database, so an empty
 * database has to be *usable* rather than merely valid. This is infrastructure:
 * if it rots, every preview environment becomes useless, which is why it runs
 * automatically at worker boot rather than being a command someone remembers.
 *
 * THREE PROPERTIES, EACH LOAD-BEARING.
 *
 *   1. **It never runs in production.** The guard is on
 *      `RAILWAY_ENVIRONMENT_NAME`, and it refuses rather than warns. Demo rows
 *      in a production tenant would be indistinguishable from real ones the
 *      moment anyone signs in.
 *
 *   2. **It is idempotent.** Every insert is `ON CONFLICT DO NOTHING` against a
 *      deterministic id, so booting the worker twice changes nothing and a
 *      half-finished run simply completes next time. That also lets it
 *      self-heal: add a row here and the next deploy picks it up.
 *
 *   3. **It writes placeholder `clerkId`s, never real ones.** A seeded user is
 *      an *invitation to claim*: `src/server/identity.ts` links the Postgres
 *      row to the Clerk identity by verified email on first sign-in, writing
 *      the real `clerkId` over the placeholder. Seeding a fabricated Clerk id
 *      would permanently shadow the real identity, because `clerkId` is unique.
 *
 * Raw `pg`, no Prisma, for the reason the worker entry already gives: this
 * process is not bundled, and the generated client is ESM-syntax TypeScript.
 * Note that Prisma generates `id` values in application code, not in the
 * database — the columns are bare `TEXT` with no default — so every insert
 * here supplies its own id.
 */

import type pg from "pg";

/** Deterministic ids, so re-running conflicts with itself rather than
 *  accumulating duplicates. The `seed_` prefix also makes demo rows obvious in
 *  a database browser. */
/* Phase 1 is a single managed marketplace, so this is *the* tenant — not just
   the demo one. The catalogue seed imports it from here rather than keeping a
   second copy (P3-BE-08, P3-BE-11).

   IT IS READ FROM THE SAME VARIABLE THE API USES. `PUBLIC_INTAKE_TENANT_ID`
   decides which tenant a public application lands in; this decides which
   tenant gets seeded. They were two literals that happened to match, which
   would have held until the first environment set one of them — and then
   every application would have arrived in a tenant with no catalogue and no
   users, looking like a data bug rather than a configuration one.

   process.env directly, not src/config/env: that module requires the Clerk
   keys, and the worker must boot without them. The default is repeated here
   for the same reason, and the test asserts the two agree. */
export const TENANT_ID = process.env.PUBLIC_INTAKE_TENANT_ID ?? "seed_tenant_btg";
const TENANT_NAME = "BTG Sports Group";

type SeedUser = {
  id: string;
  email: string;
  roles: string[];
  note: string;
};

/**
 * The four portal roles plus the real operator account.
 *
 * The first four intentionally reuse the addresses of the mock accounts that
 * `src/lib/mock-auth.ts` carried before Clerk replaced it, so the demo tenant
 * stays recognisable to anyone who used the fixture build. They are claimable
 * only by someone who can prove that email address at Clerk, which nobody can
 * for `@example.com` — they exist to be looked at, not signed into.
 */
const USERS: SeedUser[] = [
  {
    id: "seed_user_admin",
    email: "admin@example.com",
    roles: ["BTG_ADMIN"],
    note: "BTG operations — the admin workspace",
  },
  {
    id: "seed_user_sponsor",
    email: "sponsor@example.com",
    roles: ["SPONSOR_ADMIN"],
    note: "Sponsor portal",
  },
  {
    id: "seed_user_athlete",
    email: "athlete@example.com",
    roles: ["ATHLETE"],
    note: "Athlete portal",
  },
  {
    id: "seed_user_property",
    email: "property@example.com",
    roles: ["PROPERTY_MGR"],
    note: "Property portal",
  },
  {
    /* The real operator. This row is what makes the mirror's claim path
       exercisable: signing in as this address links the Clerk identity to a
       BTG_ADMIN row and lands on /admin. */
    id: "seed_user_operator",
    email: "infinex1@icarrefound.org",
    roles: ["BTG_ADMIN"],
    note: "BTG operator — claimable by real sign-in",
  },
  {
    /* Second operator, same reasoning — a BTG_ADMIN can also preview the
       fixtures-only student portal (/next) until P9-BE-05 mints STUDENT. */
    id: "seed_user_operator2",
    email: "infinex2@icarrefound.org",
    roles: ["BTG_ADMIN"],
    note: "BTG operator — claimable by real sign-in",
  },
];

export type SeedOutcome = {
  skipped: boolean;
  reason?: string;
  tenantsCreated: number;
  usersCreated: number;
  guardiansCreated?: number;
  athletesCreated?: number;
  sponsorsCreated?: number;
};

/**
 * Three athletes, chosen because they take three different paths through
 * §37 rather than because three looks like a demo.
 *
 * ACTIVE adult, ACTIVE minor with a verified guardian, and SUBMITTED minor
 * with none — so the review queue has something in it, the matching desk has
 * someone to match, and the guardian gate has a case that fails.
 */
const DEMO_ATHLETES = [
  {
    id: "seed_ath_adult", slug: "jordan-reed", legalName: "Jordan Reed",
    displayName: "JORDAN.REED", email: "jordan.reed@example.com",
    sport: "Basketball", stateCode: "MD", birthDate: "2003-04-02",
    ageBand: "18_PLUS", state: "ACTIVE", guardianId: null, tier: "CREATOR",
  },
  {
    id: "seed_ath_minor_ok", slug: "sam-ellis", legalName: "Sam Ellis",
    displayName: "SAM.ELLIS", email: "sam.ellis@example.com",
    sport: "Soccer", stateCode: "MD", birthDate: "2010-09-14",
    ageBand: "16_17", state: "ACTIVE", guardianId: "seed_grd_1", tier: "EMERGING",
  },
  {
    id: "seed_ath_minor_pending", slug: "alex-nwosu", legalName: "Alex Nwosu",
    displayName: "ALEX.NWOSU", email: "alex.nwosu@example.com",
    sport: "Track", stateCode: "DC", birthDate: "2011-01-20",
    ageBand: "UNDER_16", state: "SUBMITTED", guardianId: null, tier: null,
  },
] as const;

export async function seedEnvironment(pool: pg.Pool): Promise<SeedOutcome> {
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME ?? "local";

  if (environment.toLowerCase() === "production") {
    return {
      skipped: true,
      reason: "environment is production",
      tenantsCreated: 0,
      usersCreated: 0,
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tenant = await client.query(
      `INSERT INTO "Tenant" (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, TENANT_NAME],
    );

    let usersCreated = 0;
    for (const user of USERS) {
      /* Two conflict targets matter here and only one can be declared, so the
         email guard is explicit: `clerkId` is unique, and a row already claimed
         by a real sign-in must never be reverted to a placeholder. */
      const result = await client.query(
        `INSERT INTO "User" (id, "tenantId", "clerkId", email, roles)
         SELECT $1, $2, $3, $4, $5::"Role"[]
          WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = $4)
            ON CONFLICT (id) DO NOTHING`,
        [user.id, TENANT_ID, `seed:${user.email}`, user.email, user.roles],
      );
      usersCreated += result.rowCount ?? 0;
    }

    /* The demo data — P2-OPS-05's "usable demo tenant from scratch".
       A tenant with five logins and no athletes is not a demo: every portal
       renders an empty state, and a PR environment that shows nothing cannot
       be reviewed. These are three athletes covering the cases that actually
       differ — an adult, a minor with a verified guardian, and a minor
       without — because those three take different paths through §37 and a
       reviewer needs to see all of them.

       Guarded by NOT EXISTS on the id, so a redeploy does not multiply them
       and an edited demo athlete is not reverted under whoever is using it. */
    const guardian = await client.query(
      `INSERT INTO "Guardian" (id, "tenantId", "legalName", email, relationship, "verifiedAt")
       VALUES ('seed_grd_1', $1, 'Dana Reed', 'dana.reed@example.com', 'PARENT', now())
           ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID],
    );

    let athletesCreated = 0;
    for (const athlete of DEMO_ATHLETES) {
      const result = await client.query(
        `INSERT INTO "Athlete" (id, "tenantId", slug, "legalName", "displayName", email,
                                sport, "stateCode", "birthDate", "ageBand", state,
                                "guardianId", tier)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$10,$11::"AthleteState",$12,$13::"AthleteTier")
             ON CONFLICT (id) DO NOTHING`,
        [athlete.id, TENANT_ID, athlete.slug, athlete.legalName, athlete.displayName,
         athlete.email, athlete.sport, athlete.stateCode, athlete.birthDate,
         athlete.ageBand, athlete.state, athlete.guardianId, athlete.tier],
      );
      athletesCreated += result.rowCount ?? 0;
    }

    const sponsor = await client.query(
      `INSERT INTO "Sponsor" (id, "tenantId", name)
       VALUES ('seed_spn_1', $1, 'Bowie Auto Group')
           ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID],
    );

    await client.query("COMMIT");

    return {
      skipped: false,
      tenantsCreated: tenant.rowCount ?? 0,
      usersCreated,
      guardiansCreated: guardian.rowCount ?? 0,
      athletesCreated,
      sponsorsCreated: sponsor.rowCount ?? 0,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
