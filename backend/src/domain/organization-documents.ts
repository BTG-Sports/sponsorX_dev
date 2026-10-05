/**
 * An approved organisation keeps its documents current — 2S1-BE-07.
 *
 * "An approved organization can replace or add documents; each change re-runs
 * the checklist, keeps the previous file and emails BTG admins a link; a
 * missing required document flags the organization for BTG; only the
 * organization's own manager can change its documents."
 *
 * WHO. Only the organisation's own PROPERTY_MGR: the property is found
 * through `whereFor(actor, "property", "write")` with the actor's own
 * property id (the matrix gives PROPERTY_MGR `own` on property and nobody
 * else a property link), and its documents through the onboarding that
 * provisioned that property. BTG reviews documents through its own routes
 * (onboarding-documents.ts); it never changes an organisation's papers.
 *
 * NOTHING IS DELETED. A replacement marks the earlier file `replacedAt` and
 * a removal marks it `removedAt`; both stay in the history, and the bytes
 * stay in the private bucket. The manager gets an upload grant and never a
 * read — only BTG opens a document, through an audited five-minute link.
 *
 * LISTINGS STAY LIVE. A required document removed without a replacement
 * flags the organisation for BTG (`flags`, `flaggedAt`) and emails them; it
 * suspends nothing. Uploading the replacement clears the flag.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import { send } from "../lib/email";
import type { Actor } from "../auth/actor";
import { whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { checkPrivateUpload, presignPrivateUpload, uploadRefusal } from "../lib/storage";
import { DOCUMENT_LABEL, documentChecklist, isCurrent, meets, type DocumentKind } from "./onboarding-rules";
import { btgAdmins, OnboardingError } from "./onboarding";
import { APPLICANT_VIEW, checkUpload, documentKey, DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, MAX_ID_DOCUMENT_BYTES, maxBytesFor, safeFilename } from "./onboarding-documents";

type Tx = Prisma.TransactionClient;

/** A document's whole life is kept, so the ceiling is generous — it only stops the grant being free storage. */
const MAX_DOCUMENTS_EVER = 100;
/** The organisation must be approved (or paused) to keep its papers here. */
const OPEN_STATES = new Set(["APPROVED", "SUSPENDED"]);

const ONBOARDING = {
  id: true, tenantId: true, state: true, orgName: true, orgType: true, stateCode: true, details: true, flags: true, flaggedAt: true,
  documents: { select: { ...APPLICANT_VIEW }, orderBy: { createdAt: "asc" } },
} as const;
type Own = Prisma.PropertyOnboardingGetPayload<{ select: typeof ONBOARDING }>;
type Doc = Own["documents"][number];

/** The actor's own organisation: its property (scoped) and the onboarding that provisioned it. */
async function ownOrganisation(db: Tx | typeof prisma, actor: Actor, action: "read" | "write") {
  if (!actor.propertyId) throw new ForbiddenError("property", action);
  const property = await db.property.findFirst({ where: { ...whereFor(actor, "property", action), id: actor.propertyId }, select: { id: true, tenantId: true } });
  if (!property) throw new ForbiddenError("property", action);
  const onboarding = await db.propertyOnboarding.findFirst({
    /* tenant-scope: the onboarding that provisioned the actor's own property (found above through whereFor) — it stays in the operator's tenant, 2S1-BE-04. */
    where: { propertyId: property.id },
    select: ONBOARDING,
  });
  if (!onboarding) throw new OnboardingError("This property didn't join through the onboarding wizard, so it has no documents to keep here.", 404);
  return { property, onboarding };
}

function assertOpen(o: Pick<Own, "state">) {
  if (!OPEN_STATES.has(o.state)) throw new OnboardingError(`An organisation that is ${o.state} can't change its documents here.`, 409);
}

const day = (d: Date | null) => (d ? d.toISOString() : null);

/** One row of the Documents page: a requirement (or an extra paper), what is on file, and its history. */
function item(key: string, kind: string, stateCode: string | null, required: boolean, current: Doc | null, earlier: Doc[], now: Date) {
  const expired = Boolean(current?.expiresOn && current.expiresOn.getTime() < now.getTime());
  return {
    key, kind, stateCode, required,
    label: stateCode ? `${DOCUMENT_LABEL[kind as DocumentKind] ?? kind} (${stateCode})` : DOCUMENT_LABEL[kind as DocumentKind] ?? kind,
    state: !current ? "MISSING" as const : expired ? "EXPIRED" as const : "ON_FILE" as const,
    file: current ? { documentId: current.id, filename: current.filename, uploadedAt: day(current.uploadedAt)!, expiresOn: day(current.expiresOn) } : null,
    history: earlier
      .filter((d) => d.uploadedAt && (d.replacedAt || d.removedAt))
      .sort((a, b) => (b.replacedAt ?? b.removedAt)!.getTime() - (a.replacedAt ?? a.removedAt)!.getTime())
      .map((d) => ({
        documentId: d.id, filename: d.filename, uploadedAt: day(d.uploadedAt)!,
        endedAt: day(d.replacedAt ?? d.removedAt)!, ended: d.replacedAt ? "REPLACED" as const : "REMOVED" as const,
      })),
  };
}

