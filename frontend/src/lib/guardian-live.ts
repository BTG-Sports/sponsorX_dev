/* --------------------------------------------------------------------------
   Guardians and BTG support — the screens of 2S1-FE-06 (guardian half) and
   2S1-FE-10 (Claude Design GuardianSetup.dc.html, GuardianHandoff.dc.html,
   Contact.dc.html).

   The guardian's own page is LIVE since 2S1-BE-10 (the live shapes below,
   "guardian set-up, live"), and so are 2S1-BE-15 (the handoff) and
   2S1-BE-16 (the contact form): the shapes below are what their routes
   answer, and the samples remain only for the ?demo= previews.

   Pure: shapes, fixtures, and every word the screens derive rather than read.
   -------------------------------------------------------------------------- */

/* ------------------------------------------------------------ shared rules */

/** Agreed 2026-10-01: an ID upload is a PDF, JPEG or PNG of at most 10 MB. */
export const ID_UPLOAD = {
  types: ["application/pdf", "image/jpeg", "image/png"] as const,
  accept: ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png",
  maxBytes: 10 * 1024 * 1024,
  label: "PDF, JPEG or PNG, up to 10 MB",
};

/** Why this file can't be used as an ID upload, or null when it can. */
export function idFileProblem(file: { type: string; size: number }): string | null {
  if (!(ID_UPLOAD.types as readonly string[]).includes(file.type)) return "That file type can't be used. Upload a PDF, JPEG or PNG.";
  if (file.size > ID_UPLOAD.maxBytes) return "That file is over 10 MB. Upload a smaller scan or photo.";
  if (file.size <= 0) return "That file is empty.";
  return null;
}

/** The default support address, shown as not live, when GET /public/support
 *  can't be reached (server/support.ts). The real one is SUPPORT_EMAIL on the
 *  API, live once 2S1-OPS-01 sets SUPPORT_MAILBOX_READY. */
export const SUPPORT_EMAIL = { address: "support@sponsorx.net", live: false } as const;

export const RELATIONSHIPS = ["Mother", "Father", "Legal guardian", "Other"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 1, 8:20 am" — the designs' timestamp, read in UTC so server and test agree. */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
}

