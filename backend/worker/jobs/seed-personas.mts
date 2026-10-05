/**
 * Walkthrough personas — staging logins for the two sign-up-to-payout stories
 * (the marketplace story and the SponsorX NEXT story).
 *
 * Every address is a Clerk TEST address (`+clerk_test@example.com`): on the
 * development Clerk instance staging uses, it signs in with verification code
 * 424242 and no email is sent. No password exists anywhere. Production Clerk
 * rejects test addresses, and `seedEnvironment` never runs in production.
 *
 * Same three properties as the rest of the environment seed: never in
 * production (the caller's guard), idempotent (deterministic `seed_` ids with
 * ON CONFLICT DO NOTHING), and placeholder `clerkId`s that the first real
 * sign-in claims by verified email (`src/auth/actor.ts`).
 *
 * Each persona is created at the point where the story hands over to the
 * person — so the walkthrough starts with something to do:
 *   - Riley's application is SUBMITTED, waiting for the network manager.
 *   - Jordan's student application is SUBMITTED, waiting for Ms. Patel.
 *   - Maya is FEATURED (created by editorial), waiting to claim her profile.
 *   - Northside's Fall 2026 edition is SELLING, with its ad slots open.
 *   - The Hawks can list on the Phase 2 marketplace, with one listing live;
 *     the Bowie Bay Sox's property application waits for BTG's review.
 */

import type pg from "pg";
import { maskEmail } from "../../src/lib/redact.ts";

/* The pilot school's id, as a literal: importing PILOT_SCHOOL would make a
   cycle with seed-environment (which calls this), and the test asserts the
   two agree. */
const PILOT_SCHOOL = { propertyId: "seed_prop_northside" } as const;

/* 2S8-OPS-02 — timestamps are stored as UTC wall-clock time; bare now()
   would write the session's local time instead. */
const NOW = `(now() AT TIME ZONE 'UTC')`;

const TEST = "+clerk_test@example.com";
const email = (local: string) => `${local}${TEST}`;

export type Persona = {
  userId: string;
  email: string;
  roles: string[];
  who: string;
  story: "BTG" | "MARKETPLACE" | "NEXT";
  sponsorId?: string;
  propertyId?: string;
  athleteId?: string;
  guardianId?: string;
  studentId?: string;
};

export const HAWKS = { propertyId: "seed_prop_hawks", slug: "westfield-hawks", name: "Westfield Hawks" } as const;
export const HARBOR = { sponsorId: "seed_spn_harbor", name: "Harbor Coffee" } as const;
export const BOWIE = { sponsorId: "seed_spn_bowie_autocare", name: "Bowie Auto Care" } as const;
export const RILEY = { athleteId: "seed_ath_riley", slug: "riley-carter" } as const;
export const MAYA = { athleteId: "seed_ath_maya", slug: "maya-thompson", guardianId: "seed_grd_maya" } as const;
export const JORDAN = { studentId: "seed_stu_jordan", guardianId: "seed_grd_jordan" } as const;
export const EDITION = {
  publicationId: "seed_pub_northside",
  editionId: "seed_ed_northside_fall26",
  label: "Fall 2026",
} as const;

