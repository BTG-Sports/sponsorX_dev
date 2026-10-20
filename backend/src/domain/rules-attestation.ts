/**
 * The athlete's own rules are their responsibility — P8-BE-02 (P0-LEG-06).
 *
 * SponsorX does not research every school's, league's, association's or
 * country's NIL rules: there are too many, and they change. Instead the
 * athlete — or, for a minor, their guardian — confirms they have checked the
 * rules that apply to them. The built-in limits (the sensitive categories,
 * a person reviewing every minor's content, the athlete's own blocked
 * categories) stay for everyone, and when someone objects to a deal BTG
 * pauses it and asks for documents (deal-disputes.ts).
 *
 * THE WORDING IS VERSIONED. A confirmation counts only for the wording that
 * was shown; a new wording needs a new confirmation, exactly as a new
 * agreement version does.
 *
 * WHO CONFIRMS. An adult confirms for themselves: on the application, or
 * later from their login. For an athlete under their guardian's control only
 * the guardian's confirmation counts — on the guardian's set-up page, or from
 * the guardian's login acting for them. A minor's own tick on the application
 * is recorded, but it is not what lets a deal through.
 *
 * WHEN IT IS REQUIRED. Only once BTG switches it on for the tenant
 * (Tenant.requireRulesAttestation), so it can go live with the screen that
 * asks for it. Then accepting a deal and listing an item (guardian-acts.ts
 * `assertMayCommit`) are refused until the current wording is confirmed.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { guardianControls } from "./guardian-rules";

type Db = Prisma.TransactionClient | typeof prisma;

/** The wording the athlete or guardian confirms. A change here is a new version. */
export const RULES_ATTESTATION = {
  version: "2026-10-20",
  text:
    "I have checked that I am allowed to take paid sponsorships under the rules of my school, league, athletic association " +
    "and country or state, and I will follow them, including telling my school about a deal when its rules require it. " +
    "I understand that following these rules is my responsibility, and that if someone raises a concern about a deal, " +
    "BTG may pause it and ask me for documents.",
} as const;

/** Where it was confirmed. The two GUARDIAN_ ones are the only ones that count for an athlete under their guardian's control. */
export type AttestedVia = "APPLICATION" | "PORTAL" | "GUARDIAN_SETUP" | "GUARDIAN_PORTAL";
const BY_GUARDIAN: ReadonlySet<string> = new Set(["GUARDIAN_SETUP", "GUARDIAN_PORTAL"]);

/** 422 — the wording shown isn't the current one (the page is stale): show the new one and ask again. */
export class RulesAttestationStaleError extends Error {
  readonly status = 422;
  readonly code = "rules_attestation_stale";
  constructor() {
    super("The wording you confirmed has been updated. Read the current wording and confirm it again.");
    this.name = "RulesAttestationStaleError";
  }
}

/** 409 — required here, and not yet confirmed for the current wording. */
export class RulesAttestationRequiredError extends Error {
  readonly status = 409;
  readonly code = "rules_attestation_required";
  constructor(byGuardian: boolean) {
    super(
      byGuardian
        ? "Before a new deal, the athlete's guardian confirms that they have checked the athlete's school, league and local rules for paid sponsorships."
        : "Before a new deal, confirm that you have checked your school, league and local rules for paid sponsorships.",
    );
    this.name = "RulesAttestationRequiredError";
  }
}

export const ATTESTATION_SELECT = {
  rulesAttestedAt: true, rulesAttestationVersion: true, rulesAttestedVia: true,
  birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
} as const;

type AttestationRow = Prisma.AthleteGetPayload<{ select: typeof ATTESTATION_SELECT }>;

/** Pure: does this athlete's confirmation count, for the current wording and the right person? */
export function attestationCounts(a: AttestationRow): boolean {
  if (!a.rulesAttestedAt || a.rulesAttestationVersion !== RULES_ATTESTATION.version) return false;
  return guardianControls(a) ? BY_GUARDIAN.has(a.rulesAttestedVia ?? "") : true;
}

