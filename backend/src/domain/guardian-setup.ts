/**
 * The guardian's own page — 2S1-BE-10 (the screen is /guardian/setup,
 * 2S1-FE-06).
 *
 * A minor who applies names a guardian, who is emailed a link carrying a
 * signed token (signup-token.ts) naming the guardian and that athlete. The
 * page, with no login:
 *
 *   - OPENING the link confirms the guardian's email — the token travelled
 *     only inside that email, so using it proves the mailbox;
 *   - the guardian's details: name, relationship, phone;
 *   - their government ID and their proof of guardianship (a birth
 *     certificate naming them, a court order, or a school record), straight
 *     to the private bucket;
 *   - the guardian agreement, accepted with §12's evidence (agreement.ts
 *     `recordGuardianAcceptanceIn`) — once per athlete they look after.
 *
 * Every step runs the athlete's automatic checks (athlete-signup.ts): once
 * both emails are confirmed, the guardian's ID and proof and the minor's ID
 * are in and the agreement is accepted, both are approved with no BTG step
 * — unless the tenant's "BTG staff confirm minors" setting is on.
 *
 * The token is not authentication: it grants no role and reaches nothing
 * but this guardian's set-up for this athlete.
 */
import { readFile } from "node:fs/promises";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { readGuardianSetupToken } from "../lib/signup-token";
import { hashAgreementBody } from "./agreement-hash";
import { agreementFile, loadAgreementBody } from "./agreement-text";
import { GUARDIAN_AGREEMENT_KIND, recordGuardianAcceptanceIn } from "./agreement";
import { documentsOf, finishAccountDocument, startAccountDocument } from "./account-documents";
import { evaluateAthleteSignup, evaluateGuardianWards, firstNameOf, guardianAgreed, signupFacts, SignupError } from "./athlete-signup";
import { GUARDIAN_RELATIONSHIPS, requiresGuardian, type GuardianRelationship } from "./guardian-rules";
import { signupMissing, type GuardianProofKind } from "./signup-rules";

type Tx = Prisma.TransactionClient;

/** The guardian and the athlete a set-up link names — or a refusal that says neither exists. */
async function context(token: string) {
  const ids = readGuardianSetupToken(token);
  if (!ids) throw new SignupError("This link is not valid. Open the whole link from the email.", 400);
  const athlete = await prisma.athlete.findFirst({
    /* tenant-scope: the athlete named inside a signed set-up token; the guardian must be theirs, in their tenant. */
    where: { id: ids.athleteId, guardianId: ids.guardianId },
    select: {
      id: true, tenantId: true, state: true, legalName: true, displayName: true, email: true, phone: true, sport: true, stateCode: true,
      countryCode: true, birthDate: true, ageBand: true, majorityAge: true, majorityKnown: true, guardianId: true,
      emailConfirmedAt: true, reviewReasons: true, autoApproved: true, signupRejectedAt: true, createdAt: true,
      guardian: { select: { id: true, legalName: true, email: true, relationship: true, phone: true, emailConfirmedAt: true, verifiedAt: true, rejectedAt: true } },
    },
  });
  if (!athlete?.guardian) throw new SignupError("This link is no longer valid — you may no longer be this athlete's guardian. Contact BTG if that's wrong.", 404);
  return { athlete, guardian: athlete.guardian };
}

/**
 * The guardian agreement now in force for the tenant. The text is the file
 * `agreements/GUARDIAN.v<n>.txt`; a tenant with no version yet gets version
 * 1 registered from the file the first time a guardian needs it, so a
 * missing row can never stop a minor's sign-up.
 */
async function currentAgreement(tenantId: string) {
  let row = await prisma.agreement.findFirst({
    where: { tenantId, kind: GUARDIAN_AGREEMENT_KIND }, orderBy: { version: "desc" }, select: { id: true, kind: true, version: true, bodyHash: true },
  });
  if (!row) {
    const file = agreementFile(GUARDIAN_AGREEMENT_KIND, 1);
    const body = file ? await readFile(file, "utf8").catch(() => null) : null;
    if (!body) return null;
    row = await prisma.agreement.upsert({
      where: { tenantId_kind_version: { tenantId, kind: GUARDIAN_AGREEMENT_KIND, version: 1 } },
      create: { tenantId, kind: GUARDIAN_AGREEMENT_KIND, version: 1, bodyHash: hashAgreementBody(body), effectiveAt: new Date() },
      update: {},
      select: { id: true, kind: true, version: true, bodyHash: true },
    });
  }
  const body = await loadAgreementBody(row);
  return body ? { agreementId: row.id, version: row.version, bodyHash: row.bodyHash, body } : null;
}

export type GuardianSetupState = "IN_PROGRESS" | "CHECKING" | "HELD" | "APPROVED" | "REJECTED";

