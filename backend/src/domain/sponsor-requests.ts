/**
 * New sponsors — 2S1-BE-05 (BTG's decision) and 2S1-BE-17 (automatic approval).
 *
 * THE REQUEST is the enquiry the public form already writes (P8-INT-06) —
 * still pushed to Zoho as a Lead, unchanged. It also waits in SponsorX:
 * NEW → APPROVED or NEW → DECLINED, once; an approved one can later be
 * REJECTED by BTG (its logins switched off) and reinstated.
 *
 * AUTOMATIC APPROVAL (2S1-BE-17). BTG has at most one reviewer, so the
 * system approves a sponsor itself once the contact has confirmed their
 * email, the proof of business is uploaded and the business type is given —
 * unless the type is restricted, the "Other" description matches the
 * restricted-words list (2S1-BE-18) or sounds like a restricted type, the
 * email already has a login, or a sponsor with the same name exists. Those
 * wait in BTG's queue with their reasons. Either way BTG admins and sales
 * are emailed a link to the request.
 *
 * OPENING THE ACCOUNT is one transaction, the same for a person or the
 * system: the sponsor (with its categories — the clash check's input), its
 * primary contact, and a SPONSOR_ADMIN login for the request's email,
 * created the way every provisioned login is (a placeholder clerkId the
 * first sign-in claims, auth/actor.ts). The sign-in email and the Zoho
 * account push are queued in the same transaction.
 *
 * NO DUPLICATES. A same-named sponsor (business-name-rules.ts) is never
 * linked automatically — only a person can tell the same company from a
 * different one, and linking on a name alone would let a stranger take over
 * a real company's account. An email that already has a login is refused:
 * logins are claimed by email.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { presignPrivateDownload, presignPrivateUpload, privateObjectSize, SENSITIVE_DOCUMENT_TTL_SECONDS } from "../lib/storage";
import { issueSponsorRequestToken, readSponsorEmailToken, readSponsorRequestToken } from "../lib/sponsor-request-token";
import type { BrandCategory } from "./brand-categories";
import { normalizeBusinessName } from "./business-name-rules";
import { checkRestricted } from "./restricted-words";
import { recordClosureIn, reopenClosureIn } from "./account-closure";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, safeFilename } from "./onboarding-documents";
import {
  briefAnswers, sponsorApprovalVerdict, sponsorNameFor, suggestCategories, type SponsorRequestState,
} from "./sponsor-request-rules";
import { readPage, type PageInfo, type PageRequest } from "../lib/paging";

type Tx = Prisma.TransactionClient;

export class SponsorRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SponsorRequestError";
    this.status = status;
  }
}

export const INQUIRY_SELECT = {
  id: true, tenantId: true, companyName: true, firstName: true, lastName: true, email: true, phone: true, message: true, source: true,
  categoryText: true, zohoLeadId: true, state: true, decidedAt: true, decidedBy: true, decisionNote: true, sponsorId: true, createdAt: true,
  businessType: true, businessTypeOther: true, emailConfirmedAt: true, reviewReasons: true, autoApproved: true,
} as const;
const SELECT = INQUIRY_SELECT;
type Row = Prisma.InquiryGetPayload<{ select: typeof INQUIRY_SELECT }>;

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const appUrl = () => env.APP_URL.replace(/\/+$/, "");
const firstNameOf = (r: Pick<Row, "firstName" | "lastName">) => r.firstName?.trim() || r.lastName;

export function summary(r: Row) {
  return {
    id: r.id, state: r.state as SponsorRequestState, businessName: sponsorNameFor(r),
    contactName: [r.firstName, r.lastName].filter(Boolean).join(" "), email: r.email,
    categoryText: r.categoryText, businessType: r.businessType, businessTypeOther: r.businessTypeOther,
    budget: briefAnswers(r.message).find((a) => a.label === "Budget")?.value ?? null,
    zoho: r.zohoLeadId ? "LEAD" as const : "PENDING" as const,
    emailConfirmed: Boolean(r.emailConfirmedAt), autoApproved: r.autoApproved, reviewReasons: r.reviewReasons,
    createdAt: r.createdAt, decidedAt: r.decidedAt, sponsorId: r.sponsorId,
  };
}

/** BTG's queue: one tab at a time, newest first, with every tab's count. */
/** `page` (the house pager, lib/paging.ts): one page of the tab and its count instead of the first 200. */
export async function listSponsorRequests(actor: Actor, state: SponsorRequestState = "NEW", page?: PageRequest) {
  const where = whereFor(actor, "inquiry", "read");
  const tabWhere = { ...where, state };
  const read = (skip: number, take: number) =>
    prisma.inquiry.findMany({ where: tabWhere /* tenant-scope: whereFor(inquiry) in where */, select: SELECT, orderBy: { createdAt: state === "NEW" ? "asc" : "desc" }, skip, take });
  const [paged, grouped] = await Promise.all([
    page
      ? readPage(page, () => prisma.inquiry.count({ where: tabWhere /* tenant-scope: whereFor(inquiry) in where */ }), read)
      : read(0, 200).then((rows) => ({ rows, page: null as PageInfo | null })),
    prisma.inquiry.groupBy({ where: { ...where }, by: ["state"], _count: { _all: true } }),
  ]);
  const counts = { NEW: 0, APPROVED: 0, DECLINED: 0, REJECTED: 0 } as Record<SponsorRequestState, number>;
  for (const g of grouped) counts[g.state as SponsorRequestState] = g._count._all;
  return { requests: paged.rows.map(summary), counts, ...(paged.page ? { page: paged.page } : {}) };
}

