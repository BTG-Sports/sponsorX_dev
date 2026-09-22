/**
 * Social accounts and where their numbers came from — P3-BE-04, §11 §3, §22.
 *
 * The schema has carried `AthleteSocial.source` since P2-BE-02 and the
 * application intake writes it, but nothing could *change* a social account
 * after the application closed — and the numbers are the point. A follower
 * count an athlete typed in March is not a follower count in September, and
 * §22's whole argument is that a stale number and a fresh one must not look
 * alike on a screen.
 *
 * PROVENANCE IS NOT THE CALLER'S TO CLAIM. An athlete editing their own
 * accounts always writes `SELF_REPORTED`, whatever they send. Only BTG may
 * record `VERIFIED_MANUAL`, and only by having actually looked. The label is
 * the project's stated biggest credibility risk; a caller who can set their
 * own provenance has removed the label's meaning entirely.
 *
 * `capturedAt` moves with every write, because "when was this true" is the
 * question a labelled number exists to answer.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, can } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { SocialAccount } from "../contracts/athlete";

/** §22. `VERIFIED_API` is absent on purpose: nothing integrates a platform API
 *  in Phase 1, and offering the label would let someone claim a verification
 *  the system cannot perform. */
export type SocialSource = "SELF_REPORTED" | "VERIFIED_MANUAL";

/**
 * Replace an athlete's social accounts.
 *
 * Wholesale rather than per-row: the set is at most four, and "I deleted the
 * TikTok I never use" has to be expressible. A merge keyed on platform cannot
 * express a removal without a second verb.
 */
export async function recordSocials(
  actor: Actor,
  athleteId: string,
  accounts: readonly SocialAccount[],
): Promise<{ athleteId: string; accounts: number; source: SocialSource }> {
  assertAllowed(actor, "athleteSocialAccount", "write");

  /* Who may say a number was checked. `own-tenant` reach means BTG staff;
     an athlete or guardian holds `own`/`ward` and cannot. */
  const scope = can(actor, "athlete", "write") && !isSelfScoped(actor);
  const source: SocialSource = scope ? "VERIFIED_MANUAL" : "SELF_REPORTED";

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { id: athleteId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (!athlete) throw new ForbiddenError("athleteSocialAccount", "write");

    const before = await tx.athleteSocial.findMany({
      where: { athleteId },
      select: { platform: true, handle: true, followers: true, source: true },
    });

    await tx.athleteSocial.deleteMany({ where: { athleteId } });
    if (accounts.length > 0) {
      await tx.athleteSocial.createMany({
        data: accounts.map((a) => ({
          tenantId: actor.tenantId,
          athleteId,
          platform: a.platform,
          handle: a.handle,
          followers: a.followers ?? null,
          avgViews: a.avgViews ?? null,
          source: source as Prisma.AthleteSocialCreateManyInput["source"],
          capturedAt: new Date(),
        })),
      });
    }

    await audit(tx, actor, "athlete.socialsRecord", "Athlete", athleteId, {
      before: { accounts: before },
      after: {
        accounts: accounts.map((a) => ({
          platform: a.platform, handle: a.handle, followers: a.followers ?? null,
        })),
        source,
      },
    });

    return { athleteId, accounts: accounts.length, source };
  });
}

/**
 * Is this actor acting on themselves rather than on the network?
 *
 * ATHLETE and GUARDIAN reach only their own record, so a BTG role is the
 * absence of both. Written as a check on roles rather than on scope strings
 * because `scopeFor` returns the *widest* of an actor's roles — a BTG staffer
 * who is also an athlete in the network must still be able to verify, and a
 * naive scope comparison would quietly demote them.
 */
function isSelfScoped(actor: Actor): boolean {
  return actor.roles.every((role) => role === "ATHLETE" || role === "GUARDIAN");
}
