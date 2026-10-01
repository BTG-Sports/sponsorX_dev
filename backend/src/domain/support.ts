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
 * queued only once every declared file has arrived. The worker reads them
 * at send time and attaches them; nobody is ever handed a link to them.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { send } from "../lib/email";
import { env } from "../config/env";
import { issuePurposeToken, readPurposeToken } from "../lib/purpose-token";
import { presignPrivateUpload, privateObjectSize } from "../lib/storage";
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

/** A stable id for the thread: the desk's reply references it. */
const messageIdOf = (id: string) => `<support-${id}@sponsorx.net>`;

/** The two emails, queued in the caller's transaction. */
async function queue(tx: Tx, m: { id: string; tenantId: string; name: string; email: string; topic: string; message: string; createdAt: Date }) {
  const files = await tx.supportAttachment.findMany({
    where: { tenantId: m.tenantId, messageId: m.id, uploadedAt: { not: null } },
    select: { filename: true, r2Key: true, contentType: true },
  });
  const data = {
    name: m.name, email: m.email, topic: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic, message: m.message,
    reference: m.id, sentAt: m.createdAt.toISOString(), attachments: files.map((f) => f.filename).join(", "),
  };
  await send(tx, m.tenantId, {
    template: "support.message", to: env.SUPPORT_EMAIL, idempotencyKey: `support.message:${m.id}`, data,
    replyTo: m.email, headers: { "Message-ID": messageIdOf(m.id) },
    attachments: files.map((f) => ({ filename: f.filename, key: f.r2Key, contentType: f.contentType })),
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
        select: { id: true, filename: true, contentType: true, r2Key: true },
      }));
    }
    if (!declared.length) await queue(tx, m);
    return { m, files };
  });
  const uploads = [];
  for (const f of created.files) {
    uploads.push({
      attachmentId: f.id, filename: f.filename, contentType: f.contentType,
      uploadUrl: await presignPrivateUpload(SYSTEM(tenantId), f.r2Key, f.contentType, { entity: "SupportAttachment", entityId: f.id }),
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
    const files = await tx.supportAttachment.findMany({ where: { tenantId: m.tenantId, messageId: m.id }, select: { id: true, r2Key: true, filename: true } });
    for (const f of files) {
      const size = await privateObjectSize(f.r2Key);
      if (size === null) throw new SupportError(`${f.filename} hasn't arrived yet — upload it again, or send without it.`);
      if (size > MAX_SUPPORT_ATTACHMENT_BYTES) throw new SupportError(`${f.filename} is over 10 MB.`, 422);
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