/** Sponsors in this tenant with the same business name, by the one name rule. */
async function sameNameSponsors(tx: Tx | typeof prisma, tenantId: string, name: string) {
  const key = normalizeBusinessName(name);
  if (!key) return [];
  const all = await tx.sponsor.findMany({
    /* tenant-scope: the request's own tenant — every sponsor it could duplicate. */
    where: { tenantId }, select: { id: true, name: true, zohoAccountId: true },
  });
  return all.filter((s) => normalizeBusinessName(s.name) === key);
}

/** "Already has a login" is platform-wide: a login is claimed by email across every tenant (auth/actor.ts). */
async function emailInUse(tx: Tx | typeof prisma, email: string) {
  const login = await tx.user.findFirst({
    /* tenant-scope: identity resolution is cross-tenant by design — see auth/actor.ts. */
    where: { email: { equals: email, mode: "insensitive" } }, select: { id: true },
  });
  return Boolean(login);
}

/** Everything BTG weighs before deciding — and the checks that gate Approve. */
async function checksFor(tx: Tx | typeof prisma, r: Row) {
  const [inUse, same] = await Promise.all([emailInUse(tx, r.email), sameNameSponsors(tx, r.tenantId, sponsorNameFor(r))]);
  const withLogin = await loginsOf(tx, same.map((s) => s.id));
  return {
    emailInUse: inUse,
    matches: same.map((s) => ({ id: s.id, name: s.name, fromZoho: Boolean(s.zohoAccountId), hasLogin: withLogin.has(s.id) })),
  };
}

