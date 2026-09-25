/**
 * The rights ledger — P9-BE-10, spec v2.0 §5.3, §6.1 — and consent with
 * typed subjects, P9-BE-11 / §6.2.
 *
 * ONE LEDGER, THREE POPULATION PATHS. A student's consent, an athlete's or a
 * guardian's consent, and a negotiated BTG or third-party licence all land in
 * `ContentRight`, told apart by `grantorKind`. The capture differs — a guardian
 * ticking a box is not a media licence — but the record must not, because the
 * publication gate is only as reliable as the single place it checks.
 *
 * THE GATE ASKS ONE QUESTION IN ONE QUERY: *which assets in this edition have
 * no right covering this format on this date?* (`rightsGap`). Print and digital
 * are separate permissions, so a digital-first edition clears while print is
 * outstanding.
 *
 * COMMERCIAL REUSE IS NEVER A DEFAULT. BTG content defaults
 * `mayReuseCommercially = false` — editorial use is not a licence to resell
 * journalism inside a sponsor's campaign — and nothing enters a campaign
 * without a right that says so explicitly.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { requiresGuardian } from "./guardian-rules";

export const ASSET_KINDS = ["ARTICLE", "PHOTO", "PHOTO_PACKAGE", "INTERVIEW", "VIDEO", "AD_CREATIVE"] as const;
export const SOURCE_KINDS = ["STUDENT", "ATHLETE", "BTG", "THIRD_PARTY"] as const;
export const GRANTOR_KINDS = ["STUDENT", "ATHLETE", "GUARDIAN", "BTG", "THIRD_PARTY"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export type SourceKind = (typeof SOURCE_KINDS)[number];
export type GrantorKind = (typeof GRANTOR_KINDS)[number];
export type PublishFormat = "DIGITAL" | "PRINT";

const CONSENT_GRANTORS: ReadonlySet<GrantorKind> = new Set(["STUDENT", "ATHLETE", "GUARDIAN"]);

export class RightsError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "RightsError";
    this.status = status;
  }
}

export class CommercialGrantRequiredError extends Error {
  readonly status = 409;
  constructor() {
    super("This asset has no right granting commercial reuse, so it cannot be used in a sponsor's campaign.");
    this.name = "CommercialGrantRequiredError";
  }
}

/* ── edition content ────────────────────────────────────────────────────── */

export async function addEditionAsset(
  actor: Actor,
  editionId: string,
  input: { kind: AssetKind; title: string; sourceKind: SourceKind; studentId?: string | null; athleteId?: string | null; r2Key?: string | null },
): Promise<{ id: string }> {
  assertAllowed(actor, "editionAsset", "write");
  if (input.sourceKind === "STUDENT" && !input.studentId) throw new RightsError("A student's asset names the student.");
  if (input.sourceKind === "ATHLETE" && !input.athleteId) throw new RightsError("An athlete's asset names the athlete.");
  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true },
    });
    if (!edition) throw new ForbiddenError("editionAsset", "write");
    if (input.studentId && !(await tx.student.count({ where: { tenantId: actor.tenantId, id: input.studentId } }))) {
      throw new ForbiddenError("student", "read");
    }
    if (input.athleteId && !(await tx.athlete.count({ where: { tenantId: actor.tenantId, id: input.athleteId } }))) {
      throw new ForbiddenError("athlete", "read");
    }
    const asset = await tx.editionAsset.create({
      data: {
        tenantId: actor.tenantId, editionId, kind: input.kind, title: input.title, sourceKind: input.sourceKind,
        studentId: input.studentId ?? null, athleteId: input.athleteId ?? null, r2Key: input.r2Key ?? null,
      },
      select: { id: true },
    });
    await audit(tx, actor, "editionAsset.create", "EditionAsset", asset.id, { after: { editionId, kind: input.kind, sourceKind: input.sourceKind } });
    return asset;
  });
}

/* ── consent for a subject with no login (P9-BE-11, §6.2) ───────────────── */

/**
 * Record an acceptance whose SUBJECT is an athlete or a student rather than
 * a signed-in User — a featured athlete has no login and a guardian has no
 * account. `userId` stays null; the subject column says whose consent it is,
 * and `guardianId` (unchanged meaning) who signed for a minor. BTG records it
 * from the signed form (the e-signature question is an open legal decision,
 * tracked separately; the record does not depend on how it is answered).
 */
