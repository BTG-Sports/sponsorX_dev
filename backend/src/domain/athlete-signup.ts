/**
 * Athletes approved automatically — 2S1-BE-09 (adults) and 2S1-BE-10
 * (minors and their guardians).
 *
 * BTG has at most one reviewer, so the system approves and BTG checks
 * afterwards. An athlete applies at /join exactly as before (application-
 * intake.ts); then:
 *
 *   - they confirm their email by the link in the receipt (signup-token.ts);
 *   - they upload a government ID — or, under their place's age of majority,
 *     a school ID — straight to the private bucket (account-documents.ts);
 *   - a minor names a guardian, who is emailed a link to their own page
 *     (guardian-setup.ts): details, government ID, proof of guardianship,
 *     the guardian agreement. Opening the link confirms their email.
 *
 * Each of those steps runs `evaluateAthleteSignup`. When nothing is left
 * (signup-rules.ts `signupVerdict`), the system verifies the guardian (a
 * minor's), moves the athlete SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE
 * through the one state machine (as the auto-approval system actor, which
 * the §37 guardian gate still checks), opens their logins, and emails the
 * athlete, the guardian and BTG's admins — BTG with a link to New sign-ups.
 * A likely duplicate, an address that already has a login, a rejected
 * guardian or the staff-confirmation setting holds it in BTG's queue with
 * the reason instead — and BTG is emailed the same link.
 *
 * BTG's manual review is untouched: a held athlete still sits SUBMITTED in
 * the applications desk (/admin/applications), and BTG approves, asks for
 * changes or rejects there — or approves from New sign-ups (signups-desk.ts).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS, type AuditActor } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { athleteNotificationKey, send } from "../lib/email";
import { issueIntakeToken } from "../lib/intake-token";
import { issueAthleteEmailToken, issueGuardianSetupToken, readAthleteEmailToken } from "../lib/signup-token";
import { missingApplicationFields } from "../contracts/athlete";
import { transitionAthleteIn, type SystemActor, type TransitionActor } from "./athlete";
import { IllegalTransitionError, type AthleteState } from "./athlete-state";
import { provisionAthleteLoginsIn } from "./athlete-login";
import { requiresGuardian, GUARDIAN_RELATIONSHIPS, type GuardianRelationship } from "./guardian-rules";
import { GUARDIAN_AGREEMENT_KIND } from "./agreement";
import { documentsOf, finishAccountDocument, startAccountDocument, uploadedKinds } from "./account-documents";
import { signupMissing, signupVerdict, idKindFor, STAFF_CONFIRM_REASON, type AthleteFacts, type GuardianProofKind, type SignupVerdict } from "./signup-rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export class SignupError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SignupError";
    this.status = status;
  }
}

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const AUTO = (tenantId: string): SystemActor => ({ system: true, tenantId, userId: null, signupChecksPassed: true });
export const appUrl = () => env.APP_URL.replace(/\/+$/, "");
export const firstNameOf = (legalName: string, displayName: string) => (legalName.trim() || displayName.trim()).split(/\s+/)[0] ?? "";

/** While the applicant may still add documents and a guardian — before a decision. */
const OPEN_STATES: readonly AthleteState[] = ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "UNDER_REVIEW"];

export const ATHLETE_SELECT = {
  id: true, tenantId: true, state: true, legalName: true, displayName: true, email: true, phone: true, sport: true, stateCode: true,
  countryCode: true, birthDate: true, ageBand: true, majorityAge: true, majorityKnown: true, guardianId: true,
  emailConfirmedAt: true, reviewReasons: true, autoApproved: true, signupRejectedAt: true, createdAt: true,
  guardian: { select: { id: true, legalName: true, email: true, relationship: true, phone: true, emailConfirmedAt: true, verifiedAt: true, rejectedAt: true } },
} as const;
export type SignupAthlete = Prisma.AthleteGetPayload<{ select: typeof ATHLETE_SELECT }>;