export async function getSponsorRequest(actor: Actor, id: string) {
  const row = await prisma.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("inquiry", "read");
  const [checks, documents] = await Promise.all([
    checksFor(prisma, row),
    prisma.inquiryDocument.findMany({
      where: { tenantId: row.tenantId, inquiryId: row.id }, select: { id: true, kind: true, filename: true, contentType: true, bytes: true, uploadedAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    ...summary(row), phone: row.phone, message: row.message, answers: briefAnswers(row.message),
    suggestedCategories: suggestCategories(row.businessType === "OTHER" ? row.businessTypeOther : (row.categoryText ?? row.businessTypeOther)),
    zohoLeadId: row.zohoLeadId, decisionNote: row.decisionNote, decidedBy: row.decidedBy,
    documents, checks, progress: await progressOf(row),
  };
}

/** BTG reads a proof of business through a five-minute, audited link. */
export async function viewSponsorDocument(actor: Actor, id: string, documentId: string) {
  const row = await prisma.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "read"), id }, select: { id: true, tenantId: true } });
  if (!row) throw new ForbiddenError("inquiry", "read");
  const doc = await prisma.inquiryDocument.findFirst({ where: { tenantId: row.tenantId, inquiryId: row.id, id: documentId }, select: { id: true, r2Key: true, uploadedAt: true } });
  if (!doc) throw new ForbiddenError("inquiry", "read");
  if (!doc.uploadedAt) throw new SponsorRequestError("That document never finished uploading.");
  const url = await presignPrivateDownload(actor, doc.r2Key, { entity: "InquiryDocument", entityId: doc.id }, SENSITIVE_DOCUMENT_TTL_SECONDS);
  return { url, expiresInSeconds: SENSITIVE_DOCUMENT_TTL_SECONDS };
}

/**
 * What happened after the decision, read from where it is recorded — never
 * assumed: who decided, whether the email actually went (the email job's
 * send log), and whether the new login has been signed into (a claimed
 * login's clerkId is no longer the invite placeholder).
 */
async function progressOf(row: Row) {
  if (row.state === "NEW") return null;
  const key = `${row.state === "DECLINED" ? "sponsor.requestDeclined" : "sponsor.accountOpened"}:${row.id}`;
  const [decider, sent, login, sponsor] = await Promise.all([
    row.decidedBy ? prisma.user.findFirst({ where: { tenantId: row.tenantId, id: row.decidedBy }, select: { email: true, roles: true } }) : null,
    prisma.emailSendLog.findFirst({ where: { tenantId: row.tenantId, idempotencyKey: key }, select: { sentAt: true } }),
    row.sponsorId
      ? prisma.user.findFirst({ where: { tenantId: row.tenantId, email: row.email.toLowerCase(), sponsorId: row.sponsorId }, select: { clerkId: true, disabledAt: true } })
      : null,
    row.sponsorId ? prisma.sponsor.findFirst({ where: { tenantId: row.tenantId, id: row.sponsorId }, select: { categories: true } }) : null,
  ]);
  return {
    /* The business type the account was opened with — the clash check's input. */
    categories: sponsor?.categories ?? [],
    decidedBy: decider ? { email: decider.email, roles: decider.roles } : null,
    automatic: row.autoApproved,
    emailSentAt: sent?.sentAt ?? null,
    signedIn: login ? !login.clerkId.startsWith("invite:") : null,
    loginSwitchedOff: login ? Boolean(login.disabledAt) : null,
  };
}

/* ═══════════════════════ opening the account ═══════════════════════════ */

type OpenOptions = {
  categories: BrandCategory[];
  linkSponsorId?: string | null;
  decidedBy: string | null;
  auditActor: AuditActor;
};