export async function recordSubjectConsent(
  actor: Actor,
  input: {
    agreementId: string; subjectKind: "ATHLETE" | "STUDENT"; subjectId: string;
    guardianId?: string | null; bodyHashShown: string; ip: string; userAgent: string;
  },
): Promise<{ id: string }> {
  assertTenantWide(actor, "agreement", "write");
  return prisma.$transaction(async (tx) => {
    const agreement = await tx.agreement.findFirst({
      where: { tenantId: actor.tenantId, id: input.agreementId }, select: { id: true, kind: true, bodyHash: true },
    });
    if (!agreement) throw new ForbiddenError("agreement", "write");
    if (agreement.bodyHash !== input.bodyHashShown) throw new RightsError("The agreement shown is not the current version.", 409);

    const subject = input.subjectKind === "ATHLETE"
      ? await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: input.subjectId }, select: { birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } } })
      : await tx.student.findFirst({ where: { tenantId: actor.tenantId, id: input.subjectId }, select: { birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } } });
    if (!subject) throw new ForbiddenError("agreement", "write");

    /* A minor's consent is their guardian's to give — the linked, VERIFIED
       guardian, and no one else. */
    if (requiresGuardian(subject)) {
      if (!input.guardianId || input.guardianId !== subject.guardianId || !subject.guardian?.verifiedAt) {
        throw new RightsError("A minor's consent is given by their verified guardian.", 409);
      }
    } else if (input.guardianId) {
      throw new RightsError("An adult consents for themselves.");
    }

    const row = await tx.agreementAcceptance.create({
      data: {
        tenantId: actor.tenantId, agreementId: agreement.id, userId: null,
        ...(input.subjectKind === "ATHLETE" ? { athleteId: input.subjectId } : { studentId: input.subjectId }),
        guardianId: input.guardianId ?? null, bodyHash: agreement.bodyHash, ip: input.ip, userAgent: input.userAgent,
      },
      select: { id: true },
    });
    await audit(tx, actor, "agreement.recordSubjectConsent", "AgreementAcceptance", row.id, {
      after: { kind: agreement.kind, subjectKind: input.subjectKind, subjectId: input.subjectId, guardianId: input.guardianId ?? null },
    });
    return row;
  });
}

/* ── the ledger ─────────────────────────────────────────────────────────── */

export type RightInput = {
  grantorKind: GrantorKind;
  grantorRef: string;
  mayPublishDigital?: boolean;
  mayPublishPrint?: boolean;
  mayPromote?: boolean;
  mayReuseCommercially?: boolean;
  territory?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  attribution?: string | null;
  acceptanceId?: string | null;
  licenseRef?: string | null;
};

/**
 * Grant a right on an asset. Consent grantors must point at an acceptance
 * whose subject IS the asset's maker (a guardian's, signed for them); licence
 * grantors at a contract. Postgres enforces the same shape (CHECK constraints
 * in migration 20260925160000). Commercial reuse by consent needs a
 * COMMERCIAL agreement — a feature consent does not stretch to advertising.
 */
