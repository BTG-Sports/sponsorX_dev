/**
 * BTG approves a new sponsor and opens the account — 2S1-BE-05.
 *
 * "A sponsor's request appears in BTG's queue with its business type;
 * approving it creates the sponsor, its contact and a login the requester
 * can sign in with, and links the Zoho account without a duplicate;
 * declining tells the requester why; only BTG admin and sales can decide."
 *
 * THE REQUEST is the enquiry the public form already writes (P8-INT-06) —
 * still pushed to Zoho as a Lead, unchanged. It now also waits in SponsorX
 * for BTG: NEW → APPROVED or NEW → DECLINED, once, by `approve` on
 * `inquiry` (BTG_ADMIN and SALES, their own tenant).
 *
 * APPROVING is one transaction: the sponsor (with the categories BTG picked —
 * the clash check's input), its primary contact, and a SPONSOR_ADMIN login
 * for the request's email, created the way every provisioned login is: a
 * placeholder `clerkId` the first sign-in with that email claims
 * (auth/actor.ts). The sign-in email and the Zoho account push are queued in
 * the same transaction, so a rolled-back approval announces nothing.
 *
 * NO DUPLICATES. If sales already converted the lead, Zoho's account has
 * synced in as a sponsor row with no login; BTG links the request to it
 * instead of creating a second. A same-named sponsor must be answered one
 * way or the other — link, or say it is a different business — before
 * approving. An email that already has a SponsorX login is refused: logins
 * are claimed by email, so a second one could never be signed into.
 */
import { randomBytes } from "node:crypto";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { enqueue } from "../db/outbox";
import { send } from "../lib/email";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import type { BrandCategory } from "./brand-categories";
import { briefAnswers, sponsorNameFor, suggestCategories, type SponsorRequestState } from "./sponsor-request-rules";

export class SponsorRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SponsorRequestError";
    this.status = status;
  }
}

const SELECT = {
  id: true, tenantId: true, companyName: true, firstName: true, lastName: true, email: true, phone: true, message: true, source: true,
  categoryText: true, zohoLeadId: true, state: true, decidedAt: true, decidedBy: true, decisionNote: true, sponsorId: true, createdAt: true,
} as const;
type Row = Prisma.InquiryGetPayload<{ select: typeof SELECT }>;

function summary(r: Row) {
  return {
    id: r.id, state: r.state as SponsorRequestState, businessName: sponsorNameFor(r),
    contactName: [r.firstName, r.lastName].filter(Boolean).join(" "), email: r.email,
    categoryText: r.categoryText, budget: briefAnswers(r.message).find((a) => a.label === "Budget")?.value ?? null,
    zoho: r.zohoLeadId ? "LEAD" as const : "PENDING" as const,
    createdAt: r.createdAt, decidedAt: r.decidedAt, sponsorId: r.sponsorId,
  };
}

/** BTG's queue: one tab at a time, newest first, with every tab's count. */
export async function listSponsorRequests(actor: Actor, state: SponsorRequestState = "NEW") {
  const where = whereFor(actor, "inquiry", "read");
  const [rows, grouped] = await Promise.all([
    prisma.inquiry.findMany({ where: { ...where, state }, select: SELECT, orderBy: { createdAt: state === "NEW" ? "asc" : "desc" }, take: 200 }),
    prisma.inquiry.groupBy({ where: { ...where }, by: ["state"], _count: { _all: true } }),
  ]);
  const counts = { NEW: 0, APPROVED: 0, DECLINED: 0 } as Record<SponsorRequestState, number>;
  for (const g of grouped) counts[g.state as SponsorRequestState] = g._count._all;
  return { requests: rows.map(summary), counts };
}

