/**
 * The athlete's Content Collaboration Agreement, recorded — P8-BE-04 (§12, P0-LEG-01).
 *
 * Until now /join showed the agreement and armed its button on the tick, but
 * nothing reached the server: no text file, no acceptance. Counsel will
 * approve this agreement, and an acceptance that was never recorded proves
 * nothing. Now:
 *
 *   - THE TEXT is `agreements/COLLAB.v<n>.txt`, served with its version and
 *     fingerprint at GET /public/agreements/collab. v1 is today's /join
 *     wording, marked draft; counsel's approved text is a new file.
 *   - THE APPLICATION sends the agreement it showed (`agreement`) and the
 *     acceptance is recorded with §12's evidence — the exact text's
 *     fingerprint, the time, the IP and the user agent from the request — on
 *     the applicant's athlete row (there is no login yet).
 *   - AN EXISTING ATHLETE accepts from their login through POST
 *     /agreements/accept, as every other agreement; GET /me/collab-agreement
 *     says where they stand.
 *   - A MINOR: their guardian's agreement accepts this one on their behalf
 *     (Guardian Agreement §2), so a guardian who accepted it covers them.
 *   - REQUIRED only once BTG switches it on (Tenant.requireCollabAcceptance,
 *     off until /join sends it): then a new deal or item waits for an
 *     acceptance of the version in force (guardian-acts.ts `assertMayCommit`).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { env } from "../config/env";
import { bodyHashMatches } from "./agreement-hash";
import { AgreementTextChangedError, GUARDIAN_AGREEMENT_KIND } from "./agreement";
import { currentAgreementOf } from "./current-agreement";
import { guardianControls } from "./guardian-rules";

type Db = Prisma.TransactionClient | typeof prisma;

export const COLLAB_AGREEMENT_KIND = "COLLAB";

/** 409 — required here, and the version in force isn't accepted yet. */
export class CollabAgreementRequiredError extends Error {
  readonly status = 409;
  readonly code = "collab_agreement_required";
  constructor() {
    super("Before a new deal, accept the current SponsorX Content Collaboration Agreement.");
    this.name = "CollabAgreementRequiredError";
  }
}

/** 422 — the agreement sent isn't this tenant's Content Collaboration Agreement. */
export class NotCollabAgreementError extends Error {
  readonly status = 422;
  readonly code = "not_collab_agreement";
  constructor() {
    super("That isn't the current Content Collaboration Agreement. Reload the page to see it, then accept again.");
    this.name = "NotCollabAgreementError";
  }
}

/** The agreement /join shows: the version in force for the public intake tenant. */
export async function publicCollabAgreement() {
  const a = await currentAgreementOf(prisma, env.PUBLIC_INTAKE_TENANT_ID, COLLAB_AGREEMENT_KIND);
  if (!a) throw new ForbiddenError("agreement", "read");
  return { agreementId: a.agreementId, version: a.version, bodyHash: a.bodyHash, body: a.body };
}

/**
 * The applicant's acceptance, inside the application's transaction: only the
 * version in force, only against the text shown, once per athlete and version.
 */
export async function recordApplicantCollabIn(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; athleteId: string; agreementId: string; bodyHashShown: string; ip: string; userAgent: string },
): Promise<{ acceptanceId: string; acceptedAt: Date }> {
  const current = await currentAgreementOf(tx, input.tenantId, COLLAB_AGREEMENT_KIND);
  if (!current || current.agreementId !== input.agreementId) throw new NotCollabAgreementError();
  if (!bodyHashMatches(current.bodyHash, input.bodyHashShown)) throw new AgreementTextChangedError();
  const existing = await tx.agreementAcceptance.findFirst({
    /* tenant-scope: the applicant's own acceptance of this version. */
    where: { tenantId: input.tenantId, agreementId: current.agreementId, athleteId: input.athleteId },
    select: { id: true, acceptedAt: true },
  });
  if (existing) return { acceptanceId: existing.id, acceptedAt: existing.acceptedAt };
  const row = await tx.agreementAcceptance.create({
    data: {
      tenantId: input.tenantId, agreementId: current.agreementId, athleteId: input.athleteId,
      /* Copied, not referenced: what this person actually agreed to. */
      bodyHash: current.bodyHash, ip: input.ip, userAgent: input.userAgent,
    },
    select: { id: true, acceptedAt: true },
  });
  await audit(tx, { userId: null, tenantId: input.tenantId }, AUDIT_ACTIONS.agreement.accept, "Agreement", current.agreementId, {
    after: { acceptanceId: row.id, kind: COLLAB_AGREEMENT_KIND, version: current.version, bodyHash: current.bodyHash, athleteId: input.athleteId, via: "APPLICATION" },
  });
  return { acceptanceId: row.id, acceptedAt: row.acceptedAt };
}

