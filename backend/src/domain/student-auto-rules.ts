/**
 * The rules behind P9-BE-20 (students approved from the school roster) and
 * P9-BE-21 (prospects decided automatically). Pure — no Prisma — so every
 * clause is testable without a database; student-auto.ts reads the facts
 * and applies the verdicts.
 *
 * THE RULE (programme owner, 2026-10-03): a step is automatic when every
 * safety check passes, and held for the right person, with the reason, when
 * one fails. Minors always stay protected: nothing here verifies a guardian
 * or relaxes the guardian gate (guardian-rules.ts) — a minor approved from
 * the roster still reaches ACTIVE only with a verified guardian.
 */
import { BRAND_CATEGORIES, isSensitiveCategory } from "./brand-categories";
import { isMinorBand, isMinorOn } from "./guardian-rules";
import { norm, sameName } from "./name-match";
import { NOT_FOR_STUDENTS } from "./student-categories";

/* ── P9-BE-20 · the roster approval ─────────────────────────────────────── */

/** The words an advisor reads on a waiting application. Stored; never shown to the student. */
export const STUDENT_HOLD = {
  NO_ROSTER: "Your school has no roster on file",
  NOT_ON_ROSTER: "Not on the school roster",
  TWO_ENTRIES: "Two roster entries share this name",
  GRAD_YEAR: "Graduation year differs from the roster",
  ALREADY_APPROVED: "A student with this name is already approved",
  AGE_UNKNOWN: "No date of birth or age band given",
  ADULT_NO_DOMAIN: "Adult applicant: the school has no email domain on file",
  ADULT_OFF_DOMAIN: "Adult applicant without a school email",
} as const;

export type RosterFacts = {
  legalName: string;
  gradYear: number | null;
  birthDate: Date | null;
  ageBand: string | null;
  email: string | null;
  /** The roster of THIS student's school, and only it. */
  roster: ReadonlyArray<{ id: string; legalName: string; gradYear: number | null }>;
  /** APPROVED, ACTIVE or SUSPENDED students at this school, the applicant excluded. */
  existing: ReadonlyArray<{ legalName: string }>;
  /** The school's email domain, or null when none is on file. */
  schoolDomain: string | null;
};

export type RosterVerdict = { approve: true; rosterEntryId: string } | { approve: false; reasons: string[] };

/** The part after the "@", lower case — or null for a missing or malformed address. */
export function emailDomainOf(email: string | null | undefined): string | null {
  const at = email?.trim().toLowerCase().split("@");
  if (!at || at.length !== 2 || !at[0] || !at[1]) return null;
  return at[1];
}

/**
 * Adult, minor, or unknown — today, from the date or the band. Unknown
 * never passes as an adult here: the guardian rule reads an unknown age as
 * adult (guardian-rules.ts), and an approval that skipped the school-email
 * check on that reading would be the gap.
 */
export function studentAge(s: { birthDate: Date | null; ageBand: string | null }, on = new Date()): "adult" | "minor" | "unknown" {
  if (s.birthDate) return isMinorOn(s.birthDate, on) ? "minor" : "adult";
  if (isMinorBand(s.ageBand)) return "minor";
  if (s.ageBand === "18_PLUS") return "adult";
  return "unknown";
}

/**
 * Approve from the roster only when ALL of these hold — otherwise the
 * advisor decides, told every reason that failed:
 *  - the legal name matches exactly ONE roster entry at the school (`norm`,
 *    the claim's match — no fuzzy matching); an empty roster matches nobody;
 *  - the graduation years agree where both are given;
 *  - no APPROVED / ACTIVE / SUSPENDED student at the school has the name —
 *    someone may be posing as a classmate;
 *  - the age is known, and an adult's application email is on the school's
 *    email domain (no domain on file → the advisor).
 */
export function rosterVerdict(f: RosterFacts, on = new Date()): RosterVerdict {
  const reasons: string[] = [];
  const name = norm(f.legalName);
  const matches = name ? f.roster.filter((r) => norm(r.legalName) === name) : [];
  if (f.roster.length === 0) reasons.push(STUDENT_HOLD.NO_ROSTER);
  else if (matches.length === 0) reasons.push(STUDENT_HOLD.NOT_ON_ROSTER);
  else if (matches.length > 1) reasons.push(STUDENT_HOLD.TWO_ENTRIES);
  else if (f.gradYear != null && matches[0]!.gradYear != null && f.gradYear !== matches[0]!.gradYear) reasons.push(STUDENT_HOLD.GRAD_YEAR);

  if (f.existing.some((e) => sameName(e.legalName, f.legalName))) reasons.push(STUDENT_HOLD.ALREADY_APPROVED);

  const age = studentAge(f, on);
  if (age === "unknown") reasons.push(STUDENT_HOLD.AGE_UNKNOWN);
  if (age === "adult") {
    if (!f.schoolDomain) reasons.push(STUDENT_HOLD.ADULT_NO_DOMAIN);
    else if (emailDomainOf(f.email) !== f.schoolDomain.toLowerCase()) reasons.push(STUDENT_HOLD.ADULT_OFF_DOMAIN);
  }

  if (reasons.length || matches.length !== 1) return { approve: false, reasons: reasons.length ? reasons : [STUDENT_HOLD.NOT_ON_ROSTER] };
  return { approve: true, rosterEntryId: matches[0]!.id };
}

