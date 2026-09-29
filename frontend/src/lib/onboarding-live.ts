/* --------------------------------------------------------------------------
   Property onboarding — the pure pieces of 2S1-FE-01 (the public wizard) and
   2S1-FE-02 (BTG's verification queue).

   Everything here mirrors backend/src/domain/onboarding-rules.ts and
   onboarding-documents.ts, so the wizard can say what is wrong before the
   API does. The API still decides: this only shapes bodies and copy. The
   business-detail fields are STRICT on the API (a key the type does not ask
   for is refused), so the bodies built here carry exactly the keys each
   organisation type allows and nothing else — never a bank or tax field.
   -------------------------------------------------------------------------- */

export const ORG_TYPES = ["TEAM", "SCHOOL", "EVENT", "MEDIA", "VIRTUAL"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_TYPE_COPY: Record<OrgType, { label: string; text: string }> = {
  TEAM: { label: "Team", text: "A club or travel team with a roster." },
  SCHOOL: { label: "School", text: "A school athletic programme." },
  EVENT: { label: "Event", text: "A tournament, showcase or camp." },
  MEDIA: { label: "Media", text: "A publication, stream or channel." },
  VIRTUAL: { label: "Virtual", text: "A virtual venue or world." },
};

export const isOrgType = (v: unknown): v is OrgType => typeof v === "string" && (ORG_TYPES as readonly string[]).includes(v);

export const ONBOARDING_STATES = ["DRAFT", "PENDING_REVIEW", "CHANGES_REQUESTED", "APPROVED", "REJECTED", "SUSPENDED"] as const;
export type OnboardingState = (typeof ONBOARDING_STATES)[number];
export const isOnboardingState = (v: unknown): v is OnboardingState =>
  typeof v === "string" && (ONBOARDING_STATES as readonly string[]).includes(v);

/** The applicant may edit only while the application is theirs to change. */
export const EDITABLE_STATES: ReadonlySet<OnboardingState> = new Set(["DRAFT", "CHANGES_REQUESTED"]);

export const STATE_COPY: Record<OnboardingState, { label: string; tone: "neutral" | "primary" | "accent" | "danger" | "warn" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "Pending review", tone: "warn" },
  CHANGES_REQUESTED: { label: "Changes requested", tone: "primary" },
  APPROVED: { label: "Approved", tone: "accent" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
};

/* ── the API's shapes ─────────────────────────────────────────────────── */

export type ApiContact = { name: string; email: string; phone?: string; role: string; primary: boolean };

export type ApiOnboardingDocument = {
  id: string;
  kind: string;
  filename: string;
  contentType: string;
  bytes: number;
  uploadedAt: string | null;
  createdAt: string;
  /** Staff read only (GET /onboarding/:id/documents): a 15-minute audited link. */
  downloadUrl?: string | null;
};

export type ApiTerms = { agreementId: string; version: number; bodyHash: string; body: string | null };

/** GET /public/onboarding/:token, PATCH …, and the staff GET /onboarding[/:id]. */
export type ApiOnboarding = {
  id: string;
  state: OnboardingState;
  orgType: OrgType;
  orgName: string;
  stateCode: string | null;
  contacts: unknown;
  details: unknown;
  payoutAcknowledgedAt: string | null;
  termsAgreementId: string | null;
  termsAcceptedAt: string | null;
  submittedAt: string | null;
  reviewNotes: string | null;
  decidedAt: string | null;
  propertyId: string | null;
  createdAt: string;
  updatedAt: string;
  documents: ApiOnboardingDocument[];
  listingAccess: boolean;
  missing: string[];
  /** Only on the public GET — the latest PROPERTY_TERMS, or null if none is published. */
  terms?: ApiTerms | null;
};

/* ── the steps ────────────────────────────────────────────────────────── */

export type StepKey = "organisation" | "contacts" | "business" | "payout" | "documents" | "agreements" | "review";

const BUSINESS_LABEL: Record<OrgType, string> = {
  TEAM: "Team details",
  SCHOOL: "School programme",
  EVENT: "Event details",
  MEDIA: "Media details",
  VIRTUAL: "Venue details",
};

/** The wizard's steps for an organisation type — the same seven for every
 *  type; the business step's name and fields are what change. */
export function stepsFor(orgType: OrgType): { key: StepKey; label: string; optional?: boolean }[] {
  return [
    { key: "organisation", label: "Organisation" },
    { key: "contacts", label: "Contacts" },
    { key: "business", label: BUSINESS_LABEL[orgType] },
    { key: "payout", label: "How you get paid" },
    { key: "documents", label: "Documents", optional: true },
    { key: "agreements", label: "Property terms" },
    { key: "review", label: "Review & submit" },
  ];
}

/* ── business details per type (DETAILS_SCHEMA, transcribed) ──────────── */

export type FieldKind = "text" | "textarea" | "date" | "url" | "list";
export type FieldSpec = { key: string; label: string; kind: FieldKind; max: number; optional?: boolean; hint?: string };

const REG_ID: FieldSpec = {
  key: "stateRegistrationId",
  label: "State business registration number",
  kind: "text",
  max: 60,
  optional: true,
  hint: "The entity number on your Secretary of State's register — a public record, not a tax ID.",
};

export const BUSINESS_FIELDS: Record<OrgType, FieldSpec[]> = {
  TEAM: [
    { key: "legalEntityName", label: "Legal entity name", kind: "text", max: 200 },
    { key: "league", label: "League", kind: "text", max: 200 },
    { key: "sport", label: "Sport", kind: "text", max: 60 },
    REG_ID,
  ],
  SCHOOL: [
    { key: "district", label: "School district", kind: "text", max: 200 },
    { key: "athleticDirector", label: "Athletic director", kind: "text", max: 200 },
    { key: "sports", label: "Sports offered", kind: "list", max: 60, hint: "Separate with commas — e.g. Basketball, Soccer." },
  ],
  EVENT: [
    { key: "legalEntityName", label: "Legal entity name", kind: "text", max: 200 },
    { key: "venue", label: "Venue", kind: "text", max: 200 },
    { key: "startsOn", label: "Starts on", kind: "date", max: 10 },
    { key: "endsOn", label: "Ends on", kind: "date", max: 10 },
    REG_ID,
  ],
  MEDIA: [
    { key: "legalEntityName", label: "Legal entity name", kind: "text", max: 200 },
    { key: "outlet", label: "Outlet", kind: "text", max: 200, hint: "The publication, stream or channel." },
    { key: "audience", label: "Audience", kind: "textarea", max: 500, hint: "Who reads, watches or listens — in your own words." },
    REG_ID,
  ],
  VIRTUAL: [
    { key: "legalEntityName", label: "Legal entity name", kind: "text", max: 200 },
    { key: "platformUrl", label: "Platform URL", kind: "url", max: 300 },
    REG_ID,
  ],
};

/** States where a commercial organisation must give its state registration
 *  number (the API's REGISTRATION_STATES — simulated pending BTG's counsel). */
export const REGISTRATION_STATES: ReadonlySet<string> = new Set(["CA", "NY", "TX", "FL", "IL"]);

export function registrationRequired(orgType: OrgType, stateCode: string | null | undefined): boolean {
  return orgType !== "SCHOOL" && !!stateCode && REGISTRATION_STATES.has(stateCode);
}

export const US_STATES: readonly { code: string; name: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"],
  ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"],
  ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"],
  ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"],
  ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
].map(([code, name]) => ({ code, name }));

const US_STATE_CODES = new Set(US_STATES.map((s) => s.code));
export const isUsState = (code: string | null | undefined) => !!code && US_STATE_CODES.has(code);

/* ── missing[] → steps and words ──────────────────────────────────────── */

const MISSING_STEP: Record<string, StepKey> = {
  organisation: "organisation",
  contacts: "contacts",
  business: "business",
  payout: "payout",
  agreements: "agreements",
};

/** Which step a `missing[]` key belongs to (its prefix). Unknown → review. */
export function stepOfMissing(key: string): StepKey {
  return MISSING_STEP[key.split(".")[0] ?? ""] ?? "review";
}

/** A `missing[]` key in words, e.g. "business.league" → "League". */
export function missingLabel(key: string, orgType: OrgType): string {
  const [head, field] = key.split(".");
  if (key === "organisation.orgName") return "Organisation name";
  if (key === "organisation.stateCode") return "State";
  if (key === "contacts.primary") return "Contacts, with exactly one primary contact";
  if (key === "payout.acknowledged") return "Payout acknowledgement";
  if (key === "agreements.terms") return "Acceptance of the property terms";
  if (head === "business") {
    if (!field || field === "details") return "Business details";
    return BUSINESS_FIELDS[orgType].find((f) => f.key === field)?.label ?? field;
  }
  return key;
}

/** `missing[]` grouped by step, words included — for ticks and the review list. */
export function missingByStep(missing: readonly string[], orgType: OrgType): Partial<Record<StepKey, string[]>> {
  const out: Partial<Record<StepKey, string[]>> = {};
  for (const key of missing) {
    const step = stepOfMissing(key);
    const label = missingLabel(key, orgType);
    const list = (out[step] ??= []);
    if (!list.includes(label)) list.push(label);
  }
  return out;
}

export type StepStatus = "done" | "todo" | "optional";

/** A step's tick: done when the API reports nothing missing for it.
 *  Documents are optional (the API does not require them to submit). */
export function stepStatus(step: StepKey, view: Pick<ApiOnboarding, "missing" | "documents">): StepStatus {
  if (step === "documents") return view.documents.some((d) => d.uploadedAt) ? "done" : "optional";
  if (step === "review") return view.missing.length === 0 ? "done" : "todo";
  return view.missing.some((k) => stepOfMissing(k) === step) ? "todo" : "done";
}

/** Where the wizard opens: the first step still missing something, else review. */
export function firstOpenStep(view: Pick<ApiOnboarding, "missing" | "orgType">): StepKey {
  for (const s of stepsFor(view.orgType)) {
    if (s.key === "documents" || s.key === "review") continue;
    if (view.missing.some((k) => stepOfMissing(k) === s.key)) return s.key;
  }
  return "review";
}

/* ── validation (mirrors the API) ─────────────────────────────────────── */

export type Errors = Record<string, string>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateOrganisation(form: { orgName: string; stateCode: string }): Errors {
  const e: Errors = {};
  const name = form.orgName.trim();
  if (!name) e.orgName = "Give the organisation's name.";
  else if (name.length > 200) e.orgName = "Keep the name under 200 characters.";
  if (!form.stateCode) e.stateCode = "Pick the state you operate in.";
  else if (!isUsState(form.stateCode)) e.stateCode = "SponsorX operates in the United States — pick a US state.";
  return e;
}

export type ContactForm = { name: string; email: string; phone: string; role: string; primary: boolean };
export const EMPTY_CONTACT: ContactForm = { name: "", email: "", phone: "", role: "", primary: false };
export const MAX_CONTACTS = 10;

/** Saved contacts, read defensively (the column is JSON). */
export function contactsFrom(raw: unknown): ContactForm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "",
      email: typeof c.email === "string" ? c.email : "",
      phone: typeof c.phone === "string" ? c.phone : "",
      role: typeof c.role === "string" ? c.role : "",
      primary: c.primary === true,
    }));
}

