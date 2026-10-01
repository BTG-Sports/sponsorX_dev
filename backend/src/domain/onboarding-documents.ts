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
import { presignPrivateDownload, presignPrivateUpload, privateObjectSize, SENSITIVE_DOCUMENT_TTL_SECONDS } from "../lib/storage";
import { readOnboardingToken } from "../lib/onboarding-token";
import { DOCUMENT_KINDS, EDITABLE, requiredDocuments, US_STATES, type DocumentKind, type OnboardingShape, type OnboardingState } from "./onboarding-rules";
import { evaluateOnboarding, OnboardingError, OnboardingNotFoundError } from "./onboarding";

export { DOCUMENT_KINDS, type DocumentKind };

/** Scans and photos of paper — nothing executable, nothing that renders script. */
export const DOCUMENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** An ID document is at most 10 MB (the 2026-10-01 rules); everything else 20 MB. */
export const MAX_ID_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const maxBytesFor = (kind: string) => (kind === "IDENTITY" ? MAX_ID_DOCUMENT_BYTES : MAX_DOCUMENT_BYTES);
/** Enough for every kind twice over; stops a token being used as free storage. */
export const MAX_DOCUMENTS = 12;
/** An agency needs a registration per state, so its ceiling grows with its list. */
export const maxDocumentsFor = (o: Pick<OnboardingShape, "orgType" | "stateCode" | "details">) => Math.max(MAX_DOCUMENTS, requiredDocuments(o).length * 2 + 4);

/** The parts of an upload request every route checks the same way — the applicant's and the manager's. */
export function checkUpload(input: { kind: string; contentType: string; bytes: number; stateCode?: string | null; expiresOn?: string | null }) {
  if (!(DOCUMENT_KINDS as readonly string[]).includes(input.kind)) throw new OnboardingError("Unknown kind of document.");
  if (!DOCUMENT_TYPES.has(input.contentType)) throw new OnboardingError("Documents are PDF, JPEG or PNG.");
  const max = maxBytesFor(input.kind);
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > max) {
    throw new OnboardingError(`${input.kind === "IDENTITY" ? "An ID document" : "A document"} is at most ${max / 1024 / 1024} MB.`);
  }
  if (input.stateCode && input.kind !== "BUSINESS_REGISTRATION") throw new OnboardingError("Only a business registration names a state.");
  if (input.stateCode && !US_STATES.has(input.stateCode)) throw new OnboardingError("Give a US state code.");
  const expiresOn = input.expiresOn ? new Date(`${input.expiresOn}T00:00:00.000Z`) : null;
  if (expiresOn && Number.isNaN(expiresOn.getTime())) throw new OnboardingError("“Valid until” is a date like 2027-06-30.");
  return { stateCode: input.stateCode ?? null, expiresOn };
}

/** Open while the applicant may still add papers: drafting, or waiting on the automatic checks (2S1-BE-06). */
const TAKES_DOCUMENTS: ReadonlySet<OnboardingState> = new Set([...EDITABLE, "PENDING_REVIEW"]);

/** A filename made safe for a key: no path, no traversal, no odd bytes. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/\.{2,}/g, ".").replace(/^[-.]+/, "").slice(-100);
  return clean || "document";
}

export function documentKey(onboardingId: string, documentId: string, filename: string): string {
  return `onboarding/${onboardingId}/${documentId}-${safeFilename(filename)}`;
}

export const APPLICANT_VIEW = {
  id: true, kind: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true,
  stateCode: true, expiresOn: true, replacesId: true, replacedAt: true, removedAt: true,
} as const;

async function applicantOnboarding(token: string) {
  const id = readOnboardingToken(token);
  if (!id) throw new OnboardingNotFoundError();
  const row = await prisma.propertyOnboarding.findFirst({
    /* tenant-scope: public resume token — it names its own application, whose tenantId is on the row. */
    where: { id },
    select: { id: true, tenantId: true, state: true, orgType: true, stateCode: true, details: true },
  });
  if (!row) throw new OnboardingNotFoundError();
  return row;
}

function assertEditable(state: string) {
  if (!TAKES_DOCUMENTS.has(state as OnboardingState)) {
    throw new OnboardingError(
      state === "APPROVED" ? "This organisation is approved — change its documents from the property portal." : `An application that is ${state} cannot take new documents.`,
      409,
    );
  }
}

/**
 * Step one: the applicant says what it is about to upload and is handed a
 * private-bucket PUT for exactly that key and content type. Audited as a grant.
 */
export async function requestDocumentUpload(
  token: string,
  input: { kind: DocumentKind; filename: string; contentType: string; bytes: number; stateCode?: string | null; expiresOn?: string | null },
) {
  const o = await applicantOnboarding(token);
  assertEditable(o.state);
  const { stateCode, expiresOn } = checkUpload(input);
  const max = maxDocumentsFor(o);
  const count = await prisma.onboardingDocument.count({ where: { tenantId: o.tenantId, onboardingId: o.id } });
  if (count >= max) throw new OnboardingError(`An application holds at most ${max} documents.`, 409);

  const id = `odoc_${randomBytes(12).toString("hex")}`;
  const r2Key = documentKey(o.id, id, input.filename);
  const doc = await prisma.onboardingDocument.create({
    data: {
      id, tenantId: o.tenantId, onboardingId: o.id, kind: input.kind, filename: safeFilename(input.filename),
      contentType: input.contentType, bytes: input.bytes, r2Key, stateCode, expiresOn,
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
    select: { id: true, r2Key: true, kind: true },
  });
  if (!doc) throw new OnboardingNotFoundError();
  const size = await privateObjectSize(doc.r2Key);
  if (size === null) throw new OnboardingError("That document has not arrived yet — upload it, then confirm.", 409);
  if (size > maxBytesFor(doc.kind)) throw new OnboardingError("That document is larger than allowed.", 422);
  return prisma.$transaction(async (tx) => {
    const confirmed = await tx.onboardingDocument.update({
      where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: size }, select: APPLICANT_VIEW,
    });
    /* 2S1-BE-06 — waiting on the automatic checks: this may be the last thing missing. */
    if (o.state === "PENDING_REVIEW") await evaluateOnboarding(tx, o.id);
    return confirmed;
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
  /* 2S1-BE-06 — five minutes, the identity-document rule, for every one of them. */
  return Promise.all(docs.map(async ({ r2Key, ...d }) => ({
    ...d,
    downloadUrl: d.uploadedAt ? await presignPrivateDownload(actor, r2Key, { entity: "OnboardingDocument", entityId: d.id }, SENSITIVE_DOCUMENT_TTL_SECONDS) : null,
  })));
}

/** One document, opened by BTG through a five-minute audited link — the profile page's viewer. */
export async function viewOnboardingDocument(actor: Actor, onboardingId: string, documentId: string) {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const o = await prisma.propertyOnboarding.findFirst({
    where: { ...whereFor(actor, "propertyOnboarding", "read"), id: onboardingId }, select: { id: true, tenantId: true },
  });
  if (!o) throw new ForbiddenError("propertyOnboarding", "read");
  const doc = await prisma.onboardingDocument.findFirst({
    where: { tenantId: o.tenantId, onboardingId: o.id, id: documentId }, select: { id: true, r2Key: true, uploadedAt: true },
  });
  if (!doc) throw new ForbiddenError("propertyOnboarding", "read");
  if (!doc.uploadedAt) throw new OnboardingError("That document never finished uploading.", 409);
  const url = await presignPrivateDownload(actor, doc.r2Key, { entity: "OnboardingDocument", entityId: doc.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}