async function loadAthlete(db: Db, athleteId: string, tenantId?: string): Promise<SignupAthlete | null> {
  return db.athlete.findFirst({
    /* tenant-scope: the athlete named by a signed link or a job, found by id; a caller with a tenant passes it. */
    where: { id: athleteId, ...(tenantId ? { tenantId } : {}) }, select: ATHLETE_SELECT,
  });
}

/** Has this guardian accepted the guardian agreement for this athlete? */
export async function guardianAgreed(db: Db, tenantId: string, athleteId: string, guardianId: string): Promise<Date | null> {
  const row = await db.agreementAcceptance.findFirst({
    where: { tenantId, athleteId, guardianId, agreement: { is: { kind: GUARDIAN_AGREEMENT_KIND } } },
    select: { acceptedAt: true }, orderBy: { acceptedAt: "desc" },
  });
  return row?.acceptedAt ?? null;
}

/** Everything the verdict weighs, read from where it is recorded. */
export async function signupFacts(db: Db, a: SignupAthlete): Promise<AthleteFacts> {
  const minor = requiresGuardian(a);
  const [kinds, gKinds, agreed, dupes, login, tenant] = await Promise.all([
    uploadedKinds(db, { tenantId: a.tenantId, athleteId: a.id }),
    a.guardian ? uploadedKinds(db, { tenantId: a.tenantId, guardianId: a.guardian.id }) : Promise.resolve(new Set<string>()),
    a.guardian ? guardianAgreed(db, a.tenantId, a.id, a.guardian.id) : Promise.resolve(null),
    likelyDuplicates(db, a),
    a.email
      ? db.user.findFirst({
          /* tenant-scope: identity is global — a sign-in is claimed by email across every tenant (athlete-login.ts). */
          where: { email: { equals: a.email, mode: "insensitive" }, NOT: { athleteId: a.id } }, select: { id: true },
        })
      : Promise.resolve(null),
    db.tenant.findFirst({ where: { id: a.tenantId }, select: { staffConfirmMinors: true } }),
  ]);
  return {
    missingFields: missingApplicationFields(a),
    hasBirthDate: Boolean(a.birthDate),
    emailConfirmed: Boolean(a.emailConfirmedAt),
    minor,
    idUploaded: minor ? kinds.has("SCHOOL_ID") || kinds.has("GOVERNMENT_ID") : kinds.has("GOVERNMENT_ID"),
    guardian: a.guardian
      ? {
          name: a.guardian.legalName,
          emailConfirmed: Boolean(a.guardian.emailConfirmedAt),
          idUploaded: gKinds.has("GUARDIAN_ID"),
          proofUploaded: gKinds.has("GUARDIANSHIP_PROOF"),
          agreementAccepted: Boolean(agreed),
          rejected: Boolean(a.guardian.rejectedAt),
        }
      : null,
    duplicates: dupes,
    emailInUse: Boolean(login),
    staffConfirmMinors: tenant?.staffConfirmMinors ?? false,
  };
}

