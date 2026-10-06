/**
 * Contacting BTG support — 2S1-BE-16.
 *
 * The way to reach a person at BTG for what must never be automated, a
 * disputed guardianship first. PUBLIC, like /join: the tenant is
 * configuration (PUBLIC_INTAKE_TENANT_ID) and the route is rate-limited.
 *
 * NEVER SENT ON THE REQUEST PATH. A message is a row plus two queued emails
 * (lib/email.ts `send`, inside the same transaction): one to the support
 * mailbox (SUPPORT_EMAIL — Zoho Desk or a shared inbox, 2S1-OPS-01) with
 * Reply-To set to the sender and a stable Message-ID, and a copy to the
 * sender that references it, so a reply from the desk continues the
 * thread. The worker retries with backoff (queue-policy.mts), so the
 * message still arrives when the mail service is briefly down.
 *
 * ATTACHMENTS stay private: each gets a presigned PUT to the private bucket
 * (an audited grant), the browser uploads it directly, and the message is
 * queued only once every declared file has arrived.
 *
 * 2S0-SEC-01 (the owner's decision on O1, 2026-10-06): the desk's email
 * NAMES the files and links to BTG's signed-in support page
 * (APP_URL/admin/support/<id>); it no longer carries them. A guardianship
 * dispute's attachment is a birth certificate or a court order, and once
 * mailed it lived in the desk's mailbox, outside the private bucket, its
 * audit and its retention. BTG opens each file through
 * GET /support-messages/:id/attachments/:attachmentId — a five-minute,
 * audited link, like every other ID document. And (O2) the retention sweep
 * deletes them (account-closure.ts `purgeSupportAttachments`).
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { assertTenantWide, whereFor } from "../auth/scope";
import { issuePurposeToken, readPurposeToken } from "../lib/purpose-token";
import { checkPrivateUpload, presignPrivateDownload, presignPrivateUpload, SENSITIVE_DOCUMENT_TTL_SECONDS, uploadRefusal } from "../lib/storage";
import { safeFilename } from "./onboarding-documents";
import { MAX_SUPPORT_ATTACHMENT_BYTES, SUPPORT_TOPICS } from "../contracts/support";
import type { Prisma } from "../generated/prisma/client";

type Tx = Prisma.TransactionClient;

export class SupportError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SupportError";
    this.status = status;
  }
}

export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
const TOPIC_WORDS: Record<SupportTopic, string> = { GUARDIANSHIP: "Guardianship", ACCOUNT: "Account", PAYMENT: "Payment", OTHER: "Other" };
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

/** What every page that shows the support address reads (GET /public/support). */
export function supportContact() {
  return {
    email: env.SUPPORT_EMAIL,
    /* Whether 2S1-OPS-01 has set the mailbox up; until then pages say "being set up". */
    ready: env.SUPPORT_MAILBOX_READY,
    topics: SUPPORT_TOPICS.map((key) => ({ key, label: TOPIC_WORDS[key] })),
  };
}

export type SupportInput = {
  name: string;
  email: string;
  topic: SupportTopic;
  message: string;
  attachments?: { filename: string; contentType: string; bytes: number }[];
};

/** BTG's signed-in page for one message, where its attachments are opened (2S0-SEC-01). */
export const supportPageUrl = (id: string) => `${env.APP_URL.replace(/\/+$/, "")}/admin/support/${encodeURIComponent(id)}`;

/** A stable id for the thread: the desk's reply references it. */
const messageIdOf = (id: string) => `<support-${id}@sponsorx.net>`;