/** The sponsor, its primary contact and its login; the sign-in email and Zoho push, queued. */
async function openAccount(tx: Tx, row: Row, o: OpenOptions) {
  let sponsorId: string;
  if (o.linkSponsorId) {
    const target = await tx.sponsor.findFirst({
      /* tenant-scope: a sponsor in the request's own tenant; the caller checked `sponsor` write. */
      where: { tenantId: row.tenantId, id: o.linkSponsorId }, select: { id: true, categories: true },
    });
    if (!target) throw new ForbiddenError("sponsor", "write");
    if ((await loginsOf(tx, [target.id])).size > 0) throw new SponsorRequestError("That sponsor already has people signing in — add this contact from the sponsor's page instead.");
    await tx.sponsor.update({
      /* tenant-scope: loaded above in the request's tenant. */
      where: { id: target.id }, data: { categories: [...new Set([...target.categories, ...o.categories])] },
    });
    sponsorId = target.id;
  } else {
    const created = await tx.sponsor.create({ data: { tenantId: row.tenantId, name: sponsorNameFor(row), categories: o.categories }, select: { id: true } });
    sponsorId = created.id;
  }
  const contactName = [row.firstName, row.lastName].filter(Boolean).join(" ");
  const hasPrimary = await tx.sponsorContact.count({ where: { tenantId: row.tenantId, sponsorId, isPrimary: true } });
  await tx.sponsorContact.create({
    data: { tenantId: row.tenantId, sponsorId, name: contactName, email: row.email.toLowerCase(), phone: row.phone, isPrimary: hasPrimary === 0 },
    select: { id: true },
  });
  const login = await tx.user.create({
    data: {
      tenantId: row.tenantId, email: row.email.toLowerCase(), roles: ["SPONSOR_ADMIN"], sponsorId,
      /* Placeholder until the first sign-in with this email claims it — never a fabricated Clerk id. */
      clerkId: `invite:${randomBytes(12).toString("hex")}`,
    },
    select: { id: true },
  });
  await claim(tx, row.id, { state: "APPROVED", decidedAt: new Date(), decidedBy: o.decidedBy, sponsorId, autoApproved: o.decidedBy === null, reviewReasons: [] });
  await audit(tx, o.auditActor, o.decidedBy === null ? "sponsorRequest.autoApprove" : "sponsorRequest.approve", "Inquiry", row.id, {
    before: { state: "NEW" },
    after: { state: "APPROVED", sponsorId, linked: Boolean(o.linkSponsorId), categories: o.categories, loginUserId: login.id },
  });
  /* Zoho learns the account now, with our key on it, so converting the lead later matches it. */
  await enqueue(tx, row.tenantId, "zoho.pushSponsor", { sponsorId });
  await send(tx, row.tenantId, {
    template: "sponsor.accountOpened", to: row.email, idempotencyKey: `sponsor.accountOpened:${row.id}`,
    data: { firstName: firstNameOf(row), businessName: sponsorNameFor(row), portalUrl: `${appUrl()}/sponsor` },
  });
  return sponsorId;
}

/** BTG admins and sales, told about every new sponsor — approved, or waiting for them. */
async function tellBtg(tx: Tx, row: Row, outcome: "approved" | "review", reasons: string[]) {
  const staff = await tx.user.findMany({
    where: { tenantId: row.tenantId, disabledAt: null, roles: { hasSome: ["BTG_ADMIN", "SALES"] } },
    select: { id: true, email: true },
  });
  for (const u of staff) {
    await send(tx, row.tenantId, {
      template: "sponsor.newSponsor", to: u.email, idempotencyKey: `sponsor.newSponsor:${row.id}:${outcome}:${u.id}`,
      data: {
        businessName: sponsorNameFor(row), outcome: outcome === "approved" ? "was approved automatically" : "needs your review",
        reasons: reasons.length ? reasons.map((r) => `• ${r}`).join("\n") : "",
        reviewUrl: `${appUrl()}/admin/sponsor-requests/${row.id}`,
      },
    });
  }
}

/**
 * 2S1-BE-17 — run the automatic checks on a NEW request: approve it, send
 * it to BTG's queue with its reasons, or leave it waiting for the applicant.
 * Safe to run any number of times.
 */
