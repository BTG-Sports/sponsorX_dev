/**
 * External property onboarding — 2S1-BE-01 (the wizard's data, over a
 * public API) and 2S1-BE-03 (BTG's review queue and decisions).
 *
 * THE APPLICANT has no login: it starts an application, gets a resume token,
 * saves each wizard step as it goes (organisations do not finish in one
 * sitting), and submits when `missingFor` says nothing is missing. No
 * database intervention anywhere on that path.
 *
 * THE REVIEWER is BTG: approve, request changes, reject, suspend, reinstate
 * (documentation/SponsorX-Phase2-State-Machines.md §1). Approval creates the
 * organisation's Property and grants it listing access; suspension withdraws
 * that. Every decision is audited with who made it and why.
 *
 * NO TAX ID, NO BANK DETAILS. The payout step records only that the
 * applicant acknowledged the payment provider collects them.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { agreementFile } from "./agreement-text";
import { ForbiddenError } from "../auth/errors";
import { issueOnboardingToken, readOnboardingToken } from "../lib/onboarding-token";
import { send, type EmailTemplate } from "../lib/email";
import {
  canTransitionOnboarding,
  ContactSchema,
  DECISIONS,
  DETAILS_SCHEMA,
  EDITABLE,
  IllegalOnboardingTransitionError,
  missingFor,
  NEEDS_NOTE,
  US_STATES,
  type Decision,
  type OnboardingState,
  type OrgType,
} from "./onboarding-rules";

export const PROPERTY_TERMS_KIND = "PROPERTY_TERMS";

export class OnboardingNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    /* One answer for "no such application" and "bad token": the routes are
       public, and a distinction would be an oracle for probing ids. */
    super("No onboarding matches that link.");
    this.name = "OnboardingNotFoundError";
  }
}

export class OnboardingError extends Error {
  readonly status: number;
  readonly missing?: string[];
  constructor(message: string, status = 422, missing?: string[]) {
    super(message);
    this.name = "OnboardingError";
    this.status = status;
    this.missing = missing;
  }
}