export const PERSONAS: readonly Persona[] = [
  { userId: "seed_user_p_admin", email: email("btg.admin"), roles: ["BTG_ADMIN"], who: "BTG admin", story: "BTG" },
  { userId: "seed_user_p_network", email: email("btg.network"), roles: ["NETWORK_MGR"], who: "BTG network manager (approves athletes)", story: "BTG" },
  { userId: "seed_user_p_campaigns", email: email("btg.campaigns"), roles: ["CAMPAIGN_MGR"], who: "BTG campaign manager (matching, invitations, content approval)", story: "BTG" },
  { userId: "seed_user_p_finance", email: email("btg.finance"), roles: ["FINANCE"], who: "BTG finance (marks earnings paid)", story: "BTG" },
  { userId: "seed_user_p_sales", email: email("btg.sales"), roles: ["SALES"], who: "BTG sales (NEXT ad sales)", story: "BTG" },

  { userId: "seed_user_p_harbor", email: email("harbor.coffee"), roles: ["SPONSOR_ADMIN"], who: "Harbor Coffee (sponsor)", story: "MARKETPLACE", sponsorId: HARBOR.sponsorId },
  { userId: "seed_user_p_hawks", email: email("hawks"), roles: ["PROPERTY_MGR"], who: "Westfield Hawks (team manager)", story: "MARKETPLACE", propertyId: HAWKS.propertyId },
  { userId: "seed_user_p_riley", email: email("riley"), roles: ["ATHLETE"], who: "Riley Carter (athlete, application submitted)", story: "MARKETPLACE", athleteId: RILEY.athleteId },

  { userId: "seed_user_p_patel", email: email("ms.patel"), roles: ["ADVISOR"], who: "Ms. Patel (Northside faculty advisor)", story: "NEXT", propertyId: PILOT_SCHOOL.propertyId },
  { userId: "seed_user_p_jordan", email: email("jordan"), roles: ["STUDENT"], who: "Jordan Reyes (student, application submitted)", story: "NEXT", studentId: JORDAN.studentId, propertyId: PILOT_SCHOOL.propertyId },
  { userId: "seed_user_p_jordan_guardian", email: email("jordan.guardian"), roles: ["GUARDIAN"], who: "Carmen Reyes (Jordan's parent)", story: "NEXT", guardianId: JORDAN.guardianId },
  { userId: "seed_user_p_bowie", email: email("bowie.autocare"), roles: ["SPONSOR_ADMIN"], who: "Bowie Auto Care (sponsor)", story: "NEXT", sponsorId: BOWIE.sponsorId },
  { userId: "seed_user_p_maya", email: email("maya"), roles: ["ATHLETE"], who: "Maya Thompson (featured athlete, not yet claimed)", story: "NEXT", athleteId: MAYA.athleteId },
  { userId: "seed_user_p_maya_guardian", email: email("maya.guardian"), roles: ["GUARDIAN"], who: "Lena Thompson (Maya's parent)", story: "NEXT", guardianId: MAYA.guardianId },
];

/** The Hawks' team inventory — [id, title, kind, priceCents, quantity, categories]. */
export const MARKETPLACE_ITEMS: ReadonlyArray<readonly [string, string, string, number, number, string[]]> = [
  ["seed_inv_hawks_signage", "Courtside LED signage", "SIGNAGE", 150_000, 12, ["RESTAURANT", "AUTOMOTIVE"]],
  ["seed_inv_hawks_tickets", "Season ticket pack (4 seats)", "TICKETS", 60_000, 20, []],
];

/** Fall 2026 flatplan at the NEXT rate card (SponsorX-NEXT-Rate-Card-Decision.md). */
export const EDITION_SLOTS: ReadonlyArray<readonly [slotCode: string, kind: string, priceCents: number]> = [
  ["P01-PRES", "PRESENTING", 300_000],
  ["P03-FULL", "FULL", 80_000], ["P04-FULL", "FULL", 80_000], ["P05-FULL", "FULL", 80_000], ["P06-FULL", "FULL", 80_000],
  ...[7, 8, 9, 10].flatMap((p) => ([["T", "HALF", 50_000], ["B", "HALF", 50_000]] as const)
    .map(([half, kind, cents]) => [`P${String(p).padStart(2, "0")}-HALF-${half}`, kind, cents] as const)),
  ...[1, 2, 3, 4].map((n) => [`P11-QTR-${n}`, "QUARTER", 25_000] as const),
  ...[1, 2, 3, 4].map((n) => [`P12-QTR-${n}`, "QUARTER", 25_000] as const),
  ["P16-BACK", "BACK_COVER", 100_000],
];