/**
 * May the system move an APPROVED student to ACTIVE? Only with a known age
 * (an unknown one waits for a person, who may still activate by hand under
 * the unchanged gate), and only when the guardian gate is already met.
 */
export function mayAutoActivate(s: { birthDate: Date | null; ageBand: string | null }, readiness: { status: string }, on = new Date()): boolean {
  if (studentAge(s, on) === "unknown") return false;
  return readiness.status === "not-required" || readiness.status === "ready";
}

/* ── the school's email domain ──────────────────────────────────────────── */

/**
 * Mail providers anyone can sign up to. A school domain is proof of
 * belonging only because the school hands the addresses out; one of these
 * on file would approve any adult with a roster name and a free account.
 */
export const FREE_MAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com", "gmx.net",
  "mail.com", "yandex.com", "zoho.com", "zohomail.com", "fastmail.com", "hey.com", "tutanota.com", "duck.com",
  "comcast.net", "verizon.net", "att.net", "sbcglobal.net",
]);

export class SchoolDomainError extends Error {
  readonly status = 422;
  constructor(message: string) {
    super(message);
    this.name = "SchoolDomainError";
  }
}

/** "@Northside.K12.md.us " → "northside.k12.md.us"; null clears it. Refuses a free-mail provider. */
export function normalizeSchoolDomain(input: string | null): string | null {
  if (input === null) return null;
  const d = input.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
  if (!d) return null;
  if (d.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) {
    throw new SchoolDomainError("That isn't an email domain. Enter the part after the @, like northside.k12.md.us.");
  }
  if (FREE_MAIL_DOMAINS.has(d)) {
    throw new SchoolDomainError("That is a public email provider, not your school's domain — anyone can get an address there.");
  }
  return d;
}

/* ── P9-BE-21 · the prospect decision ───────────────────────────────────── */

export const PROSPECT_HOLD = {
  NOT_FOR_STUDENTS: "Not a category the student programme sells",
  SCHOOL_RESTRICTION: "The school restricts this category",
  ATHLETE_RESTRICTION: "An athlete at the school is restricted from this category",
  ALREADY_SPONSOR: "Already a SponsorX sponsor",
  ALREADY_PROSPECT: "Another student has already brought this business in",
} as const;

export type ProspectFacts = {
  category: string;
  /** Categories another sponsor holds exclusively at the student's school (`heldCategories`). */
  held: ReadonlySet<string>;
  /** School-level restrictions on the category (restrictions.ts `restrictionConflicts`, property rows). */
  schoolConflicts: number;
  /** Restrictions on the category held by athletes at the school. */
  athleteConflicts: number;
  /** A sponsor in the tenant with this business's name. */
  alreadySponsor: boolean;
  /** Another SUBMITTED or ACCEPTED prospect in the tenant with this business's name. */
  openProspect: boolean;
};

export type ProspectVerdict =
  | { decision: "REJECT"; reasonCode: "CATEGORY_EXCLUSIVE" }
  | { decision: "ACCEPT" }
  | { decision: "HOLD"; reasons: string[] };

/**
 * Refuse outright when another sponsor holds the category (the student is
 * offered the open ones); accept when nothing at all is in the way; hold for
 * SALES, with every reason, otherwise. A category the programme never sells
 * is refused at submit — it is checked again here so it can never be
 * accepted by a road around that check.
 */
export function prospectVerdict(f: ProspectFacts): ProspectVerdict {
  if (NOT_FOR_STUDENTS.has(f.category) || isSensitiveCategory(f.category) || !(BRAND_CATEGORIES as readonly string[]).includes(f.category)) {
    return { decision: "HOLD", reasons: [PROSPECT_HOLD.NOT_FOR_STUDENTS] };
  }
  if (f.held.has(f.category)) return { decision: "REJECT", reasonCode: "CATEGORY_EXCLUSIVE" };
  const reasons: string[] = [];
  if (f.schoolConflicts > 0) reasons.push(PROSPECT_HOLD.SCHOOL_RESTRICTION);
  if (f.athleteConflicts > 0) reasons.push(PROSPECT_HOLD.ATHLETE_RESTRICTION);
  if (f.alreadySponsor) reasons.push(PROSPECT_HOLD.ALREADY_SPONSOR);
  if (f.openProspect) reasons.push(PROSPECT_HOLD.ALREADY_PROSPECT);
  return reasons.length ? { decision: "HOLD", reasons } : { decision: "ACCEPT" };
}

/** The longest word of a business name — the narrowing `contains` before the exact `norm` match. */
export function longestWord(name: string): string {
  return norm(name).split(" ").reduce((a, b) => (b.length > a.length ? b : a), "");
}