export async function grantRight(actor: Actor, assetId: string, input: RightInput): Promise<{ id: string }> {
  assertTenantWide(actor, "contentRight", "write");
  const consent = CONSENT_GRANTORS.has(input.grantorKind);
  if (consent && (!input.acceptanceId || input.licenseRef)) throw new RightsError("A consent grant points at the acceptance, not a licence.");
  if (!consent && (!input.licenseRef || input.acceptanceId)) throw new RightsError("A licence grant carries a contract reference, not an acceptance.");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new RightsError("A right must end after it starts.");

  return prisma.$transaction(async (tx) => {
    const asset = await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionAsset", "read"), id: assetId },
      select: { id: true, sourceKind: true, studentId: true, athleteId: true },
    });
    if (!asset) throw new ForbiddenError("contentRight", "write");

    if (consent) {
      const acc = await tx.agreementAcceptance.findFirst({
        where: { tenantId: actor.tenantId, id: input.acceptanceId! },
        select: { studentId: true, athleteId: true, guardianId: true, agreement: { select: { kind: true } } },
      });
      if (!acc) throw new ForbiddenError("agreement", "read");
      const madeBy = asset.studentId ?? asset.athleteId;
      const subject = acc.studentId ?? acc.athleteId;
      if (!madeBy || subject !== madeBy) throw new RightsError("That consent is not from the person who made this asset.");
      if (input.grantorKind === "GUARDIAN" && !acc.guardianId) throw new RightsError("A guardian grant needs the guardian's signed consent.");
      if (input.mayReuseCommercially && acc.agreement.kind !== "COMMERCIAL") {
        throw new RightsError("Commercial reuse by consent needs a COMMERCIAL agreement.");
      }
    }

    const right = await tx.contentRight.create({
      data: {
        tenantId: actor.tenantId, assetId, grantorKind: input.grantorKind, grantorRef: input.grantorRef,
        mayPublishDigital: input.mayPublishDigital ?? false,
        mayPublishPrint: input.mayPublishPrint ?? false,
        mayPromote: input.mayPromote ?? false,
        /* Explicit or nothing — for BTG content above all. */
        mayReuseCommercially: input.mayReuseCommercially ?? false,
        territory: input.territory ?? null, startsAt: input.startsAt, endsAt: input.endsAt ?? null,
        attribution: input.attribution ?? null, acceptanceId: input.acceptanceId ?? null, licenseRef: input.licenseRef ?? null,
      },
      select: { id: true },
    });
    await audit(tx, actor, "contentRight.grant", "EditionAsset", assetId, {
      after: { grantorKind: input.grantorKind, digital: !!input.mayPublishDigital, print: !!input.mayPublishPrint, commercial: !!input.mayReuseCommercially },
    });
    return right;
  });
}

export async function listAssets(actor: Actor, editionId: string) {
  assertAllowed(actor, "editionAsset", "read");
  const edition = await prisma.edition.findFirst({ where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true } });
  if (!edition) throw new ForbiddenError("edition", "read");
  return prisma.editionAsset.findMany({
    where: { ...whereFor(actor, "editionAsset", "read"), editionId },
    select: {
      id: true, kind: true, title: true, sourceKind: true, studentId: true, campaignId: true,
      rights: { select: { id: true, grantorKind: true, mayPublishDigital: true, mayPublishPrint: true, mayPromote: true, mayReuseCommercially: true, startsAt: true, endsAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** A right that is in force on `on`. */
function inForce(on: Date): Prisma.ContentRightWhereInput {
  return { startsAt: { lte: on }, OR: [{ endsAt: null }, { endsAt: { gt: on } }] };
}

/**
 * THE GATE: every asset in this edition that has NO right covering `format`
 * on `on`. One query — `NOT EXISTS` over the ledger — so there is one shape
 * of answer and nothing to reconcile. Empty means cleared.
 */
export async function rightsGap(
  tx: Prisma.TransactionClient,
  tenantId: string,
  editionId: string,
  format: PublishFormat,
  on: Date,
): Promise<Array<{ id: string; title: string }>> {
  const flag: Prisma.ContentRightWhereInput = format === "DIGITAL" ? { mayPublishDigital: true } : { mayPublishPrint: true };
  return tx.editionAsset.findMany({
    where: { tenantId, editionId, rights: { none: { ...flag, ...inForce(on) } } },
    select: { id: true, title: true },
  });
}

/**
 * Put an asset inside a sponsor's campaign — a sponsored feature, say. Only
 * with a right, in force now, that grants commercial reuse. BTG content
 * defaults to false, so without an explicit grant this refuses.
 */
export async function useAssetInCampaign(actor: Actor, assetId: string, campaignId: string): Promise<{ assetId: string; campaignId: string }> {
  assertTenantWide(actor, "editionAsset", "write");
  return prisma.$transaction(async (tx) => {
    const asset = await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionAsset", "write"), id: assetId }, select: { id: true },
    });
    if (!asset) throw new ForbiddenError("editionAsset", "write");
    const campaign = await tx.campaign.findFirst({ where: { ...whereFor(actor, "campaign", "read"), id: campaignId }, select: { id: true } });
    if (!campaign) throw new ForbiddenError("campaign", "read");
    const granted = await tx.contentRight.count({
      where: { tenantId: actor.tenantId, assetId, mayReuseCommercially: true, ...inForce(new Date()) },
    });
    if (granted === 0) throw new CommercialGrantRequiredError();
    await tx.editionAsset.update({ where: { id: assetId }, data: { campaignId }, select: { id: true } });
    await audit(tx, actor, "editionAsset.useInCampaign", "EditionAsset", assetId, { after: { campaignId } });
    return { assetId, campaignId };
  });
}
