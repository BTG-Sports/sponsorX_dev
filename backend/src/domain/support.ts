/**
 * Contacting BTG support — 2S1-BE-16.
 *
 * The way to reach a person at BTG for what must never be automated, a
 * disputed guardianship first. PUBLIC, like /join: the tenant is
 * configuration (PUBLIC_INTAKE_TENANT_ID) and the route is rate-limited.
 *
 * NEVER SENT ON THE REQUEST PATH. A message is a row plus two queued emails
 * (lib/email.ts `send`, inside the same transaction): a notice to the
 * support mailbox (SUPPORT_EMAIL) with a stable Message-ID, and a copy to
 * the sender that references it. The worker retries with backoff
 * (queue-policy.mts), so the message still arrives when the mail service is
 * briefly down.
 *
 * POL-BE-41 — THE INBOX IS IN SPONSORX. The mailbox's notice says who wrote,
 * the topic and links to the message; it never carries the text. BTG reads,
 * answers and closes it here: a reply is kept with the message and emailed
 * to the sender from noreply@ in the same thread, and the message shows
 * what the sender has on SponsorX and which of it is held.
 *
 * POL-BE-43 — THE HELP DESK FORM. The sender picks a topic and ticks the
 * cases that apply (domain/helpdesk-cases.ts); the text is needed only when
 * nothing is ticked or "Something else" is. A visitor may tick only public
 * cases; sent while signed in, the message is linked to that account and
 * only that role's cases may be ticked. The inbox labels each message with
 * its cases and filters by case or topic.
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
import { MAX_SUPPORT_ATTACHMENT_BYTES, SUPPORT_STATUSES, SUPPORT_TOPICS } from "../contracts/support";
import { caseLabel, HELPDESK_TOPIC_LABELS, OTHER_CASE_ID, refusedCases, type HelpdeskTopic } from "./helpdesk-cases";
import type { Prisma } from "../generated/prisma/client";
import { readPage, type PageInfo, type PageRequest } from "../lib/paging";
import { problemsOf, type Problem } from "./hold-problems";

type Tx = Prisma.TransactionClient;

export class SupportError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SupportError";
    this.status = status;
  }
}

export type SupportTopic = HelpdeskTopic;
/* The four contact-form topics keep their words; POL-BE-43 adds four more. */
const TOPIC_WORDS: Record<SupportTopic, string> = HELPDESK_TOPIC_LABELS;
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });

/** What every page that shows the support address reads (GET /public/support). */
export function supportContact() {
  return {
    email: env.SUPPORT_EMAIL,
    /* Whether 2S1-OPS-01 has set the mailbox up; until then pages say "being set up". */
    ready: env.SUPPORT_MAILBOX_READY,
    /* The contact form's four, unchanged; the help desk reads its eight, with their cases, from GET /public/support/cases. */
    topics: SUPPORT_TOPICS.map((key) => ({ key, label: TOPIC_WORDS[key] })),
  };
}

export type SupportInput = {
  name: string;
  email: string;
  topic: SupportTopic;
  /** POL-BE-43 — the ticked case IDs. */
  cases?: string[];
  /** Required when nothing is ticked, or "Something else" is. */
  message?: string;
  attachments?: { filename: string; contentType: string; bytes: number }[];
};

/** BTG's signed-in page for one message, where its attachments are opened (2S0-SEC-01). */
export const supportPageUrl = (id: string) => `${env.APP_URL.replace(/\/+$/, "")}/admin/support/${encodeURIComponent(id)}`;

/** The public Contact page, where a sender adds to what they wrote (POL-BE-41). */
const contactPageUrl = () => `${env.APP_URL.replace(/\/+$/, "")}/contact`;

/** A stable id for the thread: the desk's reply references it. */
const messageIdOf = (id: string) => `<support-${id}@sponsorx.net>`;

/**
 * The two emails, queued in the caller's transaction.
 *
 * POL-BE-41 — the mailbox's email is a NOTICE: who wrote, the topic, how many
 * files and the link to the message in SponsorX. It carries neither the text
 * nor a file name (a guardian writes about a minor; a file is called
 * "birth-certificate-<child>.pdf"), and no Reply-To: BTG answers from
 * SponsorX, so the reply is kept and leaves from noreply@. The sender's copy
 * carries only our words (2S8-SEC-02), so only those go in its payload.
 */
