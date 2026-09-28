/**
 * Verification documents for a property onboarding — 2S1-BE-02.
 *
 * "Documents upload to the private bucket, are reviewable by an admin, and
 * are never publicly reachable."
 *
 * THE APPLICANT (public, by resume token) is given an UPLOAD grant to the
 * private bucket and nothing else: no read URL, ever — not even of its own
 * file. It confirms the upload, and the server checks the object is really
 * there before the document counts as attached. Only while the application is
 * editable (DRAFT / CHANGES_REQUESTED).
 *
 * THE REVIEWER (BTG, `propertyOnboarding` read) lists an application's
 * documents with a fifteen-minute download link each, and every link is an
 * audited grant (storage.ts — the private bucket has no unaudited path).
 *
 * The bytes never pass through the API, and never touch the public bucket:
 * the only presigners used here are the private-bucket ones.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presignPrivateDownload, presignPrivateUpload, privateObjectSize } from "../lib/storage";
import { readOnboardingToken } from "../lib/onboarding-token";
import { EDITABLE, type OnboardingState } from "./onboarding-rules";
import { OnboardingError, OnboardingNotFoundError } from "./onboarding";

export const DOCUMENT_KINDS = ["RIGHTS_PROOF", "BUSINESS_REGISTRATION", "IDENTITY", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Scans and photos of paper — nothing executable, nothing that renders script. */
export const DOCUMENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Enough for every kind twice over; stops a token being used as free storage. */
export const MAX_DOCUMENTS = 12;

/** A filename made safe for a key: no path, no traversal, no odd bytes. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+/, "").slice(-100);
  return clean || "document";
}

export function documentKey(onboardingId: string, documentId: string, filename: string): string {
  return `onboarding/${onboardingId}/${documentId}-${safeFilename(filename)}`;
}

const APPLICANT_VIEW = { id: true, kind: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true } as const;

async function applicantOnboarding(token: string) {
  const id = readOnboardingToken(token);
  if (!id) throw new OnboardingNotFoundError();
  const row = await prisma.propertyOnboarding.findFirst({
    /* tenant-scope: public resume token — it names its own application, whose tenantId is on the row. */
    where: { id },
    select: { id: true, tenantId: true, state: true },
  });
  if (!row) throw new OnboardingNotFoundError();
  return row;
}

function assertEditable(state: string) {
  if (!EDITABLE.has(state as OnboardingState)) {
    throw new OnboardingError(`An application that is ${state} cannot take new documents.`, 409);
  }
}

/**
 * Step one: the applicant says what it is about to upload and is handed a
 * private-bucket PUT for exactly that key and content type. Audited as a grant.
 */
export async function requestDocumentUpload(
  token: string,
  input: { kind: DocumentKind; filename: string; contentType: string; bytes: number },
) {
  const o = await applicantOnboarding(token);
  assertEditable(o.state);
  if (!DOCUMENT_TYPES.has(input.contentType)) throw new OnboardingError("Documents are PDF, JPEG or PNG.");
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_DOCUMENT_BYTES) {
    throw new OnboardingError(`A document is at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`);
  }
  const count = await prisma.onboardingDocument.count({ where: { tenantId: o.tenantId, onboardingId: o.id } });
  if (count >= MAX_DOCUMENTS) throw new OnboardingError(`An application holds at most ${MAX_DOCUMENTS} documents.`, 409);

  const id = `odoc_${randomBytes(12).toString("hex")}`;
  const r2Key = documentKey(o.id, id, input.filename);
  const doc = await prisma.onboardingDocument.create({
    data: {
      id, tenantId: o.tenantId, onboardingId: o.id, kind: input.kind, filename: safeFilename(input.filename),
      contentType: input.contentType, bytes: input.bytes, r2Key,
    },
    select: APPLICANT_VIEW,
  });
  const uploadUrl = await presignPrivateUpload({ userId: null, tenantId: o.tenantId }, r2Key, input.contentType, {
    entity: "OnboardingDocument", entityId: id,
  });
  return { document: doc, uploadUrl, contentType: input.contentType };
}

/** Step two: the applicant says it has uploaded. Counted only if it is there. */
export async function confirmDocumentUpload(token: string, documentId: string) {
  const o = await applicantOnboarding(token);
  assertEditable(o.state);
  const doc = await prisma.onboardingDocument.findFirst({
    where: { tenantId: o.tenantId, onboardingId: o.id, id: documentId },
    select: { id: true, r2Key: true },
  });
  if (!doc) throw new OnboardingNotFoundError();
  const size = await privateObjectSize(doc.r2Key);
  if (size === null) throw new OnboardingError("That document has not arrived yet — upload it, then confirm.", 409);
  if (size > MAX_DOCUMENT_BYTES) throw new OnboardingError("That document is larger than allowed.", 422);
  return prisma.onboardingDocument.update({
    where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: size }, select: APPLICANT_VIEW,
  });
}

/**
 * The reviewer's view: every uploaded document, each with its own audited,
 * time-limited read of the private object. Unconfirmed grants are listed
 * without a link — there may be nothing there to read.
 */
export async function reviewDocuments(actor: Actor, onboardingId: string) {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const o = await prisma.propertyOnboarding.findFirst({
    where: { ...whereFor(actor, "propertyOnboarding", "read"), id: onboardingId }, select: { id: true, tenantId: true },
  });
  if (!o) throw new ForbiddenError("propertyOnboarding", "read");
  const docs = await prisma.onboardingDocument.findMany({
    where: { tenantId: o.tenantId, onboardingId: o.id },
    select: { ...APPLICANT_VIEW, r2Key: true },
    orderBy: { createdAt: "asc" },
  });
  return Promise.all(docs.map(async ({ r2Key, ...d }) => ({
    ...d,
    downloadUrl: d.uploadedAt ? await presignPrivateDownload(actor, r2Key, { entity: "OnboardingDocument", entityId: d.id }) : null,
  })));
}