type Query = (sql: string, params: unknown[]) => Promise<pg.QueryResult>;

/**
 * 2S8-QA-05 — the slug a seeded row is inserted with.
 *
 * Slugs are globally unique, and the seed runs on databases real people use:
 * an applicant who signed up as "Riley Carter" holds `riley-carter`, and the
 * seed then failed on the unique index (taking the whole boot seed with it).
 * The persona's row is keyed by its fixed id and its login by its email, not
 * by the slug, so the safe answer is to keep the persona and give it the
 * first free `riley-carter-2`, `-3`… — logged — and never touch the other
 * person's row. A row the seed already created keeps whatever slug it has.
 */
export async function seedSlug(q: Query, table: "Athlete" | "Property", id: string, slug: string): Promise<string> {
  const own = await q(`SELECT slug FROM "${table}" WHERE id = $1`, [id]);
  if (own.rowCount) return (own.rows[0] as { slug: string }).slug;
  const taken = new Set(
    (await q(`SELECT slug FROM "${table}" WHERE slug = $1 OR slug LIKE $2`, [slug, `${slug}-%`])).rows.map((r: { slug: string }) => r.slug),
  );
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  console.log(`[seed] ${table} slug "${slug}" is held by another row — seeding ${id} as "${slug}-${n}" instead`);
  return `${slug}-${n}`;
}

