/**
 * Campaign invitations — P4-BE-04, §21, §26, §37.
 *
 * The offer BTG makes to an athlete for one job on one campaign, and the
 * athlete's answer.
 *
 * THE CONFLICT CHECK RUNS AGAIN HERE. `matching.ts` shortlists, and a
 * shortlist is advisory — a desk that filters correctly and then invites from
 * a tab opened an hour ago has still put an athlete in front of a brand they
 * refused. The rule §26 states is about the invitation, so the invitation is
 * where it is enforced.
 *
 * SO DOES §37's GATE. A minor without a verified guardian cannot take paid
 * work, and an invitation is the offer of paid work. Letting one through to
 * be caught later at acceptance would mean telling a sixteen-year-old about a
 * campaign they were never able to accept.
 *
 * ONE OPEN OFFER, ENFORCED BY POSTGRES. The partial unique index in
 * prisma/sql/invite_one_open.sql covers INVITED and VIEWED. The check below
 * is the courteous error; the index is what makes it true under concurrency.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { assertMayCommit } from "./guardian-acts";
import {
  canTransitionInvite,
  IllegalInviteTransitionError,
  OPEN_INVITE_STATES,
  type InviteState,
} from "./invite-state";
import { guardianReadiness } from "./guardian-rules";
import { restrictionConflicts } from "./restrictions";

/** §21 gives no number, so this is a product default rather than a rule.
 *  Named and exported so the expiry job and the tests share one answer. */
export const DEFAULT_INVITE_WINDOW_DAYS = 7;

export class CategoryConflictError extends Error {
  readonly status = 409;
  constructor(readonly conflicting: string[]) {
    super(
      `This athlete has restricted ${conflicting.join(", ")}. §26 forbids ` +
        `inviting them to a campaign in a category they refused.`,
    );
    this.name = "CategoryConflictError";
  }
}

export class AthleteNotActiveError extends Error {
  readonly status = 409;
  constructor(state: string) {
    super(`This athlete is ${state}; only an ACTIVE athlete can be invited to paid work.`);
    this.name = "AthleteNotActiveError";
  }
}

export class GuardianNotVerifiedError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "This athlete is a minor whose guardian is not verified (§37). Verify " +
        "the guardian before offering paid work.",
    );
    this.name = "GuardianNotVerifiedError";
  }
}

export class AlreadyInvitedError extends Error {
  readonly status = 409;
  constructor() {
    super("This athlete already has an open invitation for this job on this campaign.");
    this.name = "AlreadyInvitedError";
  }
}

/**
 * Offer one job on one campaign to one athlete.
 *
 * MAKING an offer needs a wider reach than ANSWERING one, and the matrix says
 * so without saying it in words: BTG roles hold `own-tenant` on `invitation`
 * while an athlete holds `own`. Both are "write", so the coarse check alone
 * cannot tell them apart — an athlete would pass it and invite themselves to
 * a campaign. The scope is what distinguishes the two acts, so the scope is
 * what is checked.
 */
