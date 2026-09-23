/**
 * Guardian linkage and verification — P3-BE-03, §4, §11, §26, §37.
 *
 * The rules are in `guardian-rules.ts` and import nothing; this file is the
 * part that touches Postgres.
 *
 * WHAT VERIFICATION MEANS HERE, AND WHAT IT DOES NOT.
 * `verifiedAt` records that a BTG staff member confirmed, out of band, that
 * the adult is who they claim to be and consents. Phase 1 does not verify
 * identity documents, and it must not pretend to: the field is a human
 * attestation with a timestamp and an auditable actor, which is what §37's
 * pre-pilot gate asks for. Whether guardian authorisation additionally needs
 * true e-signature is an open legal question (G-03) and is deliberately not
 * resolved in code.
 *
 * Verification is therefore a privileged action: only roles that may *write*
 * a guardian record may perform it, and every one is audited with the actor
 * who attested.
 */

import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import {
  GUARDIAN_RELATIONSHIPS,
  guardianReadiness,
  requiresGuardian,
  type GuardianRelationship,
} from "./guardian-rules";

export class GuardianNotRequiredError extends Error {
  readonly status = 409;
  constructor(athleteId: string) {
    super(
      `Athlete ${athleteId} is not a minor, so a guardian cannot be linked. ` +
        `Linking one anyway would create a record implying an authorisation ` +
        `requirement that does not exist (§4).`,
    );
    this.name = "GuardianNotRequiredError";
  }
}

export class AlreadyVerifiedError extends Error {
  readonly status = 409;
  constructor(guardianId: string) {
    super(`Guardian ${guardianId} is already verified.`);
    this.name = "AlreadyVerifiedError";
  }
}

export type GuardianInput = {
  legalName: string;
  email: string;
  phone?: string;
  relationship: GuardianRelationship;
};

/**
 * Attach an authorised adult to a minor.
 *
 * Creating the guardian and linking it happen in one transaction: a guardian
 * row with no ward is an orphan nobody will ever find, and a minor pointing
 * at a guardian that failed to insert is worse.
 *
 * It refuses for an adult athlete. That looks pedantic until you consider the
 * read side — `guardianReadiness` treats "has a guardian" as meaningful, and
 * a stray guardian on an adult would make an adult look like a supervised
 * minor in every downstream check and report.
 */
export async function linkGuardian(
  actor: Actor,
  athleteId: string,
  input: GuardianInput,
): Promise<{ guardianId: string }> {
  assertAllowed(actor, "guardian", "write");

  if (!GUARDIAN_RELATIONSHIPS.includes(input.relationship)) {
    throw new Error(
      `Unknown guardian relationship ${JSON.stringify(input.relationship)}. ` +
        `Expected one of ${GUARDIAN_RELATIONSHIPS.join(", ")} (§4).`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "athlete", "read"), id: athleteId },
      select: { id: true, birthDate: true, ageBand: true, guardianId: true },
    });
    if (!athlete) throw new ForbiddenError("athlete", "write");
    if (!requiresGuardian(athlete)) throw new GuardianNotRequiredError(athleteId);

    const guardian = await tx.guardian.create({
      data: {
        tenantId: actor.tenantId,
        legalName: input.legalName,
        email: input.email.toLowerCase(),
        phone: input.phone ?? null,
        relationship: input.relationship,
        /* Never verified on creation, whoever is asking. Linking is data
           entry; verification is an attestation, and collapsing the two
           would make the gate meaningless. */
      },
      select: { id: true },
    });

    await tx.athlete.update({
      where: { id: athleteId },
      data: { guardianId: guardian.id },
      select: { id: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.guardian.link, "Athlete", athleteId, {
      before: { guardianId: athlete.guardianId },
      after: { guardianId: guardian.id, relationship: input.relationship },
    });

    return { guardianId: guardian.id };
  });
}

/**
 * Record that a BTG staff member has confirmed this adult.
 *
 * The audit row is the evidence: §37 requires that a minor cannot go live
 * without verification, and "who attested, and when" is the question that
 * matters if it is ever challenged. The actor is not passed in as data — it
 * comes from `requireActor()`, so it cannot be forged by the caller.
 */
export async function verifyGuardian(
  actor: Actor,
  guardianId: string,
): Promise<{ guardianId: string; verifiedAt: Date }> {
  /* An attestation ABOUT someone, not BY them. A guardian holds
     `guardian.write` at `own` so they can maintain their own details — which
     also let them verify themselves until this check was added. The evidence
     §26 wants is BTG confirming the adult, and a self-signed confirmation is
     not evidence. */
  assertTenantWide(actor, "guardian", "write");

  return prisma.$transaction(async (tx) => {
    const guardian = await tx.guardian.findFirst({
      where: { ...whereFor(actor, "guardian", "write"), id: guardianId },
      select: { id: true, verifiedAt: true },
    });
    if (!guardian) throw new ForbiddenError("guardian", "write");
    if (guardian.verifiedAt) throw new AlreadyVerifiedError(guardianId);

    const verifiedAt = new Date();
    await tx.guardian.update({
      where: { id: guardianId },
      data: { verifiedAt },
      select: { id: true },
    });

    await audit(tx, actor, AUDIT_ACTIONS.guardian.verify, "Guardian", guardianId, {
      after: { verifiedAt: verifiedAt.toISOString() },
    });

    return { guardianId, verifiedAt };
  });
}

/**
 * Whether this athlete may take part, as the database currently sees it.
 *
 * The single read every downstream gate uses — the ACTIVE transition now, and
 * Campaign Order acceptance in B4. One query shape so the two cannot drift
 * apart, which is how a minor ends up able to accept paid work they could not
 * be activated for.
 */
export async function readGuardianReadiness(actor: Actor, athleteId: string) {
  const athlete = await prisma.athlete.findFirst({
    where: { ...whereFor(actor, "athlete", "read"), id: athleteId },
    select: {
      birthDate: true,
      ageBand: true,
      guardianId: true,
      guardian: { select: { verifiedAt: true } },
    },
  });
  if (!athlete) throw new ForbiddenError("athlete", "read");

  return guardianReadiness({
    birthDate: athlete.birthDate,
    ageBand: athlete.ageBand,
    guardianId: athlete.guardianId,
    guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
  });
}

export * from "./guardian-rules";
