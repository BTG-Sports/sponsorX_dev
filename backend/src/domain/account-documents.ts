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
 *
 * PROOF IS PER CHILD. A guardian's GUARDIAN_ID is theirs and serves every
 * athlete they look after; a GUARDIANSHIP_PROOF names one athlete (`wardId`
 * — the athlete the set-up link is for), and only counts for that athlete.
 * A second minor naming an already-verified guardian is approved on proof
 * naming THEM, never on the first child's.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { checkPrivateUpload, presignPrivateUpload, uploadRefusal } from "../lib/storage";
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

const VIEW = { id: true, kind: true, proofKind: true, wardId: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true } as const;

function ownerWhere(o: DocumentOwner) {
  return o.athleteId ? { tenantId: o.tenantId, athleteId: o.athleteId } : { tenantId: o.tenantId, guardianId: o.guardianId! };
}

/** Step one: record the document and hand back a private-bucket PUT for exactly this file. */
export async function startAccountDocument(
  owner: DocumentOwner,
  input: { kind: AccountDocumentKind; proofKind?: GuardianProofKind | null; filename: string; contentType: string; bytes: number },
  /** GUARDIANSHIP_PROOF only: the athlete it names (the set-up link's athlete). */
  wardId?: string,
) {
  const allowed: readonly string[] = owner.athleteId ? ATHLETE_DOCUMENT_KINDS : GUARDIAN_DOCUMENT_KINDS;
  if (!allowed.includes(input.kind)) throw new AccountDocumentError("That kind of document isn't one asked for here.");
  if (input.kind === "GUARDIANSHIP_PROOF" && !GUARDIAN_PROOF_KINDS.includes(input.proofKind as GuardianProofKind)) {
    throw new AccountDocumentError("Say which proof it is: a birth certificate, a court order or a school record.");
  }
  if (input.kind === "GUARDIANSHIP_PROOF" && !wardId) throw new AccountDocumentError("Proof of guardianship names the athlete it is for.");
  const ward = input.kind === "GUARDIANSHIP_PROOF" ? wardId! : null;
  const problem = idUploadProblem(input);
  if (problem) throw new AccountDocumentError(problem);
  /* The limit is per owner — and for a guardian's proofs, per athlete, so a
     guardian of several minors is never stopped by their other children's. */
  const count = await prisma.accountDocument.count({
    /* tenant-scope: ownerWhere carries the owner's tenantId. */
    where: { ...ownerWhere(owner), ...(owner.guardianId ? { wardId: ward } : {}) },
  });
  if (count >= MAX_ACCOUNT_DOCUMENTS) throw new AccountDocumentError(`At most ${MAX_ACCOUNT_DOCUMENTS} documents can be uploaded here.`, 409);

  const id = `adoc_${randomBytes(12).toString("hex")}`;
  const filename = safeFilename(input.filename);
  const folder = owner.athleteId ? `athletes/${owner.athleteId}` : `guardians/${owner.guardianId}`;
  const r2Key = `identity/${folder}/${id}/${filename}`;
  const document = await prisma.accountDocument.create({
    data: {
      id, ...ownerWhere(owner), kind: input.kind, proofKind: input.kind === "GUARDIANSHIP_PROOF" ? input.proofKind! : null, wardId: ward,
      filename, contentType: input.contentType, bytes: input.bytes, r2Key,
    },
    select: VIEW,
  });
  /* 2S8-SEC-03 — the PUT is signed for exactly this type and size. */
  const uploadUrl = await presignPrivateUpload({ userId: null, tenantId: owner.tenantId }, r2Key, input.contentType, { entity: "AccountDocument", entityId: id }, {
    signContentType: true, contentLength: input.bytes,
  });
  return { document, uploadUrl, contentType: input.contentType };
}

/** Step two: count it only if it is really in the bucket. Returns the document. */
export async function finishAccountDocument(owner: DocumentOwner, documentId: string) {
  const doc = await prisma.accountDocument.findFirst({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: { ...ownerWhere(owner), id: documentId }, select: { id: true, r2Key: true, kind: true, uploadedAt: true, contentType: true, bytes: true } });
  if (!doc) throw new AccountDocumentError("That document isn't one of yours.", 404);
  const view = { id: doc.id, r2Key: doc.r2Key, kind: doc.kind, uploadedAt: doc.uploadedAt };
  if (doc.uploadedAt) return view;
  /* 2S8-SEC-03 — what arrived must be what the grant pinned; anything else is deleted. */
  const arrived = await checkPrivateUpload({ userId: null, tenantId: owner.tenantId }, doc.r2Key,
    { contentType: doc.contentType, bytes: doc.bytes, maxBytes: MAX_ID_DOCUMENT_BYTES }, { entity: "AccountDocument", entityId: doc.id });
  if (!arrived.ok && arrived.problem === "missing") throw new AccountDocumentError("That document hasn't arrived yet — upload it, then confirm.", 409);
  if (!arrived.ok) throw new AccountDocumentError(uploadRefusal(arrived.problem, "That document"));
  return prisma.accountDocument.update({
    /* tenant-scope: the row loaded above within this owner. */
    where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: arrived.bytes }, select: { id: true, r2Key: true, kind: true, uploadedAt: true },
  });
}

/** The kinds this owner has actually uploaded. */
export async function uploadedKinds(db: Prisma.TransactionClient | typeof prisma, owner: DocumentOwner): Promise<Set<string>> {
  const rows = await db.accountDocument.findMany({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: { ...ownerWhere(owner), uploadedAt: { not: null } }, select: { kind: true } });
  return new Set(rows.map((r) => r.kind));
}

/**
 * What a guardian has uploaded FOR ONE ATHLETE: their government ID (theirs,
 * whichever child it was uploaded on) and proof of guardianship naming this
 * athlete. Proof naming another of their athletes does not count.
 */
export async function guardianUploadsFor(db: Prisma.TransactionClient | typeof prisma, tenantId: string, guardianId: string, wardId: string) {
  const rows = await db.accountDocument.findMany({
    /* tenant-scope: the guardian's own documents, in their tenant. */
    where: { tenantId, guardianId, uploadedAt: { not: null }, OR: [{ kind: "GUARDIAN_ID" }, { kind: "GUARDIANSHIP_PROOF", wardId }] },
    select: { kind: true },
  });
  return { idUploaded: rows.some((r) => r.kind === "GUARDIAN_ID"), proofUploaded: rows.some((r) => r.kind === "GUARDIANSHIP_PROOF") };
}

/** The owner's documents, for the applicant's own checklist (never a read link). */
export async function documentsOf(db: Prisma.TransactionClient | typeof prisma, owner: DocumentOwner) {
  return db.accountDocument.findMany({ /* tenant-scope: ownerWhere carries the owner's tenantId. */ where: ownerWhere(owner), select: VIEW, orderBy: { createdAt: "asc" } });
}