/** Everything BTG weighs before deciding — and the checks that gate Approve. */
async function checksFor(tx: Prisma.TransactionClient, actor: Actor, r: Row) {
  const name = sponsorNameFor(r);
  const [login, sameName] = await Promise.all([
    tx.user.findFirst({
      /* tenant-scope: a login is claimed by email across every tenant (auth/actor.ts), so "already in use" is platform-wide. */
      where: { email: { equals: r.email, mode: "insensitive" } }, select: { id: true },
    }),
    tx.sponsor.findMany({
      where: { ...whereFor(actor, "sponsor", "read"), name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true, zohoAccountId: true },
      take: 5,
    }),
  ]);
  const withLogin = await loginsOf(tx, sameName.map((s) => s.id));
  return {
    emailInUse: Boolean(login),
    matches: sameName.map((s) => ({ id: s.id, name: s.name, fromZoho: Boolean(s.zohoAccountId), hasLogin: withLogin.has(s.id) })),
  };
}

export async function getSponsorRequest(actor: Actor, id: string) {
  const row = await prisma.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("inquiry", "read");
  const checks = await checksFor(prisma, actor, row);
  return {
    ...summary(row), phone: row.phone, message: row.message, answers: briefAnswers(row.message),
    suggestedCategories: suggestCategories(row.categoryText), zohoLeadId: row.zohoLeadId, decisionNote: row.decisionNote, decidedBy: row.decidedBy,
    checks, progress: await progressOf(row),
  };
}

/**
 * What happened after the decision, read from where it is recorded — never
 * assumed: who decided, whether the email actually went (the email job's
 * send log), and whether the new login has been signed into (a claimed
 * login's clerkId is no longer the invite placeholder).
 */
async function progressOf(row: Row) {
  if (row.state === "NEW") return null;
  const key = `${row.state === "APPROVED" ? "sponsor.accountOpened" : "sponsor.requestDeclined"}:${row.id}`;
  const [decider, sent, login, sponsor] = await Promise.all([
    row.decidedBy ? prisma.user.findFirst({ where: { tenantId: row.tenantId, id: row.decidedBy }, select: { email: true, roles: true } }) : null,
    prisma.emailSendLog.findFirst({ where: { tenantId: row.tenantId, idempotencyKey: key }, select: { sentAt: true } }),
    row.state === "APPROVED"
      ? prisma.user.findFirst({ where: { tenantId: row.tenantId, email: row.email.toLowerCase(), sponsorId: row.sponsorId }, select: { clerkId: true } })
      : null,
    row.sponsorId ? prisma.sponsor.findFirst({ where: { tenantId: row.tenantId, id: row.sponsorId }, select: { categories: true } }) : null,
  ]);
  return {
    /* The business type the account was opened with — the clash check's input. */
    categories: sponsor?.categories ?? [],
    decidedBy: decider ? { email: decider.email, roles: decider.roles } : null,
    emailSentAt: sent?.sentAt ?? null,
    signedIn: login ? !login.clerkId.startsWith("invite:") : null,
  };
}

export type SponsorRequestDecision =
  | { decision: "APPROVE"; categories: BrandCategory[]; linkSponsorId?: string | null; newSponsor?: boolean }
  | { decision: "DECLINE"; note: string };