/** The same email, or the same legal name and date of birth, as another athlete in the tenant. */
async function likelyDuplicates(db: Db, a: SignupAthlete): Promise<string[]> {
  const or: Prisma.AthleteWhereInput[] = [];
  if (a.email) or.push({ email: { equals: a.email, mode: "insensitive" } });
  if (a.birthDate && a.legalName.trim()) or.push({ legalName: { equals: a.legalName.trim(), mode: "insensitive" }, birthDate: a.birthDate });
  if (!or.length) return [];
  const rows = await db.athlete.findMany({
    where: { tenantId: a.tenantId, id: { not: a.id }, OR: or },
    select: { legalName: true, displayName: true, email: true, birthDate: true }, take: 5, orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => {
    const sameEmail = a.email && r.email && r.email.toLowerCase() === a.email.toLowerCase();
    return `${sameEmail ? "same email as" : "same name and date of birth as"} ${r.legalName || r.displayName}`;
  });
}

/* ═══════════════════════ the checks, and the approval ════════════════ */

/**
 * Run the automatic checks on one athlete: approve them, hold them for BTG
 * with the reasons, or leave them waiting on the applicant. Safe to run any
 * number of times, concurrently: the state machine's conditional update
 * lets exactly one approval land.
 */
export async function evaluateAthleteSignup(athleteId: string): Promise<SignupVerdict | { outcome: "decided" }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const a = await loadAthlete(tx, athleteId);
      /* 2S1-BE-14 — an approved minor who named a guardian after approval (a
         profile edit): the guardian's own page verifies them the same way. */
      if (a && !a.signupRejectedAt && (a.state === "APPROVED" || a.state === "ACTIVE") && a.guardian && !a.guardian.verifiedAt) {
        return verifyLateGuardianIn(tx, a);
      }
      if (!a || a.state !== "SUBMITTED" || a.signupRejectedAt) return { outcome: "decided" as const };
      const verdict = signupVerdict(await signupFacts(tx, a));
      if (verdict.outcome === "waiting") return verdict;
      if (verdict.outcome === "review") {
        if (verdict.reasons.join("|") !== a.reviewReasons.join("|")) {
          await tx.athlete.update({
            /* tenant-scope: the row loaded above. */
            where: { id: a.id }, data: { reviewReasons: verdict.reasons }, select: { id: true },
          });
          await audit(tx, SYSTEM(a.tenantId), "athlete.needsReview", "Athlete", a.id, { after: { reasons: verdict.reasons } });
          await tellBtg(tx, a.tenantId, { kind: "athlete", id: a.id, name: a.legalName || a.displayName }, "review", verdict.reasons);
        }
        return verdict;
      }
      await approveSignupIn(tx, a, null);
      return verdict;
    });
  } catch (error) {
    /* Two checks raced to approve the same athlete; the other one won. */
    if (error instanceof IllegalTransitionError) return { outcome: "decided" };
    throw error;
  }
}

/**
 * "BTG staff confirm minors" was switched off: the minors it was holding go
 * through their checks again, so the system approves them as it would have.
 */
export async function recheckStaffHeld(tenantId: string) {
  const held = await prisma.athlete.findMany({
    where: { tenantId, state: "SUBMITTED", reviewReasons: { has: STAFF_CONFIRM_REASON } }, select: { id: true }, take: 500,
  });
  for (const a of held) {
    await prisma.athlete.update({
      /* tenant-scope: found above in this tenant. */
      where: { id: a.id }, data: { reviewReasons: [] }, select: { id: true },
    });
    await evaluateAthleteSignup(a.id);
  }
  return { rechecked: held.length };
}

/**
 * A guardian named AFTER the athlete was approved (2S1-BE-14's profile edit):
 * the athlete needs no approval, only the guardian's verification. Once their
 * email is confirmed, their ID and proof are in and the agreement accepted,
 * the system verifies them — unless "BTG staff confirm minors" is on, when
 * BTG is told and a person verifies. The athlete's own checks are not re-run.
 */
async function verifyLateGuardianIn(tx: Tx, a: SignupAthlete): Promise<SignupVerdict | { outcome: "decided" }> {
  const g = a.guardian!;
  if (g.rejectedAt || !requiresGuardian(a)) return { outcome: "decided" };
  const f = await signupFacts(tx, a);
  const missing = signupMissing(f).filter((m) => m.startsWith("your guardian"));
  if (missing.length) return { outcome: "waiting", missing };
  if (f.staffConfirmMinors) {
    await tellBtg(tx, a.tenantId, { kind: "guardian", id: g.id, name: g.legalName }, "review", [STAFF_CONFIRM_REASON]);
    return { outcome: "review", reasons: [STAFF_CONFIRM_REASON] };
  }
  const now = new Date();
  const moved = await tx.guardian.updateMany({
    /* tenant-scope: the athlete's own guardian, loaded with it; only while unverified. */
    where: { id: g.id, tenantId: a.tenantId, verifiedAt: null }, data: { verifiedAt: now, autoVerified: true },
  });
  if (moved.count !== 1) return { outcome: "decided" };
  await audit(tx, SYSTEM(a.tenantId), "guardian.autoVerify", "Guardian", g.id, {
    after: { verifiedAt: now.toISOString(), athleteId: a.id, namedAfterApproval: true, evidence: `guardian confirmed by email, with ID and proof, at ${now.toISOString()}` },
  });
  await send(tx, a.tenantId, {
    template: "guardian.approved", to: g.email,
    data: { firstName: g.legalName.split(/\s+/)[0] ?? "", athleteFirstName: firstNameOf(a.legalName, a.displayName), portalUrl: `${appUrl()}/athlete` },
    idempotencyKey: `guardian.approved:${g.id}:${a.id}`,
  });
  await tellBtg(tx, a.tenantId, { kind: "guardian", id: g.id, name: g.legalName }, "approved", []);
  return { outcome: "approve" };
}