/** Errors keyed `<index>.<field>`, plus `list` for the whole-list rules. */
export function validateContacts(contacts: readonly ContactForm[]): Errors {
  const e: Errors = {};
  if (contacts.length === 0) e.list = "Add at least one contact.";
  if (contacts.length > MAX_CONTACTS) e.list = `At most ${MAX_CONTACTS} contacts.`;
  contacts.forEach((c, i) => {
    if (!c.name.trim()) e[`${i}.name`] = "Name is required.";
    else if (c.name.trim().length > 200) e[`${i}.name`] = "Under 200 characters.";
    const email = c.email.trim();
    if (!email) e[`${i}.email`] = "Email is required.";
    else if (!EMAIL.test(email) || email.length > 320) e[`${i}.email`] = "That doesn't look like an email address.";
    if (c.phone.trim().length > 40) e[`${i}.phone`] = "Under 40 characters.";
    if (!c.role.trim()) e[`${i}.role`] = "Their role is required.";
    else if (c.role.trim().length > 80) e[`${i}.role`] = "Under 80 characters.";
  });
  const primaries = contacts.filter((c) => c.primary).length;
  if (contacts.length > 0 && primaries !== 1) e.list ??= "Mark exactly one contact as the primary contact.";
  return e;
}

/** The contacts step's body: trimmed, an empty phone left out. */
export function contactsBody(contacts: readonly ContactForm[]): ApiContact[] {
  return contacts.map((c) => ({
    name: c.name.trim(),
    email: c.email.trim(),
    ...(c.phone.trim() ? { phone: c.phone.trim() } : {}),
    role: c.role.trim(),
    primary: c.primary,
  }));
}

