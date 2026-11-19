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
import { randomUUID } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { AUDIT_ACTIONS, audit, type AuditActor } from "../db/audit";
import { checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, uploadRefusal } from "../lib/storage";
import { ANY_FILE_MAX_BYTES, anyFileType, downloadDisposition, safeFileName } from "../lib/file-formats";
import type { Actor } from "../auth/actor";
import { assertAllowed, assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { guardianControls, requiresGuardian } from "./guardian-rules";
import { CONSENT_KINDS, consentGrant } from "./consent-rights-rules";

type Tx = Prisma.TransactionClient;

/** The system, for what it records on its own (P9-BE-22, -23). */
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

/** P9-BE-25 — DESIGN (a page or a graphic a student designed) is what an approved design assignment becomes. */
export const ASSET_KINDS = ["ARTICLE", "PHOTO", "PHOTO_PACKAGE", "INTERVIEW", "VIDEO", "AD_CREATIVE", "DESIGN"] as const;
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

/* P9-BE-25 — a piece's file, in any format (owner, 2026-11-19). Uploaded
   straight to the private bucket on a grant signed for its exact type and
   size, then checked when the piece is saved: the key must be one this
   edition's grant handed out, and what arrived must be what was signed for. */

const contentKeyPrefix = (tenantId: string, editionId: string) => `edition-content/${tenantId}/${editionId}/`;

/** Published or cancelled: a piece's file can no longer be added. */
const CONTENT_FINAL_STATES = ["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED", "CANCELLED"];

/** POST /editions/{id}/assets/uploads — a grant to upload one file for this edition's content. */
export async function presignEditionContentUpload(
  actor: Actor,
  editionId: string,
  input: { contentType: string; bytes: number },
): Promise<{ url: string; key: string; contentType: string; maxBytes: number }> {
  assertAllowed(actor, "editionAsset", "write");
  const contentType = anyFileType(input.contentType);
  if (!contentType) throw new RightsError("That file's type can't be read — choose the file again.");
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > ANY_FILE_MAX_BYTES) throw new RightsError("Keep the file under 2 GB.");
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true, tenantId: true, state: true },
  });
  if (!edition) throw new ForbiddenError("editionAsset", "write");
  if (edition.state === "CANCELLED") throw new RightsError("This edition was cancelled, so it takes no content.", 409);
  const key = `${contentKeyPrefix(edition.tenantId, edition.id)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, contentType, { entity: "Edition", entityId: edition.id }, {
    contentLength: input.bytes,
    signContentType: true,
  });
  return { url, key, contentType, maxBytes: ANY_FILE_MAX_BYTES };
}

/**
 * The confirm step: the key is under this edition's prefix, a grant for this
 * edition handed it out, no other piece already uses it, and what arrived is
 * the type and exact size that grant signed for — or it is refused (and a
 * wrong file deleted and recorded, lib/storage `checkPrivateUpload`).
 */
async function checkContentFile(
  tx: Tx,
  actor: Actor,
  edition: { id: string; tenantId: string },
  r2Key: string,
): Promise<{ fileType: string; fileBytes: number }> {
  const notOurs = () => new RightsError("That file wasn't uploaded for this edition — upload it again.");
  if (!r2Key.startsWith(contentKeyPrefix(edition.tenantId, edition.id)) || r2Key.includes("..")) throw notOurs();
  const grant = await tx.auditLog.findFirst({
    /* tenant-scope: the grant was audited under the presigning actor's
       tenant — the edition's own (reached through whereFor(edition)), or
       this actor's; keyed by this edition and this key. */
    where: {
      tenantId: { in: [...new Set([edition.tenantId, actor.tenantId])] },
      entity: "Edition", entityId: edition.id,
      action: AUDIT_ACTIONS.storage.privateUploadGrant,
      after: { path: ["key"], equals: r2Key },
    },
    select: { after: true },
    orderBy: { at: "desc" },
  });
  const granted = (grant?.after ?? null) as { contentType?: unknown; bytes?: unknown } | null;
  if (typeof granted?.contentType !== "string" || typeof granted.bytes !== "number") throw notOurs();
  if (await tx.editionAsset.count({ where: { tenantId: edition.tenantId, r2Key } })) {
    throw new RightsError("That file is already another piece's — upload it again for this one.", 409);
  }
  const arrived = await checkPrivateUpload(actor, r2Key,
    { contentType: granted.contentType, bytes: granted.bytes, maxBytes: ANY_FILE_MAX_BYTES },
    { entity: "Edition", entityId: edition.id });
  if (!arrived.ok && arrived.problem === "missing") throw new RightsError(uploadRefusal("missing", "That file"), 409);
  if (!arrived.ok) throw new RightsError(uploadRefusal(arrived, "That file"));
  return { fileType: granted.contentType, fileBytes: arrived.bytes };
}

export async function addEditionAsset(
  actor: Actor,
  editionId: string,
  input: { kind: AssetKind; title: string; sourceKind: SourceKind; studentId?: string | null; athleteId?: string | null; r2Key?: string | null; fileName?: string | null },
): Promise<{ id: string }> {
  assertAllowed(actor, "editionAsset", "write");
  if (input.sourceKind === "STUDENT" && !input.studentId) throw new RightsError("A student's asset names the student.");
  if (input.sourceKind === "ATHLETE" && !input.athleteId) throw new RightsError("An athlete's asset names the athlete.");
  return prisma.$transaction(async (tx) => {
    const edition = await tx.edition.findFirst({
      where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true, tenantId: true, state: true },
    });
    if (!edition) throw new ForbiddenError("editionAsset", "write");
    if (input.r2Key && CONTENT_FINAL_STATES.includes(edition.state)) {
      throw new RightsError("This edition is published or cancelled, so its content can't take new files.", 409);
    }
    if (input.studentId && !(await tx.student.count({ where: { tenantId: actor.tenantId, id: input.studentId } }))) {
      throw new ForbiddenError("student", "read");
    }
    if (input.athleteId && !(await tx.athlete.count({ where: { tenantId: actor.tenantId, id: input.athleteId } }))) {
      throw new ForbiddenError("athlete", "read");
    }
    const file = input.r2Key ? await checkContentFile(tx, actor, edition, input.r2Key) : null;
    const fileName = file ? safeFileName(input.fileName) : null;
    const asset = await tx.editionAsset.create({
      data: {
        tenantId: actor.tenantId, editionId, kind: input.kind, title: input.title, sourceKind: input.sourceKind,
        studentId: input.studentId ?? null, athleteId: input.athleteId ?? null, r2Key: file ? input.r2Key! : null,
        fileType: file?.fileType ?? null, fileBytes: file?.fileBytes ?? null, fileName,
      },
      select: { id: true },
    });
    await audit(tx, actor, "editionAsset.create", "EditionAsset", asset.id, {
      after: { editionId, kind: input.kind, sourceKind: input.sourceKind, ...(file ? { file: { key: input.r2Key, type: file.fileType, bytes: file.fileBytes, name: fileName } } : {}) },
    });
    /* P9-BE-23 — a maker whose consent is already on file: the right is
       recorded now, in this transaction, by the system. */
    await recordConsentRightsIn(tx, actor.tenantId, { assetIds: [asset.id] });
    return asset;
  });
}

/**
 * PUT /edition-assets/{id}/file — P9-BE-25. A file for a piece that has none
 * (content added by title before files could be uploaded). Ad artwork is the
 * sponsor's upload on its slot, and a student's piece carries its draft's
 * file, so neither takes one here. A file once attached isn't swapped: the
 * piece's rights were granted for what it is.
 */
export async function attachEditionAssetFile(
  actor: Actor,
  assetId: string,
  input: { r2Key: string; fileName?: string | null },
): Promise<{ id: string; fileType: string; fileBytes: number; fileName: string | null }> {
  assertAllowed(actor, "editionAsset", "write");
  return prisma.$transaction(async (tx) => {
    const asset = await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionAsset", "write"), id: assetId },
      select: { id: true, tenantId: true, editionId: true, r2Key: true, adSlotId: true, assignment: { select: { id: true } }, edition: { select: { state: true } } },
    });
    if (!asset) throw new ForbiddenError("editionAsset", "write");
    if (asset.adSlotId) throw new RightsError("Ad artwork is uploaded by its sponsor, on the slot.", 409);
    if (asset.assignment) throw new RightsError("A student's piece carries the file from their draft.", 409);
    if (asset.r2Key) throw new RightsError("This piece already has its file.", 409);
    if (CONTENT_FINAL_STATES.includes(asset.edition.state)) {
      throw new RightsError("This edition is published or cancelled, so its content can't take new files.", 409);
    }
    const file = await checkContentFile(tx, actor, { id: asset.editionId, tenantId: asset.tenantId }, input.r2Key);
    const fileName = safeFileName(input.fileName);
    /* Conditional on it still having no file: two attaches racing record one. */
    const { count } = await tx.editionAsset.updateMany({
      where: { id: asset.id, tenantId: asset.tenantId, r2Key: null },
      data: { r2Key: input.r2Key, fileType: file.fileType, fileBytes: file.fileBytes, fileName },
    });
    if (!count) throw new RightsError("This piece already has its file.", 409);
    await audit(tx, actor, "editionAsset.file", "EditionAsset", asset.id, {
      after: { key: input.r2Key, type: file.fileType, bytes: file.fileBytes, name: fileName },
    });
    return { id: asset.id, ...file, fileName };
  });
}

/**
 * GET /edition-assets/{id}/file — P9-BE-25. A short-lived, audited signed
 * read of a piece's file, for whoever reads the piece. A file a browser
 * mustn't open in place (a design file, an HTML page, an SVG) comes back as
 * a download, signed into the link (lib/file-formats.ts).
 */
export async function editionAssetFileUrl(
  actor: Actor,
  assetId: string,
): Promise<{ url: string; fileType: string | null; fileName: string | null; download: boolean }> {
  assertAllowed(actor, "editionAsset", "read");
  const asset = await prisma.editionAsset.findFirst({
    where: { ...whereFor(actor, "editionAsset", "read"), id: assetId },
    select: { id: true, r2Key: true, fileType: true, fileName: true, artworkContentType: true },
  });
  if (!asset) throw new ForbiddenError("editionAsset", "read");
  if (!asset.r2Key) throw new RightsError("This piece has no file.", 404);
  const fileType = asset.fileType ?? asset.artworkContentType ?? null;
  const disposition = downloadDisposition(fileType, asset.fileName);
  const url = await presignPrivateDownload(actor, asset.r2Key, { entity: "EditionAsset", entityId: asset.id }, undefined, disposition);
  return { url, fileType, fileName: asset.fileName, download: disposition !== null };
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
    /* P9-BE-23 — the consent covers what this person already made: their
       existing assets get the right now, in this transaction. */
    await recordConsentRightsIn(tx, actor.tenantId, input.subjectKind === "STUDENT" ? { studentId: input.subjectId } : { athleteId: input.subjectId });
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
  assertRightShape(input);

  return prisma.$transaction(async (tx) => {
    const asset = await tx.editionAsset.findFirst({
      where: { ...whereFor(actor, "editionAsset", "read"), id: assetId },
      select: { id: true, sourceKind: true, studentId: true, athleteId: true },
    });
    if (!asset) throw new ForbiddenError("contentRight", "write");
    return (await grantRightIn(tx, actor, actor.tenantId, asset, input))!;
  });
}

/** The shape every grant must have, before anything is read. Answers
 *  whether it is a consent grant. */
function assertRightShape(input: RightInput): boolean {
  const consent = CONSENT_GRANTORS.has(input.grantorKind);
  if (consent && (!input.acceptanceId || input.licenseRef)) throw new RightsError("A consent grant points at the acceptance, not a licence.");
  if (!consent && (!input.licenseRef || input.acceptanceId)) throw new RightsError("A licence grant carries a contract reference, not an acceptance.");
  if (input.endsAt && input.endsAt <= input.startsAt) throw new RightsError("A right must end after it starts.");
  return consent;
}

/** Recorded by the system, and on what — null when BTG records it by hand. */
export type AutoBasis = "AD_APPROVAL" | "CONSENT";

/**
 * grantRight's validation and write, for an asset already in reach. The one
 * path every right takes — BTG's by hand, and the system's automatic ones
 * (P9-BE-22's ad licence, P9-BE-23's consent) — so the rules cannot drift:
 *
 *   - a consent points at an acceptance whose subject IS the asset's maker;
 *   - a GUARDIAN grant needs the guardian's signed acceptance;
 *   - a minor's consent (P9-BE-23) carries their linked guardian, and that
 *     guardian is verified — checked again here, at grant time, rather than
 *     trusted from when the acceptance was recorded;
 *   - commercial reuse by consent needs a COMMERCIAL agreement.
 *
 * An automatic right is written ON CONFLICT DO NOTHING against the unique
 * indexes in migration 20261004900000 (one ad licence per artwork, one
 * consent right per asset and acceptance): a retry, or two triggers racing,
 * records it once, and the loser answers null and audits nothing.
 */
async function grantRightIn(
  tx: Tx,
  by: AuditActor,
  tenantId: string,
  asset: { id: string; studentId: string | null; athleteId: string | null },
  input: RightInput,
  autoBasis: AutoBasis | null = null,
): Promise<{ id: string } | null> {
  const consent = assertRightShape(input);
  if (consent) {
    const acc = await tx.agreementAcceptance.findFirst({
      where: { tenantId, id: input.acceptanceId! },
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
    const who = acc.studentId
      ? await tx.student.findFirst({
          where: { tenantId, id: acc.studentId },
          select: { birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } },
        })
      : await tx.athlete.findFirst({
          where: { tenantId, id: acc.athleteId! },
          select: { birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardian: { select: { verifiedAt: true } } },
        });
    if (!who) throw new ForbiddenError("agreement", "read");
    if (requiresGuardian(who) && (!acc.guardianId || acc.guardianId !== who.guardianId || !who.guardian?.verifiedAt)) {
      throw new RightsError("A minor's consent is given by their verified guardian.", 409);
    }
  } else if (asset.studentId || asset.athleteId) {
    /* POL-BE-88 — a licence is a contract reference, and nothing about it
       involves a guardian. On a piece a minor made it would clear their work
       for print and the web with no guardian ever asked, so a minor's piece is
       cleared by consent only. An adult maker's piece may still carry a
       licence (a contract signed with them); sponsor artwork has no maker. */
    const maker = asset.studentId
      ? await tx.student.findFirst({ where: { tenantId, id: asset.studentId }, select: { birthDate: true, ageBand: true } })
      : await tx.athlete.findFirst({ where: { tenantId, id: asset.athleteId! }, select: { birthDate: true, ageBand: true, majorityAge: true } });
    if (!maker || requiresGuardian(maker)) {
      throw new RightsError("A minor's piece is cleared by their verified guardian's consent, not a licence.", 409);
    }
  }

  const data: Prisma.ContentRightCreateManyInput = {
    tenantId, assetId: asset.id, grantorKind: input.grantorKind, grantorRef: input.grantorRef,
    mayPublishDigital: input.mayPublishDigital ?? false,
    mayPublishPrint: input.mayPublishPrint ?? false,
    mayPromote: input.mayPromote ?? false,
    /* Explicit or nothing — for BTG content above all. */
    mayReuseCommercially: input.mayReuseCommercially ?? false,
    territory: input.territory ?? null, startsAt: input.startsAt, endsAt: input.endsAt ?? null,
    attribution: input.attribution ?? null, acceptanceId: input.acceptanceId ?? null, licenseRef: input.licenseRef ?? null,
    autoBasis,
  };
  let right: { id: string } | null;
  if (autoBasis) {
    const { count } = await tx.contentRight.createMany({ data: [data], skipDuplicates: true });
    if (count === 0) return null;
    right = await tx.contentRight.findFirst({
      where: { tenantId, assetId: asset.id, autoBasis, ...(input.acceptanceId ? { acceptanceId: input.acceptanceId } : {}) },
      select: { id: true },
    });
    if (!right) return null;
  } else {
    right = await tx.contentRight.create({ data, select: { id: true } });
  }
  await audit(tx, by, autoBasis ? "contentRight.autoGrant" : "contentRight.grant", "EditionAsset", asset.id, {
    after: {
      grantorKind: input.grantorKind,
      digital: !!input.mayPublishDigital, print: !!input.mayPublishPrint, commercial: !!input.mayReuseCommercially,
      ...(autoBasis ? { rightId: right.id, autoBasis, acceptanceId: input.acceptanceId ?? null, licenseRef: input.licenseRef ?? null } : {}),
    },
  });
  return right;
}

/* ── rights recorded automatically (P9-BE-22, -23) ──────────────────────── */

/**
 * P9-BE-22 — the sponsor's licence for its own ad artwork, recorded by the
 * system in the transaction where the sponsor approves it. Without it every
 * sold ad stopped production at the rights gate, waiting on BTG to type in a
 * licence that the sale and the sign-off already are.
 *
 *   - THIRD_PARTY (the advertiser's own work), digital and print.
 *   - For the edition's run: the asset is this edition's alone, so the right
 *     reaches no other edition. It starts at the earlier of the sign-off and
 *     the edition's publish and print dates — so it covers the whole run even
 *     when the sponsor signs off late — and does not end: a digital edition
 *     stays readable.
 *   - No promotion, no commercial reuse: a licence to run the ad in this
 *     edition is not a licence to reuse it anywhere else.
 *   - `licenseRef` names the sale and the sign-off together — the campaign
 *     that bought the slot, the slot, and the artwork version the sponsor
 *     approved. The sponsor's own audited approval of that exact file is the
 *     grant; there is no separate "ad terms" acceptance to point at (a NEXT
 *     ad is bought through a BTG-approved brief, not a click-through order).
 *
 * Idempotent: one per artwork (unique index); a second call records nothing
 * and answers null.
 */
export async function recordAdLicenceIn(
  tx: Tx,
  tenantId: string,
  artwork: {
    id: string; version: number; slotId: string; campaignId: string; sponsorName: string;
    edition: { publishTarget: Date; printDate: Date | null };
  },
  at: Date = new Date(),
): Promise<{ id: string } | null> {
  const run = [at, artwork.edition.publishTarget, ...(artwork.edition.printDate ? [artwork.edition.printDate] : [])];
  return grantRightIn(
    tx,
    SYSTEM(tenantId),
    tenantId,
    { id: artwork.id, studentId: null, athleteId: null },
    {
      grantorKind: "THIRD_PARTY",
      grantorRef: artwork.sponsorName,
      mayPublishDigital: true,
      mayPublishPrint: true,
      startsAt: new Date(Math.min(...run.map((d) => d.getTime()))),
      licenseRef: `ad-approval:campaign/${artwork.campaignId}/slot/${artwork.slotId}/v${artwork.version}`,
    },
    "AD_APPROVAL",
  );
}

/**
 * P9-BE-23 — record the consent rights a maker's consents in force already
 * give, as the system, through grantRightIn's validation. Triggered when an
 * asset is added (`assetIds`) and when a consent is recorded (that maker's
 * existing assets). Idempotent: an asset that already has a right on that
 * acceptance — automatic or BTG's — gets nothing more.
 *
 * Only an asset with a maker (a student or an athlete; the student, where
 * both are named, as grantRight reads it). A consent is in force when its
 * agreement is the CURRENT version of its kind — effective now and not
 * superseded — and it was given on that version's exact text.
 * `consent-rights-rules.ts` decides what each consent covers and who may
 * give it.
 */
export async function recordConsentRightsIn(
  tx: Tx,
  tenantId: string,
  scope: { assetIds: string[] } | { studentId: string } | { athleteId: string },
): Promise<string[]> {
  const where: Prisma.EditionAssetWhereInput =
    "assetIds" in scope ? { tenantId, id: { in: scope.assetIds } }
      : "studentId" in scope ? { tenantId, studentId: scope.studentId }
        : { tenantId, athleteId: scope.athleteId, studentId: null };
  const assets = (await tx.editionAsset.findMany({
    /* tenant-scope: every branch of `where` above carries tenantId. */
    where,
    select: { id: true, studentId: true, athleteId: true },
  }))
    .filter((a) => a.studentId || a.athleteId);
  if (!assets.length) return [];

  const current = new Map<string, string>();
  for (const a of await tx.agreement.findMany({
    where: { tenantId, kind: { in: CONSENT_KINDS }, effectiveAt: { lte: new Date() } },
    select: { id: true, kind: true },
    orderBy: [{ kind: "asc" }, { version: "desc" }],
  })) if (!current.has(a.kind)) current.set(a.kind, a.id);

  const byMaker = new Map<string, typeof assets>();
  for (const a of assets) {
    const key = a.studentId ? `S:${a.studentId}` : `A:${a.athleteId}`;
    byMaker.set(key, [...(byMaker.get(key) ?? []), a]);
  }

  const created: string[] = [];
  for (const [key, own] of byMaker) {
    const isStudent = key.startsWith("S:");
    const makerId = key.slice(2);
    /* A minor — or, for an athlete, one their guardian still acts for (the
       coming-of-age allowance): their consent is the guardian's to give. */
    let maker: { displayName: string; birthDate: Date | null; ageBand: string | null; guardianId: string | null; guardian: { verifiedAt: Date | null } | null; minor: boolean } | null = null;
    if (isStudent) {
      const s = await tx.student.findFirst({
        where: { tenantId, id: makerId },
        select: { displayName: true, birthDate: true, ageBand: true, guardianId: true, guardian: { select: { verifiedAt: true } } },
      });
      if (s) maker = { ...s, minor: requiresGuardian(s) };
    } else {
      const a = await tx.athlete.findFirst({
        where: { tenantId, id: makerId },
        select: {
          displayName: true, birthDate: true, ageBand: true, majorityAge: true, guardianId: true, guardian: { select: { verifiedAt: true } },
          comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
        },
      });
      if (a) maker = { ...a, minor: guardianControls(a) };
    }
    if (!maker) continue;
    const acceptances = await tx.agreementAcceptance.findMany({
      where: {
        tenantId, ...(isStudent ? { studentId: makerId } : { athleteId: makerId }),
        agreement: { is: { tenantId, kind: { in: CONSENT_KINDS } } },
      },
      select: { id: true, guardianId: true, bodyHash: true, acceptedAt: true, agreement: { select: { id: true, kind: true, bodyHash: true } } },
      orderBy: { acceptedAt: "asc" },
    });
    const minor = maker.minor;
    for (const acc of acceptances) {
      const decision = consentGrant({
        agreementKind: acc.agreement.kind,
        inForce: current.get(acc.agreement.kind) === acc.agreement.id && acc.bodyHash === acc.agreement.bodyHash,
        makerKind: isStudent ? "STUDENT" : "ATHLETE",
        ageKnown: Boolean(maker.birthDate || maker.ageBand),
        minor,
        acceptanceGuardianId: acc.guardianId,
        makerGuardianId: maker.guardianId,
        guardianVerified: Boolean(maker.guardian?.verifiedAt),
      });
      if (!decision.grant) continue;
      for (const asset of own) {
        if (await tx.contentRight.count({ where: { tenantId, assetId: asset.id, acceptanceId: acc.id } })) continue;
        const right = await grantRightIn(
          tx,
          SYSTEM(tenantId),
          tenantId,
          asset,
          {
            grantorKind: decision.grantorKind,
            grantorRef: maker.displayName,
            mayPublishDigital: decision.mayPublishDigital,
            mayPublishPrint: decision.mayPublishPrint,
            mayReuseCommercially: decision.mayReuseCommercially,
            startsAt: acc.acceptedAt,
            acceptanceId: acc.id,
          },
          "CONSENT",
        );
        if (right) created.push(right.id);
      }
    }
  }
  return created;
}

export async function listAssets(actor: Actor, editionId: string) {
  assertAllowed(actor, "editionAsset", "read");
  const edition = await prisma.edition.findFirst({ where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true } });
  if (!edition) throw new ForbiddenError("edition", "read");
  const rows = await prisma.editionAsset.findMany({
    where: { ...whereFor(actor, "editionAsset", "read"), editionId },
    select: {
      id: true, kind: true, title: true, sourceKind: true, studentId: true, campaignId: true,
      /* P9-BE-25 — whether it has a file, and what; the key itself stays server-side. */
      r2Key: true, fileType: true, fileBytes: true, fileName: true, artworkContentType: true,
      rights: { select: { id: true, grantorKind: true, mayPublishDigital: true, mayPublishPrint: true, mayPromote: true, mayReuseCommercially: true, startsAt: true, endsAt: true, autoBasis: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(({ r2Key, artworkContentType, fileType, ...r }) => ({
    ...r, hasFile: r2Key !== null, fileType: r2Key ? fileType ?? artworkContentType : null,
  }));
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
    /* tenant-scope: the row loaded above through whereFor(editionAsset, write). */
    await tx.editionAsset.update({ where: { id: assetId }, data: { campaignId }, select: { id: true } });
    await audit(tx, actor, "editionAsset.useInCampaign", "EditionAsset", assetId, { after: { campaignId } });
    return { assetId, campaignId };
  });
}