/** The page's model: every requirement, then any extra current paper, each with its history. */
function documentsModel(o: Own, now = new Date()) {
  const checklist = documentChecklist(o, o.documents);
  const used = new Set(checklist.map((c) => c.document?.id).filter(Boolean));
  const rows = checklist.map((c) => item(c.key, c.kind, c.stateCode, true, c.document as Doc | null, o.documents.filter((d) => !isCurrent(d) && meets(c, d)), now));
  /* An extra paper (OTHER, or a second of a kind) is its own row; its history is the chain it replaced. */
  for (const d of o.documents.filter((x) => isCurrent(x) && !used.has(x.id))) {
    const chain: Doc[] = [];
    for (let prev = o.documents.find((x) => x.id === d.replacesId); prev; prev = o.documents.find((x) => x.id === prev!.replacesId)) chain.push(prev);
    rows.push(item(`doc:${d.id}`, d.kind, d.stateCode, false, d, chain, now));
  }
  return rows;
}

/** GET /property/documents — what the organisation has on file, what is missing, and the history. */
export async function listOrganizationDocuments(actor: Actor) {
  const { onboarding: o } = await ownOrganisation(prisma, actor, "read");
  return {
    organizationName: o.orgName,
    orgType: o.orgType,
    state: o.state,
    flags: o.flags,
    documents: documentsModel(o),
    /* Not yet uploaded grants are listed, so a half-finished upload can be confirmed. */
    pending: o.documents.filter((d) => !d.uploadedAt).map((d) => ({ documentId: d.id, kind: d.kind, stateCode: d.stateCode, filename: d.filename, replacesId: d.replacesId })),
    upload: { types: [...DOCUMENT_TYPES], maxBytes: MAX_DOCUMENT_BYTES, maxIdBytes: MAX_ID_DOCUMENT_BYTES },
  };
}

export type OrganizationUploadInput = {
  kind: DocumentKind; filename: string; contentType: string; bytes: number;
  stateCode?: string | null; expiresOn?: string | null; replacesId?: string | null;
};

/** POST /property/documents — a private-bucket PUT for one new or replacement paper. Audited as a grant. */
export async function requestOrganizationUpload(actor: Actor, input: OrganizationUploadInput) {
  const { onboarding: o } = await ownOrganisation(prisma, actor, "write");
  assertOpen(o);
  const { stateCode, expiresOn } = checkUpload(input);
  if (input.replacesId) {
    const old = o.documents.find((d) => d.id === input.replacesId);
    if (!old || !isCurrent(old)) throw new OnboardingError("That document isn't on file any more — reload the page.", 409);
    if (old.kind !== input.kind || (old.stateCode ?? null) !== stateCode) throw new OnboardingError("A replacement is the same kind of document as the one it replaces.");
  }
  if (o.documents.length >= MAX_DOCUMENTS_EVER) throw new OnboardingError(`An organisation holds at most ${MAX_DOCUMENTS_EVER} documents, history included. Contact BTG.`, 409);

  const id = `odoc_${randomBytes(12).toString("hex")}`;
  const r2Key = documentKey(o.id, id, input.filename);
  const document = await prisma.onboardingDocument.create({
    data: {
      id, tenantId: o.tenantId, onboardingId: o.id, kind: input.kind, filename: safeFilename(input.filename),
      contentType: input.contentType, bytes: input.bytes, r2Key, stateCode, expiresOn, replacesId: input.replacesId ?? null,
    },
    select: APPLICANT_VIEW,
  });
  /* 2S8-SEC-03 — the PUT is signed for exactly this type and size. */
  const uploadUrl = await presignPrivateUpload(actor, r2Key, input.contentType, { entity: "OnboardingDocument", entityId: id }, {
    signContentType: true, contentLength: input.bytes,
  });
  return { document, uploadUrl, contentType: input.contentType };
}

