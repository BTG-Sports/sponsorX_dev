/* --------------------------------------------------------------------------
   /join wizard flow (P1-ART-07 · §11 · §4). Pure data + logic, no React.

   The ten application sections, the one branch (a DOB under 18 inserts the
   guardian section and changes nothing else), per-section validation, and
   the localStorage draft shape. The wizard island renders from this; the
   eventual P3-FE-01 API wiring replaces only where answers go on submit.

   Agreement is click-wrap against v0.4 draft wording — G-05 stopped being a
   gate on 2026-09-15 (documentation/Design/athlete-onboarding/README.md).
   -------------------------------------------------------------------------- */

export type FieldDef = {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "email" | "tel" | "date";
  required: boolean;
  half?: boolean; // render two-up on the row
  hint?: string; // sub-label, e.g. the §22 self-reported marker
};

export type SectionDef = {
  id: string;
  /** Rail label on the flow map. */
  title: string;
  /** Step screen heading. */
  heading: string;
  /** Step screen sub-line. */
  sub: string;
  kind: "fields" | "restrictions" | "agreement";
  minorOnly?: boolean;
  /** Extra line under the rail label on the flow map. */
  railNote?: string;
  fields: FieldDef[];
};

export const SECTIONS: SectionDef[] = [
  {
    id: "identity",
    title: "Identity",
    heading: "Who you are",
    sub: "Use your legal name — it has to match the agreement you sign at the end.",
    kind: "fields",
    fields: [
      { key: "firstName", label: "Legal first name", placeholder: "Maya", type: "text", required: true, half: true },
      { key: "lastName", label: "Legal last name", placeholder: "Okonkwo", type: "text", required: true, half: true },
      { key: "dob", label: "Date of birth", placeholder: "", type: "date", required: true },
      { key: "email", label: "Email", placeholder: "you@example.com", type: "email", required: true },
      { key: "phone", label: "Phone", placeholder: "(555) 000-0000", type: "tel", required: false },
    ],
  },
  {
    id: "sport",
    title: "Sport & team",
    heading: "Your sport",
    sub: "Where you play and at what level — sponsors are matched to this.",
    kind: "fields",
    fields: [
      { key: "sport", label: "Primary sport", placeholder: "Basketball", type: "text", required: true, half: true },
      { key: "position", label: "Position", placeholder: "Forward", type: "text", required: false, half: true },
      { key: "level", label: "Level", placeholder: "NCAA / High school / Club", type: "text", required: true },
      { key: "team", label: "Team or school", placeholder: "Riverside High", type: "text", required: true },
    ],
  },
  {
    id: "location",
    title: "Location",
    heading: "Where you are",
    sub: "Your home market, plus any secondary markets. Geography feeds matching (§13).",
    kind: "fields",
    fields: [
      { key: "city", label: "City", placeholder: "Silver Spring", type: "text", required: true, half: true },
      { key: "region", label: "State / region", placeholder: "MD", type: "text", required: true, half: true },
      { key: "country", label: "Country", placeholder: "USA", type: "text", required: true },
      { key: "markets", label: "Secondary markets", placeholder: "Optional — e.g. DC metro", type: "text", required: false },
    ],
  },
  {
    id: "social",
    title: "Social accounts",
    heading: "Your channels",
    sub: "At least one handle. Anything you type here is self-reported until verified (§22).",
    kind: "fields",
    fields: [
      { key: "instagram", label: "Instagram", placeholder: "@handle", type: "text", required: false },
      { key: "tiktok", label: "TikTok", placeholder: "@handle", type: "text", required: false },
      { key: "youtube", label: "YouTube", placeholder: "@handle", type: "text", required: false },
      { key: "followers", label: "Total followers", placeholder: "Optional", type: "text", required: false, hint: "Self-reported — verified after approval" },
    ],
  },
  {
    id: "capabilities",
    title: "Content capabilities",
    heading: "What you can make",
    sub: "Formats, turnaround and gear — campaign briefs are matched to this.",
    kind: "fields",
    fields: [
      { key: "formats", label: "Formats", placeholder: "Reels, stories, appearances", type: "text", required: true },
      { key: "turnaround", label: "Typical turnaround", placeholder: "3–5 days", type: "text", required: true, half: true },
      { key: "equipment", label: "Equipment", placeholder: "Optional — phone, ring light…", type: "text", required: false, half: true },
    ],
  },
  {
    id: "interests",
    title: "Brand interests",
    heading: "Brands you'd work with",
    sub: "A preference used for fit scoring — not a promise, and not exclusivity.",
    kind: "fields",
    fields: [
      { key: "categories", label: "Interested categories", placeholder: "Apparel, nutrition, local businesses", type: "text", required: true },
    ],
  },
  {
    id: "restrictions",
    title: "Restrictions & conflicts",
    heading: "Restrictions and conflicts",
    sub: "Every campaign is checked against this screen before it is shown to you. Anything declared here is blocked — not deprioritised.",
    kind: "restrictions",
    railNote: "Enforced on every campaign",
    fields: [],
  },
  {
    id: "guardian",
    title: "Guardian / authorized rep",
    heading: "Your guardian",
    sub: "Because you're under 18, a parent, guardian or authorized representative must confirm by email before you can accept a campaign (§4).",
    kind: "fields",
    minorOnly: true,
    fields: [
      { key: "guardianName", label: "Guardian legal name", placeholder: "Adaeze Okonkwo", type: "text", required: true },
      { key: "guardianRelation", label: "Relationship", placeholder: "Parent / legal guardian", type: "text", required: true },
      { key: "guardianEmail", label: "Guardian email", placeholder: "guardian@example.com", type: "email", required: true },
    ],
  },
  {
    id: "payment",
    title: "Payment recipient",
    heading: "Payment recipient",
    sub: "Who earnings are attributed to. Status only — money moves outside SponsorX in Phase 1.",
    kind: "fields",
    railNote: "Name only — no bank details",
    fields: [
      { key: "recipient", label: "Recipient name", placeholder: "Maya Okonkwo", type: "text", required: true },
    ],
  },
  {
    id: "agreement",
    title: "Agreement",
    heading: "The agreement",
    sub: "Content Collaboration Agreement · v0.4 draft · this wording is not final and will be reissued before launch.",
    kind: "agreement",
    fields: [],
  },
];