export async function evaluateSponsorRequest(id: string) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.inquiry.findFirst({
      /* tenant-scope: the system acting on one request, found by id from its own token or job. */
      where: { id }, select: SELECT,
    });
    if (!row || row.state !== "NEW") return { outcome: "decided" as const };
    const [proof, inUse, same, words] = await Promise.all([
      tx.inquiryDocument.count({ where: { tenantId: row.tenantId, inquiryId: row.id, kind: "PROOF_OF_BUSINESS", uploadedAt: { not: null } } }),
      emailInUse(tx, row.email),
      sameNameSponsors(tx, row.tenantId, sponsorNameFor(row)),
      row.businessType === "OTHER" ? checkRestricted(tx, row.tenantId, row.businessTypeOther) : Promise.resolve([]),
    ]);
    const verdict = sponsorApprovalVerdict({
      emailConfirmed: Boolean(row.emailConfirmedAt), proofUploaded: proof > 0,
      businessType: row.businessType, businessTypeOther: row.businessTypeOther,
      restrictedWords: words, emailInUse: inUse, sameNameSponsors: same.map((s) => s.name),
    });
    if (verdict.outcome === "waiting") return verdict;
    if (verdict.outcome === "review") {
      const changed = verdict.reasons.join("|") !== row.reviewReasons.join("|");
      if (changed) {
        await tx.inquiry.update({
          /* tenant-scope: the row loaded above. */
          where: { id: row.id }, data: { reviewReasons: verdict.reasons },
        });
        await audit(tx, SYSTEM(row.tenantId), "sponsorRequest.needsReview", "Inquiry", row.id, { after: { reasons: verdict.reasons } });
      }
      await tellBtg(tx, row, "review", verdict.reasons);
      return verdict;
    }
    await openAccount(tx, row, { categories: verdict.categories, decidedBy: null, auditActor: SYSTEM(row.tenantId) });
    await tellBtg(tx, row, "approved", []);
    return verdict;
  });
}

/* ═══════════════════════ the applicant's side (public) ═════════════════ */

function requestFromToken(token: string | undefined | null) {
  const id = readSponsorRequestToken(token);
  if (!id) throw new SponsorRequestError("This link is not valid. Send the form again to start over.", 400);
  return id;
}

async function applicantRow(id: string) {
  const row = await prisma.inquiry.findFirst({
    /* tenant-scope: found by the id inside a signed token that only this request's browser was given. */
    where: { id }, select: SELECT,
  });
  if (!row) throw new SponsorRequestError("This request no longer exists.", 404);
  return row;
}

/** What the applicant sees: where their request stands, and what is still needed. */
export async function sponsorRequestStatus(token: string) {
  const row = await applicantRow(requestFromToken(token));
  const uploaded = await prisma.inquiryDocument.count({ where: { tenantId: row.tenantId, inquiryId: row.id, kind: "PROOF_OF_BUSINESS", uploadedAt: { not: null } } });
  const missing: string[] = [];
  if (!row.emailConfirmedAt) missing.push("confirm your email");
  if (!uploaded) missing.push("upload your proof of business");
  if (!row.businessType || (row.businessType === "OTHER" && !row.businessTypeOther?.trim())) missing.push("tell us your business type");
  return {
    state: row.state as SponsorRequestState,
    businessName: sponsorNameFor(row),
    /* Their own address, so an approved applicant knows which email signs in. */
    email: row.email,
    emailConfirmed: Boolean(row.emailConfirmedAt),
    proofUploaded: uploaded > 0,
    missing: row.state === "NEW" ? missing : [],
    /* The applicant is told it is with BTG, never BTG's internal reasons. */
    underReview: row.state === "NEW" && !missing.length && row.reviewReasons.length > 0,
  };
}

/** Step one of the proof upload: a private-bucket PUT for exactly this file. Audited as a grant. */
export async function requestSponsorDocumentUpload(token: string, input: { filename: string; contentType: string; bytes: number }) {
  const row = await applicantRow(requestFromToken(token));
  if (row.state !== "NEW") throw new SponsorRequestError("This request has already been decided.");
  if (!DOCUMENT_TYPES.has(input.contentType)) throw new SponsorRequestError("A proof of business is a PDF, JPEG or PNG.", 422);
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > MAX_DOCUMENT_BYTES) {
    throw new SponsorRequestError(`A document is at most ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB.`, 422);
  }
  const count = await prisma.inquiryDocument.count({ where: { tenantId: row.tenantId, inquiryId: row.id } });
  if (count >= 6) throw new SponsorRequestError("A request holds at most 6 documents.");
  const id = `idoc_${randomBytes(12).toString("hex")}`;
  const filename = safeFilename(input.filename);
  const r2Key = `sponsor-requests/${row.id}/${id}/${filename}`;
  const doc = await prisma.inquiryDocument.create({
    data: { id, tenantId: row.tenantId, inquiryId: row.id, kind: "PROOF_OF_BUSINESS", filename, contentType: input.contentType, bytes: input.bytes, r2Key },
    select: { id: true, filename: true, contentType: true, bytes: true },
  });
  const uploadUrl = await presignPrivateUpload(SYSTEM(row.tenantId), r2Key, input.contentType, { entity: "InquiryDocument", entityId: id });
  return { document: doc, uploadUrl, contentType: input.contentType };
}