/** What the page shows: whose guardian, what is in, what is still needed. */
export async function guardianSetupStatus(token: string) {
  const { athlete: a, guardian: g } = await context(token);
  const [docs, agreedAt, agreement, facts] = await Promise.all([
    documentsOf(prisma, { tenantId: a.tenantId, guardianId: g.id }),
    guardianAgreed(prisma, a.tenantId, a.id, g.id),
    currentAgreement(a.tenantId),
    signupFacts(prisma, a),
  ]);
  const up = docs.filter((d) => d.uploadedAt);
  const id = up.find((d) => d.kind === "GUARDIAN_ID");
  const proof = up.filter((d) => d.kind === "GUARDIANSHIP_PROOF").at(-1);
  const athleteFirst = firstNameOf(a.legalName, a.displayName);

  const mine: string[] = [];
  if (!g.relationship || !g.legalName.trim()) mine.push("your details");
  if (!id) mine.push("your government ID");
  if (!proof) mine.push("proof you're the guardian");
  if (!agreedAt) mine.push("the guardian agreement");
  /* What is left on the athlete's side, said to the guardian. */
  const theirs = signupMissing(facts)
    .filter((m) => !m.startsWith("your guardian"))
    .map((m) => `${athleteFirst} needs to ${m.replace(/^your /, "their ").replace(" your ", " their ")}`);

  const approved = (a.state === "APPROVED" || a.state === "ACTIVE") && Boolean(g.verifiedAt);
  const state: GuardianSetupState = g.rejectedAt
    ? "REJECTED"
    : approved
      ? "APPROVED"
      : a.state === "SUBMITTED" && a.reviewReasons.length > 0
        ? "HELD"
        : mine.length === 0
          ? "CHECKING"
          : "IN_PROGRESS";

  return {
    athlete: { name: a.legalName || a.displayName, firstName: athleteFirst },
    guardian: {
      name: g.legalName, relationship: (GUARDIAN_RELATIONSHIPS as readonly string[]).includes(g.relationship) ? (g.relationship as GuardianRelationship) : null,
      phone: g.phone, email: g.email, emailConfirmed: Boolean(g.emailConfirmedAt),
    },
    idUploaded: Boolean(id),
    proof: proof ? { kind: proof.proofKind as GuardianProofKind, fileName: proof.filename, uploadedAt: proof.uploadedAt } : null,
    agreement,
    agreementAcceptedAt: agreedAt,
    state,
    missing: mine,
    athleteMissing: theirs,
  };
}

/** Opening the link: confirms the guardian's email, then the checks run. */
export async function openGuardianSetup(token: string) {
  const { athlete: a, guardian: g } = await context(token);
  if (!g.emailConfirmedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.guardian.update({
        /* tenant-scope: the guardian named inside the signed set-up token, the athlete's own. */
        where: { id: g.id }, data: { emailConfirmedAt: new Date() }, select: { id: true },
      });
      await audit(tx, { userId: null, tenantId: a.tenantId }, "guardian.emailConfirmed", "Guardian", g.id, { after: { email: g.email, athleteId: a.id } });
    });
  }
  await evaluateGuardianWards(g.id, a.tenantId);
  return guardianSetupStatus(token);
}

function assertEditable(g: { verifiedAt: Date | null; rejectedAt: Date | null }) {
  if (g.rejectedAt) throw new SignupError("BTG has closed this guardian account. Contact BTG if you think that's wrong.");
}

/** The guardian's details. Once approved, changing them goes through BTG (2S1-BE-14). */
export async function saveGuardianDetails(token: string, input: { legalName: string; relationship: GuardianRelationship; phone?: string | null }) {
  const { athlete: a, guardian: g } = await context(token);
  assertEditable(g);
  if (g.verifiedAt) throw new SignupError("Your details are already approved. To change them, contact BTG.");
  if (!GUARDIAN_RELATIONSHIPS.includes(input.relationship)) throw new SignupError(`A guardian is one of: ${GUARDIAN_RELATIONSHIPS.join(", ")}.`, 422);
  await prisma.$transaction(async (tx: Tx) => {
    await tx.guardian.update({
      /* tenant-scope: the guardian named inside the signed set-up token. */
      where: { id: g.id },
      data: { legalName: input.legalName.trim(), relationship: input.relationship, phone: input.phone?.trim() || null },
      select: { id: true },
    });
    await audit(tx, { userId: null, tenantId: a.tenantId }, "guardian.detailsUpdate", "Guardian", g.id, {
      after: { relationship: input.relationship, legalNameChanged: input.legalName.trim() !== g.legalName, phone: Boolean(input.phone) },
    });
  });
  return guardianSetupStatus(token);
}

/** Step one of the guardian's ID or proof upload: a private-bucket PUT for exactly this file. */
export async function requestGuardianDocument(
  token: string,
  input: { kind: "GUARDIAN_ID" | "GUARDIANSHIP_PROOF"; proofKind?: GuardianProofKind | null; filename: string; contentType: string; bytes: number },
) {
  const { athlete: a, guardian: g } = await context(token);
  assertEditable(g);
  return startAccountDocument({ tenantId: a.tenantId, guardianId: g.id }, input);
}

/** Step two: counted only if it is there; then the checks run for every athlete they look after. */
export async function confirmGuardianDocument(token: string, documentId: string) {
  const { athlete: a, guardian: g } = await context(token);
  await finishAccountDocument({ tenantId: a.tenantId, guardianId: g.id }, documentId);
  await evaluateGuardianWards(g.id, a.tenantId);
  return guardianSetupStatus(token);
}

/** The guardian agreement, accepted for this athlete with §12's evidence; then the checks run. */
export async function acceptGuardianAgreement(token: string, input: { agreementId: string; bodyHashShown: string }, evidence: { ip: string; userAgent: string }) {
  const { athlete: a, guardian: g } = await context(token);
  assertEditable(g);
  if (!requiresGuardian(a)) throw new SignupError(`${firstNameOf(a.legalName, a.displayName)} is an adult where they live, so no guardian agreement is needed.`, 422);
  await prisma.$transaction((tx) => recordGuardianAcceptanceIn(tx, {
    tenantId: a.tenantId, agreementId: input.agreementId, bodyHashShown: input.bodyHashShown,
    athleteId: a.id, guardianId: g.id, ip: evidence.ip, userAgent: evidence.userAgent,
  }));
  await evaluateAthleteSignup(a.id);
  return guardianSetupStatus(token);
}