/** Every athlete a guardian's step may have completed — sign-ups, and approved minors waiting on this guardian. */
export async function evaluateGuardianWards(guardianId: string, tenantId: string) {
  const wards = await prisma.athlete.findMany({
    where: { tenantId, guardianId, OR: [{ state: "SUBMITTED" }, { state: { in: ["APPROVED", "ACTIVE"] }, guardian: { is: { verifiedAt: null } } }] },
    select: { id: true }, orderBy: { createdAt: "asc" },
  });
  for (const w of wards) await evaluateAthleteSignup(w.id);
}

/**
 * Approve: the guardian verified (a minor's), the athlete through the state
 * machine to ACTIVE, the logins opened, everyone told. `by` is null for the
 * system, or the BTG person approving a held sign-up — the same steps, with
 * their name on them.
 */
export async function approveSignupIn(tx: Tx, a: SignupAthlete, by: Actor | null) {
  const auditActor: AuditActor = by ?? SYSTEM(a.tenantId);
  const actor: TransitionActor = by ?? AUTO(a.tenantId);
  const minor = requiresGuardian(a);
  const now = new Date();

  let guardianNewlyVerified = false;
  if (minor && a.guardian && !a.guardian.verifiedAt) {
    const agreedAt = await guardianAgreed(tx, a.tenantId, a.id, a.guardian.id);
    await tx.guardian.update({
      /* tenant-scope: the athlete's own guardian, loaded with it. */
      where: { id: a.guardian.id }, data: { verifiedAt: now, autoVerified: by === null }, select: { id: true },
    });
    /* The evidence the legal question will ask about, recorded where it can be found. */
    await audit(tx, auditActor, by ? AUDIT_ACTIONS.guardian.verify : "guardian.autoVerify", "Guardian", a.guardian.id, {
      after: {
        verifiedAt: now.toISOString(), athleteId: a.id,
        evidence: `guardian confirmed by email, with ID and proof, at ${now.toISOString()}`,
        emailConfirmedAt: a.guardian.emailConfirmedAt?.toISOString() ?? null, agreementAcceptedAt: agreedAt?.toISOString() ?? null,
      },
    });
    guardianNewlyVerified = true;
  }

  let state = a.state as AthleteState;
  if (state === "SUBMITTED") state = (await transitionAthleteIn(tx, actor, a.id, "UNDER_REVIEW")).state;
  if (state === "UNDER_REVIEW") state = (await transitionAthleteIn(tx, actor, a.id, "APPROVED")).state;
  if (state === "APPROVED") await transitionAthleteIn(tx, actor, a.id, "ACTIVE");

  await tx.athlete.update({
    /* tenant-scope: the row the caller loaded. */
    where: { id: a.id }, data: { autoApproved: by === null, reviewReasons: [] }, select: { id: true },
  });
  const login = await provisionAthleteLoginsIn(tx, auditActor, a.id);
  await audit(tx, auditActor, by ? "athlete.signupApprove" : "athlete.autoApprove", "Athlete", a.id, {
    after: { minor, guardianId: a.guardianId, login },
  });

  if (a.email) {
    await send(tx, a.tenantId, {
      template: "athlete.approved", to: a.email,
      data: { firstName: firstNameOf(a.legalName, a.displayName), portalUrl: `${appUrl()}/athlete` },
      idempotencyKey: athleteNotificationKey("athlete.approved", a.id, "APPROVED"),
    });
  }
  if (minor && a.guardian) {
    await send(tx, a.tenantId, {
      template: "guardian.approved", to: a.guardian.email,
      data: { firstName: a.guardian.legalName.split(/\s+/)[0] ?? "", athleteFirstName: firstNameOf(a.legalName, a.displayName), portalUrl: `${appUrl()}/athlete` },
      idempotencyKey: `guardian.approved:${a.guardian.id}:${a.id}`,
    });
  }
  await tellBtg(tx, a.tenantId, { kind: "athlete", id: a.id, name: a.legalName || a.displayName }, by ? "approved-by-btg" : "approved", []);
  if (guardianNewlyVerified && a.guardian) {
    await tellBtg(tx, a.tenantId, { kind: "guardian", id: a.guardian.id, name: a.guardian.legalName }, by ? "approved-by-btg" : "approved", []);
  }
}

