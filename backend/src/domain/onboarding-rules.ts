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

export const ORG_TYPES = ["TEAM", "SCHOOL", "EVENT", "MEDIA", "VIRTUAL"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export type OnboardingState = "DRAFT" | "PENDING_REVIEW" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
export const ONBOARDING_STATES: readonly OnboardingState[] = ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"];

const TRANSITIONS: Readonly<Record<OnboardingState, readonly OnboardingState[]>> = {
  DRAFT: ["PENDING_REVIEW"],
  CHANGES_REQUESTED: ["PENDING_REVIEW"],
  PENDING_REVIEW: ["APPROVED", "CHANGES_REQUESTED", "REJECTED"],
  APPROVED: ["SUSPENDED"],
  SUSPENDED: ["APPROVED"],
  REJECTED: [],
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

/** Business details per organisation type. STRICT: unknown keys refused. */
export const DETAILS_SCHEMA = {
  TEAM: z.object({ legalEntityName: s(), league: s(), sport: s(60), stateRegistrationId: s(60).optional() }).strict(),
  SCHOOL: z.object({ district: s(), athleticDirector: s(), sports: z.array(s(60)).min(1).max(40) }).strict(),
  EVENT: z.object({ legalEntityName: s(), venue: s(), startsOn: z.iso.date(), endsOn: z.iso.date(), stateRegistrationId: s(60).optional() }).strict(),
  MEDIA: z.object({ legalEntityName: s(), outlet: s(), audience: s(500), stateRegistrationId: s(60).optional() }).strict(),
  VIRTUAL: z.object({ legalEntityName: s(), platformUrl: z.url().max(300), stateRegistrationId: s(60).optional() }).strict(),
} as const satisfies Record<OrgType, z.ZodType>;

/**
 * States where a commercial organisation must give its state business
 * registration number (the entity number on the Secretary of State's
 * register — a public record, not a tax id). SIMULATED list, pending BTG's
 * counsel; schools are public bodies and exempt.
 */
export const REGISTRATION_STATES: ReadonlySet<string> = new Set(["CA", "NY", "TX", "FL", "IL"]);

export const US_STATES: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
  "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]);

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