async function queue(tx: Tx, m: { id: string; tenantId: string; name: string; email: string; topic: string; caseIds: string[]; userId: string | null; createdAt: Date }) {
  const files = await tx.supportAttachment.count({
    where: { tenantId: m.tenantId, messageId: m.id, uploadedAt: { not: null } },
  });
  const topic = TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic;
  /* POL-BE-43 — the cases: IDs for the desk, our own words for the sender. */
  const ticked = m.caseIds.map(caseLabel).map((c) => `- ${c.text ?? c.id}`).join("\n");
  await send(tx, m.tenantId, {
    template: "support.message", to: env.SUPPORT_EMAIL, idempotencyKey: `support.message:${m.id}`,
    data: {
      name: m.name, email: m.email, topic, reference: m.id, sentAt: m.createdAt.toISOString(), attachmentCount: String(files), openUrl: supportPageUrl(m.id),
      ...(m.caseIds.length ? { cases: m.caseIds.join(", ") } : {}), ...(m.userId ? { signedIn: "yes" } : {}),
    },
    headers: { "Message-ID": messageIdOf(m.id) },
  });
  await send(tx, m.tenantId, {
    /* No Reply-To either: an answer to the copy would put the sender's text in
       the mailbox. The copy points them back to the form instead. */
    template: "support.copy", to: m.email, idempotencyKey: `support.copy:${m.id}`, data: { topic, reference: m.id, contactUrl: contactPageUrl(), ...(ticked ? { ticked } : {}) },
    headers: { "In-Reply-To": messageIdOf(m.id), References: messageIdOf(m.id) },
  });
  await tx.supportMessage.update({
    /* tenant-scope: the message being queued, in its own tenant. */
    where: { id: m.id }, data: { state: "QUEUED", queuedAt: new Date() },
  });
  await audit(tx, SYSTEM(m.tenantId), "support.messageQueued", "SupportMessage", m.id, { after: { topic: m.topic, cases: m.caseIds, attachments: files, signedIn: m.userId !== null } });
}

const QUEUE_SELECT = { id: true, tenantId: true, name: true, email: true, topic: true, caseIds: true, userId: true, createdAt: true } as const;

/**
 * POST /public/support/messages. No attachments: queued now. With
 * attachments: each is granted a private upload, and the browser finishes
 * with POST /public/support/messages/:token/send.
 *
 * POL-BE-43 — `sender` is who is signed in, or null for a visitor: it decides
 * which cases may be ticked, and a signed-in sender's message is linked to
 * their account.
 */