export async function decideSponsorRequest(actor: Actor, id: string, d: SponsorRequestDecision) {
  assertAllowed(actor, "inquiry", "approve");
  if (d.decision === "DECLINE" && !d.note?.trim()) throw new SponsorRequestError("Declining needs a note — the business reads it.", 422);
  if (d.decision === "APPROVE" && !d.categories?.length) throw new SponsorRequestError("Pick at least one business type — the clash check uses it.", 422);

  return prisma.$transaction(async (tx) => {
    const row = await tx.inquiry.findFirst({ where: { ...whereFor(actor, "inquiry", "approve"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("inquiry", "approve");
    if (row.state !== "NEW") throw new SponsorRequestError(`This request was already ${row.state.toLowerCase()}.`);
    const now = new Date();
    const app = env.APP_URL.replace(/\/+$/, "");
    const firstName = row.firstName?.trim() || row.lastName;

    if (d.decision === "DECLINE") {
      const note = d.note.trim();
      await claim(tx, row.id, { state: "DECLINED", decidedAt: now, decidedBy: actor.userId, decisionNote: note });
      await audit(tx, actor, "sponsorRequest.decline", "Inquiry", row.id, { before: { state: "NEW" }, after: { state: "DECLINED", note } });
      await send(tx, row.tenantId, {
        template: "sponsor.requestDeclined", to: row.email, idempotencyKey: `sponsor.requestDeclined:${row.id}`,
        data: { firstName, businessName: sponsorNameFor(row), note },
      });
      return getAfter(tx, actor, row.id);
    }

    const checks = await checksFor(tx, actor, row);
    if (checks.emailInUse) {
      throw new SponsorRequestError(`${row.email} already has a SponsorX login. Ask the business for a different contact, or link this request to that sponsor.`);
    }
    let sponsorId: string;
    if (d.linkSponsorId) {
      const target = await tx.sponsor.findFirst({
        where: { ...whereFor(actor, "sponsor", "write"), id: d.linkSponsorId },
        select: { id: true, categories: true },
      });
      if (!target) throw new ForbiddenError("sponsor", "write");
      if ((await loginsOf(tx, [target.id])).size > 0) throw new SponsorRequestError("That sponsor already has people signing in — add this contact from the sponsor's page instead.");
      await tx.sponsor.update({
        /* tenant-scope: loaded above through whereFor(sponsor, write). */
        where: { id: target.id }, data: { categories: [...new Set([...target.categories, ...d.categories])] },
      });
      sponsorId = target.id;
    } else {
      if (checks.matches.length && !d.newSponsor) {
        throw new SponsorRequestError(`A sponsor named "${checks.matches[0]!.name}" already exists. Link this request to it, or confirm it is a different business.`);
      }
      const created = await tx.sponsor.create({
        data: { tenantId: row.tenantId, name: sponsorNameFor(row), categories: d.categories },
        select: { id: true },
      });
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
    await claim(tx, row.id, { state: "APPROVED", decidedAt: now, decidedBy: actor.userId, sponsorId });
    await audit(tx, actor, "sponsorRequest.approve", "Inquiry", row.id, {
      before: { state: "NEW" },
      after: { state: "APPROVED", sponsorId, linked: Boolean(d.linkSponsorId), categories: d.categories, loginUserId: login.id },
    });
    /* Zoho learns the account now, with our key on it, so converting the
       lead later matches this account instead of making a second. */
    await enqueue(tx, row.tenantId, "zoho.pushSponsor", { sponsorId });
    await send(tx, row.tenantId, {
      template: "sponsor.accountOpened", to: row.email, idempotencyKey: `sponsor.accountOpened:${row.id}`,
      data: { firstName, businessName: sponsorNameFor(row), portalUrl: `${app}/sponsor` },
    });
    return getAfter(tx, actor, row.id);
  });
}

/** Which of these sponsors already have someone signing in for them. */
async function loginsOf(tx: Prisma.TransactionClient, sponsorIds: string[]) {
  if (!sponsorIds.length) return new Set<string>();
  const users = await tx.user.findMany({
    /* tenant-scope: sponsors already admitted by whereFor(sponsor, …); a sponsor's logins live in its tenant. */
    where: { sponsorId: { in: sponsorIds } }, select: { sponsorId: true },
  });
  return new Set(users.map((u) => u.sponsorId!));
}

/** Decide exactly once: the update only lands while the request is still NEW. */
async function claim(tx: Prisma.TransactionClient, id: string, data: Prisma.InquiryUpdateManyMutationInput) {
  const moved = await tx.inquiry.updateMany({
    /* tenant-scope: the row the caller loaded through whereFor(inquiry, approve). */
    where: { id, state: "NEW" }, data,
  });
  if (moved.count !== 1) throw new SponsorRequestError("This request was decided a moment ago by someone else.");
}

async function getAfter(tx: Prisma.TransactionClient, actor: Actor, id: string) {
  const row = await tx.inquiry.findFirstOrThrow({ where: { ...whereFor(actor, "inquiry", "read"), id }, select: SELECT });
  return { ...summary(row), decisionNote: row.decisionNote, decidedBy: row.decidedBy };
}
