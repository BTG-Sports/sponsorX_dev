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
 * AUTOMATIC APPROVAL (2S1-BE-06). BTG has at most one reviewer, so the
 * system approves an organisation itself once its required documents are
 * uploaded (by type and state — onboarding-rules.ts requiredDocuments), its
 * primary contact has confirmed their email by the emailed link, and its name
 * is free platform-wide. The name is held from the moment an application
 * starts (`nameKey`, UNIQUE in the database), so a second application for the
 * same name is refused — even one arriving at the same moment. Anything else
 * waits in BTG's queue with its reasons, which the applicant reads too, and
 * the applicant can still upload the missing documents and confirm the email
 * while it waits: each one re-runs the checks. BTG admins are emailed a link
 * to the profile of every new organisation, approved or waiting.
 *
 * BTG REVIEWS AFTERWARDS. Reject on an approved organisation (with a reason,
 * emailed) switches off its logins and listing access, ends its listings and
 * holds its payouts; Reinstate reverses it. BTG's manual decisions all still
 * work as before.
 *
 * NO TAX ID, NO BANK DETAILS. The payout step records only that the
 * applicant acknowledged the payment provider collects them.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, type AuditActor } from "../db/audit";
import { enqueue } from "../db/outbox";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { agreementFile } from "./agreement-text";
import { ForbiddenError } from "../auth/errors";
import { emailTokenMatches, issueOnboardingEmailToken, issueOnboardingToken, onboardingIdOfEmailToken, readOnboardingToken } from "../lib/onboarding-token";
import { send, type EmailTemplate } from "../lib/email";
import { normalizeBusinessName } from "./business-name-rules";
import { recordClosureIn, reopenClosureIn, REJECT_TAKES_LOGINS } from "./account-closure";
import {
  approvalVerdict,
  canTransitionOnboarding,
  ContactSchema,
  DECISIONS,
  DETAILS_SCHEMA,
  documentChecklist,
  EDITABLE,
  IllegalOnboardingTransitionError,
  missingFor,
  NEEDS_NOTE,
  US_STATES,
  type Decision,
  type OnboardingState,
  type OrgType,
} from "./onboarding-rules";
import { readPage, type PageRequest } from "../lib/paging";

type Tx = Prisma.TransactionClient;
const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const appUrl = () => env.APP_URL.replace(/\/+$/, "");

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
  /* 2S1-BE-06 / -07 */
  nameKey: true, confirmedEmail: true, emailConfirmedAt: true, autoApproved: true, approvalChecks: true, reviewReasons: true, flags: true, flaggedAt: true,
  property: { select: { tenantId: true, listingAccessAt: true, payoutsHeldAt: true } },
  /* 2S1-BE-02 — names and status only. No link: a read of a verification
     document is BTG's, through reviewDocuments' audited grant. */
  documents: {
    select: {
      id: true, kind: true, filename: true, contentType: true, bytes: true, uploadedAt: true, createdAt: true,
      stateCode: true, expiresOn: true, replacesId: true, replacedAt: true, removedAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

export type OnboardingRow = Prisma.PropertyOnboardingGetPayload<{ select: typeof SELECT }>;
type Row = OnboardingRow;
export { SELECT as ONBOARDING_SELECT };

/** The primary contact's email, as saved — null until there is one. */
export function primaryEmail(r: Pick<Row, "contacts">): string | null {
  const contacts = z.array(ContactSchema).safeParse(r.contacts);
  const p = contacts.success ? contacts.data.find((c) => c.primary) : undefined;
  return p ? p.email.trim().toLowerCase() : null;
}

/** Confirmed only while the confirmed address is still the primary contact's. */
export function emailConfirmed(r: Pick<Row, "contacts" | "confirmedEmail" | "emailConfirmedAt">): boolean {
  const email = primaryEmail(r);
  return Boolean(r.emailConfirmedAt && email && r.confirmedEmail === email);
}

/** The document checklist as the applicant and BTG see it: each requirement, and what meets it. */
export function checklistOf(r: Pick<Row, "orgType" | "stateCode" | "details" | "documents">) {
  return documentChecklist(r, r.documents).map(({ document, ...req }) => ({ ...req, documentId: document?.id ?? null, done: Boolean(document) }));
}

function view(r: Row) {
  const { property, tenantId: _t, nameKey: _k, confirmedEmail: _c, approvalChecks: _a, ...rest } = r;
  return {
    ...rest,
    listingAccess: Boolean(property?.listingAccessAt),
    missing: missingFor(r),
    /* 2S1-BE-06 — the live checklist: the documents this type and state need, and the email. */
    checklist: checklistOf(r),
    emailConfirmed: emailConfirmed(r),
    contactEmail: primaryEmail(r),
  };
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
async function notify(tx: Prisma.TransactionClient, row: Row, moment: Decision | "SUBMIT", action: string, notes?: string | null, extra: Record<string, string> = {}, override?: EmailTemplate) {
  const template = override ?? NOTICE[moment];
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
      ...extra,
    },
    idempotencyKey: `${template}:${row.id}:${occurrence}`,
  });
}

