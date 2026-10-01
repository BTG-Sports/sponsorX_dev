/**
 * Accepting an agreement — P3-BE-06, §12, §26, Guide §08.
 *
 * §12's requirement, in full: record the agreement version, a fingerprint of
 * the exact body shown, the signer, the timestamp, the IP, the user agent,
 * and the guardian authorisation where one applies. This file is the only
 * place an `AgreementAcceptance` is created, so that list cannot be partly
 * satisfied by a caller in a hurry.
 *
 * The hashing rule lives in `agreement-hash.ts`, which imports nothing.
 */

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { bodyHashMatches } from "./agreement-hash";
import { guardianReadiness } from "./guardian-rules";
import { assertMayCommit } from "./guardian-acts";

export class AgreementTextChangedError extends Error {
  readonly status = 409;
  constructor() {
    super(
      "The agreement text has changed since it was displayed. Reload and " +
        "read the current version before accepting — an acceptance of text " +
        "the signer did not see is not evidence of anything (§12).",
    );
    this.name = "AgreementTextChangedError";
  }
}

export class AlreadyAcceptedError extends Error {
  readonly status = 409;
  constructor(agreementId: string) {
    super(`This user has already accepted agreement ${agreementId}.`);
    this.name = "AlreadyAcceptedError";
  }
}

export class GuardianAuthorisationRequiredError extends Error {
  readonly status = 409;
  constructor(reason: string) {
    super(`A guardian must authorise this acceptance: ${reason} (§4, §26).`);
    this.name = "GuardianAuthorisationRequiredError";
  }
}

export type AcceptanceRequest = {
  agreementId: string;
  /** The hash of the text the signer actually had on screen. */
  bodyHashShown: string;
  /** §12 — captured for evidential weight, not for analytics. */
  ip: string;
  userAgent: string;
};

/**
 * Record an acceptance, or refuse.
 *
 * Three refusals, each for a different reason worth keeping distinct:
 *
 *   - the displayed text no longer matches the stored agreement
 *   - this signer has already accepted this version
 *   - the signer is a minor whose guardian is missing or unverified
 *
 * The IP and user agent come from the request, and the signer comes from
 * `requireActor()` — never from the request body. A caller who can nominate
 * their own signer can manufacture an acceptance for someone else.
 */
export async function acceptAgreement(
  actor: Actor,
  request: AcceptanceRequest,
): Promise<{ acceptanceId: string; acceptedAt: Date; guardianId: string | null }> {
  return prisma.$transaction((tx) => acceptAgreementIn(tx, actor, request));
}

/**
 * The same acceptance, inside a transaction the caller already opened.
 *
 * `acceptOrder` (P5-BE-01) needs the acceptance and the order's state change
 * to commit together. Running them in two transactions looked harmless — an
 * orphan acceptance records a real event — but it is not: if the second fails,
 * the order stays SENT, the athlete retries, and this function then refuses
 * with AlreadyAcceptedError because that signer already accepted that
 * version. The order could never be accepted by anyone again.
 *
 * Same shape as `transitionAthleteIn`: one function still records an
 * acceptance, it just takes the transaction as an argument.
 */
