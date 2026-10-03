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
import { send } from "../lib/email";
import { env } from "../config/env";
import { sendGuardianSetupEmail } from "./athlete-signup";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { provisionGuardianLoginIn } from "./athlete-login";
import { activateWardStudentsIn } from "./student-moves";
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

/**
 * 409 `handoff_required` / 422 / 403: a minor who already has a guardian
 * changes guardian only by the handoff (2S1-BE-15), which only the new
 * guardian starts — or, in a dispute decided by hand, by a BTG admin
 * replacing them with a reason.
 */
export class GuardianChangeError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, code: string, status = 409) {
    super(message);
    this.name = "GuardianChangeError";
    this.code = code;
    this.status = status;
  }
}

export type GuardianInput = {
  legalName: string;
  email: string;
  phone?: string;
  relationship: GuardianRelationship;
  /** 2S1-BE-15 — a BTG admin replacing an existing guardian (a dispute decided by hand) says why. Audited and emailed. */
  replaceReason?: string;
};

const appUrl = () => env.APP_URL.replace(/\/+$/, "");
const firstWord = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] ?? "";

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
 *
 * 2S1-BE-15 — NOT A SECOND ROAD AROUND THE HANDOFF. A minor who already has
 * a guardian is refused (409 `handoff_required`): the new guardian asks on
 * the handoff page and the current one hands off, so control never has a
 * gap and nobody signed in can take a child over. A dispute is decided by
 * hand: only a BTG_ADMIN may replace an existing guardian here, with a
 * required reason, audited (`guardian.replace`), and emailed to both
 * guardians and the athlete. A GUARDIAN or ATHLETE never can.
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
      select: { id: true, tenantId: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true, state: true, email: true, legalName: true, displayName: true },
    });
    if (!athlete) throw new ForbiddenError("athlete", "write");
    if (!requiresGuardian(athlete)) throw new GuardianNotRequiredError(athleteId);

    const reason = input.replaceReason?.trim() || null;
    const previous = athlete.guardianId
      ? await tx.guardian.findFirst({ where: { tenantId: athlete.tenantId, id: athlete.guardianId }, select: { id: true, legalName: true, email: true } })
      : null;
    if (previous) {
      if (!actor.roles.includes("BTG_ADMIN")) {
        throw new GuardianChangeError(
          "This athlete already has a guardian. A new guardian asks to take over on the guardian handoff page, and the current guardian hands off. " +
            "A dispute goes to BTG support, and only a BTG admin can replace a guardian by hand.",
          "handoff_required",
        );
      }
      if (!reason) {
        throw new GuardianChangeError("Replacing a guardian by hand needs a reason — both guardians and the athlete are emailed it.", "reason_required", 422);
      }
    }

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
      /* The guardian waits for THIS athlete — proof naming them and the agreement
         for them — even if already verified for another child (2S1-BE-10). */
      data: { guardianId: guardian.id, guardianPendingSince: new Date() },
      select: { id: true },
    });

    await audit(tx, actor, previous ? "guardian.replace" : AUDIT_ACTIONS.guardian.link, "Athlete", athleteId, {
      before: { guardianId: athlete.guardianId },
      after: { guardianId: guardian.id, relationship: input.relationship, ...(previous ? { reason, by: "BTG_ADMIN" } : {}) },
    });
    if (previous) {
      /* Any handoff still open was asked of the guardian who no longer is one. */
      await tx.guardianHandoff.updateMany({
        where: { tenantId: athlete.tenantId, athleteId, state: { in: ["REQUESTED", "WAITING", "HANDED_OFF"] } },
        data: { state: "CANCELLED", decidedAt: new Date() },
      });
      const athleteFirstName = firstWord(athlete.displayName || athlete.legalName);
      const data = { athleteFirstName, newGuardianName: input.legalName, previousGuardianName: previous.legalName, reason: reason!, supportEmail: env.SUPPORT_EMAIL };
      const recipients: { to: string; seat: "new" | "previous" | "athlete"; name: string }[] = [
        { to: input.email.toLowerCase(), seat: "new", name: firstWord(input.legalName) },
        { to: previous.email, seat: "previous", name: firstWord(previous.legalName) },
        ...(athlete.email ? [{ to: athlete.email, seat: "athlete" as const, name: athleteFirstName }] : []),
      ];
      for (const r of recipients) {
        await send(tx, athlete.tenantId, {
          template: "guardian.replacedByBtg", to: r.to, idempotencyKey: `guardian.replacedByBtg:${guardian.id}:${r.seat}`,
          data: { ...data, name: r.name, seat: r.seat, portalUrl: `${appUrl()}/athlete` },
        });
      }
    }
    /* 2S1-BE-14 — every guardian BTG links, first or replacement, is emailed
       their own page (2S1-BE-10): opening it confirms their email, and their
       ID, proof naming this athlete and the agreement verify them. Until
       then they don't act for the athlete (guardian-acts.ts). */
    await sendGuardianSetupEmail(tx, athlete, { id: guardian.id, legalName: input.legalName, email: input.email.toLowerCase() }, 0);

    /* P3-BE-15 — the second path to a guardian login. Approval provisions a
       guardian already linked; one linked AFTER approval would otherwise
       never get a login, and cannot give the consent a minor's activation
       waits on. */
    if (athlete.state === "APPROVED" || athlete.state === "ACTIVE") {
      await provisionGuardianLoginIn(tx, actor, guardian.id);
    }

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
      select: { id: true, tenantId: true, verifiedAt: true },
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
    /* P9-BE-20 — a NEXT student approved and waiting only on this guardian
       joins the masthead now, as the system, in this transaction. */
    await activateWardStudentsIn(tx, guardian.tenantId, guardianId, verifiedAt);

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
      majorityAge: true,
      guardianId: true,
      guardian: { select: { verifiedAt: true } },
    },
  });
  if (!athlete) throw new ForbiddenError("athlete", "read");

  return guardianReadiness({
    birthDate: athlete.birthDate,
    ageBand: athlete.ageBand,
    majorityAge: athlete.majorityAge,
    guardianId: athlete.guardianId,
    guardianVerifiedAt: athlete.guardian?.verifiedAt ?? null,
  });
}

export * from "./guardian-rules";