function first(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/* ------------------------------------------------- the guardian agreement */

/** A line marked `placeholder` is words counsel hasn't written yet — the
 *  screen shows it as such, never as real terms. */
export type AgreementTerm = { text: string; placeholder?: boolean };
export type GuardianAgreement = { title: string; version: string; versionPending: boolean; terms: AgreementTerm[] };

export function guardianAgreement(athlete: string): GuardianAgreement {
  return {
    title: "SponsorX Guardian Agreement",
    version: "[x.y]",
    versionPending: true,
    terms: [
      { text: `You approve every agreement and every payment for ${athlete} before it happens.` },
      { text: `${athlete} can upload their own content. You get an email each time and can ask BTG to take it down.` },
      { text: `Money ${athlete} earns is paid to the payout account you set up on Stripe.` },
      { text: "[Remaining terms from counsel]", placeholder: true },
    ],
  };
}

/* --------------------------------------------- guardian set-up (2S1-BE-10) */

export type SetupStep = "details" | "id" | "proof" | "agreement" | "done";

export const SETUP_STEPS: readonly { key: SetupStep; label: string; title: string }[] = [
  { key: "details", label: "Your details", title: "Your details" },
  { key: "id", label: "Government ID", title: "Your government ID" },
  { key: "proof", label: "Proof you’re the guardian", title: "Proof you’re the guardian" },
  { key: "agreement", label: "Guardian agreement", title: "The guardian agreement" },
  { key: "done", label: "Done", title: "Done" },
];

export const PROOF_KINDS = [
  { key: "BIRTH_CERTIFICATE", label: "A birth certificate naming you" },
  { key: "COURT_ORDER", label: "A court order" },
  { key: "SCHOOL_RECORD", label: "A school record naming you as guardian" },
] as const;

/** A guardian already verified for another child (2S1-BE-10): their details
 *  and government ID are on file, so the page asks only for proof naming
 *  THIS child and the agreement for them. */
export const RETURNING_STEPS: readonly SetupStep[] = ["proof", "agreement", "done"];

/** The steps this guardian sees: all five, or the short three. */
export function stepsFor(returning: boolean) {
  return returning ? SETUP_STEPS.filter((s) => RETURNING_STEPS.includes(s.key)) : SETUP_STEPS;
}

/** One step on or back, clamped to the steps a guardian fills in (all but
 *  "done", which is reached only by finishing, which the API decides). */
export function stepMove(step: SetupStep, by: 1 | -1, returning = false): SetupStep {
  const steps = stepsFor(returning);
  const i = steps.findIndex((s) => s.key === step);
  const next = Math.min(Math.max(i + by, 0), steps.length - 2);
  return steps[next]!.key;
}

/** The future GET /public/guardian/:token. */
export type ApiGuardianSetup = {
  athlete: { name: string; firstName: string };
  guardian: { name: string; relationship: (typeof RELATIONSHIPS)[number] | null; phone: string | null; email: string; emailConfirmed: boolean };
  idUploaded: boolean;
  proof: { kind: (typeof PROOF_KINDS)[number]["key"]; fileName: string; uploadedAt: string } | null;
  agreementAcceptedAt: string | null;
  state: "IN_PROGRESS" | "CHECKING" | "APPROVED";
};

export const sampleGuardianSetup: ApiGuardianSetup = {
  athlete: { name: "Jordan Reyes", firstName: "Jordan" },
  guardian: { name: "Carmen Reyes", relationship: "Mother", phone: null, email: "carmen.reyes@example.com", emailConfirmed: true },
  idUploaded: false,
  proof: null,
  agreementAcceptedAt: null,
  state: "IN_PROGRESS",
};

/** ?demo=done|approved previews the two after-finishing states. */
export function setupDemo(raw: string | string[] | undefined): "done" | "approved" | null {
  const v = first(raw);
  return v === "done" || v === "approved" ? v : null;
}

/* ---------------------------------- guardian set-up, live (2S1-BE-10) ----

   The page the guardian's email links to (/guardian/setup?t=<token>) reads
   and writes these — backend/src/domain/guardian-setup.ts:
     POST  /public/guardian-setup/open {token}           opening confirms the email
     PATCH /public/guardian-setup/:token                 details
     POST  /public/guardian-setup/:token/documents(/:id/confirm)   ID and proof → private bucket
     POST  /public/guardian-setup/:token/accept          the agreement, against the text shown
   -------------------------------------------------------------------------- */

/** The API's vocabulary for a guardian, with the words the page shows. */
export const RELATIONSHIP_OPTIONS = [
  { code: "PARENT", label: "Parent (mother or father)" },
  { code: "LEGAL_GUARDIAN", label: "Legal guardian" },
  { code: "AUTHORIZED_REP", label: "Authorized representative" },
] as const;
export type RelationshipCode = (typeof RELATIONSHIP_OPTIONS)[number]["code"];

export type LiveSetupState = "IN_PROGRESS" | "CHECKING" | "HELD" | "APPROVED" | "REJECTED";

/** GET /public/guardian-setup/:token (and every write's answer). */
export type ApiGuardianSetupLive = {
  athlete: { name: string; firstName: string };
  guardian: { name: string; relationship: RelationshipCode | null; phone: string | null; email: string; emailConfirmed: boolean };
  /** Already verified for another child: the short page (proof for this child, and the agreement). */
  returning: boolean;
  idUploaded: boolean;
  /** Proof naming THIS athlete — proof is per child (2S1-BE-10). */
  proof: { kind: (typeof PROOF_KINDS)[number]["key"]; fileName: string; uploadedAt: string } | null;
  agreement: { agreementId: string; version: number; bodyHash: string; body: string } | null;
  agreementAcceptedAt: string | null;
  state: LiveSetupState;
  /** The guardian's own steps still to do. */
  missing: string[];
  /** What the athlete still has to do, said to the guardian. */
  athleteMissing: string[];
};

/** The step a guardian lands on: the first thing still theirs to do. */
export function firstOpenStep(s: Pick<ApiGuardianSetupLive, "guardian" | "idUploaded" | "proof" | "agreementAcceptedAt"> & { returning?: boolean }): SetupStep {
  if (!s.returning) {
    if (!s.guardian.relationship || !s.guardian.name.trim()) return "details";
    if (!s.idUploaded) return "id";
  }
  if (!s.proof) return "proof";
  if (!s.agreementAcceptedAt) return "agreement";
  return "done";
}

/**
 * The stored agreement text as the page shows it. A numbered line is a term;
 * a bracketed one is counsel's still-missing wording, shown AS a placeholder;
 * a first line that says "placeholder" marks the whole version as a draft.
 */
export function agreementFromBody(body: string, version: number): GuardianAgreement {
  const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = lines[0] ?? "SponsorX Guardian Agreement";
  const terms = lines.slice(1).map((l) => {
    const text = l.replace(/^\d+[.)]\s*/, "");
    return /\[[^\]]+\]/.test(text) ? { text, placeholder: true } : { text };
  });
  return {
    title: head.split(/\s+—\s+|\s+-\s+/)[0] || "SponsorX Guardian Agreement",
    version: String(version),
    versionPending: /placeholder|draft|not final/i.test(head),
    terms,
  };
}

