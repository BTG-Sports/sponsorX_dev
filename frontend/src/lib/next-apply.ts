/* --------------------------------------------------------------------------
   P1-FE-25 / P9-FE-06 — the "Become the Media" student application.

   The wizard's pure pieces: the roles, the minor rule (the backend's own,
   isMinorOn in guardian-rules.ts — a guardian step appears exactly when the
   API will require one), per-step validation, and the body for
   POST /public/students/applications.
   -------------------------------------------------------------------------- */

export const ROLES = [
  { key: "EDITOR", name: "Editor", text: "Run the edition, assign stories, keep deadlines." },
  { key: "WRITER", name: "Writer", text: "Recaps, features, columns. Your byline." },
  { key: "PHOTOGRAPHER", name: "Photographer", text: "Sideline and portrait shots." },
  { key: "VIDEO", name: "Video", text: "Short clips and highlight reels." },
  { key: "DESIGNER", name: "Designer", text: "Lay out pages in NEXT templates." },
  { key: "SALES", name: "Sales", text: "Pitch local businesses and sell the ads." },
  { key: "CORRESPONDENT", name: "Correspondent", text: "Cover a team or sport all season." },
] as const;
export type RoleKey = (typeof ROLES)[number]["key"];

export const RELATIONSHIPS = [
  { key: "PARENT", label: "Parent" },
  { key: "LEGAL_GUARDIAN", label: "Legal guardian" },
  { key: "AUTHORIZED_REP", label: "Other authorised caregiver" },
] as const;

export type ApplySchool = { slug: string; name: string; city: string | null; stateCode: string | null };

export type ApplyDraft = {
  legalName: string;
  displayName: string;
  email: string;
  gradYear: string;
  dobMonth: string;
  dobDay: string;
  dobYear: string;
  schoolSlug: string;
  roles: RoleKey[];
  guardianName: string;
  guardianEmail: string;
  guardianRelationship: string;
  guardianAware: boolean;
  codeAccepted: boolean;
};

export const EMPTY_DRAFT: ApplyDraft = {
  legalName: "", displayName: "", email: "", gradYear: "", dobMonth: "", dobDay: "", dobYear: "",
  schoolSlug: "", roles: [], guardianName: "", guardianEmail: "", guardianRelationship: "PARENT",
  guardianAware: false, codeAccepted: false,
};

export type StepKey = "about" | "school" | "roles" | "guardian" | "review";

/** "2010-03-14", or null when the three parts don't make a real date. */
export function birthDateOf(d: Pick<ApplyDraft, "dobMonth" | "dobDay" | "dobYear">): string | null {
  const m = Number(d.dobMonth), day = Number(d.dobDay), y = Number(d.dobYear);
  if (!Number.isInteger(m) || !Number.isInteger(day) || !Number.isInteger(y) || d.dobYear.trim().length !== 4) return null;
  const date = new Date(Date.UTC(y, m - 1, day));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== day) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The backend's minor rule: their 18th birthday is still ahead. */
export function isMinor(birthDate: string | null, on: Date = new Date()): boolean {
  if (!birthDate) return false;
  const eighteenth = new Date(`${birthDate}T00:00:00Z`);
  eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
  return eighteenth > on;
}

/** The steps this applicant walks — the guardian step only for a minor. */
export function stepsFor(d: ApplyDraft, on: Date = new Date()): StepKey[] {
  const base: StepKey[] = ["about", "school", "roles"];
  return [...base, ...(isMinor(birthDateOf(d), on) ? (["guardian"] as StepKey[]) : []), "review"];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What's wrong on this step, as field → message (empty = fine). */
export function problems(step: StepKey, d: ApplyDraft, on: Date = new Date()): Record<string, string> {
  const out: Record<string, string> = {};
  if (step === "about") {
    if (!d.legalName.trim()) out.legalName = "Your full name is empty";
    if (!d.displayName.trim()) out.displayName = "Display name is empty";
    if (d.email.trim() && !EMAIL.test(d.email.trim())) out.email = "That email doesn't look right";
    if (!d.gradYear) out.gradYear = "Pick your graduation year";
    const dob = birthDateOf(d);
    if (!dob) out.dob = d.dobYear.trim().length !== 4 ? "Date of birth is missing the year" : "Date of birth isn't a real date";
    else if (new Date(`${dob}T00:00:00Z`) > on) out.dob = "Date of birth is in the future";
  }
  if (step === "school" && !d.schoolSlug) out.schoolSlug = "Pick your school";
  if (step === "roles" && d.roles.length === 0) out.roles = "Pick at least one role";
  if (step === "guardian") {
    if (!d.guardianName.trim()) out.guardianName = "Your guardian's full name is empty";
    if (!EMAIL.test(d.guardianEmail.trim())) out.guardianEmail = "Your guardian's email doesn't look right";
    if (!d.guardianAware) out.guardianAware = "Tick the box to confirm your guardian knows you're applying";
  }
  if (step === "review" && !d.codeAccepted) out.codeAccepted = "Tick the box to agree to the NEXT student code";
  return out;
}

/** The API body. Throws if a step still has problems — the wizard gates on them first. */
export function toApplicationBody(d: ApplyDraft, on: Date = new Date()) {
  for (const s of stepsFor(d, on)) {
    if (Object.keys(problems(s, d, on)).length) throw new Error(`Step "${s}" isn't finished.`);
  }
  const birthDate = birthDateOf(d)!;
  return {
    schoolSlug: d.schoolSlug,
    legalName: d.legalName.trim(),
    displayName: d.displayName.trim(),
    email: d.email.trim() ? d.email.trim().toLowerCase() : null,
    gradYear: Number(d.gradYear),
    birthDate,
    masthead: ROLES.filter((r) => d.roles.includes(r.key)).map((r) => r.key),
    guardian: isMinor(birthDate, on)
      ? { legalName: d.guardianName.trim(), email: d.guardianEmail.trim().toLowerCase(), relationship: d.guardianRelationship }
      : null,
  };
}

/** Graduation years a high-school student applying now could have. */
export function gradYears(on: Date = new Date()): number[] {
  const y = on.getUTCFullYear();
  return [0, 1, 2, 3, 4].map((i) => y + i);
}

/** The schools page's illustration: how $1,000 of one edition's ads divide (the programme terms). */
export const SPLIT = [
  { pct: 40, who: "SponsorX", note: "Production, printing, sales operations, rights and platform." },
  { pct: 30, who: "Your school’s programme", note: "Paid to the school’s programme account, never to a person." },
  { pct: 20, who: "Student pool", note: "Funds recognition points for the student team. No student is paid." },
  { pct: 10, who: "Editorial fund", note: "Training, equipment and editorial costs for the programme." },
] as const;

export function illustrate(totalDollars: number) {
  return SPLIT.map((s) => ({ ...s, amount: `$${Math.round((totalDollars * s.pct) / 100).toLocaleString("en-US")}` }));
}