/** What §26/A6 never asks for — printed verbatim on the payment step. */
export const NEVER_ASKED =
  "SponsorX never asks for a bank account or routing number, a card, a Social Security number or a tax ID. Money moves outside the system in Phase 1.";

export const RESTRICTION_CATEGORIES = [
  "Betting",
  "Alcohol",
  "Energy drinks",
  "Supplements",
  "Crypto",
  "Weight loss",
] as const;

export type Deal = { name: string; category: string; terms: string };

export const AGREEMENT = {
  version: "v0.4 draft",
  checkbox: "I have read and accept the Content Collaboration Agreement (v0.4 draft).",
  recordNote:
    "Ticking the box records your acceptance, the date and time, and the exact version of the text shown above. You'll be emailed a copy.",
  clauses: [
    {
      title: "1. What this covers",
      body: "This agreement governs content you create for a brand through SponsorX. A separate brief is issued for each campaign and sits on top of these terms.",
    },
    {
      title: "2. Your content",
      body: "You own what you make. You grant the brand a licence to use the agreed content on the channels named in the campaign brief, for the period named there.",
    },
    {
      title: "3. Disclosure",
      body: "You will disclose paid partnerships as required by law and by the platform you post on. SponsorX will tell you what is required for each campaign.",
    },
    {
      title: "4. Eligibility",
      body: "You confirm the details in this application are true, and that if you are under 18 your guardian's confirmation is required before you accept a campaign.",
    },
    {
      title: "5. Ending it",
      body: "Either side can end this agreement in writing. Campaigns already accepted are completed under their own briefs.",
    },
  ],
} as const;

/* ------------------------------------------------------------------ logic */

/** Under 18 at `now`. Invalid or partial dates are NOT minors — the branch
    only opens on a parseable under-18 date of birth. */
export function isMinor(dob: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const d = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()),
  );
  return d.getTime() > cutoff.getTime();
}

/** The one branch: guardian appears only for minors. Everything else —
    numbering, progress segments — derives from this list. */
export function visibleSections(minor: boolean): SectionDef[] {
  return SECTIONS.filter((s) => !s.minorOnly || minor);
}

