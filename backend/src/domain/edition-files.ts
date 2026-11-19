/**
 * P9-BE-27 — an edition's cover image and its press PDF (spec §9: layout
 * stays in InDesign or Canva; the platform holds the approved artwork and
 * the press PDF).
 *
 *   - Both are uploaded by BTG straight to the PRIVATE bucket, on a grant
 *     signed for the exact type and size, and checked when recorded: the key
 *     is one this edition's grant handed out for that file, and what arrived
 *     is what was signed for. A cover must also open as a picture.
 *   - A new upload replaces the old; the audit log records each change (the
 *     old file stays in storage, as the record of what was printed).
 *   - The cover is shown in the reader and the edition list once the edition
 *     is published, from a public copy the worker makes without its metadata
 *     (edition-pictures.ts). A replaced cover's copy is retaken.
 *   - The press PDF never goes public: BTG reads it on a short signed link,
 *     every read recorded, as a download by its name.
 */
import { randomUUID } from "node:crypto";
import sharp from "sharp";

import { prisma } from "../db/client";
import { enqueue } from "../db/outbox";
import { AUDIT_ACTIONS, audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { checkPrivateUpload, deletePrivateObject, getPrivateObject, presignPrivateDownload, presignPrivateUpload, uploadRefusal } from "../lib/storage";
import { ANY_FILE_MAX_BYTES, downloadDisposition, safeFileName } from "../lib/file-formats";
import { MAX_WEB_PHOTO_BYTES } from "../lib/web-copy";
import { PUBLISHED_STATES } from "./edition-state";

export type EditionFile = "cover" | "press-pdf";

export const COVER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const COVER_MAX_BYTES = MAX_WEB_PHOTO_BYTES;
export const PRESS_PDF_MAX_BYTES = ANY_FILE_MAX_BYTES;

export class EditionFileError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "EditionFileError";
    this.status = status;
  }
}

const keyPrefix = (tenantId: string, editionId: string, which: EditionFile) => `edition-files/${tenantId}/${editionId}/${which}/`;
const words = (which: EditionFile) => (which === "cover" ? "That cover" : "That press PDF");

async function reachForWrite(actor: Actor, editionId: string) {
  assertAllowed(actor, "edition", "write");
  const edition = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "write"), id: editionId },
    select: { id: true, tenantId: true, state: true, coverKey: true, pressPdfKey: true },
  });
  if (!edition) throw new ForbiddenError("edition", "write");
  return edition;
}