const SELECT = {
  id: true, tenantId: true, state: true, orgType: true, orgName: true, stateCode: true,
  contacts: true, details: true, payoutAcknowledgedAt: true, termsAgreementId: true, termsAcceptedAt: true,
  submittedAt: true, reviewNotes: true, decidedAt: true, propertyId: true, createdAt: true, updatedAt: true,
  property: { select: { listingAccessAt: true } },
  /* 2S1-BE-02 — names and status only. No link: a read of a verification
     document is BTG's, through reviewDocuments' audited grant. */
  documents: {
    select: { id: true, kind: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const;

type Row = Prisma.PropertyOnboardingGetPayload<{ select: typeof SELECT }>;

function view(r: Row) {
  const { property, tenantId: _t, ...rest } = r;
  return { ...rest, listingAccess: Boolean(property?.listingAccessAt), missing: missingFor(r) };
}

async function currentTerms(tx: Prisma.TransactionClient, tenantId: string) {
  return tx.agreement.findFirst({
    where: { tenantId, kind: PROPERTY_TERMS_KIND },
    orderBy: { version: "desc" },
    select: { id: true, version: true, bodyHash: true },
  });
}

/* ── notifications — 2S1-INT-01 ────────────────────────────────────────── */

/** The email each moment sends. REINSTATE sends none: it is BTG undoing its
 *  own pause, and the five messages are the ones the plan names. */
const NOTICE: Partial<Record<Decision | "SUBMIT", EmailTemplate>> = {
  SUBMIT: "onboarding.received",
  REQUEST_CHANGES: "onboarding.changesRequested",
  APPROVE: "onboarding.approved",
  REJECT: "onboarding.rejected",
  SUSPEND: "onboarding.suspended",
};

/**
 * Queue the moment's email to the primary contact, inside the transaction
 * that made the move — so a rolled-back decision is never announced, and the
 * send is a job that retries (lib/email.ts). The key counts the moment ("the
 * second request for changes"), never the clock, so a redelivered job is a
 * duplicate and a genuinely new request is not.
 */
async function notify(tx: Prisma.TransactionClient, row: Row, moment: Decision | "SUBMIT", action: string, notes?: string | null) {
  const template = NOTICE[moment];
  if (!template) return;
  const primary = z.array(ContactSchema).safeParse(row.contacts);
  const to = primary.success ? primary.data.find((c) => c.primary) : undefined;
  if (!to) return; // submit requires one (missingFor), so only a hand-made row lands here
  const occurrence = await tx.auditLog.count({ where: { tenantId: row.tenantId, entity: "PropertyOnboarding", entityId: row.id, action } });
  const app = env.APP_URL.replace(/\/+$/, "");
  await send(tx, row.tenantId, {
    template,
    to: to.email,
    data: {
      orgName: row.orgName,
      contactName: to.name.split(/\s+/)[0] ?? to.name,
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
      ...(moment === "REQUEST_CHANGES" ? { resumeUrl: `${app}/onboarding/${issueOnboardingToken(row.id)}` } : {}),
      ...(moment === "APPROVE" ? { portalUrl: `${app}/property` } : {}),
    },
    idempotencyKey: `${template}:${row.id}:${occurrence}`,
  });
}

/* ── the applicant (public, by token) — 2S1-BE-01 ───────────────────────── */

/** Step 0: an organisation starts. Returns the token it comes back with. */
export async function startOnboarding(input: { orgType: OrgType; orgName: string }) {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const row = await prisma.propertyOnboarding.create({
    data: { tenantId, orgType: input.orgType, orgName: input.orgName.trim() },
    select: { id: true, state: true },
  });
  return { id: row.id, state: row.state as OnboardingState, resumeToken: issueOnboardingToken(row.id) };
}

async function byToken(tx: Prisma.TransactionClient, token: string) {
  const id = readOnboardingToken(token);
  if (!id) throw new OnboardingNotFoundError();
  const row = await tx.propertyOnboarding.findFirst({
    /* tenant-scope: public resume token — it names its own application, whose tenantId is on the row. */
    where: { id },
    select: SELECT,
  });
  if (!row) throw new OnboardingNotFoundError();
  return row;
}

/** Where the applicant is — the saved answers, what is missing, and the
 *  terms they will be asked to accept. */
export async function readOnboarding(token: string) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    const terms = await currentTerms(tx, row.tenantId);
    return {
      ...view(row),
      terms: terms ? { agreementId: terms.id, version: terms.version, bodyHash: terms.bodyHash, body: await termsBody(terms.version, terms.bodyHash) } : null,
    };
  });
}

/** The words behind a PROPERTY_TERMS version — `agreements/PROPERTY_TERMS.v<n>.txt`,
 *  served only while the file still hashes to the stored bodyHash (plain
 *  sha256 hex, the form this wizard's acceptance compares). Null otherwise:
 *  the wizard must not show words its acceptance would not match. */
async function termsBody(version: number, bodyHash: string): Promise<string | null> {
  const file = agreementFile(PROPERTY_TERMS_KIND, version);
  if (!file) return null;
  try {
    const body = await readFile(file, "utf8");
    return createHash("sha256").update(body).digest("hex") === bodyHash ? body : null;
  } catch {
    return null;
  }
}

export type StepInput =
  | { step: "organisation"; orgName?: string; stateCode?: string }
  | { step: "contacts"; contacts: unknown[] }
  | { step: "business"; details: Record<string, unknown> }
  | { step: "payout"; acknowledged: true }
  | { step: "agreements"; agreementId: string; bodyHashShown: string };

/**
 * Save one wizard step. Each step is validated on its own terms and saved,
 * so partial progress survives; completeness is judged only at submit.
 */