/** The two emails, queued in the caller's transaction. */
async function queue(tx: Tx, m: { id: string; tenantId: string; name: string; email: string; topic: string; message: string; createdAt: Date }) {
  const files = await tx.supportAttachment.findMany({
    where: { tenantId: m.tenantId, messageId: m.id, uploadedAt: { not: null } },
    select: { filename: true },
  });
  const data = {
    name: m.name, email: m.email, topic: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic, message: m.message,
    reference: m.id, sentAt: m.createdAt.toISOString(), attachments: files.map((f) => f.filename).join(", "),
  };
  /* 2S0-SEC-01 — the desk's copy names the files and links to the signed-in page; it never carries them. */
  await send(tx, m.tenantId, {
    template: "support.message", to: env.SUPPORT_EMAIL, idempotencyKey: `support.message:${m.id}`,
    data: { ...data, attachmentsUrl: files.length ? supportPageUrl(m.id) : "" },
    replyTo: m.email, headers: { "Message-ID": messageIdOf(m.id) },
  });
  await send(tx, m.tenantId, {
    template: "support.copy", to: m.email, idempotencyKey: `support.copy:${m.id}`, data,
    replyTo: env.SUPPORT_EMAIL, headers: { "In-Reply-To": messageIdOf(m.id), References: messageIdOf(m.id) },
  });
  await tx.supportMessage.update({
    /* tenant-scope: the message being queued, in its own tenant. */
    where: { id: m.id }, data: { state: "QUEUED", queuedAt: new Date() },
  });
  await audit(tx, SYSTEM(m.tenantId), "support.messageQueued", "SupportMessage", m.id, { after: { topic: m.topic, attachments: files.length } });
}

/**
 * POST /public/support/messages. No attachments: queued now. With
 * attachments: each is granted a private upload, and the browser finishes
 * with POST /public/support/messages/:token/send.
 */
export async function submitSupportMessage(input: SupportInput) {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const declared = input.attachments ?? [];
  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.supportMessage.create({
      data: { tenantId, name: input.name.trim(), email: input.email.trim().toLowerCase(), topic: input.topic, message: input.message.trim() },
      select: { id: true, tenantId: true, name: true, email: true, topic: true, message: true, createdAt: true },
    });
    const files = [];
    for (const a of declared) {
      const id = `satt_${randomBytes(12).toString("hex")}`;
      const filename = safeFilename(a.filename);
      const r2Key = `support/${m.id}/${id}/${filename}`;
      files.push(await tx.supportAttachment.create({
        data: { id, tenantId, messageId: m.id, filename, contentType: a.contentType, bytes: a.bytes, r2Key },
        select: { id: true, filename: true, contentType: true, bytes: true, r2Key: true },
      }));
    }
    if (!declared.length) await queue(tx, m);
    return { m, files };
  });
  const uploads = [];
  for (const f of created.files) {
    uploads.push({
      attachmentId: f.id, filename: f.filename, contentType: f.contentType,
      /* 2S8-SEC-03 — each PUT is signed for exactly its file's type and size. */
      uploadUrl: await presignPrivateUpload(SYSTEM(tenantId), f.r2Key, f.contentType, { entity: "SupportAttachment", entityId: f.id }, {
        signContentType: true, contentLength: f.bytes,
      }),
    });
  }
  return {
    id: created.m.id,
    queued: declared.length === 0,
    /* Only this browser's way to finish sending: upload, then /send. */
    token: declared.length ? issuePurposeToken("support", created.m.id, new Date(Date.now() + 60 * 60 * 1000)) : null,
    uploads,
    supportEmail: env.SUPPORT_EMAIL,
  };
}

/** POST /public/support/messages/:token/send — every declared file is there; queue it. */
export async function sendSupportMessage(token: string) {
  const id = readPurposeToken("support", token);
  if (!id) throw new SupportError("This message has expired. Send the form again.", 400);
  return prisma.$transaction(async (tx) => {
    const m = await tx.supportMessage.findFirst({
      /* tenant-scope: found by the id inside a signed token only the sending browser holds. */
      where: { id }, select: { id: true, tenantId: true, name: true, email: true, topic: true, message: true, state: true, createdAt: true },
    });
    if (!m) throw new SupportError("This message no longer exists.", 404);
    if (m.state === "QUEUED") return { id: m.id, queued: true, supportEmail: env.SUPPORT_EMAIL };
    const files = await tx.supportAttachment.findMany({ where: { tenantId: m.tenantId, messageId: m.id }, select: { id: true, r2Key: true, filename: true, contentType: true, bytes: true } });
    for (const f of files) {
      /* 2S8-SEC-03 — what arrived must be what the grant pinned; anything else is deleted. */
      const arrived = await checkPrivateUpload(SYSTEM(m.tenantId), f.r2Key,
        { contentType: f.contentType, bytes: f.bytes, maxBytes: MAX_SUPPORT_ATTACHMENT_BYTES }, { entity: "SupportAttachment", entityId: f.id });
      if (!arrived.ok && arrived.problem === "missing") throw new SupportError(`${f.filename} hasn't arrived yet — upload it again, or send without it.`);
      if (!arrived.ok) throw new SupportError(uploadRefusal(arrived.problem, f.filename), 422);
      const size = arrived.bytes;
      await tx.supportAttachment.update({
        /* tenant-scope: this message's own attachment. */
        where: { id: f.id }, data: { uploadedAt: new Date(), bytes: size },
      });
    }
    await queue(tx, m);
    return { id: m.id, queued: true, supportEmail: env.SUPPORT_EMAIL };
  });
}