/** Step two: the applicant says it has uploaded. Counted only if it is there; then the checks run. */
export async function confirmSponsorDocumentUpload(token: string, documentId: string) {
  const row = await applicantRow(requestFromToken(token));
  const doc = await prisma.inquiryDocument.findFirst({ where: { tenantId: row.tenantId, inquiryId: row.id, id: documentId }, select: { id: true, r2Key: true } });
  if (!doc) throw new SponsorRequestError("That document isn't part of this request.", 404);
  const size = await privateObjectSize(doc.r2Key);
  if (size === null) throw new SponsorRequestError("That document has not arrived yet — upload it, then confirm.");
  if (size > MAX_DOCUMENT_BYTES) throw new SponsorRequestError("That document is larger than allowed.", 422);
  await prisma.inquiryDocument.update({
    /* tenant-scope: the row loaded above, within this request. */
    where: { id: doc.id }, data: { uploadedAt: new Date(), bytes: size },
  });
  await evaluateSponsorRequest(row.id);
  return sponsorRequestStatus(token);
}

/** The link in the confirmation email: proves the contact reads that mailbox; then the checks run. */
export async function confirmSponsorEmail(emailToken: string) {
  const id = readSponsorEmailToken(emailToken);
  if (!id) throw new SponsorRequestError("This confirmation link is not valid.", 400);
  const row = await applicantRow(id);
  if (!row.emailConfirmedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.inquiry.update({
        /* tenant-scope: the request named inside the signed email token. */
        where: { id: row.id }, data: { emailConfirmedAt: new Date() },
      });
      await audit(tx, SYSTEM(row.tenantId), "sponsorRequest.emailConfirmed", "Inquiry", row.id, { after: { email: row.email } });
    });
  }
  const verdict = await evaluateSponsorRequest(row.id);
  const fresh = await applicantRow(row.id);
  return {
    state: fresh.state as SponsorRequestState, businessName: sponsorNameFor(fresh), email: fresh.email, emailConfirmed: true,
    waitingFor: verdict.outcome === "waiting" ? verdict.missing : [], underReview: fresh.state === "NEW" && fresh.reviewReasons.length > 0,
    /* Opening the emailed link proves the mailbox, so it may carry on from any device: upload the proof, read the status. */
    requestToken: issueSponsorRequestToken(fresh.id),
  };
}

/* ═══════════════════════ BTG's decisions ══════════════════════════════ */

export type SponsorRequestDecision =
  | { decision: "APPROVE"; categories: BrandCategory[]; linkSponsorId?: string | null; newSponsor?: boolean }
  | { decision: "DECLINE"; note: string }
  | { decision: "REJECT"; note: string }
  | { decision: "REINSTATE" };

