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
import { randomBytes } from "node:crypto";

import { z } from "zod";

import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertTenantWide, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { issueOnboardingToken, readOnboardingToken } from "../lib/onboarding-token";
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
    return { ...view(row), terms: terms ? { agreementId: terms.id, version: terms.version, bodyHash: terms.bodyHash } : null };
  });
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
    const now = new Date();
    if (to === "APPROVED") {
      if (!propertyId) {
        const property = await tx.property.create({
          data: {
            tenantId: actor.tenantId, kind: row.orgType, name: row.orgName, stateCode: row.stateCode,
            slug: `${slugify(row.orgName)}-${randomBytes(3).toString("hex")}`, listingAccessAt: now,
          },
          select: { id: true },
        });
        propertyId = property.id;
      } else {
        await tx.property.update({ where: { id: propertyId }, data: { listingAccessAt: now }, select: { id: true } });
      }
    }
    if (to === "SUSPENDED" && propertyId) {
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
      before: { state: from }, after: { state: to, notes: notes?.trim() || null, propertyId, listingAccess: to === "APPROVED" },
    });
    return view(updated);
  });
}
