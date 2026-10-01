/* --------------------------------------------------------------------------
   Guardians and BTG support — the screens of 2S1-FE-06 (guardian half) and
   2S1-FE-10 (Claude Design GuardianSetup.dc.html, GuardianHandoff.dc.html,
   Contact.dc.html).

   SCAFFOLD. None of the three backends exists yet:
     2S1-BE-10  the guardian's own page, their ID, proof and agreement
     2S1-BE-15  changing a minor's guardian (the handoff)
     2S1-BE-16  the contact form and the support mailbox (2S1-OPS-01)
   so every screen renders the sample below, typed like the future API, and
   nothing here writes. When a backend lands, its GET replaces the fixture
   and these shapes are what the page expects back.

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

/** The support mailbox is not chosen yet (2S1-OPS-01) — never shown as live. */
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

/** One step on or back, clamped to the four steps a guardian fills in.
 *  "done" is reached only by finishing, which the API decides. */
export function stepMove(step: SetupStep, by: 1 | -1): SetupStep {
  const i = SETUP_STEPS.findIndex((s) => s.key === step);
  const next = Math.min(Math.max(i + by, 0), 3);
  return SETUP_STEPS[next]!.key;
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

/* -------------------------------------------- guardian handoff (2S1-BE-15) */

export type HandoffState = "WAITING" | "HANDED_OFF" | "SWITCHED" | "DECLINED";

/** The future GET of one handoff request — the current guardian's card, the
 *  new guardian's request page and the athlete's notice all read this. */
export type ApiHandoffRequest = {
  id: string;
  state: HandoffState;
  athlete: { name: string; firstName: string; sport: string };
  current: { name: string; firstName: string };
  requester: { name: string; firstName: string; relationship: (typeof RELATIONSHIPS)[number] };
  documentsUploaded: boolean;
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
    WAITING: [
      [`${cur} has your request.`, `${cur} stays ${a}’s guardian until they hand off and your documents are checked.`],
      [`${r.requester.name} asked to become ${a}’s guardian.`, "Only you can hand off or decline. Nothing changes until you do."],
      [`${r.requester.name} asked to become your guardian.`, `${cur} decides. ${cur} still approves your agreements and payments.`],
    ],
    HANDED_OFF: [
      [`${cur} handed off. Your documents are being checked.`, "You become the guardian as soon as the check is done."],
      [`You handed off ${a}’s account.`, `You keep approving things for ${a} until ${req}’s documents are checked.`],
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