export async function saveStep(token: string, input: StepInput) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    if (!EDITABLE.has(row.state as OnboardingState)) {
      throw new OnboardingError(`An application that is ${row.state} cannot be edited.`, 409);
    }
    let data: Prisma.PropertyOnboardingUpdateInput;
    switch (input.step) {
      case "organisation": {
        if (input.stateCode && !US_STATES.has(input.stateCode)) throw new OnboardingError("SponsorX operates in the United States: give a US state code.");
        data = { ...(input.orgName ? { orgName: input.orgName.trim() } : {}), ...(input.stateCode ? { stateCode: input.stateCode } : {}) };
        break;
      }
      case "contacts": {
        const parsed = ContactSchema.array().min(1).max(10).safeParse(input.contacts);
        if (!parsed.success) throw new OnboardingError(`Contacts: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
        if (parsed.data.filter((c) => c.primary).length !== 1) throw new OnboardingError("Exactly one contact is the primary contact.");
        data = { contacts: parsed.data as Prisma.InputJsonValue };
        break;
      }
      case "business": {
        const schema = DETAILS_SCHEMA[row.orgType as OrgType];
        /* Partial while drafting — but strict: a key the type does not ask
           for (a tax id, a bank account) is refused, never stored. */
        const parsed = (schema as z.ZodObject<z.ZodRawShape>).partial().safeParse(input.details);
        if (!parsed.success) {
          const i = parsed.error.issues[0]!;
          throw new OnboardingError(`Business details: ${i.path.join(".") || "details"} — ${i.message}.`);
        }
        data = { details: { ...(row.details as object), ...(parsed.data as object) } as Prisma.InputJsonValue };
        break;
      }
      case "payout": {
        data = { payoutAcknowledgedAt: new Date() };
        break;
      }
      case "agreements": {
        const terms = await currentTerms(tx, row.tenantId);
        if (!terms) throw new OnboardingError("No property terms are published yet.", 409);
        if (terms.id !== input.agreementId || terms.bodyHash !== input.bodyHashShown) {
          throw new OnboardingError("The terms shown are not the current version — reload and accept again.", 409);
        }
        data = { termsAgreementId: terms.id, termsHash: terms.bodyHash, termsAcceptedAt: new Date() };
        break;
      }
    }
    const updated = await tx.propertyOnboarding.update({ where: { id: row.id }, data, select: SELECT });
    return view(updated);
  });
}

/** Submit for review — refused, with the list, while anything is missing. */
export async function submitOnboarding(token: string) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    const from = row.state as OnboardingState;
    if (!canTransitionOnboarding(from, "PENDING_REVIEW")) throw new IllegalOnboardingTransitionError(from, "PENDING_REVIEW");
    const missing = missingFor(row);
    if (missing.length) throw new OnboardingError(`The application is not complete: ${missing.join(", ")}.`, 422, missing);
    const updated = await tx.propertyOnboarding.update({
      where: { id: row.id }, data: { state: "PENDING_REVIEW", submittedAt: new Date() }, select: SELECT,
    });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "onboarding.submit", "PropertyOnboarding", row.id, {
      before: { state: from }, after: { state: "PENDING_REVIEW" },
    });
    await notify(tx, row, "SUBMIT", "onboarding.submit");
    return view(updated);
  });
}

/* ── the reviewer (BTG) — 2S1-BE-03 ─────────────────────────────────────── */

/** The verification queue: submitted applications, oldest first. */
export async function reviewQueue(actor: Actor, state: OnboardingState = "PENDING_REVIEW") {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const rows = await prisma.propertyOnboarding.findMany({
    where: { ...whereFor(actor, "propertyOnboarding", "read"), state: state as Prisma.EnumOnboardingStateFilter["equals"] },
    select: SELECT,
    orderBy: { submittedAt: "asc" },
  });
  return rows.map(view);
}

export async function getOnboarding(actor: Actor, id: string) {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const row = await prisma.propertyOnboarding.findFirst({ where: { ...whereFor(actor, "propertyOnboarding", "read"), id }, select: SELECT });
  if (!row) throw new ForbiddenError("propertyOnboarding", "read");
  return view(row);
}

type Provisioned = { tenantId: string; propertyId: string; managerUserId: string };

/**
 * 2S1-BE-04 — the first approval gives the organisation a tenant of its own.
 *
 * "This is where Phase 1's tenant scoping gets its real test — outside
 * organisations now hold accounts." So the organisation is NOT a row inside
 * BTG's tenant: it gets a new Tenant, its Property lives there, and its
 * primary contact becomes that tenant's PROPERTY_MGR, linked to the Property.
 * Every scope builder is tenant-first, so from the first request that account
 * reaches its own tenant's rows and nothing of BTG's or anyone else's.
 *
 * The onboarding record and its audit trail stay with BTG, who reviewed it.
 *
 * The account is a placeholder until the contact signs in: `resolveActor`
 * claims it by verified email, the same path every provisioned user takes.
 * An address that already has an account anywhere is refused — the claim is
 * by email, and a second row would make it ambiguous which tenant a sign-in
 * lands in.
 */
async function provisionTenant(tx: Prisma.TransactionClient, row: Row, now: Date): Promise<Provisioned> {
  const primary = z.array(ContactSchema).parse(row.contacts).find((c) => c.primary);
  if (!primary) throw new OnboardingError("The application has no primary contact to give the account to.", 409);
  const email = primary.email.toLowerCase();
  const existing = await tx.user.findFirst({
    /* tenant-scope: identity is global — a sign-in is claimed by email across every tenant, so uniqueness is checked across them. */
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    throw new OnboardingError(`${email} already has a SponsorX account. Ask the organisation to name a different primary contact, then approve.`, 409);
  }

  /* Operated by the tenant that approved it (2S3-BE-01): BTG reviews its
     inventory and listings, and reaches nothing else of it. */
  const tenant = await tx.tenant.create({ data: { name: row.orgName, operatorTenantId: row.tenantId }, select: { id: true } });
  const property = await tx.property.create({
    data: {
      tenantId: tenant.id, kind: row.orgType, name: row.orgName, stateCode: row.stateCode,
      slug: `${slugify(row.orgName)}-${randomBytes(3).toString("hex")}`, listingAccessAt: now,
    },
    select: { id: true },
  });
  const manager = await tx.user.create({
    data: {
      tenantId: tenant.id, email, roles: ["PROPERTY_MGR"], propertyId: property.id,
      /* Placeholder until the first sign-in claims it — never a fabricated Clerk id. */
      clerkId: `invite:${randomBytes(12).toString("hex")}`,
    },
    select: { id: true },
  });
  await audit(tx, { userId: null, tenantId: tenant.id }, "tenant.provision", "Tenant", tenant.id, {
    after: { onboardingId: row.id, propertyId: property.id, managerUserId: manager.id, roles: ["PROPERTY_MGR"] },
  });
  return { tenantId: tenant.id, propertyId: property.id, managerUserId: manager.id };
}

const slugify = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "property";

/**
 * Action a decision. APPROVE creates the Property (first approval) and grants
 * listing access; SUSPEND withdraws it and REINSTATE restores it; REQUEST_
 * CHANGES, REJECT and SUSPEND need a note the applicant will read. Audited.
 */
export async function decideOnboarding(actor: Actor, id: string, decision: Decision, notes?: string | null) {
  assertTenantWide(actor, "propertyOnboarding", "approve");
  if (NEEDS_NOTE.has(decision) && !notes?.trim()) throw new OnboardingError(`${decision} needs a note — the applicant is told why.`);
  return prisma.$transaction(async (tx) => {
    const row = await tx.propertyOnboarding.findFirst({ where: { ...whereFor(actor, "propertyOnboarding", "approve"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("propertyOnboarding", "approve");
    const from = row.state as OnboardingState;
    const to = DECISIONS[decision];
    /* REINSTATE is the only road out of SUSPENDED, and only to APPROVED;
       APPROVE is for a submitted application. The two are not synonyms. */
    if ((decision === "REINSTATE") !== (from === "SUSPENDED") || !canTransitionOnboarding(from, to)) {
      throw new IllegalOnboardingTransitionError(from, to);
    }

    let propertyId = row.propertyId;
    let provisioned: Provisioned | null = null;
    const now = new Date();
    if (to === "APPROVED") {
      if (!propertyId) {
        provisioned = await provisionTenant(tx, row, now);
        propertyId = provisioned.propertyId;
      } else {
        /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
        await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: now }, select: { id: true } });
      }
    }
    if (to === "SUSPENDED" && propertyId) {
      /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
      await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: null }, select: { id: true } });
    }

    const updated = await tx.propertyOnboarding.update({
      where: { id },
      data: {
        state: to as Prisma.PropertyOnboardingUpdateInput["state"], decidedAt: now, decidedBy: actor.userId,
        reviewNotes: notes?.trim() || null, propertyId,
      },
      select: SELECT,
    });
    await audit(tx, actor, `onboarding.${decision.toLowerCase()}`, "PropertyOnboarding", id, {
      before: { state: from },
      after: {
        state: to, notes: notes?.trim() || null, propertyId, listingAccess: to === "APPROVED",
        ...(provisioned ? { tenantId: provisioned.tenantId, managerUserId: provisioned.managerUserId } : {}),
      },
    });
    await notify(tx, row, decision, `onboarding.${decision.toLowerCase()}`, notes);
    return view(updated);
  });
}