/** BTG admins, told about every new athlete and guardian — approved, or waiting for them. */
export async function tellBtg(
  tx: Tx, tenantId: string, who: { kind: "athlete" | "guardian"; id: string; name: string },
  outcome: "approved" | "approved-by-btg" | "review", reasons: string[],
) {
  if (outcome === "approved-by-btg") return; // a BTG person did it; they know
  const staff = await tx.user.findMany({
    where: { tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } }, select: { id: true, email: true },
  });
  const signature = reasons.join("|").slice(0, 200);
  for (const u of staff) {
    await send(tx, tenantId, {
      template: "signup.newSignup", to: u.email,
      idempotencyKey: `signup.newSignup:${who.kind}:${who.id}:${outcome}:${signature}:${u.id}`,
      data: {
        kindWord: who.kind === "athlete" ? "athlete" : "guardian", name: who.name,
        outcome: outcome === "approved" ? "was approved automatically" : "needs your review",
        reasons: reasons.map((r) => `• ${r}`).join("\n"),
        reviewUrl: `${appUrl()}/admin/new-signups/${who.kind}s/${who.id}`,
      },
    });
  }
}

/* ═══════════════════════ at submission ════════════════════════════════ */

export type GuardianNaming = { legalName: string; email: string; relationship: GuardianRelationship; phone?: string | null };

/**
 * Inside the intake's own transaction (application-intake.ts): the minor's
 * guardian, linked and emailed their set-up link. One guardian may look
 * after several athletes, so an address already on file (and not rejected)
 * is that guardian, not a second one.
 */
export async function nameGuardianIn(tx: Tx, a: { id: string; tenantId: string; email: string | null; legalName: string; displayName: string }, g: GuardianNaming) {
  if (!GUARDIAN_RELATIONSHIPS.includes(g.relationship)) throw new SignupError(`A guardian is one of: ${GUARDIAN_RELATIONSHIPS.join(", ")}.`, 422);
  const email = g.email.trim().toLowerCase();
  if (a.email && email === a.email.toLowerCase()) throw new SignupError("Your guardian's email has to be their own, not yours.", 422);
  const existing = await tx.guardian.findFirst({
    where: { tenantId: a.tenantId, email: { equals: email, mode: "insensitive" }, rejectedAt: null },
    select: { id: true, legalName: true, email: true },
  });
  const guardian = existing ?? await tx.guardian.create({
    data: { tenantId: a.tenantId, legalName: g.legalName.trim(), email, phone: g.phone?.trim() || null, relationship: g.relationship },
    select: { id: true, legalName: true, email: true },
  });
  await tx.athlete.update({
    /* tenant-scope: the applicant's own row, in the intake tenant. */
    where: { id: a.id }, data: { guardianId: guardian.id }, select: { id: true },
  });
  await audit(tx, SYSTEM(a.tenantId), AUDIT_ACTIONS.guardian.link, "Athlete", a.id, {
    after: { guardianId: guardian.id, relationship: g.relationship, existingGuardian: Boolean(existing) },
  });
  await sendGuardianSetupEmail(tx, a, guardian, 0);
  return guardian;
}