export async function decideSponsorRequest(actor: Actor, id: string, d: SponsorRequestDecision) {
  assertAllowed(actor, "inquiry", "approve");
  if ((d.decision === "DECLINE" || d.decision === "REJECT") && !d.note?.trim()) {
    throw new SponsorRequestError(`${d.decision === "DECLINE" ? "Declining" : "Rejecting"} needs a note — the business reads it.`, 422);
  }
  if (d.decision === "APPROVE" && !d.categories?.length) throw new SponsorRequestError("Pick at least one business type — the clash check uses it.", 422);

  return prisma.$transaction(async (tx) => {
    const row = await tx.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "approve"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("inquiry", "approve");

    if (d.decision === "REJECT") return rejectApproved(tx, actor, row, d.note.trim());
    if (d.decision === "REINSTATE") return reinstate(tx, actor, row);
    if (row.state !== "NEW") throw new SponsorRequestError(`This request was already ${row.state.toLowerCase()}.`);

    if (d.decision === "DECLINE") {
      const note = d.note.trim();
      await claim(tx, row.id, { state: "DECLINED", decidedAt: new Date(), decidedBy: actor.userId, decisionNote: note });
      await audit(tx, actor, "sponsorRequest.decline", "Inquiry", row.id, { before: { state: "NEW" }, after: { state: "DECLINED", note } });
      /* 2S1-BE-13 — a Reject before an account opened closes the REQUEST
         (subject INQUIRY): its proof of business goes on the 30-day purge,
         and the business can ask BTG to look again. No logins exist yet.
         DECLINED is terminal; BTG's "yes" is a new request. */
      await recordClosureIn(tx, actor, {
        subjectKind: "INQUIRY", subjectId: row.id, cause: "REJECTED", reason: note, userIds: [],
        contactEmail: row.email, displayName: firstNameOf(row) || sponsorNameFor(row),
      });
      await send(tx, row.tenantId, {
        template: "sponsor.requestDeclined", to: row.email, idempotencyKey: `sponsor.requestDeclined:${row.id}`,
        data: { firstName: firstNameOf(row), businessName: sponsorNameFor(row), note, supportEmail: env.SUPPORT_EMAIL, supportUrl: `${appUrl()}/contact?topic=account` },
      });
      return getAfter(tx, actor, row.id);
    }

    /* Proof of business is required of every sponsor, the same rule whoever opens the account (2S1-BE-17). */
    const proof = await tx.inquiryDocument.count({ where: { tenantId: row.tenantId, inquiryId: row.id, kind: "PROOF_OF_BUSINESS", uploadedAt: { not: null } } });
    if (!proof) throw new SponsorRequestError("This business hasn't uploaded a proof of business yet — every sponsor needs one before the account opens.");
    const checks = await checksFor(tx, row);
    if (checks.emailInUse) {
      throw new SponsorRequestError(`${row.email} already has a SponsorX login. Ask the business for a different contact, or link this request to that sponsor.`);
    }
    if (d.linkSponsorId) {
      const target = await tx.sponsor.findFirst({ where: { ...whereFor(actor, "sponsor", "write"), id: d.linkSponsorId }, select: { id: true } });
      if (!target) throw new ForbiddenError("sponsor", "write");
    } else if (checks.matches.length && !d.newSponsor) {
      throw new SponsorRequestError(`A sponsor named "${checks.matches[0]!.name}" already exists. Link this request to it, or confirm it is a different business.`);
    }
    await openAccount(tx, row, { categories: d.categories, linkSponsorId: d.linkSponsorId, decidedBy: actor.userId, auditActor: actor });
    return getAfter(tx, actor, row.id);
  });
}

/** Reject after approval: every login of that sponsor switched off, the reason emailed. */
async function rejectApproved(tx: Tx, actor: Actor, row: Row, note: string) {
  if (row.state !== "APPROVED" || !row.sponsorId) {
    throw new SponsorRequestError(row.state === "NEW" ? "This request hasn't been approved — decline it instead." : `This request is ${row.state.toLowerCase()}.`);
  }
  const moved = await tx.inquiry.updateMany({
    /* tenant-scope: the row loaded through whereFor(inquiry, approve). */
    where: { id: row.id, state: "APPROVED" }, data: { state: "REJECTED", decisionNote: note, decidedAt: new Date(), decidedBy: actor.userId },
  });
  if (moved.count !== 1) throw new SponsorRequestError("This request changed a moment ago — reload it.");
  const logins = await tx.user.findMany({
    /* tenant-scope: the logins of the sponsor this request opened, in its tenant. */
    where: { tenantId: row.tenantId, sponsorId: row.sponsorId, disabledAt: null }, select: { id: true },
  });
  const off = await tx.user.updateMany({
    /* tenant-scope: the logins found just above. */
    where: { tenantId: row.tenantId, id: { in: logins.map((u) => u.id) } },
    data: { disabledAt: new Date(), disabledReason: `sponsorRequest:${row.id}` },
  });
  await audit(tx, actor, "sponsorRequest.reject", "Inquiry", row.id, { before: { state: "APPROVED" }, after: { state: "REJECTED", note, loginsSwitchedOff: off.count } });
  /* 2S1-BE-13 — a rejected account's files are kept 30 days, then deleted; it can ask BTG to come back. */
  await recordClosureIn(tx, actor, {
    subjectKind: "SPONSOR", subjectId: row.sponsorId, cause: "REJECTED", reason: note, userIds: logins.map((u) => u.id),
    contactEmail: row.email, displayName: firstNameOf(row),
  });
  await send(tx, row.tenantId, {
    template: "sponsor.accountRejected", to: row.email, idempotencyKey: `sponsor.accountRejected:${row.id}:${Date.now()}`,
    data: { firstName: firstNameOf(row), businessName: sponsorNameFor(row), note, supportUrl: `${appUrl()}/contact?topic=account`, supportEmail: env.SUPPORT_EMAIL },
  });
  return getAfter(tx, actor, row.id);
}