/* ── 2S1-BE-06 — the name, the email, and the automatic checks ──────────── */

export class OnboardingNameTakenError extends OnboardingError {
  constructor() {
    /* The other organisation's name is not echoed: a pending application's
       name is not public. BTG sees which one it is on the profile page. */
    super("This name is already registered on SponsorX. Add your town to tell it apart, or contact BTG.", 409);
    this.name = "OnboardingNameTakenError";
  }
}

/** A unique violation, from a model call or surfacing through the driver adapter. */
function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } } } } | null;
  return err?.code === "P2002" || err?.meta?.driverAdapterError?.cause?.originalCode === "23505";
}

/** The name key, or a refusal when the name has nothing in it to compare. */
function nameKeyOf(name: string): string {
  const key = normalizeBusinessName(name);
  if (!key) throw new OnboardingError("Give the organisation's name — letters or numbers.");
  return key;
}

/**
 * Who already holds this name, platform-wide: another application (the
 * nameKey — pending ones count), or a property that never went through
 * onboarding (BTG's own). Returns that organisation's name, for BTG.
 */
export async function nameHolder(db: Tx | typeof prisma, key: string, self: { onboardingId?: string; propertyId?: string | null } = {}): Promise<string | null> {
  const application = await db.propertyOnboarding.findFirst({
    /* tenant-scope: the name rule is platform-wide by design — every tenant's applications hold names. */
    where: { nameKey: key, ...(self.onboardingId ? { id: { not: self.onboardingId } } : {}) },
    select: { orgName: true },
  });
  if (application) return application.orgName;
  const properties = await db.property.findMany({
    /* tenant-scope: the name rule is platform-wide by design — every tenant's properties hold names. */
    where: { onboarding: { is: null }, ...(self.propertyId ? { id: { not: self.propertyId } } : {}) },
    select: { name: true },
  });
  return properties.find((p) => normalizeBusinessName(p.name) === key)?.name ?? null;
}

/** "Already has a login" is platform-wide: a login is claimed by email across every tenant (auth/actor.ts). */
async function emailHasLogin(db: Tx | typeof prisma, email: string | null): Promise<boolean> {
  if (!email) return false;
  const login = await db.user.findFirst({
    /* tenant-scope: identity resolution is cross-tenant by design — see auth/actor.ts. */
    where: { email: { equals: email, mode: "insensitive" } }, select: { id: true },
  });
  return Boolean(login);
}

/** The confirmation link, to the primary contact. One per address; `again` counts a resend. */
async function sendConfirmation(tx: Tx, row: Pick<Row, "id" | "tenantId" | "orgName" | "contacts">, again = 0) {
  const email = primaryEmail(row);
  if (!email) return;
  const contacts = z.array(ContactSchema).safeParse(row.contacts);
  const name = (contacts.success ? contacts.data.find((c) => c.primary)?.name : undefined) ?? "there";
  await send(tx, row.tenantId, {
    template: "onboarding.confirmEmail",
    to: email,
    idempotencyKey: `onboarding.confirmEmail:${row.id}:${email}:${again}`,
    data: {
      orgName: row.orgName, contactName: name.split(/\s+/)[0] ?? name,
      confirmUrl: `${appUrl()}/onboarding/confirm?t=${encodeURIComponent(issueOnboardingEmailToken(row.id, email))}`,
    },
  });
}

/** BTG admins of the tenant that reviews an organisation — who hears of it. */
export async function btgAdmins(tx: Tx, tenantId: string) {
  return tx.user.findMany({
    where: { tenantId, disabledAt: null, roles: { has: "BTG_ADMIN" } },
    select: { id: true, email: true },
  });
}

