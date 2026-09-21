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

import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { bodyHashMatches } from "./agreement-hash";
import { guardianReadiness } from "./guardian-rules";

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
  assertAllowed(actor, "agreement", "write");

  return prisma.$transaction(async (tx) => {
    const agreement = await tx.agreement.findFirst({
      where: { id: request.agreementId, tenantId: actor.tenantId },
      select: { id: true, kind: true, version: true, bodyHash: true },
    });
    if (!agreement) throw new ForbiddenError("agreement", "write");

    if (!bodyHashMatches(agreement.bodyHash, request.bodyHashShown)) {
      throw new AgreementTextChangedError();
    }

    const existing = await tx.agreementAcceptance.findFirst({
      where: {
        tenantId: actor.tenantId,
        agreementId: agreement.id,
        userId: actor.userId,
      },
      select: { id: true },
    });
    if (existing) throw new AlreadyAcceptedError(agreement.id);

    /* If the signer is an athlete and a minor, the guardian must already be
       linked and verified. Asked through the same rule the ACTIVE transition
       and (in B4) Campaign Order acceptance use — one definition of "may
       participate", so a minor cannot be blocked from activation yet able to
       sign. */
    const signer = await tx.user.findFirst({
      where: { id: actor.userId, tenantId: actor.tenantId },
      select: {
        athlete: {
          select: {
            birthDate: true,
            ageBand: true,
            guardianId: true,
            guardian: { select: { verifiedAt: true } },
          },
        },
      },
    });

    let guardianId: string | null = null;
    if (signer?.athlete) {
      const readiness = guardianReadiness({
        birthDate: signer.athlete.birthDate,
        ageBand: signer.athlete.ageBand,
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
  });
}

export * from "./agreement-hash";