/** POST /editions/{id}/cover/uploads and /press-pdf/uploads — a grant for one file. */
export async function presignEditionFileUpload(
  actor: Actor,
  editionId: string,
  which: EditionFile,
  input: { contentType: string; bytes: number },
): Promise<{ url: string; key: string; contentType: string; maxBytes: number }> {
  const contentType = (input.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const maxBytes = which === "cover" ? COVER_MAX_BYTES : PRESS_PDF_MAX_BYTES;
  if (which === "cover" && !(COVER_TYPES as readonly string[]).includes(contentType)) throw new EditionFileError("Upload the cover as a JPG, PNG or WebP.");
  if (which === "press-pdf" && contentType !== "application/pdf") throw new EditionFileError("Upload the press file as a PDF.");
  if (!Number.isInteger(input.bytes) || input.bytes <= 0 || input.bytes > maxBytes) {
    throw new EditionFileError(which === "cover" ? "Keep the cover under 50 MB." : "Keep the press PDF under 2 GB.");
  }
  const edition = await reachForWrite(actor, editionId);
  if (edition.state === "CANCELLED") throw new EditionFileError("This edition was cancelled.", 409);
  const key = `${keyPrefix(edition.tenantId, edition.id, which)}${randomUUID()}`;
  const url = await presignPrivateUpload(actor, key, contentType, { entity: "Edition", entityId: edition.id }, { contentLength: input.bytes, signContentType: true });
  return { url, key, contentType, maxBytes };
}

/** PUT /editions/{id}/cover and /press-pdf — record the uploaded file, replacing any before it. */
export async function recordEditionFile(
  actor: Actor,
  editionId: string,
  which: EditionFile,
  input: { r2Key: string; fileName?: string | null },
): Promise<{ which: EditionFile; type: string; bytes: number; fileName: string | null; replaced: boolean }> {
  const edition = await reachForWrite(actor, editionId);
  if (edition.state === "CANCELLED") throw new EditionFileError("This edition was cancelled.", 409);
  const notOurs = () => new EditionFileError(`${words(which)} wasn't uploaded for this edition — upload it again.`);
  if (!input.r2Key.startsWith(keyPrefix(edition.tenantId, edition.id, which)) || input.r2Key.includes("..")) throw notOurs();
  const grant = await prisma.auditLog.findFirst({
    /* tenant-scope: the grant was audited under the presigning actor's tenant — the edition's own, or this actor's. */
    where: {
      tenantId: { in: [...new Set([edition.tenantId, actor.tenantId])] },
      entity: "Edition", entityId: edition.id, action: AUDIT_ACTIONS.storage.privateUploadGrant,
      after: { path: ["key"], equals: input.r2Key },
    },
    select: { after: true }, orderBy: { at: "desc" },
  });
  const granted = (grant?.after ?? null) as { contentType?: unknown; bytes?: unknown } | null;
  if (typeof granted?.contentType !== "string" || typeof granted.bytes !== "number") throw notOurs();
  const maxBytes = which === "cover" ? COVER_MAX_BYTES : PRESS_PDF_MAX_BYTES;
  const arrived = await checkPrivateUpload(actor, input.r2Key, { contentType: granted.contentType, bytes: granted.bytes, maxBytes }, { entity: "Edition", entityId: edition.id });
  if (!arrived.ok && arrived.problem === "missing") throw new EditionFileError(uploadRefusal("missing", words(which)), 409);
  if (!arrived.ok) throw new EditionFileError(uploadRefusal(arrived, words(which)));
  if (which === "cover") {
    /* A cover must open as a picture — the reader shows it. */
    const opens = await sharp(await getPrivateObject(input.r2Key), { limitInputPixels: 50_000_000 }).metadata().then((m) => !!m.width, () => false);
    if (!opens) {
      await deletePrivateObject(input.r2Key);
      throw new EditionFileError("That cover couldn't be opened as a picture, so it was removed. Upload it again.");
    }
  }
  const now = new Date();
  const fileName = which === "press-pdf" ? safeFileName(input.fileName) : null;
  const before = which === "cover" ? edition.coverKey : edition.pressPdfKey;
  await prisma.$transaction(async (tx) => {
    /* tenant-scope: the edition reached above in the caller's write scope, by id and tenant. */
    await tx.edition.update({
      where: { id: edition.id },
      data: which === "cover"
        ? { coverKey: input.r2Key, coverType: granted.contentType as string, coverBytes: arrived.bytes, coverUploadedAt: now }
        : { pressPdfKey: input.r2Key, pressPdfBytes: arrived.bytes, pressPdfName: fileName, pressPdfUploadedAt: now },
    });
    await audit(tx, actor, which === "cover" ? "edition.cover" : "edition.pressPdf", "Edition", edition.id, {
      before: { key: before },
      after: { key: input.r2Key, type: granted.contentType, bytes: arrived.bytes, ...(fileName ? { name: fileName } : {}) },
    });
    /* A published edition's new cover: its public copy now, not at the next sweep. */
    if (which === "cover" && (PUBLISHED_STATES as readonly string[]).includes(edition.state)) {
      await enqueue(tx, edition.tenantId, "edition.pictures", { editionId: edition.id });
    }
  });
  return { which, type: granted.contentType, bytes: arrived.bytes, fileName, replaced: before !== null };
}

/** GET /editions/{id}/cover — a signed read of the cover for whoever reads the edition (the editions page's preview). */
export async function editionCoverUrl(actor: Actor, editionId: string): Promise<{ url: string; type: string }> {
  assertAllowed(actor, "edition", "read");
  const e = await prisma.edition.findFirst({ where: { ...whereFor(actor, "edition", "read"), id: editionId }, select: { id: true, coverKey: true, coverType: true } });
  if (!e) throw new ForbiddenError("edition", "read");
  if (!e.coverKey || !e.coverType) throw new EditionFileError("This edition has no cover yet.", 404);
  return { url: await presignPrivateDownload(actor, e.coverKey, { entity: "Edition", entityId: e.id }), type: e.coverType };
}

/** GET /editions/{id}/press-pdf — BTG's signed, recorded read of the press PDF, as a download. */
export async function editionPressPdfUrl(actor: Actor, editionId: string): Promise<{ url: string; fileName: string | null; bytes: number }> {
  assertAllowed(actor, "edition", "write");
  const e = await prisma.edition.findFirst({
    where: { ...whereFor(actor, "edition", "write"), id: editionId },
    select: { id: true, pressPdfKey: true, pressPdfName: true, pressPdfBytes: true },
  });
  if (!e) throw new ForbiddenError("edition", "write");
  if (!e.pressPdfKey || !e.pressPdfBytes) throw new EditionFileError("This edition has no press PDF yet.", 404);
  /* A PDF opens in place by default; the printer's file is always a download, by its name. */
  const disposition = downloadDisposition("application/octet-stream", e.pressPdfName ?? "press.pdf");
  const url = await presignPrivateDownload(actor, e.pressPdfKey, { entity: "Edition", entityId: e.id }, undefined, disposition);
  return { url, fileName: e.pressPdfName, bytes: e.pressPdfBytes };
}