export async function submitSupportMessage(input: SupportInput, sender: Actor | null = null) {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const declared = input.attachments ?? [];
  const caseIds = [...new Set(input.cases ?? [])];
  const text = (input.message ?? "").trim();
  const refused = refusedCases(sender ? { roles: sender.roles } : null, input.topic, caseIds);
  if (refused) throw new SupportError(refused, 422);
  if (!caseIds.length && !text) throw new SupportError("Tick what's wrong, or tell us in the message box.", 422);
  if (caseIds.includes(OTHER_CASE_ID) && !text) throw new SupportError("You ticked \"Something else\": tell us what's wrong in the message box.", 422);
  /* Linked only within the help desk's own tenant: an account elsewhere is a visitor here. */
  const userId = sender && sender.tenantId === tenantId ? sender.userId : null;
  const created = await prisma.$transaction(async (tx) => {
    const m = await tx.supportMessage.create({
      data: { tenantId, name: input.name.trim(), email: input.email.trim().toLowerCase(), topic: input.topic, caseIds, message: text, userId },
      select: QUEUE_SELECT,
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
      where: { id }, select: { ...QUEUE_SELECT, state: true },
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

/* ── BTG's support desk — 2S0-SEC-01, POL-BE-41 ─────────────────────────── */

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** Only a message that reached the desk is in the inbox: a DRAFT is still waiting for its files. */
const inbox = (actor: Actor) => ({ ...whereFor(actor, "supportMessage", "read"), state: "QUEUED" });

/**
 * GET /support-messages — BTG's inbox, one status at a time (default NEW),
 * newest first, with every status's count (the menu's "new" badge reads
 * counts.NEW). A row is who wrote, the topic and when — the text is read on
 * the message. BTG admin only.
 */
export async function listSupportMessages(actor: Actor, filter: { status?: SupportStatus; case?: string; topic?: SupportTopic } = {}, page?: PageRequest) {
  assertTenantWide(actor, "supportMessage", "read");
  const status = filter.status ?? "NEW";
  /* POL-BE-43 — one case (or one topic): the tabs and their counts both narrow to it. */
  const where = { ...inbox(actor), ...(filter.case ? { caseIds: { has: filter.case } } : {}), ...(filter.topic ? { topic: filter.topic } : {}) };
  const tab = { ...where, status };
  const read = (skip: number, take: number) => prisma.supportMessage.findMany({
    where: tab /* tenant-scope: whereFor(supportMessage) in inbox() */,
    select: { id: true, name: true, email: true, topic: true, caseIds: true, userId: true, status: true, createdAt: true, answeredAt: true, closedAt: true, _count: { select: { attachments: { where: { uploadedAt: { not: null } } }, replies: true } } },
    orderBy: { createdAt: "desc" }, skip, take,
  });
  const [paged, grouped] = await Promise.all([
    page
      ? readPage(page, () => prisma.supportMessage.count({ where: tab /* tenant-scope: whereFor(supportMessage) in inbox() */ }), read)
      : read(0, 200).then((rows) => ({ rows, page: null as PageInfo | null })),
    prisma.supportMessage.groupBy({ where /* tenant-scope: whereFor(supportMessage) in inbox() */, by: ["status"], _count: { _all: true } }),
  ]);
  const counts: Record<SupportStatus, number> = { NEW: 0, ANSWERED: 0, CLOSED: 0 };
  for (const g of grouped) counts[g.status as SupportStatus] = g._count._all;
  return {
    messages: paged.rows.map(({ _count, caseIds, userId, ...m }) => ({
      ...m, topicLabel: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic, cases: caseIds.map(caseLabel), signedIn: userId !== null,
      attachments: _count.attachments, replies: _count.replies,
    })),
    counts,
    ...(paged.page ? { page: paged.page } : {}),
  };
}

/** One of the sender's records, as the "This person on SponsorX" card lists it. */
export type SenderRecord = {
  kind: "ATHLETE" | "SPONSOR_REQUEST" | "ORGANISATION" | "GUARDIAN" | "STUDENT";
  /** SELF: found by the sender's address. WARD: an athlete the sender is guardian of. */
  relation: "SELF" | "WARD";
  id: string;
  label: string;
  state: string;
  /** Waiting for BTG, with `reasons` saying why (the stored reasons, word for word). */
  held: boolean;
  reasons: string[];
  /** POL-BE-42 — the same reasons as typed, coded tags (hold-problems.ts). */
  problems: Problem[];
  emailConfirmed: boolean;
  /** BTG's page for it, or null where there is none yet. */
  adminPath: string | null;
  /** Null for a guardian account, which keeps no creation time. */
  createdAt: Date | null;
};

/**
 * Everything the sender has on SponsorX, found by their email address in the
 * message's tenant: athlete sign-ups, sponsor requests, organisations,
 * guardian accounts (with the athletes they look after) and students. Held
 * means waiting for BTG with stored reasons — the same test as the sign-up
 * desks (athlete-signup.ts `underReview`, signups-stream.ts).
 */
async function senderRecords(tenantId: string, email: string): Promise<SenderRecord[]> {
  const byEmail = { equals: email, mode: "insensitive" as const };
  const [athletes, requests, orgs, guardians, students] = await Promise.all([
    prisma.athlete.findMany({ where: { tenantId, email: byEmail } /* tenant-scope: the message's own tenant */, select: ATHLETE_SELECT, take: 20 }),
    prisma.inquiry.findMany({ where: { tenantId, email: byEmail } /* tenant-scope: the message's own tenant */, select: { id: true, companyName: true, firstName: true, lastName: true, state: true, reviewReasons: true, emailConfirmedAt: true, createdAt: true }, take: 20 }),
    prisma.propertyOnboarding.findMany({ where: { tenantId, confirmedEmail: byEmail } /* tenant-scope: the message's own tenant */, select: { id: true, orgName: true, state: true, reviewReasons: true, emailConfirmedAt: true, createdAt: true }, take: 20 }),
    prisma.guardian.findMany({ where: { tenantId, email: byEmail } /* tenant-scope: the message's own tenant */, select: { id: true, legalName: true, emailConfirmedAt: true, rejectedAt: true, wards: { select: ATHLETE_SELECT, take: 20 } }, take: 20 }),
    prisma.student.findMany({ where: { tenantId, email: byEmail } /* tenant-scope: the message's own tenant */, select: { id: true, legalName: true, state: true, reviewReasons: true, createdAt: true }, take: 20 }),
  ]);
  const athlete = (a: (typeof athletes)[number], relation: SenderRecord["relation"]): Omit<SenderRecord, "problems"> => {
    const held = a.state === "SUBMITTED" && a.reviewReasons.length > 0;
    return { kind: "ATHLETE", relation, id: a.id, label: a.legalName, state: a.state, held, reasons: held ? a.reviewReasons : [], emailConfirmed: a.emailConfirmedAt !== null, adminPath: `/admin/new-signups/athletes/${a.id}`, createdAt: a.createdAt };
  };
  const out: Omit<SenderRecord, "problems">[] = athletes.map((a) => athlete(a, "SELF"));
  for (const r of requests) {
    const held = r.state === "NEW" && r.reviewReasons.length > 0;
    out.push({ kind: "SPONSOR_REQUEST", relation: "SELF", id: r.id, label: r.companyName || [r.firstName, r.lastName].filter(Boolean).join(" "), state: r.state, held, reasons: held ? r.reviewReasons : [], emailConfirmed: r.emailConfirmedAt !== null, adminPath: `/admin/sponsor-requests/${r.id}`, createdAt: r.createdAt });
  }
  for (const o of orgs) {
    const held = o.state === "PENDING_REVIEW" && o.reviewReasons.length > 0;
    out.push({ kind: "ORGANISATION", relation: "SELF", id: o.id, label: o.orgName, state: o.state, held, reasons: held ? o.reviewReasons : [], emailConfirmed: o.emailConfirmedAt !== null, adminPath: `/admin/onboarding/${o.id}`, createdAt: o.createdAt });
  }
  const seen = new Set(out.map((r) => r.id));
  for (const g of guardians) {
    out.push({ kind: "GUARDIAN", relation: "SELF", id: g.id, label: g.legalName, state: g.rejectedAt ? "REJECTED" : g.emailConfirmedAt ? "ACTIVE" : "EMAIL_NOT_CONFIRMED", held: false, reasons: [], emailConfirmed: g.emailConfirmedAt !== null, adminPath: `/admin/new-signups/guardians/${g.id}`, createdAt: null });
    for (const w of g.wards) if (!seen.has(w.id)) { seen.add(w.id); out.push(athlete(w, "WARD")); }
  }
  for (const st of students) {
    const held = st.state === "SUBMITTED" && st.reviewReasons.length > 0;
    /* No BTG page for a student yet. */
    out.push({ kind: "STUDENT", relation: "SELF", id: st.id, label: st.legalName, state: st.state, held, reasons: held ? st.reviewReasons : [], emailConfirmed: true, adminPath: null, createdAt: st.createdAt });
  }
  /* Held first, then newest. */
  return out.map((r) => ({ ...r, problems: problemsOf(r.reasons) })).sort((x, y) => Number(y.held) - Number(x.held) || (y.createdAt?.getTime() ?? 0) - (x.createdAt?.getTime() ?? 0));
}
const ATHLETE_SELECT = { id: true, legalName: true, state: true, reviewReasons: true, emailConfirmedAt: true, createdAt: true } as const;

/**
 * GET /support-messages/:id — one message as BTG's support page shows it:
 * who sent it, the topic and text, its status, BTG's replies, its
 * attachments (name, type, size, whether it arrived) and what the sender has
 * on SponsorX (POL-BE-41). No file and no link: each file is opened
 * separately, through its own audited grant. BTG admin only.
 */
export async function getSupportMessage(actor: Actor, id: string) {
  assertTenantWide(actor, "supportMessage", "read");
  const m = await prisma.supportMessage.findFirst({
    where: { ...whereFor(actor, "supportMessage", "read"), id },
    select: {
      id: true, tenantId: true, name: true, email: true, topic: true, caseIds: true, message: true, state: true, status: true, createdAt: true, queuedAt: true, answeredAt: true, closedAt: true, closedById: true,
      /* POL-BE-43 — the account it was sent from, when signed in. */
      user: { select: { id: true, email: true, roles: true } },
    },
  });
  if (!m) throw new ForbiddenError("supportMessage", "read");
  const [files, replies, sender] = await Promise.all([
    prisma.supportAttachment.findMany({
      /* tenant-scope: the message was found through whereFor(supportMessage, read); its attachments are named by its id. */
      where: { messageId: m.id }, select: { id: true, filename: true, contentType: true, bytes: true, uploadedAt: true }, orderBy: { createdAt: "asc" },
    }),
    prisma.supportReply.findMany({
      /* tenant-scope: the message's own tenant, by its id. */
      where: { tenantId: m.tenantId, messageId: m.id }, select: { id: true, body: true, authorId: true, createdAt: true }, orderBy: { createdAt: "asc" },
    }),
    senderRecords(m.tenantId, m.email),
  ]);
  const { tenantId: _tenant, caseIds, user, ...rest } = m;
  return {
    ...rest,
    topicLabel: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic,
    cases: caseIds.map(caseLabel),
    account: user,
    attachments: files.map((f) => ({ ...f, arrived: f.uploadedAt !== null })),
    replies,
    sender: { records: sender, held: sender.filter((r) => r.held).length },
  };
}

/** The message a BTG admin may write to: in their reach, and sent to the desk. */
async function writable(tx: Tx, actor: Actor, id: string) {
  assertTenantWide(actor, "supportMessage", "write");
  const m = await tx.supportMessage.findFirst({
    where: { ...whereFor(actor, "supportMessage", "write"), id },
    select: { id: true, tenantId: true, email: true, topic: true, state: true, status: true },
  });
  if (!m) throw new ForbiddenError("supportMessage", "write");
  if (m.state !== "QUEUED") throw new SupportError("This message hasn't finished sending yet.");
  return m;
}

/**
 * POST /support-messages/:id/replies — BTG answers in SponsorX. The reply is
 * kept with the message and queued to the sender from noreply@ in the same
 * transaction, threaded under their message; the message becomes ANSWERED
 * (a closed one too — writing again reopens it). Audited, without the text.
 */
export async function replyToSupportMessage(actor: Actor, id: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const m = await writable(tx, actor, id);
    const reply = await tx.supportReply.create({
      data: { tenantId: m.tenantId, messageId: m.id, body: body.trim(), authorId: actor.userId },
      select: { id: true, body: true, authorId: true, createdAt: true },
    });
    await send(tx, m.tenantId, {
      template: "support.reply", to: m.email, idempotencyKey: `support.reply:${reply.id}`,
      data: { body: reply.body, topic: TOPIC_WORDS[m.topic as SupportTopic] ?? m.topic, reference: m.id, contactUrl: contactPageUrl() },
      headers: { "In-Reply-To": messageIdOf(m.id), References: messageIdOf(m.id) },
    });
    const now = new Date();
    await tx.supportMessage.update({
      /* tenant-scope: found through whereFor(supportMessage, write) in writable(). */
      where: { id: m.id }, data: { status: "ANSWERED", answeredAt: now, closedAt: null, closedById: null }, select: { id: true },
    });
    await audit(tx, actor, "support.replied", "SupportMessage", m.id, { before: { status: m.status }, after: { status: "ANSWERED", replyId: reply.id } });
    return { id: m.id, status: "ANSWERED" as const, reply };
  });
}

/** POST /support-messages/:id/close — "Mark closed". Closing a closed message changes nothing. */
export async function closeSupportMessage(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    const m = await writable(tx, actor, id);
    if (m.status === "CLOSED") return { id: m.id, status: "CLOSED" as const };
    await tx.supportMessage.update({
      /* tenant-scope: found through whereFor(supportMessage, write) in writable(). */
      where: { id: m.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: actor.userId }, select: { id: true },
    });
    await audit(tx, actor, "support.closed", "SupportMessage", m.id, { before: { status: m.status }, after: { status: "CLOSED" } });
    return { id: m.id, status: "CLOSED" as const };
  });
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
