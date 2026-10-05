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

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type pg from "pg";

import { hashAgreementBody } from "../../src/domain/agreement-hash.ts";

import { seedPersonas } from "./seed-personas.mts";

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
  pilotSchoolCreated?: boolean;
  personaUsersCreated?: number;
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
       VALUES ('seed_grd_1', $1, 'Dana Reed', 'dana.reed@example.com', 'PARENT', (now() AT TIME ZONE 'UTC'))
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
      `INSERT INTO "Sponsor" (id, "tenantId", name, categories)
       VALUES ('seed_spn_1', $1, 'Bowie Auto Group', ARRAY['AUTOMOTIVE']::TEXT[])
           ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID],
    );
    /* 2S2-BE-02 — SIMULATED brand category for the demo sponsor, so the
       marketplace can be walked end to end on staging. Only fills an empty
       list: a category BTG has set is never overwritten. */
    await client.query(
      `UPDATE "Sponsor" SET categories = ARRAY['AUTOMOTIVE']::TEXT[]
        WHERE id = 'seed_spn_1' AND cardinality(categories) = 0`,
    );

    const school = await seedPilotSchool(client, TENANT_ID);
    /* The walkthrough logins for the two sign-up-to-payout stories — after the
       pilot school, whose property Jordan, Ms. Patel and the edition hang off. */
    const personas = await seedPersonas(client, TENANT_ID);

    /* 2S1-BE-01 — the property terms an onboarding applicant accepts.
       SIMULATED text version so the wizard can complete on staging; the real
       terms are BTG's (and counsel's) to publish as version 2 — the wizard
       always asks for the latest. The hash is of the placeholder wording. */
    await client.query(
      `INSERT INTO "Agreement" (id, "tenantId", kind, version, "bodyHash", "effectiveAt")
       VALUES ('seed_agreement_property_terms_v1', $1, 'PROPERTY_TERMS', 1, $2, '2026-09-28')
           ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, createHash("sha256").update(PROPERTY_TERMS_PLACEHOLDER).digest("hex")],
    );

    /* 2S4-FE-02 — the marketplace order terms a sponsor accepts at checkout.
       Placeholder wording pending counsel (agreements/MARKETPLACE_ORDER.v1.txt
       says so at the top), hashed exactly as acceptances are checked, so the
       checkout's contract gate can be walked on staging. The counsel-approved
       text is a new version, registered with `npm run agreement:register`. */
    await client.query(
      `INSERT INTO "Agreement" (id, "tenantId", kind, version, "bodyHash", "effectiveAt")
       VALUES ('seed_agreement_marketplace_order_v1', $1, 'MARKETPLACE_ORDER', 1, $2, '2026-10-01')
           ON CONFLICT (id) DO NOTHING`,
      [TENANT_ID, hashAgreementBody(readFileSync(new URL("../../agreements/MARKETPLACE_ORDER.v1.txt", import.meta.url), "utf8"))],
    );

    await client.query("COMMIT");

    return {
      skipped: false,
      tenantsCreated: tenant.rowCount ?? 0,
      usersCreated,
      guardiansCreated: guardian.rowCount ?? 0,
      athletesCreated,
      sponsorsCreated: sponsor.rowCount ?? 0,
      pilotSchoolCreated: school.created,
      personaUsersCreated: personas.usersCreated,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The SponsorX NEXT pilot school — P9-OPS-01, spec §3. SIMULATED: Northside
 * High is the school the NEXT screens already show, standing in until BTG
 * signs a real one (terms: documentation/SponsorX-NEXT-School-Programme-Terms.md,
 * P9-PMO-02). A real school is onboarded the same way, by a BTG admin.
 *
 * A school is a `Property` with kind SCHOOL — no new model. Its faculty
 * advisor signs in as that property's PROPERTY_MGR, the role the property
 * portal already has. NOT the ADVISOR role: that is Stage 9 schema work
 * behind the NEXT entry gate (P9-BE-05), and this deliberately needs none.
 *
 * The advisor's address is a Clerk TEST address (`+clerk_test`), so on the
 * development Clerk instance anyone on the team can sign in with it using
 * verification code 424242 — a login that actually works, where the
 * `@example.com` demo rows above are look-only. Production Clerk rejects
 * test addresses, and this seed never runs there anyway.
 *
 * No Zoho Account: field-mapping S-9 (2026-09-24) sends a property to Zoho as
 * plain text, not as an object, so there is nothing to sync.
 */
/** SIMULATED property terms (2S1-BE-01) — placeholder wording, not legal text. */
export const PROPERTY_TERMS_PLACEHOLDER =
  "SponsorX Marketplace Property Terms (simulated placeholder, v1): the organisation confirms it has the right to sell the inventory it lists, that BTG reviews every listing before it is published, and that payouts are made through the marketplace's payment provider.";

export const PILOT_SCHOOL = {
  propertyId: "seed_prop_northside",
  slug: "northside-high",
  name: "Northside High School",
  city: "Bowie",
  stateCode: "MD",
  advisorUserId: "seed_user_northside_advisor",
  advisorEmail: "northside.advisor+clerk_test@example.com",
} as const;

export async function seedPilotSchool(
  client: pg.PoolClient,
  tenantId: string,
): Promise<{ created: boolean }> {
  const p = PILOT_SCHOOL;
  const property = await client.query(
    `INSERT INTO "Property" (id, "tenantId", slug, name, kind, city, "stateCode")
     VALUES ($1, $2, $3, $4, 'SCHOOL', $5, $6)
         ON CONFLICT (id) DO NOTHING`,
    [p.propertyId, tenantId, p.slug, p.name, p.city, p.stateCode],
  );
  /* Same email guard as the users above: a row a real sign-in has already
     claimed is never reset to a placeholder. */
  await client.query(
    `INSERT INTO "User" (id, "tenantId", "clerkId", email, roles, "propertyId")
     SELECT $1, $2, $3, $4, ARRAY['PROPERTY_MGR']::"Role"[], $5
      WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = $4)
        ON CONFLICT (id) DO NOTHING`,
    [p.advisorUserId, tenantId, `seed:${p.advisorEmail}`, p.advisorEmail, p.propertyId],
  );
  /* P9-BE-11 — a SIMULATED roster for the claim flow to match against (the
     real one is open gate 1, spec §14). Names and graduation years only. */
  for (const [i, [legalName, gradYear]] of PILOT_ROSTER.entries()) {
    await client.query(
      `INSERT INTO "RosterEntry" (id, "tenantId", "propertyId", "legalName", "gradYear")
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING`,
      [`seed_roster_northside_${i + 1}`, tenantId, p.propertyId, legalName, gradYear],
    );
  }
  return { created: (property.rowCount ?? 0) > 0 };
}

/** Simulated Northside High roster (P9-BE-11). */
export const PILOT_ROSTER: ReadonlyArray<readonly [string, number]> = [
  ["Jordan Reyes", 2027], ["Maya Thompson", 2028], ["Andre Wallace", 2027],
  ["Sofia Nguyen", 2029], ["Elijah Brooks", 2028], ["Priya Raman", 2027],
];