/** POST /public/support/messages/:token/attachments/:id/drop — send without a file that won't upload. */
export async function dropSupportAttachment(token: string, attachmentId: string) {
  const id = readPurposeToken("support", token);
  if (!id) throw new SupportError("This message has expired. Send the form again.", 400);
  const m = await prisma.supportMessage.findFirst({
    /* tenant-scope: found by the id inside a signed token only the sending browser holds. */
    where: { id }, select: { id: true, tenantId: true, state: true },
  });
  if (!m) throw new SupportError("This message no longer exists.", 404);
  if (m.state === "QUEUED") throw new SupportError("This message has already been sent.");
  const gone = await prisma.supportAttachment.deleteMany({ where: { tenantId: m.tenantId, messageId: m.id, id: attachmentId } });
  if (!gone.count) throw new SupportError("That file isn't part of this message.", 404);
  return { dropped: attachmentId };
}

/* ── BTG's support desk — 2S0-SEC-01 ──────────────────────────────────── */

/**
 * GET /support-messages/:id — one message as BTG's support page shows it:
 * who sent it, the topic and text, and its attachments (name, type, size,
 * whether it arrived). No file and no link: each file is opened separately,
 * through its own audited grant. BTG admin only.
 */
export async function getSupportMessage(actor: Actor, id: string) {
  assertTenantWide(actor, "supportMessage", "read");
  const m = await prisma.supportMessage.findFirst({
    where: { ...whereFor(actor, "supportMessage", "read"), id },
    select: { id: true, name: true, email: true, topic: true, message: true, state: true, createdAt: true, queuedAt: true },
  });
  if (!m) throw new ForbiddenError("supportMessage", "read");
  const files = await prisma.supportAttachment.findMany({
    /* tenant-scope: the message was found through whereFor(supportMessage, read); its attachments are named by its id. */
    where: { messageId: m.id }, select: { id: true, filename: true, contentType: true, bytes: true, uploadedAt: true }, orderBy: { createdAt: "asc" },
  });
  return {
    ...m,
    topicLabel: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic,
    attachments: files.map((f) => ({ ...f, arrived: f.uploadedAt !== null })),
  };
}

/** GET /support-messages/:id/attachments/:attachmentId — BTG opens one attachment through a five-minute, audited link. */
export async function viewSupportAttachment(actor: Actor, id: string, attachmentId: string) {
  assertTenantWide(actor, "supportMessage", "read");
  const m = await prisma.supportMessage.findFirst({ where: { ...whereFor(actor, "supportMessage", "read"), id }, select: { id: true, tenantId: true } });
  if (!m) throw new ForbiddenError("supportMessage", "read");
  const f = await prisma.supportAttachment.findFirst({ where: { tenantId: m.tenantId, messageId: m.id, id: attachmentId }, select: { id: true, r2Key: true, uploadedAt: true } });
  if (!f) throw new ForbiddenError("supportMessage", "read");
  if (!f.uploadedAt) throw new SupportError("That file never finished uploading.");
  const url = await presignPrivateDownload(actor, f.r2Key, { entity: "SupportAttachment", entityId: f.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}
