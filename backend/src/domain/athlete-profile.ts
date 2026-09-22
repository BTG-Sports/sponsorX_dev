/**
 * Capabilities, interests and restrictions — P3-BE-05, §11 §4-§6, §26.
 *
 * Three lists that look alike and are not. Capabilities and interests are
 * *preferences* — they shape matching and nothing breaks if they are wrong.
 * Restrictions are a **rule**: §26's conflict check reads them before an
 * athlete is invited to anything, and an athlete who said "no alcohol" being
 * offered a bar promotion is the failure the whole column exists to prevent.
 *
 * WHY THE CATEGORIES ARE A CLOSED SET. Free text cannot be conflict-checked.
 * "no booze", "No Alcohol" and "alcohol/bars" are three strings and one
 * intention, and a query that has to guess is a query that misses. The
 * vocabulary is small and explicit, and anything outside it goes in
 * `restrictionNotes`, which the conflict check deliberately cannot read.
 */

import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { BrandCategory, ContentCapability } from "./brand-categories";

export type ProfileInput = {
  contentCapabilities?: readonly ContentCapability[];
  brandInterests?: readonly BrandCategory[];
  restrictedCategories?: readonly BrandCategory[];
  restrictionNotes?: string | null;
};

/**
 * Set any of the three lists.
 *
 * Each is replaced wholesale when present and untouched when absent —
 * removing a restriction must be expressible, and a merge cannot express it.
 * That asymmetry is why a missing key and an empty array mean different
 * things here, and the contract says so.
 */
export async function setAthleteProfile(
  actor: Actor,
  athleteId: string,
  input: ProfileInput,
): Promise<{ athleteId: string; restrictedCategories: string[] }> {
  assertAllowed(actor, "athlete", "write");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.athlete.findFirst({
      /* Scoped, because restrictions drive §26's conflict check and an
         ATHLETE holds `athlete.write` at `own` — unscoped, they could clear
         someone else's restrictions. */
      where: { ...whereFor(actor, "athlete", "write"), id: athleteId },
      select: {
        id: true,
        contentCapabilities: true,
        brandInterests: true,
        restrictedCategories: true,
        restrictionNotes: true,
      },
    });
    if (!existing) throw new ForbiddenError("athlete", "write");

    const updated = await tx.athlete.update({
      where: { id: athleteId },
      data: {
        ...(input.contentCapabilities !== undefined
          ? { contentCapabilities: [...input.contentCapabilities] }
          : {}),
        ...(input.brandInterests !== undefined
          ? { brandInterests: [...input.brandInterests] }
          : {}),
        ...(input.restrictedCategories !== undefined
          ? { restrictedCategories: [...input.restrictedCategories] }
          : {}),
        ...(input.restrictionNotes !== undefined
          ? { restrictionNotes: input.restrictionNotes }
          : {}),
      },
      select: { id: true, restrictedCategories: true },
    });

    /* Restrictions are audited as their own change. §26 wants "who removed
       the alcohol restriction, and when" answerable without reading a diff of
       an entire profile update. */
    if (input.restrictedCategories !== undefined) {
      await audit(tx, actor, "athlete.restrictionsSet", "Athlete", athleteId, {
        before: { restrictedCategories: existing.restrictedCategories },
        after: { restrictedCategories: updated.restrictedCategories },
      });
    }
    await audit(tx, actor, "athlete.profileSet", "Athlete", athleteId, {
      after: { fields: Object.keys(input) },
    });

    return { athleteId, restrictedCategories: updated.restrictedCategories };
  });
}

/**
 * Athletes who may be offered work in these categories — the §26 conflict
 * check, answered from an index rather than from someone reading notes.
 *
 * This is what makes P3-BE-05's acceptance ("restrictions are queryable")
 * true rather than merely stored. Phase 4's matching calls it; it lives here
 * because the rule is the model's, not the matcher's.
 */
export async function athletesWithoutConflict(
  actor: Actor,
  categories: readonly BrandCategory[],
): Promise<Array<{ id: string; displayName: string }>> {
  assertAllowed(actor, "athlete", "read");

  return prisma.athlete.findMany({
    where: {
      tenantId: actor.tenantId,
      state: "ACTIVE",
      /* NOT hasSome, rather than a negated hasEvery: an athlete who bars
         *any* of the campaign's categories is a conflict, not only one who
         bars all of them. */
      NOT: { restrictedCategories: { hasSome: [...categories] } },
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" },
    take: 200,
  });
}

export * from "./brand-categories";