export async function inviteAthlete(
  actor: Actor,
  input: {
    campaignId: string;
    athleteId: string;
    jobId: string;
    /** Cents offered to the athlete. */
    offered: number;
    expiresAt?: Date;
  },
): Promise<{ id: string; state: InviteState; expiresAt: Date }> {
  const scope = assertAllowed(actor, "invitation", "write");
  if (scope !== "any" && scope !== "own-tenant") {
    throw new ForbiddenError("invitation", "write");
  }

  return prisma.$transaction(async (tx) => {
    const campaign = await tx.campaign.findFirst({
      where: { id: input.campaignId, tenantId: actor.tenantId },
      select: { id: true, brief: { select: { categories: true } }, startDate: true, endDate: true, sponsor: { select: { categories: true } } },
    });
    if (!campaign) throw new ForbiddenError("invitation", "write");

    const athlete = await tx.athlete.findFirst({
      where: { id: input.athleteId, tenantId: actor.tenantId },
      select: {
        id: true, state: true, restrictedCategories: true,
        birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
        guardian: { select: { verifiedAt: true } },
      },
    });
    if (!athlete) throw new ForbiddenError("invitation", "write");

    if (athlete.state !== "ACTIVE") throw new AthleteNotActiveError(athlete.state);

    /* §37, asked through the shared rule rather than re-derived. */
    const readiness = guardianReadiness({
      birthDate: athlete.birthDate,
      ageBand: athlete.ageBand,
      majorityAge: athlete.majorityAge,
      guardianId: athlete.guardianId,
      guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianNotVerifiedError();
    }

    /* §26, re-asked at the moment of the offer. */
    const briefCategories = campaign.brief?.categories ?? [];
    const conflicting = athlete.restrictedCategories.filter((r) => briefCategories.includes(r));
    if (conflicting.length > 0) throw new CategoryConflictError(conflicting);

    /* 2S2-BE-02 — and the first-class restrictions (the athlete's, their
       team's, exclusivities from accepted offers) for the campaign's dates:
       the same question every offer and purchase asks. */
    const dated = await restrictionConflicts(tx, {
      tenantId: actor.tenantId, athleteId: athlete.id,
      categories: [...new Set([...briefCategories, ...(campaign.sponsor?.categories ?? [])])],
      startsOn: campaign.startDate, endsOn: campaign.endDate,
    });
    if (dated.length > 0) throw new CategoryConflictError([...new Set(dated.map((c) => c.category))]);

    const open = await tx.campaignInvite.findFirst({
      /* tenant-scope: campaign and athlete were both loaded above through whereFor. */
      where: {
        campaignId: input.campaignId,
        athleteId: input.athleteId,
        jobId: input.jobId,
        /* The constant, not a literal: prisma/sql/invite_one_open.sql
           indexes exactly these states, and a second hand-typed copy here is
           how the guard and the index drift apart. */
        state: { in: [...OPEN_INVITE_STATES] },
      },
      select: { id: true },
    });
    if (open) throw new AlreadyInvitedError();

    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + DEFAULT_INVITE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const invite = await tx.campaignInvite.create({
      data: {
        tenantId: actor.tenantId,
        campaignId: input.campaignId,
        athleteId: input.athleteId,
        jobId: input.jobId,
        offered: input.offered,
        expiresAt,
      },
      select: { id: true, state: true, expiresAt: true },
    });

    await audit(tx, actor, "invitation.send", "CampaignInvite", invite.id, {
      after: {
        campaignId: input.campaignId, athleteId: input.athleteId,
        jobId: input.jobId, offered: input.offered,
      },
    });

    await enqueue(tx, actor.tenantId, "notify.invitationSent", { inviteId: invite.id });

    return { id: invite.id, state: invite.state as InviteState, expiresAt: invite.expiresAt };
  });
}

/**
 * The athlete's answer, or BTG recording that they opened it.
 *
 * `viewedAt` and `respondedAt` are stamped from the transition rather than
 * sent by the caller, so the record cannot disagree with the state.
 */
export async function transitionInvite(
  actor: Actor,
  inviteId: string,
  to: InviteState,
): Promise<{ id: string; state: InviteState }> {
  assertAllowed(actor, "invitation", "write");

  return prisma.$transaction(async (tx) => {
    const invite = await tx.campaignInvite.findFirst({
      /* An athlete answers their OWN invitation. Unscoped, they could
         accept or decline another athlete's. */
      where: { ...whereFor(actor, "invitation", "write"), id: inviteId },
      select: { id: true, state: true },
    });
    if (!invite) throw new ForbiddenError("invitation", "write");

    const from = invite.state as InviteState;
    if (!canTransitionInvite(from, to)) throw new IllegalInviteTransitionError(from, to);
    /* 2S1-BE-11 / -12 — accepting is an agreement: a minor's comes from their guardian, and none during coming of age. */
    if (to === "ACCEPTED") await assertMayCommit(tx, actor, "accept");

    const updated = await tx.campaignInvite.update({
      where: { id: inviteId },
      data: {
        state: to as Prisma.CampaignInviteUpdateInput["state"],
        ...(to === "VIEWED" ? { viewedAt: new Date() } : {}),
        ...(to === "ACCEPTED" || to === "DECLINED" ? { respondedAt: new Date() } : {}),
      },
      select: { id: true, state: true },
    });

    await audit(tx, actor, INVITE_AUDIT_ACTIONS[to], "CampaignInvite", inviteId, {
      before: { state: from },
      after: { state: to },
    });

    return { id: updated.id, state: updated.state as InviteState };
  });
}

const INVITE_AUDIT_ACTIONS: Record<InviteState, `${string}.${string}`> = {
  INVITED: "invitation.send",
  VIEWED: "invitation.view",
  ACCEPTED: "invitation.accept",
  DECLINED: "invitation.decline",
  EXPIRED: "invitation.expire",
};

export { INVITE_AUDIT_ACTIONS };
export * from "./invite-state";