const ATHLETE_SELECT = {
  id: true, guardianId: true, birthDate: true, ageBand: true, majorityAge: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  user: { select: { id: true } },
} as const;

/** When this athlete's acceptance of the version in force was recorded, by whichever route; null if none. */
export async function collabAcceptedAt(db: Db, tenantId: string, athleteId: string): Promise<{ acceptedAt: Date | null; byGuardian: boolean; version: number | null }> {
  const a = await db.athlete.findFirst({ /* tenant-scope: the athlete's own tenant. */ where: { tenantId, id: athleteId }, select: ATHLETE_SELECT });
  if (!a) return { acceptedAt: null, byGuardian: false, version: null };
  const current = await currentAgreementOf(db, tenantId, COLLAB_AGREEMENT_KIND);
  const byGuardian = guardianControls(a);
  /* A minor: their guardian's agreement accepts this one for them (Guardian Agreement §2). */
  if (byGuardian && a.guardianId) {
    const g = await db.agreementAcceptance.findFirst({
      /* tenant-scope: the guardian's acceptance for this athlete. */
      where: { tenantId, athleteId, guardianId: a.guardianId, agreement: { is: { kind: GUARDIAN_AGREEMENT_KIND } } },
      select: { acceptedAt: true }, orderBy: { acceptedAt: "desc" },
    });
    if (g) return { acceptedAt: g.acceptedAt, byGuardian, version: current?.version ?? null };
  }
  if (!current) return { acceptedAt: null, byGuardian, version: null };
  const own = await db.agreementAcceptance.findFirst({
    /* tenant-scope: this athlete's acceptance of the version in force — on the application (athleteId) or from their login (userId). */
    where: {
      tenantId, agreementId: current.agreementId,
      OR: [{ athleteId }, ...(a.user ? [{ userId: a.user.id }] : [])],
    },
    select: { acceptedAt: true }, orderBy: { acceptedAt: "desc" },
  });
  return { acceptedAt: own?.acceptedAt ?? null, byGuardian, version: current.version };
}

/** Is the acceptance switched on for this tenant? */
export async function collabRequired(db: Db, tenantId: string): Promise<boolean> {
  const t = await db.tenant.findFirst({ /* tenant-scope: the athlete's own tenant row. */ where: { id: tenantId }, select: { requireCollabAcceptance: true } });
  return t?.requireCollabAcceptance ?? false;
}

/** Throw when the tenant requires it and the version in force isn't accepted. Called from `assertMayCommit`. */
export async function assertCollabAccepted(db: Db, tenantId: string, athleteId: string): Promise<void> {
  if (!(await collabRequired(db, tenantId))) return;
  if (!(await collabAcceptedAt(db, tenantId, athleteId)).acceptedAt) throw new CollabAgreementRequiredError();
}

/** The signed-in athlete's (or the guardian acting for them) agreement: its text and whether it is accepted. */
export async function myCollabAgreement(actor: Actor) {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE")) throw new ForbiddenError("agreement", "read");
  const current = await currentAgreementOf(prisma, actor.tenantId, COLLAB_AGREEMENT_KIND);
  if (!current) throw new ForbiddenError("agreement", "read");
  const status = await collabAcceptedAt(prisma, actor.tenantId, actor.athleteId);
  return {
    agreementId: current.agreementId, version: current.version, bodyHash: current.bodyHash, body: current.body,
    acceptedAt: status.acceptedAt?.toISOString() ?? null,
    /** Accept through POST /agreements/accept with this agreementId and the body's hash. */
    current: Boolean(status.acceptedAt),
    required: await collabRequired(prisma, actor.tenantId),
    /** For an athlete under their guardian's control, the guardian's agreement covers it. */
    byGuardian: status.byGuardian,
  };
}