/** BTG admins, told about every new organisation — approved, or waiting for them — with a link to its profile. */
async function tellBtg(tx: Tx, row: Pick<Row, "id" | "tenantId" | "orgName" | "orgType">, outcome: "approved" | "review", reasons: string[]) {
  for (const u of await btgAdmins(tx, row.tenantId)) {
    await send(tx, row.tenantId, {
      template: "onboarding.newOrganization", to: u.email, idempotencyKey: `onboarding.newOrganization:${row.id}:${outcome}:${u.id}`,
      data: {
        orgName: row.orgName, orgType: row.orgType.toLowerCase(),
        outcome: outcome === "approved" ? "was approved automatically" : "is waiting for your review",
        reasons: reasons.map((r) => `• ${r}`).join("\n"),
        profileUrl: `${appUrl()}/admin/onboarding/${row.id}`,
      },
    });
  }
}

/** Take the row's lock and check it is still in `state` — so two deciders never both act. */
async function lockIn(tx: Tx, id: string, state: OnboardingState): Promise<boolean> {
  const moved = await tx.propertyOnboarding.updateMany({
    /* tenant-scope: the row the caller already found (through whereFor, or its own token). */
    where: { id, state: state as Prisma.EnumOnboardingStateFilter["equals"] }, data: { updatedAt: new Date() },
  });
  return moved.count === 1;
}

/** The facts the automatic approval weighs, read now. */
export async function approvalFactsFor(tx: Tx | typeof prisma, row: Row) {
  const email = primaryEmail(row);
  let nameTakenBy: string | null;
  if (row.nameKey) {
    nameTakenBy = await nameHolder(tx, row.nameKey, { onboardingId: row.id, propertyId: row.propertyId });
  } else {
    /* An application from before the name rule, whose name another one already held. */
    nameTakenBy = await nameHolder(tx, normalizeBusinessName(row.orgName), { onboardingId: row.id, propertyId: row.propertyId });
  }
  return {
    answersMissing: missingFor(row),
    missingDocuments: checklistOf(row).filter((c) => !c.done).map((c) => c.label),
    contactEmail: email,
    emailConfirmed: emailConfirmed(row),
    nameTakenBy,
    emailHasLogin: await emailHasLogin(tx, email),
  };
}

/**
 * 2S1-BE-06 — run the automatic checks on a PENDING_REVIEW application:
 * approve it (the same provisioning as a manual approval), or keep it in
 * BTG's queue with its reasons. Safe to run any number of times; a no-op in
 * any other state.
 */