/** Reinstate a rejected sponsor: the logins this rejection switched off come back on. */
async function reinstate(tx: Tx, actor: Actor, row: Row) {
  if (row.state !== "REJECTED") throw new SponsorRequestError("Only a rejected sponsor can be reinstated.");
  await tx.inquiry.update({
    /* tenant-scope: the row loaded through whereFor(inquiry, approve). */
    where: { id: row.id }, data: { state: "APPROVED", decidedAt: new Date(), decidedBy: actor.userId },
  });
  const on = await tx.user.updateMany({
    /* tenant-scope: the logins this rejection switched off, in the request's tenant. */
    where: { tenantId: row.tenantId, sponsorId: row.sponsorId ?? "-", disabledReason: `sponsorRequest:${row.id}` },
    data: { disabledAt: null, disabledReason: null },
  });
  await audit(tx, actor, "sponsorRequest.reinstate", "Inquiry", row.id, { before: { state: "REJECTED" }, after: { state: "APPROVED", loginsSwitchedOn: on.count } });
  /* 2S1-BE-13 — back inside the 30 days: the closure ends and nothing is deleted. */
  if (row.sponsorId) await reopenClosureIn(tx, actor, "SPONSOR", row.sponsorId);
  await send(tx, row.tenantId, {
    template: "sponsor.accountReinstated", to: row.email, idempotencyKey: `sponsor.accountReinstated:${row.id}:${Date.now()}`,
    data: { firstName: firstNameOf(row), businessName: sponsorNameFor(row), portalUrl: `${appUrl()}/sponsor` },
  });
  return getAfter(tx, actor, row.id);
}

/** Which of these sponsors already have someone signing in for them. */
async function loginsOf(tx: Tx | typeof prisma, sponsorIds: string[]) {
  if (!sponsorIds.length) return new Set<string>();
  const users = await tx.user.findMany({
    /* tenant-scope: sponsors already found in the request's tenant; a sponsor's logins live in its tenant. */
    where: { sponsorId: { in: sponsorIds } }, select: { sponsorId: true },
  });
  return new Set(users.map((u) => u.sponsorId!));
}

/** Decide exactly once: the update only lands while the request is still NEW. */
async function claim(tx: Tx, id: string, data: Prisma.InquiryUpdateManyMutationInput) {
  const moved = await tx.inquiry.updateMany({
    /* tenant-scope: the row the caller loaded (through whereFor, or its own token). */
    where: { id, state: "NEW" }, data,
  });
  if (moved.count !== 1) throw new SponsorRequestError("This request was decided a moment ago by someone else.");
}

async function getAfter(tx: Tx, actor: Actor, id: string) {
  const row = await tx.inquiry.findFirstOrThrow({ where: { ...whereFor(actor, "inquiry", "read"), id }, select: SELECT });
  return { ...summary(row), decisionNote: row.decisionNote, decidedBy: row.decidedBy };
}