export async function sendGuardianSetupEmail(
  tx: Tx, a: { id: string; tenantId: string; legalName: string; displayName: string }, g: { id: string; legalName: string; email: string }, attempt: number,
) {
  await send(tx, a.tenantId, {
    template: "guardian.setup", to: g.email,
    idempotencyKey: `guardian.setup:${g.id}:${a.id}:${attempt}`,
    data: {
      firstName: g.legalName.split(/\s+/)[0] ?? "", athleteName: a.legalName || a.displayName, athleteFirstName: firstNameOf(a.legalName, a.displayName),
      setupUrl: `${appUrl()}/guardian/setup?t=${encodeURIComponent(issueGuardianSetupToken(g.id, a.id))}`,
    },
  });
}

/** The receipt's confirmation link — the athlete reads this mailbox. */
export function athleteConfirmUrl(athleteId: string): string {
  return `${appUrl()}/join/confirm?t=${encodeURIComponent(issueAthleteEmailToken(athleteId))}`;
}

/* ═══════════════════════ the applicant's side (by intake token) ═══════ */

async function applicant(athleteId: string): Promise<SignupAthlete> {
  const a = await loadAthlete(prisma, athleteId, env.PUBLIC_INTAKE_TENANT_ID);
  if (!a) throw new SignupError("No application matches that link.", 404);
  return a;
}

function assertOpen(a: SignupAthlete) {
  if (!OPEN_STATES.includes(a.state as AthleteState) || a.signupRejectedAt) {
    throw new SignupError("This application has already been decided — nothing more is needed here.");
  }
}

/** What the applicant sees: where they stand, and what is still needed. */
export async function signupStatus(athleteId: string) {
  const a = await applicant(athleteId);
  const facts = await signupFacts(prisma, a);
  const docs = await documentsOf(prisma, { tenantId: a.tenantId, athleteId: a.id });
  const approved = a.state === "APPROVED" || a.state === "ACTIVE";
  const decided = !OPEN_STATES.includes(a.state as AthleteState) || Boolean(a.signupRejectedAt);
  return {
    id: a.id,
    state: a.state as AthleteState,
    firstName: firstNameOf(a.legalName, a.displayName),
    email: a.email,
    emailConfirmed: facts.emailConfirmed,
    minor: facts.minor,
    majorityAge: a.majorityAge,
    idKind: idKindFor(facts.minor),
    idUploaded: facts.idUploaded,
    documents: docs.filter((d) => d.uploadedAt).map((d) => ({ id: d.id, kind: d.kind, filename: d.filename, uploadedAt: d.uploadedAt })),
    guardian: a.guardian && facts.guardian
      ? {
          name: a.guardian.legalName, email: a.guardian.email, relationship: a.guardian.relationship,
          emailConfirmed: facts.guardian.emailConfirmed, idUploaded: facts.guardian.idUploaded, proofUploaded: facts.guardian.proofUploaded,
          agreementAccepted: facts.guardian.agreementAccepted, approved: Boolean(a.guardian.verifiedAt),
        }
      : null,
    missing: decided ? [] : signupMissing(facts),
    approved,
    /* The applicant is told it is with BTG, never BTG's internal reasons. */
    underReview: !decided && a.state === "SUBMITTED" && a.reviewReasons.length > 0,
    closed: decided && !approved,
  };
}

