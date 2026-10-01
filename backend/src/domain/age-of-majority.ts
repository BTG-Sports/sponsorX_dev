/**
 * The age-of-majority table BTG edits, and the sign-up settings — 2S1-BE-12,
 * 2S1-BE-10.
 *
 * "Adulthood follows the athlete's state or country, from the date of birth,
 * using the editable table; an unknown place counts as 18 and is flagged."
 *
 * The rule itself is pure (age-of-majority-rules.ts). This file keeps the
 * table: per tenant, seeded with the common places the first time a tenant's
 * table is used (the restricted-words list's pattern), edited by BTG admins
 * with every change audited. Each athlete carries their place's age
 * (`Athlete.majorityAge`, `majorityKnown`) so every age rule reads it without
 * a second query — so a change to the table, or to where an athlete lives,
 * works the age out again for exactly the athletes it touches.
 *
 * The staff-confirmation setting lives here too: one per tenant, "BTG staff
 * confirm minors before approval", off unless BTG switches it on.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  DEFAULT_AGE_TABLE, MAX_MAJORITY_AGE, MIN_MAJORITY_AGE, majorityFor, type AgeRow, type Majority,
} from "./age-of-majority-rules";

type Db = Prisma.TransactionClient | typeof prisma;

export class AgeTableError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "AgeTableError";
    this.status = status;
  }
}

/** First use of a tenant's table: write the common places in, once. */
async function ensureSeeded(db: Db, tenantId: string) {
  const any = await db.ageOfMajority.count({ where: { tenantId } });
  if (any > 0) return;
  await db.ageOfMajority.createMany({
    data: DEFAULT_AGE_TABLE.map((r) => ({ tenantId, countryCode: r.countryCode, regionCode: r.regionCode, age: r.age, updatedBy: "seed" })),
    skipDuplicates: true,
  });
}

/** The tenant's table as the rule reads it. */
export async function ageTable(db: Db, tenantId: string): Promise<AgeRow[]> {
  await ensureSeeded(db, tenantId);
  return db.ageOfMajority.findMany({
    where: { tenantId },
    select: { countryCode: true, regionCode: true, age: true },
  });
}

/** The age of majority for a place, in this tenant. */
export async function majorityOf(db: Db, tenantId: string, countryCode: string | null | undefined, regionCode: string | null | undefined): Promise<Majority> {
  return majorityFor(await ageTable(db, tenantId), countryCode, regionCode);
}

/**
 * Work one athlete's age out again from where they live — after a move, or
 * after BTG edits the table. Returns what it now is; writes only on a change.
 */
export async function refreshMajorityIn(tx: Prisma.TransactionClient, tenantId: string, athleteId: string, table?: AgeRow[]): Promise<Majority> {
  const a = await tx.athlete.findFirst({
    where: { tenantId, id: athleteId },
    select: { countryCode: true, stateCode: true, majorityAge: true, majorityKnown: true },
  });
  if (!a) return { age: 18, known: false };
  const m = majorityFor(table ?? (await ageTable(tx, tenantId)), a.countryCode, a.stateCode);
  if (m.age !== a.majorityAge || m.known !== a.majorityKnown) {
    await tx.athlete.update({
      /* tenant-scope: loaded above in this tenant. */
      where: { id: athleteId }, data: { majorityAge: m.age, majorityKnown: m.known }, select: { id: true },
    });
  }
  return m;
}

/* ═══════════════════════ BTG's table ══════════════════════════════════ */

const VIEW = { id: true, countryCode: true, regionCode: true, age: true, updatedBy: true, updatedAt: true } as const;

/** The admin page: every place and its age, and how many athletes are flagged as unknown. */
export async function listAgeTable(actor: Actor) {
  const where = whereFor(actor, "signupRules", "read");
  await ensureSeeded(prisma, actor.tenantId);
  const [rows, unknown] = await Promise.all([
    prisma.ageOfMajority.findMany({ where: { ...where }, select: VIEW, orderBy: [{ countryCode: "asc" }, { regionCode: "asc" }] }),
    prisma.athlete.count({ where: { tenantId: actor.tenantId, majorityKnown: false } }),
  ]);
  return { rows, unknownPlaceAthletes: unknown, unknownPlaceAge: 18 };
}