/** Re-run the checklist after a change: flag (or clear) a missing required paper, and tell BTG. */
async function recheck(tx: Tx, actor: Actor, onboardingId: string, change: "added" | "replaced" | "removed", doc: Pick<Doc, "id" | "kind" | "stateCode" | "filename">) {
  const o = await tx.propertyOnboarding.findFirstOrThrow({
    /* tenant-scope: the actor's own organisation's onboarding, found through its scoped property in the caller. */
    where: { id: onboardingId }, select: ONBOARDING,
  });
  const missing = documentChecklist(o, o.documents).filter((c) => !c.document).map((c) => c.label);
  const flags = missing.map((m) => `Document missing after an update: ${m}`);
  const now = new Date();
  await tx.propertyOnboarding.update({
    /* tenant-scope: the same row. */
    where: { id: o.id },
    data: { flags, flaggedAt: flags.length ? (o.flaggedAt ?? now) : null },
    select: { id: true },
  });
  const label = doc.stateCode ? `${DOCUMENT_LABEL[doc.kind as DocumentKind] ?? doc.kind} (${doc.stateCode})` : DOCUMENT_LABEL[doc.kind as DocumentKind] ?? doc.kind;
  await audit(tx, actor, `onboarding.document${change[0]!.toUpperCase()}${change.slice(1)}`, "PropertyOnboarding", o.id, {
    after: { documentId: doc.id, kind: doc.kind, stateCode: doc.stateCode, filename: doc.filename, flags },
  });
  const app = env.APP_URL.replace(/\/+$/, "");
  for (const u of await btgAdmins(tx, o.tenantId)) {
    await send(tx, o.tenantId, {
      template: "onboarding.documentChanged", to: u.email, idempotencyKey: `onboarding.documentChanged:${doc.id}:${change}:${u.id}`,
      data: {
        orgName: o.orgName, change: change === "removed" ? "removed a document" : change === "replaced" ? "replaced a document" : "added a document",
        document: `${label} — ${doc.filename}`, flagged: flags.map((f) => `• ${f}`).join("\n"),
        profileUrl: `${app}/admin/onboarding/${o.id}`,
      },
    });
  }
  return o;
}

/** POST /property/documents/:id/confirm — counted only once it is in the bucket; the earlier file moves to the history. */
export async function confirmOrganizationUpload(actor: Actor, documentId: string) {
  const { onboarding: o } = await ownOrganisation(prisma, actor, "write");
  assertOpen(o);
  const doc = o.documents.find((d) => d.id === documentId);
  if (!doc) throw new OnboardingError("That document isn't one of your organisation's.", 404);
  if (doc.uploadedAt) return listOrganizationDocuments(actor);
  const row = await prisma.onboardingDocument.findFirstOrThrow({ where: { tenantId: o.tenantId, onboardingId: o.id, id: doc.id }, select: { r2Key: true, contentType: true, bytes: true } });
  /* 2S8-SEC-03 — what arrived must be what the grant pinned; anything else is deleted. */
  const arrived = await checkPrivateUpload(actor, row.r2Key,
    { contentType: row.contentType, bytes: row.bytes, maxBytes: maxBytesFor(doc.kind) }, { entity: "OnboardingDocument", entityId: doc.id });
  if (!arrived.ok && arrived.problem === "missing") throw new OnboardingError("That document has not arrived yet — upload it, then confirm.", 409);
  if (!arrived.ok) throw new OnboardingError(uploadRefusal(arrived.problem, "That document"), 422);
  const size = arrived.bytes;
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const confirmed = await tx.onboardingDocument.updateMany({
      /* tenant-scope: the organisation's own document, loaded above within its onboarding. */
      where: { tenantId: o.tenantId, id: doc.id, uploadedAt: null }, data: { uploadedAt: now, bytes: size },
    });
    if (confirmed.count !== 1) return;
    let replaced = false;
    if (doc.replacesId) {
      const old = await tx.onboardingDocument.updateMany({
        /* tenant-scope: the earlier paper of the same organisation this one replaces. */
        where: { tenantId: o.tenantId, onboardingId: o.id, id: doc.replacesId, replacedAt: null, removedAt: null }, data: { replacedAt: now },
      });
      replaced = old.count === 1;
    }
    await recheck(tx, actor, o.id, replaced ? "replaced" : "added", doc);
  });
  return listOrganizationDocuments(actor);
}

/** DELETE /property/documents/:id — off the list, kept in the history; a missing required paper flags the organisation. */
export async function removeOrganizationDocument(actor: Actor, documentId: string) {
  const { onboarding: o } = await ownOrganisation(prisma, actor, "write");
  assertOpen(o);
  const doc = o.documents.find((d) => d.id === documentId);
  if (!doc || !isCurrent(doc)) throw new OnboardingError("That document isn't on file — reload the page.", 404);
  await prisma.$transaction(async (tx) => {
    const moved = await tx.onboardingDocument.updateMany({
      /* tenant-scope: the organisation's own current document, loaded above within its onboarding. */
      where: { tenantId: o.tenantId, onboardingId: o.id, id: doc.id, removedAt: null, replacedAt: null }, data: { removedAt: new Date() },
    });
    if (moved.count === 1) await recheck(tx, actor, o.id, "removed", doc);
  });
  return listOrganizationDocuments(actor);
}
