/* --------------------------------------------------------------------------
   POL-FE-103 — a school advisor's Profile page: their own details and their
   school's (backend POL-BE-103, GET /advisor/profile).

   Network-free: the shape the API answers with, the check the one form makes
   before it asks, and every word the page says about the school. The read is
   the page's; the write is app/(app)/advisor/profile/actions.ts.

   Whose is what, and the page keeps them apart:
     the advisor's   their name, job title and phone — saved at once, audited.
                     The name is what their students see on their own Profile
                     (POL-FE-101) in place of a bare email address;
     the school's    its email domain and roster — changed as before, through
                     the controls the advisor home already has (they are on
                     the page too);
     BTG's           the school's name and kind — shown, never edited here.
   Email, password and two-step sign-in are Clerk's; the page links there.
   -------------------------------------------------------------------------- */

export type ApiAdvisorProfile = {
  me: { name: string | null; jobTitle: string | null; phone: string | null; email: string; signIn: "CLERK" };
  school: {
    id: string;
    name: string;
    kind: string;
    /** The school's name and kind are BTG's to change. */
    managedBy: "BTG";
    emailDomain: string | null;
    roster: { count: number; lastUpdatedAt: string | null };
  };
  editable: string[];
};

/** Enough of the answer to draw the page; anything else is "couldn't be read". */
export function isAdvisorProfile(a: unknown): a is ApiAdvisorProfile {
  const x = a as Partial<ApiAdvisorProfile> | null;
  return !!x && typeof x.me?.email === "string" && typeof x.school?.id === "string" && typeof x.school.name === "string"
    && typeof x.school.roster?.count === "number";
}

/* ------------------------------------------------------------------ words */

const KIND_WORDS: Record<string, string> = {
  TEAM: "Team", SCHOOL: "School", EVENT: "Event", MEDIA: "Media", VIRTUAL: "Virtual venue", AGENCY: "Agency",
};

/** "SCHOOL" → "School"; a kind the list doesn't know is shown in plain case. */
export function schoolKindWord(kind: string): string {
  return KIND_WORDS[kind] ?? (kind ? kind[0]!.toUpperCase() + kind.slice(1).toLowerCase().replace(/_/g, " ") : "Not on file");
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayOf = (iso: string) => DAY.format(new Date(iso));

/** "128 students" / "1 student" / "No roster on file yet". */
export function rosterCountLine(count: number): string {
  if (count < 1) return "No roster on file yet";
  return `${count.toLocaleString("en-US")} ${count === 1 ? "student" : "students"}`;
}

/** When the roster last grew: "Nov 12, 2026", or why there is no date. */
export function rosterUpdatedLine(roster: ApiAdvisorProfile["school"]["roster"]): string {
  if (roster.count < 1) return "Never: paste your roster below";
  return roster.lastUpdatedAt ? dayOf(roster.lastUpdatedAt) : "Not recorded";
}

/** What the email domain does, in one line, for the school card. */
export function domainLine(domain: string | null): string {
  return domain
    ? `Adults (18 and over) on your roster are approved automatically only with an email ending @${domain}.`
    : "None on file, so every adult applicant comes to you for a decision.";
}

/**
 * How a student reads their advisor (POL-FE-101's page): the name the advisor
 * set, or nothing when they haven't set one — the email is always shown
 * beside it, so a missing name never leaves the row empty.
 */
export function advisorNameOf(a:{ name?: string | null }): string | null {
  const n = typeof a.name === "string" ? a.name.trim() : "";
  return n || null;
}

/* ------------------------------------------------------------------ the form */

export type AdvisorMeDraft = { name: string; jobTitle: string; phone: string };
export type AdvisorMeInput = { name: string | null; jobTitle: string | null; phone: string | null };
export type Checked<I, D> = { ok: true; input: I } | { ok: false; errors: Partial<Record<keyof D, string>> };

const blank = (s: string) => (s.trim() ? s.trim() : null);
/* Digits, spaces and the marks a phone number is written with; at least 7 digits. */
const PHONE = /^[0-9+().\-\s/x#,]*$/i;

/** The advisor's own name, job title and phone. A field left empty is cleared. */
export function validateAdvisorMe(d: AdvisorMeDraft): Checked<AdvisorMeInput, AdvisorMeDraft> {
  const errors: Partial<Record<keyof AdvisorMeDraft, string>> = {};
  if (d.name.trim().length > 120) errors.name = "Keep your name under 120 characters.";
  if (d.jobTitle.trim().length > 120) errors.jobTitle = "Keep your title under 120 characters.";
  const phone = d.phone.trim();
  if (phone.length > 40) errors.phone = "Keep the phone number under 40 characters.";
  else if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7)) errors.phone = "That doesn’t look like a phone number.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: { name: blank(d.name), jobTitle: blank(d.jobTitle), phone: blank(d.phone) } };
}

/* ------------------------------------------------------------------ refusals */

/**
 * What a refused save says: the API's own sentence where it wrote one for the
 * person (a 409 or a 422), the first field problem of a 400, plain words for
 * the rest.
 */
export function advisorRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 0) return "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute.";
  if (status === 401) return "Your session ended. Sign in again, then retry.";
  if (status === 403) return "Only the school’s own advisor can change this profile.";
  const err = (body as { error?: { message?: unknown; issues?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "";
  const issues = Array.isArray(err?.issues) ? (err.issues as { message?: unknown }[]) : [];
  const first = issues.find((i) => typeof i?.message === "string")?.message as string | undefined;
  if (status === 400) return first ?? (message || "That wasn’t accepted. Check it and try again.");
  if ((status === 409 || status === 422) && message) return message;
  return `${fallback} (${status}).`;
}