/* -------------------------------------------- guardian handoff (2S1-BE-15) */

/** REQUESTED: the new guardian is still filling it in. WAITING: with the
 *  current guardian. HANDED_OFF: the current guardian handed off and the
 *  tenant's "BTG staff confirm minors" setting is on, so a BTG admin confirms
 *  the switch (otherwise it happens at once). CANCELLED: the guardian changed
 *  another way first. */
export type HandoffState = "REQUESTED" | "WAITING" | "HANDED_OFF" | "SWITCHED" | "DECLINED" | "CANCELLED";

/** One handoff request (2S1-BE-15) — GET /guardian-handoffs[/:id] for the
 *  current guardian and the athlete, GET /public/guardian-handoffs/:token for
 *  the new guardian (first names only there). */
export type ApiHandoffRequest = {
  id: string;
  state: HandoffState;
  athlete: { name: string; firstName: string; sport: string };
  current: { name: string; firstName: string };
  /** "Parent", "Legal guardian", "Authorized representative". */
  requester: { name: string; firstName: string; relationship: string };
  documentsUploaded: boolean;
  emailConfirmed?: boolean;
  idUploaded?: boolean;
  proofUploaded?: boolean;
  agreementAccepted?: boolean;
  /** While REQUESTED: what the new guardian still has to do. */
  missing?: string[];
  supportEmail?: string;
  requestedAt: string;
  decidedAt: string | null;
  documentsCheckedAt: string | null;
  switchedAt: string | null;
};

export const sampleHandoff: ApiHandoffRequest = {
  id: "ho_sample",
  state: "WAITING",
  athlete: { name: "Jordan Reyes", firstName: "Jordan", sport: "Basketball" },
  current: { name: "Carmen Reyes", firstName: "Carmen" },
  requester: { name: "Luis Reyes", firstName: "Luis", relationship: "Father" },
  documentsUploaded: true,
  requestedAt: "2026-10-01T08:20:00.000Z",
  decidedAt: null,
  documentsCheckedAt: null,
  switchedAt: null,
};

/** The sample after Carmen handed off and Luis's documents were checked. */
export const sampleSwitched: ApiHandoffRequest = {
  ...sampleHandoff,
  state: "SWITCHED",
  decidedAt: "2026-10-01T09:05:00.000Z",
  documentsCheckedAt: "2026-10-01T09:12:00.000Z",
  switchedAt: "2026-10-01T09:12:00.000Z",
};

export const sampleDeclined: ApiHandoffRequest = { ...sampleHandoff, state: "DECLINED", decidedAt: "2026-10-01T09:05:00.000Z" };

export type TrackStep = { label: string; status: "done" | "current" | "todo" | "stopped"; note: string };

/** The handoff's three steps, the same for all three people. A step is done
 *  only when its timestamp says it happened. */
export function handoffTrack(r: ApiHandoffRequest): TrackStep[] {
  const cur = r.current.firstName;
  const req = r.requester.firstName;
  const declined = r.state === "DECLINED";
  if (r.state === "CANCELLED") {
    return [
      { label: `${cur} is no longer the guardian`, status: "stopped", note: r.decidedAt ? whenLabel(r.decidedAt) : "Closed" },
      { label: `${req}’s documents checked`, status: "todo", note: "Not needed" },
      { label: `${req} becomes ${r.athlete.firstName}’s guardian`, status: "todo", note: "Not happening" },
    ];
  }
  const decided = r.decidedAt && !declined;
  return [
    declined
      ? { label: `${cur} declined`, status: "stopped", note: whenLabel(r.decidedAt!) }
      : decided
        ? { label: `${cur} handed off`, status: "done", note: whenLabel(r.decidedAt!) }
        : { label: `Waiting for ${cur}`, status: "current", note: "Waiting" },
    r.documentsCheckedAt
      ? { label: `${req}’s documents checked`, status: "done", note: whenLabel(r.documentsCheckedAt) }
      : { label: `${req}’s documents checked`, status: decided ? "current" : "todo", note: decided ? "Checking" : declined ? "Not needed" : "Not yet" },
    r.switchedAt
      ? { label: `${req} is now ${r.athlete.firstName}’s guardian`, status: "done", note: whenLabel(r.switchedAt) }
      : { label: `${req} becomes ${r.athlete.firstName}’s guardian`, status: "todo", note: declined ? "Not happening" : "Not yet" },
  ];
}