export async function seedPersonas(client: pg.PoolClient, tenantId: string): Promise<{ usersCreated: number }> {
  const q: Query = (sql, params) => client.query(sql, params);

  /* Organisations. */
  await q(
    `INSERT INTO "Property" (id, "tenantId", slug, name, kind, city, "stateCode")
     VALUES ($1, $2, $3, $4, 'TEAM', 'Laurel', 'MD') ON CONFLICT (id) DO NOTHING`,
    [HAWKS.propertyId, tenantId, await seedSlug(q, "Property", HAWKS.propertyId, HAWKS.slug), HAWKS.name],
  );
  for (const [s, category] of [[HARBOR, "RESTAURANT"], [BOWIE, "AUTOMOTIVE"]] as const) {
    await q(
      `INSERT INTO "Sponsor" (id, "tenantId", name, categories)
       VALUES ($1, $2, $3, ARRAY[$4]::TEXT[]) ON CONFLICT (id) DO NOTHING`,
      [s.sponsorId, tenantId, s.name, category],
    );
  }

  /* Phase 2 marketplace (2S1–2S4) — the Hawks are an APPROVED marketplace
     property with listing access, two team items and one PUBLISHED listing,
     so a sponsor has something to buy; the Bowie Bay Sox have applied and wait
     in BTG's verification queue. Their primary contact is a Clerk test
     address, so approving them on staging creates a login that works.
     SIMULATED data, per the other personas. */
  await q(
    `INSERT INTO "PropertyOnboarding" (id, "tenantId", state, "orgType", "orgName", "stateCode", contacts, details,
                                       "payoutAcknowledgedAt", "termsAcceptedAt", "submittedAt", "decidedAt", "propertyId")
     VALUES ('seed_onb_hawks', $1, 'APPROVED', 'TEAM', $2, 'MD', $3::jsonb, $4::jsonb, ${NOW}, ${NOW}, ${NOW}, ${NOW}, $5)
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, HAWKS.name,
     JSON.stringify([{ name: "Dana Brooks", email: email("hawks"), role: "General manager", primary: true }]),
     JSON.stringify({ legalEntityName: "Westfield Hawks Basketball LLC", league: "Mid-Atlantic Amateur League", sport: "Basketball" }),
     HAWKS.propertyId],
  );
  await q(`UPDATE "Property" SET "listingAccessAt" = ${NOW} WHERE id = $1 AND "listingAccessAt" IS NULL`, [HAWKS.propertyId]);
  await q(
    `INSERT INTO "PropertyOnboarding" (id, "tenantId", state, "orgType", "orgName", "stateCode", contacts, details,
                                       "payoutAcknowledgedAt", "termsAcceptedAt", "submittedAt")
     VALUES ('seed_onb_baysox', $1, 'PENDING_REVIEW', 'TEAM', 'Bowie Bay Sox', 'MD', $2::jsonb, $3::jsonb,
             ${NOW}, ${NOW}, ${NOW} - interval '26 hours')
     ON CONFLICT (id) DO NOTHING`,
    [tenantId,
     JSON.stringify([{ name: "Sam Ortiz", email: email("baysox"), role: "Owner", primary: true }]),
     JSON.stringify({ legalEntityName: "Bowie Bay Sox Baseball Club Inc.", league: "Atlantic Collegiate Baseball League", sport: "Baseball" })],
  );
  for (const [id, title, kind, priceCents, quantity, categories] of MARKETPLACE_ITEMS) {
    await q(
      `INSERT INTO "InventoryItem" (id, "tenantId", "propertyId", title, description, kind, "priceCents", quantity,
                                    "availableFrom", "availableUntil", categories, "restrictedCategories")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '2026-10-01'::timestamp, '2027-03-31'::timestamp, $9::TEXT[], ARRAY['ALCOHOL','TOBACCO_VAPE','GAMBLING']::TEXT[])
       ON CONFLICT (id) DO NOTHING`,
      [id, tenantId, HAWKS.propertyId, title, `${title} at the Westfield Hawks' 2026–27 home season.`, kind, priceCents, quantity, categories],
    );
  }
  await q(
    `INSERT INTO "Listing" (id, "tenantId", "propertyId", "inventoryItemId", title, description, state,
                            "submittedAt", "decidedAt", "publishedAt")
     VALUES ('seed_lst_hawks_signage', $1, $2, $3, 'Courtside LED signage — Hawks home games',
             'Rotating courtside LED board, 30 seconds per quarter at every Hawks home game, October through March.',
             'PUBLISHED', ${NOW}, ${NOW}, ${NOW})
     ON CONFLICT (id) DO NOTHING`,
    [tenantId, HAWKS.propertyId, MARKETPLACE_ITEMS[0][0]],
  );

  /* Guardians — Jordan's has already consented (verified); Maya's has not,
     because authorising her claim is a step in the story. */
  await q(
    `INSERT INTO "Guardian" (id, "tenantId", "legalName", email, relationship, "verifiedAt")
     VALUES ($1, $2, 'Carmen Reyes', $3, 'PARENT', ${NOW}),
            ($4, $2, 'Lena Thompson', $5, 'PARENT', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [JORDAN.guardianId, tenantId, email("jordan.guardian"), MAYA.guardianId, email("maya.guardian")],
  );

  /* Riley — an adult, on the Hawks' roster at a 20% team share, application
     submitted. Maya — FEATURED by editorial, a Northside minor. */
  await q(
    `INSERT INTO "Athlete" (id, "tenantId", slug, "legalName", "displayName", email, sport, position,
                            city, "stateCode", "birthDate", "ageBand", state, "propertyId", "teamShareBps")
     VALUES ($1, $2, $3, 'Riley Carter', 'RILEY.CARTER', $4, 'Basketball', 'Guard',
             'Laurel', 'MD', '2006-03-11'::timestamp, '18_PLUS', 'SUBMITTED'::"AthleteState", $5, 2000)
     ON CONFLICT (id) DO NOTHING`,
    [RILEY.athleteId, tenantId, await seedSlug(q, "Athlete", RILEY.athleteId, RILEY.slug), email("riley"), HAWKS.propertyId],
  );
  await q(
    `INSERT INTO "Athlete" (id, "tenantId", slug, "legalName", "displayName", email, sport, position,
                            school, city, "stateCode", "birthDate", "ageBand", "gradYear", state, "guardianId")
     VALUES ($1, $2, $3, 'Maya Thompson', 'MAYA.THOMPSON', $4, 'Basketball', 'Point guard',
             'Northside High School', 'Bowie', 'MD', '2010-05-19'::timestamp, '16_17', 2028,
             'FEATURED'::"AthleteState", $5)
     ON CONFLICT (id) DO NOTHING`,
    [MAYA.athleteId, tenantId, await seedSlug(q, "Athlete", MAYA.athleteId, MAYA.slug), email("maya"), MAYA.guardianId],
  );

  /* Jordan — a Northside minor, sales and writing, application submitted. */
  await q(
    `INSERT INTO "Student" (id, "tenantId", "propertyId", "guardianId", "legalName", "displayName", email,
                            "gradYear", "birthDate", "ageBand", masthead, state)
     VALUES ($1, $2, $3, $4, 'Jordan Reyes', 'Jordan R.', $5, 2027, '2009-10-02'::timestamp, '16_17',
             ARRAY['SALES','WRITER']::TEXT[], 'SUBMITTED'::"StudentState")
     ON CONFLICT (id) DO NOTHING`,
    [JORDAN.studentId, tenantId, PILOT_SCHOOL.propertyId, JORDAN.guardianId, email("jordan")],
  );

  /* Northside Sports, Fall 2026 — selling, with the rate-card flatplan. */
  await q(
    `INSERT INTO "Publication" (id, "tenantId", "propertyId", name)
     VALUES ($1, $2, $3, 'Northside Sports') ON CONFLICT (id) DO NOTHING`,
    [EDITION.publicationId, tenantId, PILOT_SCHOOL.propertyId],
  );
  await q(
    `INSERT INTO "Edition" (id, "tenantId", "publicationId", label, "closeDate", "publishTarget",
                            "thresholdCents", state)
     VALUES ($1, $2, $3, $4, '2026-11-15'::timestamp, '2026-12-05'::timestamp, 500000,
             'SELLING'::"EditionState")
     ON CONFLICT (id) DO NOTHING`,
    [EDITION.editionId, tenantId, EDITION.publicationId, EDITION.label],
  );
  for (const [slotCode, kind, priceCents] of EDITION_SLOTS) {
    await q(
      `INSERT INTO "AdSlot" (id, "tenantId", "editionId", "slotCode", kind, "priceCents")
       VALUES ($1, $2, $3, $4, $5::"AdSlotKind", $6) ON CONFLICT (id) DO NOTHING`,
      [`seed_slot_fall26_${slotCode}`, tenantId, EDITION.editionId, slotCode, kind, priceCents],
    );
  }

  /* Logins. Same email guard as the other seeded users: a row a real sign-in
     has already claimed is never reset to a placeholder. */
  let usersCreated = 0;
  for (const p of PERSONAS) {
    const result = await q(
      `INSERT INTO "User" (id, "tenantId", "clerkId", email, roles,
                           "sponsorId", "propertyId", "athleteId", "guardianId", "studentId")
       SELECT $1, $2, $3, $4, $5::"Role"[], $6, $7, $8, $9, $10
        WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = $4 OR "clerkId" = $3)
          ON CONFLICT (id) DO NOTHING`,
      [p.userId, tenantId, `seed:${p.email}`, p.email, p.roles,
       p.sponsorId ?? null, p.propertyId ?? null, p.athleteId ?? null, p.guardianId ?? null, p.studentId ?? null],
    );
    usersCreated += result.rowCount ?? 0;
    /* 2S8-QA-05 — a login whose address another user already holds is
       skipped, never merged into theirs: the email is the identity a sign-in
       claims, so sharing it would hand one person the other's account. */
    if (!result.rowCount && !(await q(`SELECT 1 FROM "User" WHERE id = $1`, [p.userId])).rowCount) {
      /* 2S8-SEC-05 — the address by its domain only. */
      console.log(`[seed] persona ${p.userId} skipped — ${maskEmail(p.email)} already belongs to another user`);
    }
  }
  return { usersCreated };
}