/** Per-field error messages; empty object = section passes. */
export function validateSection(
  section: SectionDef,
  answers: Record<string, string>,
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of section.fields) {
    const v = (answers[f.key] ?? "").trim();
    if (f.required && !v) errs[f.key] = "Required";
  }
  if (section.id === "identity") {
    const dob = (answers.dob ?? "").trim();
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      errs.dob = "Enter a full date";
    } else if (dob) {
      /* Sanity bounds the API doesn't enforce (z.iso.date() takes any date):
         a future DOB would file as a minor and summon the guardian branch. */
      const d = new Date(`${dob}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d > new Date() || d.getUTCFullYear() < 1920)
        errs.dob = "Enter a real date of birth";
    }
    const email = (answers.email ?? "").trim();
    if (email && !email.includes("@")) errs.email = "Enter a valid email";
  }
  if (section.id === "guardian") {
    const email = (answers.guardianEmail ?? "").trim();
    if (email && !email.includes("@")) errs.guardianEmail = "Enter a valid email";
  }
  if (section.id === "location") {
    /* The API's stateCode is a strict two-letter US code (NIL is US law);
       catching it here beats a validation round-trip on the final step. */
    const region = (answers.region ?? "").trim();
    if (region && !/^[A-Za-z]{2}$/.test(region))
      errs.region = "Two-letter state code — e.g. MD";
  }
  if (section.id === "social") {
    const any = ["instagram", "tiktok", "youtube"].some((k) => (answers[k] ?? "").trim());
    if (!any) errs.instagram = "Add at least one handle";
  }
  return errs;
}

/* ------------------------------------------------------------------ draft */

export type JoinPhase = "intro" | "steps" | "submitted";

export type JoinDraft = {
  v: 1;
  phase: JoinPhase;
  step: number;
  answers: Record<string, string>;
  deals: Deal[];
  excluded: string[];
  accepted: boolean;
  /** ISO timestamp, set at submit. */
  submittedAt?: string;
  /** P3-FE-01 — set by a successful real submission. The reference is shown
   *  to the applicant; the token reaches their own application later
   *  (GET/PATCH /applications/intake/mine). parseDraft tolerates absence. */
  refId?: string;
  intakeToken?: string;
};

/* --------------------------------------------------------------------------
   P3-FE-01 — where answers go on submit (the seam this file promised).
   draftToApplication is pure so the mapping is testable without a browser or
   an API: wizard keys on the left, AthleteApplicationInput fields on the
   right. Wizard sections the contract deliberately does not take yet
   (capabilities, interests, restrictions, payment recipient, guardian
   details — and `country`, which the location step asks but the US-only
   Phase 1 contract has no field for) stay in the draft — the contract's own
   description says those are attached by sibling tasks, and the
   applicant-side guardian capture is a recorded gap on P3-BE-14.
   -------------------------------------------------------------------------- */

export type IntakeSocial = {
  platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE";
  handle: string;
};

export type IntakePayload = {
  legalName: string;
  displayName: string;
  email: string;
  phone?: string;
  birthDate?: string;
  city?: string;
  stateCode: string;
  sport: string;
  position?: string;
  school?: string;
  level?: "HIGH_SCHOOL" | "COLLEGE" | "SEMI_PRO" | "PRO" | "AMATEUR";
  socials: IntakeSocial[];
};

/** The wizard's free-text level → the contract's enum, or nothing — the enum
 *  is optional in the contract, and guessing wrong is worse than omitting. */
export function levelToEnum(raw: string): IntakePayload["level"] {
  const s = raw.toLowerCase();
  if (/semi/.test(s)) return "SEMI_PRO";
  if (/high/.test(s)) return "HIGH_SCHOOL";
  if (/college|ncaa|univ/.test(s)) return "COLLEGE";
  if (/\bpro\b|professional/.test(s)) return "PRO";
  if (/amateur|club/.test(s)) return "AMATEUR";
  return undefined;
}

export function draftToApplication(draft: JoinDraft): IntakePayload {
  const a = draft.answers;
  const val = (k: string) => (a[k] ?? "").trim();
  const opt = (k: string) => (val(k) ? val(k) : undefined);

  const legalName = `${val("firstName")} ${val("lastName")}`.trim();

  /* The wizard collects one self-reported follower total across platforms;
     the contract wants per-account numbers. Splitting a total by guesswork
     would be fabricated provenance (§22), so counts wait for the profile
     editor and only the handles travel. */
  const socials: IntakeSocial[] = (
    [
      ["INSTAGRAM", "instagram"],
      ["TIKTOK", "tiktok"],
      ["YOUTUBE", "youtube"],
    ] as const
  )
    .filter(([, key]) => val(key))
    .map(([platform, key]) => ({ platform, handle: val(key) }));

  return {
    legalName,
    /* The wizard asks for no separate brand name; the legal name is the
       display name until the athlete edits their profile (§11 §1). */
    displayName: legalName,
    email: val("email"),
    phone: opt("phone"),
    birthDate: opt("dob"),
    city: opt("city"),
    stateCode: val("region").toUpperCase(),
    sport: val("sport"),
    position: opt("position"),
    school: opt("team"),
    level: levelToEnum(val("level")),
    socials,
  };
}

export const DRAFT_KEY = "sx-join-draft-v1";

export function emptyDraft(): JoinDraft {
  return { v: 1, phase: "intro", step: 0, answers: {}, deals: [], excluded: [], accepted: false };
}

/** Safe parse: anything malformed → null (start fresh, never crash). */
export function parseDraft(raw: string | null): JoinDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as JoinDraft;
    if (
      d?.v !== 1 ||
      typeof d.step !== "number" ||
      typeof d.answers !== "object" ||
      !Array.isArray(d.deals) ||
      !Array.isArray(d.excluded) ||
      !["intro", "steps", "submitted"].includes(d.phase)
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