export type PersonView = { who: string; head: string; foot: string };

/** "What each person sees" — the new guardian, the current guardian and the
 *  athlete, at the request's current state. */
export function handoffViews(r: ApiHandoffRequest): PersonView[] {
  const { firstName: a } = r.athlete;
  const req = r.requester.firstName;
  const cur = r.current.firstName;
  const words: Record<HandoffState, [string, string][]> = {
    REQUESTED: [
      ["Your request isn’t sent yet.", `Confirm your email, upload both documents and accept the agreement. ${cur} is asked only then.`],
      [`${r.requester.name} is preparing a request.`, "Nothing reaches you until they send it."],
      [`${r.requester.name} is preparing a request.`, `${cur} is still your guardian.`],
    ],
    CANCELLED: [
      ["This request was closed.", `${a}’s guardian changed another way first. If that’s wrong, contact BTG.`],
      ["This request was closed.", `You were no longer ${a}’s guardian when it reached you.`],
      ["This request was closed.", "Nothing changed because of it."],
    ],
    WAITING: [
      [`${cur} has your request.`, `${cur} stays ${a}’s guardian until they hand off and your documents are checked.`],
      [`${r.requester.name} asked to become ${a}’s guardian.`, "Only you can hand off or decline. Nothing changes until you do."],
      [`${r.requester.name} asked to become your guardian.`, `${cur} decides. ${cur} still approves your agreements and payments.`],
    ],
    HANDED_OFF: [
      [`${cur} handed off. BTG is confirming the switch.`, "You become the guardian as soon as BTG confirms."],
      [`You handed off ${a}’s account.`, `You keep approving things for ${a} until BTG confirms the switch to ${req}.`],
      [`${r.requester.name} will soon be your guardian.`, `${cur} approves your agreements and payments until the switch.`],
    ],
    SWITCHED: [
      [`You’re now ${a}’s guardian.`, `Next: set up your payout account on Stripe for ${a}’s new deals.`],
      [`You handed off ${a}’s account.`, `Money ${a} already earned still comes to you as before.`],
      [`${r.requester.name} is now your guardian.`, `${req} approves your agreements and payments from now on.`],
    ],
    DECLINED: [
      [`${cur} declined.`, "If this is about custody or you can’t reach them, contact BTG. A person at BTG decides."],
      [`You declined ${req}’s request.`, `Nothing changed. You’re still ${a}’s guardian.`],
      [`${cur} is still your guardian.`, "Nothing changed on your account."],
    ],
  };
  const who = [`${req} sees`, `${cur} sees`, `${a} sees`];
  return words[r.state].map(([head, foot], i) => ({ who: who[i]!, head, foot }));
}

/** Holds for every state — the agreed carry-over rules (2S1-BE-15 §4). */
export function handoffCarryOver(r: ApiHandoffRequest): string[] {
  return [
    "Agreed orders continue as they are.",
    `Money ${r.athlete.firstName} already earned is paid as before, to your payout account.`,
    `${r.requester.firstName} sets up their own payout account for anything new.`,
  ];
}

/** The request page's relationship words → the API's three (2S1-BE-15). */
export function relationshipCode(label: string): "PARENT" | "LEGAL_GUARDIAN" | "AUTHORIZED_REP" {
  if (label === "Legal guardian") return "LEGAL_GUARDIAN";
  if (label === "Mother" || label === "Father") return "PARENT";
  return "AUTHORIZED_REP";
}

/** What the new guardian can still send, in the order the page asks for it. */
export function handoffReady(r: Pick<ApiHandoffRequest, "emailConfirmed" | "idUploaded" | "proofUploaded">, agreed: boolean): boolean {
  return Boolean(r.emailConfirmed && r.idUploaded && r.proofUploaded && agreed);
}

/** ?demo=status|declined on the new guardian's page. */
export function handoffDemo(raw: string | string[] | undefined): "status" | "declined" | null {
  const v = first(raw);
  return v === "status" || v === "declined" ? v : null;
}

/* --------------------------------------------------- contact (2S1-BE-16) */

export const CONTACT_TOPICS = [
  { key: "guardianship", label: "Guardianship" },
  { key: "account", label: "Account" },
  { key: "payment", label: "Payment" },
  { key: "other", label: "Other" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["key"];

/** ?topic=guardianship pre-picks the topic (the declined-handoff page links
 *  here that way); anything else is Guardianship, the design's default. */
export function contactTopic(raw: string | string[] | undefined): ContactTopic {
  const v = first(raw);
  return CONTACT_TOPICS.find((t) => t.key === v)?.key ?? "guardianship";
}
