/**
 * Identity documents for athletes and guardians — 2S1-BE-09, -10, -12.
 *
 * An adult's government ID, a minor's school ID, a guardian's government ID
 * and proof of guardianship. The same two-step upload every private file
 * here uses (onboarding-documents.ts, sponsor proofs):
 *
 *   1. the uploader says what it is about to send and is handed a
 *      private-bucket PUT for exactly that key and type — audited as a grant;
 *   2. it says it has sent it, and the document counts only once the object
 *      is really in the bucket (its stored size, checked against the limit).
 *
 * The bytes never pass through the API and never touch the public bucket.
 * The uploader is never given a read link — not even of their own file.
 * BTG admins read them through five-minute, audited links (signups-desk.ts).
 *
 * The callers authorise: a signed link (the applicant, the guardian's
 * set-up page, the coming-of-age page). This file trusts the owner it is
 * handed and checks only the file.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { presignPrivateUpload, privateObjectSize } from "../lib/storage";
import { safeFilename } from "./onboarding-documents";
import {
  ATHLETE_DOCUMENT_KINDS, GUARDIAN_DOCUMENT_KINDS, GUARDIAN_PROOF_KINDS, MAX_ACCOUNT_DOCUMENTS, MAX_ID_DOCUMENT_BYTES, idUploadProblem,
  type AccountDocumentKind, type GuardianProofKind,
} from "./signup-rules";

export class AccountDocumentError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "AccountDocumentError";
    this.status = status;
  }
}

export type DocumentOwner = { tenantId: string } & ({ athleteId: string; guardianId?: undefined } | { guardianId: string; athleteId?: undefined });

const VIEW = { id: true, kind: true, proofKind: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true } as const;

function ownerWhere(o: DocumentOwner) {
  return o.athleteId ? { tenantId: o.tenantId, athleteId: o.athleteId } : { tenantId: o.tenantId, guardianId: o.guardianId! };
}

/** Step one: record the document and hand back a private-bucket PUT for exactly this file. */
export async function startAccountDocument(
  owner: DocumentOwner,
  input: { kind: AccountDocumentKind; proofKind?: GuardianProofKind | null; filename: string; contentType: string; bytes: number },
) {
  const allowed: readonly string[] = owner.athleteId ? ATHLETE_DOCUMENT_KINDS : GUARDIAN_DOCUMENT_KINDS;
  if (!allowed.includes(input.kind)) throw new AccountDocumentError("That kind of document isn't one asked for here.");
  if (input.kind === "GUARDIANSHIP_PROOF" && !GUARDIAN_PROOF_KINDS.includes(input.proofKind as GuardianProofKind)) {
    throw new AccountDocumentError("Say which proof it is: a birth certificate, a court order or a school record.");
  }
  const problem = idUploadProblem(input);
  if (problem) throw new AccountDocumentError(problem);
  const count = await prisma.accountDocument.count({ where: ownerWhere(owner) /* tenant-scope: ownerWhere carries the owner's tenantId. */ });
  if (count >= MAX_ACCOUNT_DOCUMENTS) throw new AccountDocumentError(`At most ${MAX_ACCOUNT_DOCUMENTS} documents can be uploaded here.`, 409);

  const id = `adoc_${randomBytes(12).toString("hex")}`;
  const filename = safeFilename(input.filename);
  const folder = owner.athleteId ? `athletes/${owner.athleteId}` : `guardians/${owner.guardianId}`;
  const r2Key = `identity/${folder}/${id}/${filename}`;
  const document = await prisma.accountDocument.create({
    data: {
      id, ...ownerWhere(owner), kind: input.kind, proofKind: input.kind === "GUARDIANSHIP_PROOF" ? input.proofKind! : null,
      filename, contentType: input.contentType, bytes: input.bytes, r2Key,
    },
    select: VIEW,
  });
  const uploadUrl = await presignPrivateUpload({ userId: null, tenantId: owner.tenantId }, r2Key, input.contentType, { entity: "AccountDocument", entityId: id });
  return { document, uploadUrl, contentType: input.contentType };
}

/** Step two: count it only if it is really in the bucket. Returns the document. */
export async function finishAccountDocument(owner: DocumentOwner, documentId: string) {
  const doc = await prisma.accountDocument.findFirst({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: { ...ownerWhere(owner), id: documentId }, select: { id: true, r2Key: true, kind: true, uploadedAt: true } });
  if (!doc) throw new AccountDocumentError("That document isn't one of yours.", 404);
  if (doc.uploadedAt) return doc;
  const size = await privateObjectSize(doc.r2Key);
  if (size === null) throw new AccountDocumentError("That document hasn't arrived yet — upload it, then confirm.", 409);
  if (size > MAX_ID_DOCUMENT_BYTES) throw new AccountDocumentError("That document is larger than 10 MB.");
  return prisma.accountDocument.update({
    /* tenant-scope: the row loaded above within this owner. */
    where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: size }, select: { id: true, r2Key: true, kind: true, uploadedAt: true },
  });
}

/** The kinds this owner has actually uploaded. */
export async function uploadedKinds(db: Prisma.TransactionClient | typeof prisma, owner: DocumentOwner): Promise<Set<string>> {
  const rows = await db.accountDocument.findMany({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: { ...ownerWhere(owner), uploadedAt: { not: null } }, select: { kind: true } });
  return new Set(rows.map((r) => r.kind));
}

/** The owner's documents, for the applicant's own checklist (never a read link). */
export async function documentsOf(db: Prisma.TransactionClient | typeof prisma, owner: DocumentOwner) {
  return db.accountDocument.findMany({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: ownerWhere(owner), select: VIEW, orderBy: { createdAt: "asc" } });
}