export type BusinessForm = Record<string, string>;

/** The saved details as form strings (a school's sports list joined). */
export function businessFormFrom(orgType: OrgType, raw: unknown): BusinessForm {
  const d = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: BusinessForm = {};
  for (const f of BUSINESS_FIELDS[orgType]) {
    const v = d[f.key];
    out[f.key] = f.kind === "list" ? (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : "") : typeof v === "string" ? v : "";
  }
  return out;
}

const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** A complete business step for this type and state, as the API's
 *  DETAILS_SCHEMA and missingFor judge it. */
export function validateBusiness(orgType: OrgType, form: BusinessForm, stateCode: string | null | undefined): Errors {
  const e: Errors = {};
  for (const f of BUSINESS_FIELDS[orgType]) {
    const v = (form[f.key] ?? "").trim();
    const required = !f.optional || (f.key === "stateRegistrationId" && registrationRequired(orgType, stateCode));
    if (!v) {
      if (required) e[f.key] = f.key === "stateRegistrationId" ? `Required for organisations in ${stateCode}.` : `${f.label} is required.`;
      continue;
    }
    if (f.kind === "list") {
      const items = splitList(v);
      if (items.length === 0) e[f.key] = `${f.label} is required.`;
      else if (items.length > 40) e[f.key] = "At most 40.";
      else if (items.some((s) => s.length > f.max)) e[f.key] = `Each under ${f.max} characters.`;
    } else if (f.kind === "date") {
      if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) e[f.key] = "Use a date like 2026-10-24.";
    } else if (f.kind === "url") {
      if (!isHttpUrl(v)) e[f.key] = "A full web address, starting https://";
      else if (v.length > f.max) e[f.key] = `Under ${f.max} characters.`;
    } else if (v.length > f.max) {
      e[f.key] = `Under ${f.max} characters.`;
    }
  }
  if (orgType === "EVENT" && !e.startsOn && !e.endsOn && form.startsOn && form.endsOn && form.endsOn < form.startsOn) {
    e.endsOn = "The event can't end before it starts.";
  }
  return e;
}

