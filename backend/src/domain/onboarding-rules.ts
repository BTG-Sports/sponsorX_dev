/**
 * Property onboarding — the rules (2S1-BE-01, 2S1-BE-03). Pure.
 *
 * The state machine is documentation/SponsorX-Phase2-State-Machines.md §1,
 * transcribed. What an application must contain before it can be submitted
 * depends on the organisation type and the state it operates in: the per-
 * type detail schemas are STRICT, so a field nobody asked for — a tax id, a
 * bank account — is refused rather than stored (Postgres holds neither;
 * CLAUDE.md, §26). Payout and tax details are the payment provider's to
 * collect.
 */
import { z } from "zod";

/** 2S1-BE-08 — AGENCY: an athlete management or talent agency. Like a team
 *  it holds a roster and takes an agreed share of its athletes' sales. */
export const ORG_TYPES = ["TEAM", "SCHOOL", "EVENT", "MEDIA", "VIRTUAL", "AGENCY"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export type OnboardingState = "DRAFT" | "PENDING_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
export const ONBOARDING_STATES: readonly OnboardingState[] = ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"];

/* 2S1-BE-06 — the system approves (PENDING_REVIEW → APPROVED) when every
   check passes, and BTG reviews afterwards: Reject takes an APPROVED
   organisation to REJECTED, and Reinstate brings it back. Only an
   organisation that was approved can be reinstated — an application BTG
   rejected at review stays terminal (decideOnboarding checks it had a
   Property). */
const TRANSITIONS: Readonly<Record<OnboardingState, readonly OnboardingState[]>> = {
  DRAFT: ["PENDING_REVIEW"],
  CHANGES_REQUESTED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  APPROVED: ["SUSPENDED", "REJECTED"],
  SUSPENDED: ["APPROVED"],
  REJECTED: ["APPROVED"],
};

/** The applicant may edit only an application that is theirs to change. */
export const EDITABLE: ReadonlySet<OnboardingState> = new Set(["DRAFT", "CHANGES_REQUESTED"]);

export function canTransitionOnboarding(from: OnboardingState, to: OnboardingState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** BTG's decisions, and the state each one moves to. */
export const DECISIONS = {
  APPROVE: "APPROVED",
  REQUEST_CHANGES: "CHANGES_REQUESTED",
  REJECT: "REJECTED",
  SUSPEND: "SUSPENDED",
  REINSTATE: "APPROVED",
} as const satisfies Record<string, OnboardingState>;
export type Decision = keyof typeof DECISIONS;
/** A refusal or a pause always says why — the applicant is told. */
export const NEEDS_NOTE: ReadonlySet<Decision> = new Set(["REQUEST_CHANGES", "REJECT", "SUSPEND"]);

export class IllegalOnboardingTransitionError extends Error {
  readonly status = 409;
  constructor(from: OnboardingState, to: OnboardingState) {
    super(`An onboarding cannot go from ${from} to ${to}. Legal moves from ${from}: ${TRANSITIONS[from].join(", ") || "none — it is terminal"}.`);
    this.name = "IllegalOnboardingTransitionError";
  }
}

/* ── what each type must tell us ─────────────────────────────────────────── */

const s = (max = 200) => z.string().trim().min(1).max(max);

export const US_STATES: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

const usState = z.string().length(2).refine((c) => US_STATES.has(c), "a US state code");

/** Business details per organisation type. STRICT: unknown keys refused. */
export const DETAILS_SCHEMA = {
  TEAM: z.object({ legalEntityName: s(), league: s(), sport: s(60), stateRegistrationId: s(60).optional() }).strict(),
  SCHOOL: z.object({ district: s(), athleticDirector: s(), sports: z.array(s(60)).min(1).max(40) }).strict(),
  EVENT: z.object({ legalEntityName: s(), venue: s(), startsOn: z.iso.date(), endsOn: z.iso.date(), stateRegistrationId: s(60).optional() }).strict(),
  MEDIA: z.object({ legalEntityName: s(), outlet: s(), audience: s(500), stateRegistrationId: s(60).optional() }).strict(),
  VIRTUAL: z.object({ legalEntityName: s(), platformUrl: z.url().max(300), stateRegistrationId: s(60).optional() }).strict(),
  /* 2S1-BE-08 — an agency is a business wherever it operates: it names the
     states beyond its own, and is held to a business registration for each
     of them and its own (requiredDocuments). */
  AGENCY: z.object({ legalEntityName: s(), statesOperatedIn: z.array(usState).max(51).optional(), stateRegistrationId: s(60).optional() }).strict(),
} as const satisfies Record<OrgType, z.ZodType>;

/**
 * States where a commercial organisation must give its state business
 * registration number (the entity number on the Secretary of State's
 * register — a public record, not a tax id). SIMULATED list, pending BTG's
 * counsel; schools are public bodies and exempt.
 */
export const REGISTRATION_STATES: ReadonlySet<string> = new Set(["CA", "NY", "TX", "FL", "IL"]);

export const ContactSchema = z.object({
  name: s(), email: z.email().max(320), phone: s(40).optional(), role: s(80), primary: z.boolean().default(false),
}).strict();

export type OnboardingShape = {
  orgType: string;
  orgName: string;
  stateCode: string | null;
  contacts: unknown;
  details: unknown;
  payoutAcknowledgedAt: Date | null;
  termsAcceptedAt: Date | null;
};

/**
 * What is still missing before this application can be submitted — empty
 * means complete. Named per field so the wizard can say exactly what to fill.
 */
export function missingFor(o: OnboardingShape): string[] {
  const missing: string[] = [];
  const type = o.orgType as OrgType;
  if (!o.orgName?.trim()) missing.push("organisation.orgName");
  if (!o.stateCode || !US_STATES.has(o.stateCode)) missing.push("organisation.stateCode");

  const contacts = z.array(ContactSchema).safeParse(o.contacts);
  if (!contacts.success || contacts.data.filter((c) => c.primary).length !== 1) missing.push("contacts.primary");

  const schema = DETAILS_SCHEMA[type];
  const details = schema ? schema.safeParse(o.details) : null;
  if (!details?.success) {
    for (const issue of details?.error.issues ?? [{ path: ["details"] }]) missing.push(`business.${issue.path.join(".") || "details"}`);
  } else if (type !== "SCHOOL" && o.stateCode && REGISTRATION_STATES.has(o.stateCode)) {
    if (!(details.data as { stateRegistrationId?: string }).stateRegistrationId) missing.push("business.stateRegistrationId");
  }
  if (type === "EVENT" && details?.success) {
    const d = details.data as { startsOn: string; endsOn: string };
    if (d.endsOn < d.startsOn) missing.push("business.endsOn");
  }

  if (!o.payoutAcknowledgedAt) missing.push("payout.acknowledged");
  if (!o.termsAcceptedAt) missing.push("agreements.terms");
  return [...new Set(missing)];
}

/* ── documents each organisation must hold — 2S1-BE-06, 2S1-BE-08 ──────── */

export const DOCUMENT_KINDS = ["RIGHTS_PROOF", "BUSINESS_REGISTRATION", "IDENTITY", "REPRESENTATION_AGREEMENT", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** What each kind is, in the words the applicant and BTG read. */
export const DOCUMENT_LABEL: Record<DocumentKind, string> = {
  IDENTITY: "Government ID of the person signing",
  RIGHTS_PROOF: "Proof of the rights to sell your inventory",
  BUSINESS_REGISTRATION: "Business registration",
  REPRESENTATION_AGREEMENT: "Representation agreement with your athletes",
  OTHER: "Other document",
};

/** One required document: a kind, and for a registration the state it is for. */
export type DocumentRequirement = { key: string; kind: DocumentKind; stateCode: string | null; label: string };

const requirement = (kind: DocumentKind, stateCode: string | null = null): DocumentRequirement => ({
  key: stateCode ? `${kind}:${stateCode}` : kind,
  kind,
  stateCode,
  label: stateCode ? `${DOCUMENT_LABEL[kind]} (${stateCode})` : DOCUMENT_LABEL[kind],
});

/** The states an agency operates in: its own, and every one it names. */
export function agencyStates(o: Pick<OnboardingShape, "stateCode" | "details">): string[] {
  const named = (o.details as { statesOperatedIn?: unknown } | null)?.statesOperatedIn;
  const list = Array.isArray(named) ? named.filter((c): c is string => typeof c === "string" && US_STATES.has(c)) : [];
  return [...new Set([...(o.stateCode && US_STATES.has(o.stateCode) ? [o.stateCode] : []), ...list])].sort();
}

/**
 * The documents an organisation must have on file, by type and state.
 *
 * SIMULATED pending BTG's counsel (as REGISTRATION_STATES is), except
 * AGENCY's, which the programme owner set on 2026-10-01: a business
 * registration for every state it operates in, the signer's government ID,
 * and a representation agreement (that last one not yet confirmed by the
 * owner — flagged in the 2S1-BE-08 handover).
 *
 * Everyone names the person signing (a government ID). Who sells inventory
 * proves the rights to sell it. A commercial organisation registered in a
 * REGISTRATION_STATES state uploads that registration; a school is a public
 * body and does not.
 */
export function requiredDocuments(o: Pick<OnboardingShape, "orgType" | "stateCode" | "details">): DocumentRequirement[] {
  const type = o.orgType as OrgType;
  const out = [requirement("IDENTITY")];
  if (type === "AGENCY") {
    out.push(requirement("REPRESENTATION_AGREEMENT"));
    for (const st of agencyStates(o)) out.push(requirement("BUSINESS_REGISTRATION", st));
    return out;
  }
  if (type === "TEAM" || type === "SCHOOL" || type === "EVENT") out.push(requirement("RIGHTS_PROOF"));
  if (type !== "SCHOOL" && o.stateCode && REGISTRATION_STATES.has(o.stateCode)) out.push(requirement("BUSINESS_REGISTRATION", o.stateCode));
  return out;
}

/** A document as the checklist reads it: on file means uploaded, not replaced, not removed. */
export type DocumentOnFile = {
  id: string; kind: string; stateCode: string | null; filename: string;
  uploadedAt: Date | null; replacedAt: Date | null; removedAt: Date | null;
};

export const isCurrent = (d: Pick<DocumentOnFile, "uploadedAt" | "replacedAt" | "removedAt">) => Boolean(d.uploadedAt) && !d.replacedAt && !d.removedAt;

/** Does this document meet that requirement? A registration counts for its own state only. */
export function meets(r: DocumentRequirement, d: Pick<DocumentOnFile, "kind" | "stateCode">): boolean {
  if (d.kind !== r.kind) return false;
  return r.kind !== "BUSINESS_REGISTRATION" || !r.stateCode || d.stateCode === r.stateCode;
}

/** Every requirement, with the current document that meets it (or none). */
export function documentChecklist<D extends DocumentOnFile>(o: Pick<OnboardingShape, "orgType" | "stateCode" | "details">, docs: readonly D[]) {
  const current = docs.filter(isCurrent);
  return requiredDocuments(o).map((r) => ({ ...r, document: current.find((d) => meets(r, d)) ?? null }));
}

/* ── the automatic approval — 2S1-BE-06 ────────────────────────────────── */

export type ApprovalFacts = {
  /** missingFor — the answers. Submit already requires them. */
  answersMissing: string[];
  missingDocuments: string[];
  contactEmail: string | null;
  emailConfirmed: boolean;
  /** Another organisation already holds this name (an application, or a property). */
  nameTakenBy: string | null;
  /** The primary contact's email already has a SponsorX login — approval would be refused. */
  emailHasLogin: boolean;
};

export type ApprovalCheck = { key: string; label: string; ok: boolean };

/**
 * The checklist, ticked from the facts, and its verdict: APPROVE when every
 * item holds, otherwise REVIEW with a reason per failed item — the applicant
 * and BTG read the same reasons.
 */
export function approvalVerdict(f: ApprovalFacts): { outcome: "approve" | "review"; checks: ApprovalCheck[]; reasons: string[] } {
  const checks: ApprovalCheck[] = [
    { key: "answers", label: "Application complete", ok: f.answersMissing.length === 0 },
    {
      key: "documents",
      label: f.missingDocuments.length ? `Required documents uploaded — missing: ${f.missingDocuments.join(", ")}` : "Required documents uploaded",
      ok: f.missingDocuments.length === 0,
    },
    { key: "email", label: f.contactEmail ? `Contact email confirmed (${f.contactEmail})` : "Contact email confirmed", ok: f.emailConfirmed },
    { key: "name", label: f.nameTakenBy ? `Name not already registered — “${f.nameTakenBy}” holds it` : "Name not already registered", ok: !f.nameTakenBy },
    { key: "login", label: "Contact email has no other SponsorX login", ok: !f.emailHasLogin },
  ];
  const reasons: string[] = [];
  if (f.answersMissing.length) reasons.push("Some answers are still missing");
  for (const d of f.missingDocuments) reasons.push(`Missing document: ${d}`);
  if (!f.emailConfirmed) reasons.push("The primary contact hasn't confirmed their email yet — open the link we emailed");
  /* The other organisation is not named: the applicant reads these reasons too. */
  if (f.nameTakenBy) reasons.push("This name is already registered on SponsorX — add your town to tell it apart, or contact BTG");
  if (f.emailHasLogin) reasons.push(`${f.contactEmail ?? "The contact's email"} already has a SponsorX login — name a different primary contact, or contact BTG`);
  return { outcome: reasons.length ? "review" : "approve", checks, reasons };
}