export async function evaluateOnboarding(tx: Tx, id: string) {
  if (!(await lockIn(tx, id, "PENDING_REVIEW"))) return { outcome: "decided" as const, reasons: [] as string[] };
  const row = await tx.propertyOnboarding.findFirstOrThrow({
    /* tenant-scope: the system acting on one application, found by id from its own token or the caller's scoped read. */
    where: { id }, select: SELECT,
  });
  const facts = await approvalFactsFor(tx, row);
  const verdict = approvalVerdict(facts);
  if (verdict.outcome === "review") {
    if (verdict.reasons.join("|") !== row.reviewReasons.join("|")) {
      await tx.propertyOnboarding.update({
        /* tenant-scope: the row locked above. */
        where: { id }, data: { reviewReasons: verdict.reasons }, select: { id: true },
      });
      await audit(tx, SYSTEM(row.tenantId), "onboarding.needsReview", "PropertyOnboarding", id, { after: { reasons: verdict.reasons } });
    }
    /* Once, when it first lands in the queue — not again for each paper that narrows the reasons. */
    if (row.reviewReasons.length === 0) await tellBtg(tx, row, "review", verdict.reasons);
    return { outcome: "review" as const, reasons: verdict.reasons };
  }

  const now = new Date();
  if (!row.nameKey) {
    await tx.propertyOnboarding.update({
      /* tenant-scope: the row locked above — it takes the name it was checked free for. */
      where: { id }, data: { nameKey: normalizeBusinessName(row.orgName) }, select: { id: true },
    });
  }
  const provisioned = row.propertyId ? null : await provisionTenant(tx, row, now);
  const propertyId = row.propertyId ?? provisioned!.propertyId;
  if (!provisioned) {
    /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
    await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: now, payoutsHeldAt: null }, select: { id: true } });
  }
  await tx.propertyOnboarding.update({
    /* tenant-scope: the row locked above. */
    where: { id },
    data: {
      state: "APPROVED", decidedAt: now, decidedBy: null, autoApproved: true, reviewReasons: [], propertyId,
      approvalChecks: { at: now.toISOString(), checks: verdict.checks } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await audit(tx, SYSTEM(row.tenantId), "onboarding.autoApprove", "PropertyOnboarding", id, {
    before: { state: "PENDING_REVIEW" },
    after: {
      state: "APPROVED", automatic: true, propertyId, listingAccess: true, checks: verdict.checks,
      ...(provisioned ? { tenantId: provisioned.tenantId, managerUserId: provisioned.managerUserId } : {}),
    },
  });
  await notify(tx, row, "APPROVE", "onboarding.autoApprove");
  await tellBtg(tx, row, "approved", []);
  return { outcome: "approved" as const, reasons: [] as string[] };
}

/** The link in the confirmation email: proves the primary contact reads that mailbox; then the checks run. */
export async function confirmOnboardingEmail(emailToken: string) {
  const id = onboardingIdOfEmailToken(emailToken);
  if (!id) throw new OnboardingError("This confirmation link is not valid.", 400);
  return prisma.$transaction(async (tx) => {
    const row = await tx.propertyOnboarding.findFirst({
      /* tenant-scope: found by the id inside a signed email token, checked against the row's own contact below. */
      where: { id }, select: SELECT,
    });
    const email = row ? primaryEmail(row) : null;
    if (!row || !email || !emailTokenMatches(emailToken, row.id, email)) {
      throw new OnboardingError("This confirmation link is no longer valid — the primary contact may have changed. Ask for a new link from your application.", 400);
    }
    if (!emailConfirmed(row)) {
      await tx.propertyOnboarding.update({
        /* tenant-scope: the row named by the signed token. */
        where: { id: row.id }, data: { confirmedEmail: email, emailConfirmedAt: new Date() }, select: { id: true },
      });
      await audit(tx, SYSTEM(row.tenantId), "onboarding.emailConfirmed", "PropertyOnboarding", row.id, { after: { email } });
    }
    const verdict = row.state === "PENDING_REVIEW" ? await evaluateOnboarding(tx, row.id) : null;
    const fresh = await tx.propertyOnboarding.findFirstOrThrow({
      /* tenant-scope: the same row. */
      where: { id: row.id }, select: { state: true, orgName: true, reviewReasons: true },
    });
    return {
      state: fresh.state as OnboardingState, orgName: fresh.orgName, email, emailConfirmed: true,
      approved: verdict?.outcome === "approved", reviewReasons: fresh.reviewReasons,
      /* Opening the emailed link proves the mailbox, so it may carry on from any device. */
      resumeToken: issueOnboardingToken(row.id),
    };
  });
}

/** Send the confirmation link again — the applicant lost it, or it went to spam. */
export async function resendOnboardingConfirmation(token: string) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    if (!primaryEmail(row)) throw new OnboardingError("Add your contacts first — the link goes to the primary contact.", 409);
    if (emailConfirmed(row)) return view(row);
    const again = await tx.auditLog.count({ where: { tenantId: row.tenantId, entity: "PropertyOnboarding", entityId: row.id, action: "onboarding.confirmEmailResent" } });
    if (again >= 5) throw new OnboardingError("We've sent this link several times already. Check your spam folder, or contact BTG.", 429);
    await audit(tx, SYSTEM(row.tenantId), "onboarding.confirmEmailResent", "PropertyOnboarding", row.id, { after: { email: primaryEmail(row) } });
    await sendConfirmation(tx, row, again + 1);
    return view(row);
  });
}

/* ── the applicant (public, by token) — 2S1-BE-01 ───────────────────────── */