/** The business step's body: exactly this type's keys, empty ones left out
 *  (the API saves partial details and refuses unknown keys). */
export function businessBody(orgType: OrgType, form: BusinessForm): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of BUSINESS_FIELDS[orgType]) {
    const v = (form[f.key] ?? "").trim();
    if (!v) continue;
    out[f.key] = f.kind === "list" ? splitList(v) : v;
  }
  return out;
}

/* ── documents (onboarding-documents.ts, transcribed) ─────────────────── */

export const DOCUMENT_KINDS: readonly { key: string; label: string }[] = [
  { key: "RIGHTS_PROOF", label: "Proof of rights to sell" },
  { key: "BUSINESS_REGISTRATION", label: "Business registration" },
  { key: "IDENTITY", label: "Identity" },
  { key: "OTHER", label: "Other" },
];
export const documentKindLabel = (k: string) => DOCUMENT_KINDS.find((d) => d.key === k)?.label ?? k;
export const DOCUMENT_TYPES: ReadonlySet<string> = new Set(["application/pdf", "image/jpeg", "image/png"]);
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENTS = 12;

/** Why this file can't be uploaded, or null. `count` is documents already on the application. */
export function checkDocument(file: { name: string; type: string; size: number }, count: number): string | null {
  if (count >= MAX_DOCUMENTS) return `An application holds at most ${MAX_DOCUMENTS} documents.`;
  if (!DOCUMENT_TYPES.has(file.type)) return "Documents are PDF, JPEG or PNG.";
  if (file.size < 1) return "That file is empty.";
  if (file.size > MAX_DOCUMENT_BYTES) return "A document is at most 20 MB.";
  if (!file.name.trim()) return "The file needs a name.";
  return null;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── BTG's decisions (DECISIONS / TRANSITIONS, transcribed) ───────────── */

export type OnboardingDecision = "APPROVE" | "REQUEST_CHANGES" | "REJECT" | "SUSPEND" | "REINSTATE";

const LEGAL_DECISIONS: Record<OnboardingState, readonly OnboardingDecision[]> = {
  DRAFT: [],
  CHANGES_REQUESTED: [],
  PENDING_REVIEW: ["APPROVE", "REQUEST_CHANGES", "REJECT"],
  APPROVED: ["SUSPEND"],
  SUSPENDED: ["REINSTATE"],
  REJECTED: [],
};

/** The decisions the API will accept from this state — and only those. */
export function legalDecisions(state: OnboardingState): readonly OnboardingDecision[] {
  return LEGAL_DECISIONS[state] ?? [];
}

const NEEDS_NOTE: ReadonlySet<OnboardingDecision> = new Set(["REQUEST_CHANGES", "REJECT", "SUSPEND"]);
export const decisionNeedsNote = (d: OnboardingDecision) => NEEDS_NOTE.has(d);

export const DECISION_COPY: Record<OnboardingDecision, { label: string; done: string; hint: string }> = {
  APPROVE: {
    label: "Approve",
    done: "Approved",
    hint: "The first approval creates the property and a manager login for the primary contact, and grants listing access.",
  },
  REQUEST_CHANGES: { label: "Request changes", done: "Changes requested", hint: "The applicant is emailed your note and a link back to the application." },
  REJECT: { label: "Reject", done: "Rejected", hint: "Final. The applicant is emailed your note." },
  SUSPEND: { label: "Suspend", done: "Suspended", hint: "Withdraws listing access. The applicant is emailed your note." },
  REINSTATE: { label: "Reinstate", done: "Reinstated", hint: "Restores listing access. No email is sent." },
};

/** Why nothing can be decided from this state, for the decision panel. */
export function noDecisionReason(state: OnboardingState): string {
  if (state === "DRAFT") return "Still a draft — the applicant hasn't submitted it.";
  if (state === "CHANGES_REQUESTED") return "Waiting on the applicant to make the changes you asked for and resubmit.";
  if (state === "REJECTED") return "Rejected — final. No further decision can be recorded.";
  return "No decision is available from this state.";
}

/* ── refusals ─────────────────────────────────────────────────────────── */

/** The words in an API refusal body `{ error: { message, issues, reasons, problems } }`. */
export function refusalMessage(body: unknown): string | undefined {
  const err = (body as { error?: Record<string, unknown> } | null)?.error;
  if (!err || typeof err !== "object") return undefined;
  const issues = err.issues as { message?: string }[] | undefined;
  if (Array.isArray(issues) && issues[0]?.message) return issues[0].message;
  const reasons = err.reasons as { message?: string }[] | undefined;
  if (Array.isArray(reasons) && reasons[0]?.message) return reasons[0].message;
  const problems = err.problems as unknown[] | undefined;
  if (Array.isArray(problems) && problems.length) return problems.map(String).join("; ");
  return typeof err.message === "string" ? err.message : undefined;
}

/** A refusal to the applicant, as copy. */
export function explainApplicantRefusal(status: number, message: string | undefined): string {
  if (status === 429) return "That's a lot of requests from this connection. Wait a few minutes, then try again — your saved answers are safe.";
  if (status === 404) return "This link doesn't match an application. Check you have the whole address.";
  if (status === 409) return message ?? "This application can't be changed right now. Reload the page to see where it stands.";
  if (status >= 500) return "Something went wrong on our side. Nothing you saved was lost — try again in a minute.";
  return message ?? "That didn't save. Check the answers on this step and try again.";
}

/* ── dates ────────────────────────────────────────────────────────────── */

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export function dateLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "—" : DATE.format(t);
}

/* ── the device's memory of an application ────────────────────────────── */

/** localStorage key holding `{ token, orgName, savedAt }` on this device. */
export const RESUME_KEY = "sx-onboarding-v1";
export type SavedApplication = { token: string; orgName: string; savedAt: string };

export function parseSaved(raw: string | null): SavedApplication | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<SavedApplication>;
    return typeof v.token === "string" && v.token ? { token: v.token, orgName: typeof v.orgName === "string" ? v.orgName : "", savedAt: v.savedAt ?? "" } : null;
  } catch {
    return null;
  }
}