function placeOf(input: { countryCode: string; regionCode?: string | null }) {
  const countryCode = input.countryCode.trim().toUpperCase();
  const regionCode = (input.regionCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new AgeTableError("A country is its two-letter code, e.g. US or CA.");
  if (regionCode && !/^[A-Z0-9]{1,3}$/.test(regionCode)) throw new AgeTableError("A state or province is its code, e.g. AL or BC.");
  return { countryCode, regionCode };
}

/** Every athlete in the place a row covers, worked out again. */
async function refreshPlace(tx: Prisma.TransactionClient, actor: AuditActor, countryCode: string, regionCode: string) {
  const table = await ageTable(tx, actor.tenantId);
  const athletes = await tx.athlete.findMany({
    where: { tenantId: actor.tenantId, countryCode, ...(regionCode ? { stateCode: regionCode } : {}) },
    select: { id: true, countryCode: true, stateCode: true, majorityAge: true, majorityKnown: true },
  });
  let changed = 0;
  for (const a of athletes) {
    const m = majorityFor(table, a.countryCode, a.stateCode);
    if (m.age === a.majorityAge && m.known === a.majorityKnown) continue;
    await tx.athlete.update({
      /* tenant-scope: found above in the actor's tenant. */
      where: { id: a.id }, data: { majorityAge: m.age, majorityKnown: m.known }, select: { id: true },
    });
    changed++;
  }
  return changed;
}

/** Add a place or change its age. The athletes who live there are worked out again. */
export async function setAgeRow(actor: Actor, input: { countryCode: string; regionCode?: string | null; age: number }) {
  assertAllowed(actor, "signupRules", "write");
  const { countryCode, regionCode } = placeOf(input);
  if (!Number.isInteger(input.age) || input.age < MIN_MAJORITY_AGE || input.age > MAX_MAJORITY_AGE) {
    throw new AgeTableError(`An age of majority is between ${MIN_MAJORITY_AGE} and ${MAX_MAJORITY_AGE}.`);
  }
  return prisma.$transaction(async (tx) => {
    await ensureSeeded(tx, actor.tenantId);
    const existing = await tx.ageOfMajority.findFirst({
      where: { ...whereFor(actor, "signupRules", "write"), countryCode, regionCode }, select: { id: true, age: true },
    });
    const row = existing
      ? await tx.ageOfMajority.update({
          /* tenant-scope: loaded above through whereFor(signupRules, write). */
          where: { id: existing.id }, data: { age: input.age, updatedBy: actor.userId }, select: VIEW,
        })
      : await tx.ageOfMajority.create({ data: { tenantId: actor.tenantId, countryCode, regionCode, age: input.age, updatedBy: actor.userId }, select: VIEW });
    const athletesUpdated = await refreshPlace(tx, actor, countryCode, regionCode);
    await audit(tx, actor, existing ? "ageOfMajority.update" : "ageOfMajority.add", "AgeOfMajority", row.id, {
      before: existing ? { age: existing.age } : undefined,
      after: { countryCode, regionCode, age: input.age, athletesUpdated },
    });
    return { row, athletesUpdated };
  });
}

/** Remove a place. Its athletes fall back to the country's age, or 18 and flagged. */
export async function removeAgeRow(actor: Actor, id: string) {
  assertAllowed(actor, "signupRules", "write");
  return prisma.$transaction(async (tx) => {
    const row = await tx.ageOfMajority.findFirst({ where: { ...whereFor(actor, "signupRules", "write"), id }, select: VIEW });
    if (!row) throw new ForbiddenError("signupRules", "write");
    await tx.ageOfMajority.delete({
      /* tenant-scope: loaded above through whereFor(signupRules, write). */
      where: { id: row.id },
    });
    const athletesUpdated = await refreshPlace(tx, actor, row.countryCode, row.regionCode);
    await audit(tx, actor, "ageOfMajority.remove", "AgeOfMajority", row.id, {
      before: { countryCode: row.countryCode, regionCode: row.regionCode, age: row.age }, after: { athletesUpdated },
    });
    return { removed: row.id, athletesUpdated };
  });
}

/* ═══════════════════════ the staff-confirmation setting ═══════════════ */

export async function signupSettings(actor: Actor) {
  assertAllowed(actor, "signupRules", "read");
  const t = await prisma.tenant.findFirst({
    /* tenant-scope: the actor's own tenant row. */
    where: { id: actor.tenantId }, select: { staffConfirmMinors: true },
  });
  return { staffConfirmMinors: t?.staffConfirmMinors ?? false };
}

/**
 * Switch "BTG staff confirm minors before approval" on or off. Switching it
 * off lets the minors it was holding through, by running their checks again
 * (the caller does that, after this commits — see routes/v1/signups.ts).
 */
export async function setSignupSettings(actor: Actor, input: { staffConfirmMinors: boolean }) {
  assertAllowed(actor, "signupRules", "write");
  return prisma.$transaction(async (tx) => {
    const before = await tx.tenant.findFirst({
      /* tenant-scope: the actor's own tenant row. */
      where: { id: actor.tenantId }, select: { staffConfirmMinors: true },
    });
    if (!before) throw new ForbiddenError("signupRules", "write");
    await tx.tenant.update({
      /* tenant-scope: the actor's own tenant row. */
      where: { id: actor.tenantId }, data: { staffConfirmMinors: input.staffConfirmMinors }, select: { id: true },
    });
    await audit(tx, actor, "signupSettings.update", "Tenant", actor.tenantId, {
      before: { staffConfirmMinors: before.staffConfirmMinors }, after: { staffConfirmMinors: input.staffConfirmMinors },
    });
    return { staffConfirmMinors: input.staffConfirmMinors };
  });
}