/** Refuse a version that isn't the current wording. */
export function assertCurrentWording(version: string): void {
  if (version !== RULES_ATTESTATION.version) throw new RulesAttestationStaleError();
}

/** Record a confirmation of the current wording on the athlete. The caller has authorised. */
export async function recordAttestationIn(
  tx: Prisma.TransactionClient,
  who: { userId: string | null; tenantId: string },
  athleteId: string,
  via: AttestedVia,
  version: string,
  at = new Date(),
): Promise<void> {
  assertCurrentWording(version);
  await tx.athlete.updateMany({
    /* tenant-scope: the caller's tenant and the athlete it authorised. */
    where: { tenantId: who.tenantId, id: athleteId },
    data: { rulesAttestedAt: at, rulesAttestationVersion: version, rulesAttestedVia: via },
  });
  await audit(tx, who, "athlete.rulesAttest", "Athlete", athleteId, { after: { version, via, at: at.toISOString() } });
}

/** Is the confirmation switched on for this tenant? */
export async function attestationRequired(db: Db, tenantId: string): Promise<boolean> {
  const t = await db.tenant.findFirst({ /* tenant-scope: the athlete's own tenant row. */ where: { id: tenantId }, select: { requireRulesAttestation: true } });
  return t?.requireRulesAttestation ?? false;
}

/** Throw when the tenant requires a confirmation and this athlete's doesn't count. Called from `assertMayCommit`. */
export async function assertAttested(db: Db, tenantId: string, athleteId: string): Promise<void> {
  if (!(await attestationRequired(db, tenantId))) return;
  const a = await db.athlete.findFirst({ /* tenant-scope: the athlete's tenant. */ where: { tenantId, id: athleteId }, select: ATTESTATION_SELECT });
  if (a && !attestationCounts(a)) throw new RulesAttestationRequiredError(guardianControls(a));
}

/** The wording, for a page that asks for it (public: the application and the guardian's page show it before any login). */
export function rulesAttestationWording() {
  return { version: RULES_ATTESTATION.version, text: RULES_ATTESTATION.text };
}

/** Where the signed-in athlete (or the guardian acting for them) stands. */
export async function myRulesAttestation(actor: Actor) {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE")) throw new ForbiddenError("athlete", "read");
  const a = await prisma.athlete.findFirst({ /* tenant-scope: the actor's own athlete. */ where: { tenantId: actor.tenantId, id: actor.athleteId }, select: ATTESTATION_SELECT });
  if (!a) throw new ForbiddenError("athlete", "read");
  return {
    ...rulesAttestationWording(),
    attestedAt: a.rulesAttestedAt?.toISOString() ?? null,
    attestedVersion: a.rulesAttestationVersion,
    attestedVia: a.rulesAttestedVia,
    /** Counts for the current wording, from the right person. */
    current: attestationCounts(a),
    /** Whether a deal waits on it here. */
    required: await attestationRequired(prisma, actor.tenantId),
    /** Who must confirm: the guardian, for an athlete under their control. */
    byGuardian: guardianControls(a),
  };
}

/**
 * Confirm from a login: the adult athlete, or the guardian acting for their
 * minor. A minor's own login is refused (`assertMayCommit`, guardian_must_act).
 */
export async function confirmRulesAttestation(actor: Actor, version: string) {
  if (!actor.athleteId || !actor.roles.includes("ATHLETE")) throw new ForbiddenError("athlete", "write");
  /* Imported here: guardian-acts.ts imports this file for `assertAttested`. */
  const { assertMayCommit } = await import("./guardian-acts");
  await prisma.$transaction(async (tx) => {
    await assertMayCommit(tx, actor, "manage");
    await recordAttestationIn(tx, actor, actor.athleteId!, actor.actingFor ? "GUARDIAN_PORTAL" : "PORTAL", version);
  });
  return myRulesAttestation(actor);
}