export async function acceptAgreementIn(
  tx: Prisma.TransactionClient,
  actor: Actor,
  request: AcceptanceRequest,
  /**
   * `oncePerSigner` (default true) is right for terms a person accepts once —
   * the collaboration agreement, a guardian's authorisation. It is WRONG for
   * a Campaign Order, which is the same versioned template accepted once per
   * ORDER: with it, an athlete's second order under v1 was refused with
   * AlreadyAccepted and could never be accepted by anyone (found by the
   * P5-FE-01 walk). acceptOrder passes false; its own SENT-only guard, inside
   * the same transaction, is what stops one order being accepted twice.
   */
  opts: { oncePerSigner?: boolean } = {},
): Promise<{ acceptanceId: string; acceptedAt: Date; guardianId: string | null }> {
  assertAllowed(actor, "agreement", "write");
  /* 2S1-BE-11 — a minor's agreements come from their guardian's account; and
     2S1-BE-12 — nothing new is agreed during the coming-of-age allowance. */
  await assertMayCommit(tx, actor, "accept");

  const agreement = await tx.agreement.findFirst({
    where: { id: request.agreementId, tenantId: actor.tenantId },
    select: { id: true, kind: true, version: true, bodyHash: true },
  });
  if (!agreement) throw new ForbiddenError("agreement", "write");

  if (!bodyHashMatches(agreement.bodyHash, request.bodyHashShown)) {
    throw new AgreementTextChangedError();
  }

  if (opts.oncePerSigner !== false) {
    const existing = await tx.agreementAcceptance.findFirst({
      where: {
        tenantId: actor.tenantId,
        agreementId: agreement.id,
        userId: actor.userId,
      },
      select: { id: true },
    });
    if (existing) throw new AlreadyAcceptedError(agreement.id);
  }

  /* If the signer is an athlete and a minor, the guardian must already be
     linked and verified. Asked through the same rule the ACTIVE transition
     and (in B4) Campaign Order acceptance use — one definition of "may
     participate", so a minor cannot be blocked from activation yet able to
     sign. */
  const SUBJECT = { birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardian: { select: { verifiedAt: true } } } as const;
  const signer = actor.actingFor
    ? /* 2S1-BE-11 — a guardian signing for their ward: the ward is the subject, and the same gate asks of them. */
      { athlete: await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: actor.actingFor.athleteId }, select: SUBJECT }) }
    : await tx.user.findFirst({
        where: { id: actor.userId, tenantId: actor.tenantId },
        select: { athlete: { select: SUBJECT } },
      });

  let guardianId: string | null = null;
  if (signer?.athlete) {
    const readiness = guardianReadiness({
      birthDate: signer.athlete.birthDate,
      ageBand: signer.athlete.ageBand,
      majorityAge: signer.athlete.majorityAge,
      guardianId: signer.athlete.guardianId,
      guardianVerifiedAt: signer.athlete.guardian?.verifiedAt ?? null,
    });
    if (readiness.status === "missing" || readiness.status === "unverified") {
      throw new GuardianAuthorisationRequiredError(readiness.reason);
    }
    /* Recorded on the acceptance only when one was actually required —
       §12's "guardian authorization when applicable". An adult's
       acceptance carries null, not a spurious reference. */
    if (readiness.status === "ready") guardianId = signer.athlete.guardianId ?? null;
  }
  /* 2S1-BE-11 — the guardian accepting from their own login, for the ward:
     the acceptance records the guardian who authorised it. */
  if (actor.actingFor) guardianId = actor.actingFor.guardianId;

  const acceptance = await tx.agreementAcceptance.create({
    data: {
      tenantId: actor.tenantId,
      agreementId: agreement.id,
      userId: actor.userId,
      /* Copied, not referenced. If the template is later corrected, this
         row still says what this person actually agreed to — which is the
         entire evidential point (schema comment on the column). */
      bodyHash: agreement.bodyHash,
      ip: request.ip,
      userAgent: request.userAgent,
      guardianId,
    },
    select: { id: true, acceptedAt: true },
  });

  await audit(tx, actor, AUDIT_ACTIONS.agreement.accept, "Agreement", agreement.id, {
    after: {
      acceptanceId: acceptance.id,
      kind: agreement.kind,
      version: agreement.version,
      bodyHash: agreement.bodyHash,
      guardianId,
      /* IP and user agent are on the acceptance row itself; repeating them
         in the audit payload would duplicate personal data across two
         tables for no gain (§26). */
    },
  });

  return {
    acceptanceId: acceptance.id,
    acceptedAt: acceptance.acceptedAt,
    guardianId,
  };
}

export * from "./agreement-hash";


/* ══════════════ the guardian agreement — 2S1-BE-10 ═════════════════════ */

/** The guardian agreement's kind: accepted on the guardian's public set-up page. */
export const GUARDIAN_AGREEMENT_KIND = "GUARDIAN";

/**
 * Record a guardian's acceptance of the guardian agreement for one minor —
 * from their public set-up page, before they have any login, so there is no
 * Actor to sign with. §12's evidence is the same as every acceptance: the
 * version, the hash of the text shown, the IP, the user agent, the time. The
 * subject is the minor (`athleteId`) and `guardianId` the adult who
 * authorised — the shape the NEXT consents already use for a subject with no
 * login. Accepting twice for the same minor returns the first acceptance.
 */
export async function recordGuardianAcceptanceIn(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; agreementId: string; bodyHashShown: string; athleteId: string; guardianId: string; ip: string; userAgent: string },
): Promise<{ acceptanceId: string; acceptedAt: Date }> {
  const agreement = await tx.agreement.findFirst({
    where: { id: input.agreementId, tenantId: input.tenantId, kind: GUARDIAN_AGREEMENT_KIND },
    select: { id: true, kind: true, version: true, bodyHash: true },
  });
  if (!agreement || !bodyHashMatches(agreement.bodyHash, input.bodyHashShown)) throw new AgreementTextChangedError();
  const existing = await tx.agreementAcceptance.findFirst({
    where: { tenantId: input.tenantId, agreementId: agreement.id, athleteId: input.athleteId, guardianId: input.guardianId },
    select: { id: true, acceptedAt: true },
  });
  if (existing) return { acceptanceId: existing.id, acceptedAt: existing.acceptedAt };
  const acceptance = await tx.agreementAcceptance.create({
    data: {
      tenantId: input.tenantId, agreementId: agreement.id, athleteId: input.athleteId, guardianId: input.guardianId,
      bodyHash: agreement.bodyHash, ip: input.ip, userAgent: input.userAgent,
    },
    select: { id: true, acceptedAt: true },
  });
  await audit(tx, { userId: null, tenantId: input.tenantId }, AUDIT_ACTIONS.agreement.accept, "Agreement", agreement.id, {
    after: { acceptanceId: acceptance.id, kind: agreement.kind, version: agreement.version, bodyHash: agreement.bodyHash, guardianId: input.guardianId, athleteId: input.athleteId },
  });
  return { acceptanceId: acceptance.id, acceptedAt: acceptance.acceptedAt };
}