/** The link in the receipt: proves the mailbox, then the checks run. */
export async function confirmAthleteEmail(emailToken: string) {
  const id = readAthleteEmailToken(emailToken);
  if (!id) throw new SignupError("This confirmation link is not valid.", 400);
  const a = await applicant(id);
  if (!a.emailConfirmedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.athlete.update({
        /* tenant-scope: the athlete named inside the signed email token, in the intake tenant. */
        where: { id: a.id }, data: { emailConfirmedAt: new Date() }, select: { id: true },
      });
      await audit(tx, SYSTEM(a.tenantId), "athlete.emailConfirmed", "Athlete", a.id, { after: { email: a.email } });
    });
  }
  await evaluateAthleteSignup(a.id);
  /* Opening the emailed link proves the mailbox, so it may carry on from any device. */
  return { status: await signupStatus(a.id), continuationToken: issueIntakeToken(a.id) };
}

/** Send the confirmation email again (a new key, so it really sends). */
export async function resendAthleteEmail(athleteId: string) {
  const a = await applicant(athleteId);
  assertOpen(a);
  if (a.emailConfirmedAt) return signupStatus(a.id);
  if (!a.email) throw new SignupError("There is no email on this application.", 422);
  const sent = await prisma.outboxJob.count({
    where: { tenantId: a.tenantId, name: "notify.email", payload: { path: ["idempotencyKey"], string_starts_with: `athlete.confirmEmail:${a.id}:` } },
  });
  if (sent >= 5) throw new SignupError("We've sent this a few times already — check your spam folder, or contact BTG.", 429);
  await prisma.$transaction((tx) => send(tx, a.tenantId, {
    template: "athlete.confirmEmail", to: a.email!, idempotencyKey: `athlete.confirmEmail:${a.id}:${sent + 1}`,
    data: { firstName: firstNameOf(a.legalName, a.displayName), confirmUrl: athleteConfirmUrl(a.id) },
  }));
  return signupStatus(a.id);
}

/** Step one of the ID upload. A minor's is a school ID (a government ID is accepted too). */
export async function requestAthleteDocument(athleteId: string, input: { kind: "GOVERNMENT_ID" | "SCHOOL_ID"; filename: string; contentType: string; bytes: number }) {
  const a = await applicant(athleteId);
  assertOpen(a);
  if (input.kind === "SCHOOL_ID" && !requiresGuardian(a)) throw new SignupError("An adult uploads a government ID.", 422);
  return startAccountDocument({ tenantId: a.tenantId, athleteId: a.id }, input);
}

/** Step two: counted only if it is there; then the checks run. */
export async function confirmAthleteDocument(athleteId: string, documentId: string) {
  const a = await applicant(athleteId);
  await finishAccountDocument({ tenantId: a.tenantId, athleteId: a.id }, documentId);
  await evaluateAthleteSignup(a.id);
  return signupStatus(a.id);
}

/**
 * A minor names their guardian after applying — the wizard decides "minor"
 * at 18, and a place whose age is higher (Alabama's 19) finds out here. Or
 * changes the guardian they named, until that guardian has been approved.
 */
export async function nameGuardianAfterApplying(athleteId: string, g: GuardianNaming) {
  const a = await applicant(athleteId);
  assertOpen(a);
  if (!requiresGuardian(a)) throw new SignupError("You're an adult where you live, so no guardian is needed.", 422);
  if (a.guardian?.verifiedAt) throw new SignupError("Your guardian is already approved. To change them, contact BTG.");
  await prisma.$transaction((tx) => nameGuardianIn(tx, a, g));
  return signupStatus(a.id);
}

/** Email the guardian their set-up link again. */
export async function resendGuardianEmail(athleteId: string) {
  const a = await applicant(athleteId);
  assertOpen(a);
  if (!a.guardian) throw new SignupError("Name your guardian first.", 422);
  const sent = await prisma.outboxJob.count({
    where: { tenantId: a.tenantId, name: "notify.email", payload: { path: ["idempotencyKey"], string_starts_with: `guardian.setup:${a.guardian.id}:${a.id}:` } },
  });
  if (sent >= 5) throw new SignupError("We've emailed your guardian a few times already — ask them to check their spam folder, or contact BTG.", 429);
  await prisma.$transaction((tx) => sendGuardianSetupEmail(tx, a, a.guardian!, sent));
  return signupStatus(a.id);
}

export type { GuardianProofKind };
