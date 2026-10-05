/**
 * Content trust — P5-BE-10, the database half of `content-trust-rules.ts`.
 *
 * THE CLEAN STREAK IS READ FROM TWO CLOCKS ON THE DELIVERABLE, not counted
 * from the audit log. `btgPassedAt` is set when a BTG reviewer (a person)
 * passes a deliverable on from BTG_REVIEW — to the sponsor or approved
 * outright; `btgRevisionAt` when BTG asks for a revision on it, from either
 * review desk. The athlete's clean count is then
 *
 *   deliverables BTG passed AFTER the athlete's latest BTG revision (any
 *   deliverable, any campaign, this tenant), that BTG never revised.
 *
 * which is "the last 3 BTG-reviewed deliverables were clean" read the safe
 * way round: one BTG revision anywhere — a skipped draft while it is with
 * the sponsor included — sets every earlier pass behind it, and the next 3
 * must be clean again. The system's revisions (failed checks) and the
 * sponsor's never touch either clock, so they never count against anyone.
 * A skipped draft has no `btgPassedAt` (BTG never reviewed it): it neither
 * adds to the streak nor, unless BTG revises it, takes from it.
 */
import type { Prisma } from "../generated/prisma/client";
import type { Actor } from "../auth/actor";
import { scopeOf } from "../auth/scope";
import { guardianControls } from "./guardian-rules";
import { contentTrust, skipDecision, type ContentTrust, type SkipDecision } from "./content-trust-rules";

type Db = Pick<Prisma.TransactionClient, "deliverable" | "user" | "$queryRaw">;

/**
 * The athlete's content-trust lock, held to the end of the caller's
 * transaction. Taken by a BTG revision BEFORE it stamps `btgRevisionAt`, and
 * by a submission BEFORE it reads the streak — always first, before either
 * writes the deliverable — so the two cannot interleave: a submission that
 * waits on a revision reads the streak the revision just broke, and one that
 * goes first skips only on a streak that was still intact.
 *
 * A row lock on the Athlete, FOR NO KEY UPDATE: it conflicts with itself but
 * not with the key-share locks inserts referencing the athlete take.
 */
export async function lockAthleteContent(db: Pick<Db, "$queryRaw">, tenantId: string, athleteId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "Athlete" WHERE "id" = ${athleteId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
}

/**
 * Is this a BTG reviewer's verdict, rather than the sponsor's? BTG holds
 * `deliverable.approve` across the tenant; a sponsor only on its own
 * campaigns (policy.ts) — the same line `assertTenantWide` draws.
 */
export function isBtgReviewer(actor: Actor): boolean {
  const scope = scopeOf(actor, "deliverable", "approve");
  return scope === "any" || scope === "own-tenant";
}

/** The athlete's raw clean count in this tenant (see the header). */
export async function cleanCount(db: Pick<Db, "deliverable">, tenantId: string, athleteId: string): Promise<number> {
  const last = await db.deliverable.aggregate({
    where: { tenantId, order: { athleteId } },
    _max: { btgRevisionAt: true },
  });
  const since = last._max.btgRevisionAt;
  return db.deliverable.count({
    where: {
      tenantId,
      order: { athleteId },
      btgRevisionAt: null,
      btgPassedAt: since ? { gt: since } : { not: null },
    },
  });
}

/** `{ trusted, cleanStreak, needed }` — BTG's view of an athlete. */
export async function contentTrustOf(db: Pick<Db, "deliverable">, tenantId: string, athleteId: string): Promise<ContentTrust> {
  return contentTrust(await cleanCount(db, tenantId, athleteId));
}

/** What `submitDraft` reads to decide, inside its transaction. */
export type SkipFacts = {
  id: string;
  tenantId: string;
  btgRevisionAt: Date | null;
  order: {
    athleteId: string;
    athlete: {
      birthDate: Date | null;
      ageBand: string | null;
      majorityAge: number;
      guardianId: string | null;
      comingOfAgeStartedAt: Date | null;
      comingOfAgeCompletedAt: Date | null;
      comingOfAgeTerminatedAt: Date | null;
    };
    campaign: {
      sponsorId: string;
      sponsor: { categories: string[] };
      brief: { categories: string[] } | null;
    };
  };
};

/** The select that loads SkipFacts' order half (merged into submitDraft's). */
export const SKIP_ATHLETE_SELECT = {
  birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
} as const;

/** Does this passing draft skip BTG? Reads the streak and the sponsor's reviewers. */
export async function decideSkip(db: Db, d: SkipFacts): Promise<SkipDecision> {
  const a = d.order.athlete;
  /* One after the other: `db` is a transaction, one connection. The lock
     first, so the streak is read after any BTG revision ahead of us. */
  await lockAthleteContent(db, d.tenantId, d.order.athleteId);
  const clean = await cleanCount(db, d.tenantId, d.order.athleteId);
  const reviewer = await db.user.findFirst({
    where: { tenantId: d.tenantId, disabledAt: null, sponsorId: d.order.campaign.sponsorId, roles: { has: "SPONSOR_ADMIN" } },
    select: { id: true },
  });
  return skipDecision({
    clean,
    /* A minor, or a just-adult athlete their guardian still acts for. */
    minor: guardianControls(a),
    ageKnown: Boolean(a.birthDate || a.ageBand),
    sponsorCategories: d.order.campaign.sponsor.categories,
    briefCategories: d.order.campaign.brief?.categories ?? [],
    btgRevisedBefore: Boolean(d.btgRevisionAt),
    sponsorReviewer: Boolean(reviewer),
  });
}