/** Step 0: an organisation starts. Returns the token it comes back with. */
export async function startOnboarding(input: { orgType: OrgType; orgName: string }) {
  const tenantId = env.PUBLIC_INTAKE_TENANT_ID;
  const orgName = input.orgName.trim();
  /* 2S1-BE-06 — the name is held from the first step. The check is the
     friendly answer; the UNIQUE nameKey is what makes it true when two
     applications for one name arrive together. */
  const nameKey = nameKeyOf(orgName);
  if (await nameHolder(prisma, nameKey)) throw new OnboardingNameTakenError();
  let row: { id: string; state: string };
  try {
    row = await prisma.propertyOnboarding.create({
      data: { tenantId, orgType: input.orgType, orgName, nameKey },
      select: { id: true, state: true },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new OnboardingNameTakenError();
    throw e;
  }
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
  try {
    return await saveStepTx(token, input);
  } catch (e) {
    /* Two applications renamed to one name at the same moment: the database refused the second. */
    if (isUniqueViolation(e)) throw new OnboardingNameTakenError();
    throw e;
  }
}

async function saveStepTx(token: string, input: StepInput) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    if (!EDITABLE.has(row.state as OnboardingState)) {
      throw new OnboardingError(`An application that is ${row.state} cannot be edited.`, 409);
    }
    let data: Prisma.PropertyOnboardingUpdateInput;
    switch (input.step) {
      case "organisation": {
        if (input.stateCode && !US_STATES.has(input.stateCode)) throw new OnboardingError("SponsorX operates in the United States: give a US state code.");
        let nameKey: string | undefined;
        if (input.orgName && input.orgName.trim() !== row.orgName) {
          /* 2S1-BE-06 — a new name must be free too; the old one is released. */
          nameKey = nameKeyOf(input.orgName.trim());
          if (nameKey !== row.nameKey && (await nameHolder(tx, nameKey, { onboardingId: row.id, propertyId: row.propertyId }))) throw new OnboardingNameTakenError();
        }
        data = {
          ...(input.orgName ? { orgName: input.orgName.trim() } : {}), ...(input.stateCode ? { stateCode: input.stateCode } : {}),
          ...(nameKey ? { nameKey } : {}),
        };
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
    /* tenant-scope: the application named by the signed resume token, loaded above (byToken). */
    const updated = await tx.propertyOnboarding.update({ where: { id: row.id }, data, select: SELECT });
    /* 2S1-BE-06 — a primary contact whose address isn't confirmed is sent the link (once per address). */
    if (input.step === "contacts" && !emailConfirmed(updated)) await sendConfirmation(tx, updated);
    return view(updated);
  });
}

/**
 * Submit — refused, with the list, while an answer is missing. Then the
 * automatic checks run (2S1-BE-06): approved at once when every one passes,
 * otherwise PENDING_REVIEW with the reasons the applicant is shown — and the
 * applicant can still upload the missing documents and confirm the email.
 */
export async function submitOnboarding(token: string) {
  return prisma.$transaction(async (tx) => {
    const row = await byToken(tx, token);
    const from = row.state as OnboardingState;
    if (!canTransitionOnboarding(from, "PENDING_REVIEW")) throw new IllegalOnboardingTransitionError(from, "PENDING_REVIEW");
    const missing = missingFor(row);
    if (missing.length) throw new OnboardingError(`The application is not complete: ${missing.join(", ")}.`, 422, missing);
    /* tenant-scope: the application named by the signed resume token, loaded above (byToken). */
    await tx.propertyOnboarding.update({
      where: { id: row.id }, data: { state: "PENDING_REVIEW", submittedAt: new Date(), reviewReasons: [] }, select: { id: true },
    });
    await audit(tx, { userId: null, tenantId: row.tenantId }, "onboarding.submit", "PropertyOnboarding", row.id, {
      before: { state: from }, after: { state: "PENDING_REVIEW" },
    });
    const verdict = await evaluateOnboarding(tx, row.id);
    /* Approved at once: the approval email is the only one. Otherwise the
       receipt says what is still needed. */
    if (verdict.outcome !== "approved") {
      await notify(tx, row, "SUBMIT", "onboarding.submit", null, {
        stillNeeded: verdict.reasons.map((r) => `• ${r}`).join("\n"),
        resumeUrl: `${appUrl()}/onboarding/${issueOnboardingToken(row.id)}`,
      });
    }
    return view(await tx.propertyOnboarding.findFirstOrThrow({
      /* tenant-scope: the row named by the applicant's own token. */
      where: { id: row.id }, select: SELECT,
    }));
  });
}

/* ── the reviewer (BTG) — 2S1-BE-03 ─────────────────────────────────────── */

/**
 * The verification queue: submitted applications, oldest first.
 * 2S1-BE-06 adds two lists for BTG's checks afterwards: `auto` — the
 * organisations the system approved, newest first (spot checks) — and
 * `flagged` — approved organisations a document change flagged (2S1-BE-07).
 */
export async function reviewQueue(actor: Actor, state: OnboardingState = "PENDING_REVIEW", list?: "auto" | "flagged") {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const where = whereFor(actor, "propertyOnboarding", "read");
  const rows = await prisma.propertyOnboarding.findMany({
    where: list === "auto" ? { ...where, autoApproved: true }
      : list === "flagged" ? { ...where, flaggedAt: { not: null } }
      : { ...where, state: state as Prisma.EnumOnboardingStateFilter["equals"] },
    select: SELECT,
    orderBy: list ? { decidedAt: "desc" } : { submittedAt: "asc" },
    ...(list ? { take: 200 } : {}),
  });
  return rows.map(view);
}

/** The desk's page of one tab (the house pager, lib/paging.ts), with every
 *  tab's count: each state, plus the "approved automatically" and "flagged" lists. */
export async function reviewQueuePage(actor: Actor, page: PageRequest, state: OnboardingState = "PENDING_REVIEW", list?: "auto" | "flagged") {
  assertTenantWide(actor, "propertyOnboarding", "read");
  const scope = whereFor(actor, "propertyOnboarding", "read");
  const where = list === "auto" ? { ...scope, autoApproved: true }
    : list === "flagged" ? { ...scope, flaggedAt: { not: null } }
    : { ...scope, state: state as Prisma.EnumOnboardingStateFilter["equals"] };
  const orderBy = list ? { decidedAt: "desc" as const } : { submittedAt: "asc" as const };
  const [paged, byState, auto, flagged] = await Promise.all([
    readPage(
      page,
      () => prisma.propertyOnboarding.count({ where /* tenant-scope: whereFor(propertyOnboarding) in scope */ }),
      (skip, take) => prisma.propertyOnboarding.findMany({ where /* tenant-scope: whereFor(propertyOnboarding) in scope */, select: SELECT, orderBy, skip, take }),
    ),
    prisma.propertyOnboarding.groupBy({ by: ["state"], where: scope /* tenant-scope: whereFor(propertyOnboarding) */, _count: { _all: true } }),
    prisma.propertyOnboarding.count({ where: { ...scope, autoApproved: true } /* tenant-scope: whereFor(propertyOnboarding) in scope */ }),
    prisma.propertyOnboarding.count({ where: { ...scope, flaggedAt: { not: null } } /* tenant-scope: whereFor(propertyOnboarding) in scope */ }),
  ]);
  return {
    onboardings: paged.rows.map(view),
    page: paged.page,
    counts: { ...(Object.fromEntries(byState.map((s) => [s.state, s._count._all])) as Record<string, number>), auto, flagged },
  };
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
 * Is this decision legal from here? APPROVE is for a submitted application
 * only; REINSTATE is the road back from SUSPENDED, or from a Reject after
 * approval (2S1-BE-06) — never from an application rejected at review, which
 * stays terminal. The rest follow the machine.
 */
export function decisionAllowed(decision: Decision, from: OnboardingState, hadProperty: boolean): boolean {
  if (decision === "APPROVE") return from === "PENDING_REVIEW";
  if (decision === "REINSTATE") return from === "SUSPENDED" || (from === "REJECTED" && hadProperty);
  return canTransitionOnboarding(from, DECISIONS[decision]);
}

/** The logins of an organisation's property — its managers — in its own tenant. */
const managersOf = (property: { id: string; tenantId: string }) => ({ tenantId: property.tenantId, propertyId: property.id });

/**
 * 2S1-BE-06 — Reject after approval withdraws the organisation: its logins
 * switched off (refused at sign-in, auth/actor.ts), listing access off, its
 * listings ended, its payouts held. Nothing is deleted yet: 2S1-BE-13's
 * closure keeps its files 30 days (then the retention job deletes them) and
 * lets it ask BTG to come back. A login the organisation had switched off by
 * closing itself is taken over too, so it can't reactivate itself.
 */
async function withdraw(tx: Tx, actor: Actor, row: Row, now: Date, notes: string | null) {
  const property = row.propertyId && row.property ? { id: row.propertyId, tenantId: row.property.tenantId } : null;
  if (!property) return { loginsSwitchedOff: 0, listingsEnded: 0, closureId: "" };
  /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
  await tx.property.update({ where: { id: property.id }, data: { listingAccessAt: null, payoutsHeldAt: now }, select: { id: true } });
  const logins = await tx.user.findMany({
    /* tenant-scope: the organisation's own logins, in its own tenant. */
    where: { ...managersOf(property), ...REJECT_TAKES_LOGINS }, select: { id: true },
  });
  const off = await tx.user.updateMany({
    /* tenant-scope: the logins found just above, in the organisation's own tenant. */
    where: { ...managersOf(property), id: { in: logins.map((u) => u.id) } },
    data: { disabledAt: now, disabledReason: `onboarding:${row.id}` },
  });
  /* 2S1-BE-13 — every Reject records a closure: files on the 30-day purge, and the way to ask BTG to come back. */
  const closureId = await recordClosureIn(tx, actor, {
    subjectKind: "PROPERTY", subjectId: property.id, cause: "REJECTED", reason: notes, userIds: logins.map((u) => u.id),
    contactEmail: primaryEmail(row) ?? "", displayName: row.orgName,
  });
  const live = await tx.listing.findMany({
    where: { tenantId: property.tenantId, propertyId: property.id, state: { not: "ARCHIVED" } },
    select: { id: true, state: true },
  });
  for (const l of live) {
    /* The listing machine (State Machines §2): live and draft listings end;
       one waiting for BTG goes back to draft, where no listing access means
       it can never be resubmitted. */
    const to = l.state === "PENDING_APPROVAL" ? "DRAFT" : "ARCHIVED";
    await tx.listing.update({
      /* tenant-scope: a listing of the organisation's own property, loaded above in its tenant. */
      where: { id: l.id }, data: { state: to, reviewNotes: "The organisation was rejected by BTG." }, select: { id: true },
    });
    await audit(tx, actor, `listing.${to === "ARCHIVED" ? "archive" : "request_changes"}`, "Listing", l.id, {
      before: { state: l.state }, after: { state: to, reason: "organisation rejected", onboardingId: row.id },
    });
  }
  return { loginsSwitchedOff: off.count, listingsEnded: live.length, closureId };
}

/**
 * 2S1-BE-13 — a Reject at review, before the organisation had a Property:
 * the APPLICATION is closed (subject ONBOARDING), so its uploaded documents
 * go on the 30-day purge (account-closure.ts RETAINED_DOCUMENT_SOURCES) and
 * the applicant can ask BTG to look again from the reactivation page. It has
 * no logins yet. The rejection stays terminal (decisionAllowed): BTG's "yes"
 * is a fresh application, its name now free.
 */
async function closeRejectedApplication(tx: Tx, actor: Actor, row: Row, notes: string | null) {
  const closureId = await recordClosureIn(tx, actor, {
    subjectKind: "ONBOARDING", subjectId: row.id, cause: "REJECTED", reason: notes, userIds: [],
    contactEmail: primaryEmail(row) ?? "", displayName: row.orgName,
  });
  return { closureId };
}

/** Reinstate after a Reject: the logins that Reject switched off come back, payouts are released, the closure ends. */
async function restore(tx: Tx, actor: Actor, row: Row) {
  const property = row.propertyId && row.property ? { id: row.propertyId, tenantId: row.property.tenantId } : null;
  if (!property) return { loginsSwitchedOn: 0, payoutsResent: 0 };
  const on = await tx.user.updateMany({
    /* tenant-scope: the organisation's own logins this rejection switched off, in its own tenant. */
    where: { ...managersOf(property), disabledReason: `onboarding:${row.id}` },
    data: { disabledAt: null, disabledReason: null },
  });
  /* Payouts BTG approved before the Reject waited, held (payouts.ts sendPayout); they go now. */
  const waiting = await tx.payout.findMany({
    /* tenant-scope: the organisation's own payouts, named by its payee key (its tenant, type and property). */
    where: { payeeTenantId: property.tenantId, payeeType: "PROPERTY", payeeId: property.id, state: "APPROVED" },
    select: { id: true, tenantId: true },
  });
  for (const p of waiting) await enqueue(tx, p.tenantId, "payouts.send", { payoutId: p.id });
  /* 2S1-BE-13 — back inside the 30 days: the closure ends and nothing is deleted. */
  await reopenClosureIn(tx, actor, "PROPERTY", property.id);
  return { loginsSwitchedOn: on.count, payoutsResent: waiting.length };
}

/**
 * Action a decision. APPROVE creates the Property (first approval) and grants
 * listing access; SUSPEND withdraws it and REINSTATE restores it; REQUEST_
 * CHANGES, REJECT and SUSPEND need a note the applicant will read. Audited.
 *
 * 2S1-BE-06 — REJECT on an APPROVED organisation is BTG's check afterwards:
 * it withdraws the organisation (withdraw above) and emails the reason;
 * REINSTATE reverses it. REJECT at review releases the name for others.
 */
export async function decideOnboarding(actor: Actor, id: string, decision: Decision, notes?: string | null) {
  assertTenantWide(actor, "propertyOnboarding", "approve");
  if (NEEDS_NOTE.has(decision) && !notes?.trim()) throw new OnboardingError(`${decision} needs a note — the applicant is told why.`);
  return prisma.$transaction(async (tx) => {
    const row = await tx.propertyOnboarding.findFirst({ where: { ...whereFor(actor, "propertyOnboarding", "approve"), id }, select: SELECT });
    if (!row) throw new ForbiddenError("propertyOnboarding", "approve");
    const from = row.state as OnboardingState;
    const to = DECISIONS[decision];
    if (!decisionAllowed(decision, from, Boolean(row.propertyId))) throw new IllegalOnboardingTransitionError(from, to);
    /* One decider at a time — BTG, or the automatic approval on the applicant's last upload. */
    if (!(await lockIn(tx, id, from))) throw new OnboardingError("This application changed a moment ago — reload it.", 409);

    let propertyId = row.propertyId;
    let provisioned: Provisioned | null = null;
    let effects: Record<string, number | string> = {};
    const now = new Date();
    if (to === "APPROVED") {
      /* One organisation per name, whoever approves (2S1-BE-06): BTG's own approval
         checks the name too — including a row that predates the name key. */
      const key = row.nameKey ?? normalizeBusinessName(row.orgName);
      const taken = await nameHolder(tx, key, { onboardingId: row.id, propertyId });
      if (taken) throw new OnboardingError(`"${taken}" is already registered on SponsorX — one organisation per name.`, 409);
      if (!row.nameKey) {
        await tx.propertyOnboarding.update({
          /* tenant-scope: the row loaded through whereFor(propertyOnboarding, approve) — it takes the name it was checked free for. */
          where: { id }, data: { nameKey: key }, select: { id: true },
        });
      }
      if (!propertyId) {
        provisioned = await provisionTenant(tx, row, now);
        propertyId = provisioned.propertyId;
      } else {
        /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
        await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: now, payoutsHeldAt: null }, select: { id: true } });
      }
      if (decision === "REINSTATE" && from === "REJECTED") effects = await restore(tx, actor, row);
    }
    if (to === "SUSPENDED" && propertyId) {
      /* 2S1-BE-13 — deliberately NO closure: a suspension pauses listing
         access only. The logins stay on, nothing is withdrawn for good, and
         no file is due for deletion; Reinstate lifts it. */
      /* tenant-scope: the Property this onboarding provisioned, in the organisation's own tenant (2S1-BE-04). */
      await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: null }, select: { id: true } });
    }
    const afterApproval = decision === "REJECT" && from === "APPROVED";
    if (afterApproval) effects = await withdraw(tx, actor, row, now, notes?.trim() || null);
    if (decision === "REJECT" && !afterApproval) effects = await closeRejectedApplication(tx, actor, row, notes?.trim() || null);

    /* tenant-scope: the row loaded above through whereFor(propertyOnboarding, approve). */
    const updated = await tx.propertyOnboarding.update({
      where: { id },
      data: {
        state: to as Prisma.PropertyOnboardingUpdateInput["state"], decidedAt: now, decidedBy: actor.userId,
        reviewNotes: notes?.trim() || null, propertyId,
        ...(decision === "APPROVE" ? { autoApproved: false, reviewReasons: [] } : {}),
        /* Rejected at review: the name is free for another organisation. */
        ...(decision === "REJECT" && !afterApproval ? { nameKey: null } : {}),
      },
      select: SELECT,
    });
    await audit(tx, actor, `onboarding.${decision.toLowerCase()}`, "PropertyOnboarding", id, {
      before: { state: from },
      after: {
        state: to, notes: notes?.trim() || null, propertyId, listingAccess: to === "APPROVED",
        ...(afterApproval ? { afterApproval: true, payoutsHeld: true } : {}),
        ...effects,
        ...(provisioned ? { tenantId: provisioned.tenantId, managerUserId: provisioned.managerUserId } : {}),
      },
    });
    if (afterApproval) {
      await notify(tx, row, decision, `onboarding.${decision.toLowerCase()}`, notes, { supportUrl: `${appUrl()}/contact`, supportEmail: env.SUPPORT_EMAIL }, "onboarding.accountRejected");
    } else if (decision === "REINSTATE" && from === "REJECTED") {
      await notify(tx, row, decision, `onboarding.${decision.toLowerCase()}`, null, { portalUrl: `${appUrl()}/property` }, "onboarding.reinstated");
    } else {
      await notify(tx, row, decision, `onboarding.${decision.toLowerCase()}`, notes);
    }
    return view(updated);
  });
}
