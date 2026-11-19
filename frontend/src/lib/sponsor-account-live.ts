import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import type { ApiPreference } from "@/lib/notification-prefs-live";

/* --------------------------------------------------------------------------
   POL-FE-102 — a sponsor's Account page: the company's details and the
   signed-in person's own (backend POL-BE-102, GET /sponsor/account).

   Network-free: the shape the API answers with, the checks a form makes
   before it asks, and every word the page says about a change that is
   waiting for BTG or was decided. The read is the page's; the writes are
   app/(app)/sponsor/account/actions.ts.

   Two kinds of field, and the page keeps them apart:
     saved at once   logo, website, address, billing contact; the person's
                     own name and job title;
     checked first   the company's name and its brand categories — they feed
                     the conflict checks and the Zoho account, so a change
                     takes effect at once only when every safety check
                     passes, and otherwise waits for BTG with the reasons.
   Email, password and two-step sign-in are Clerk's; the page links there.
   -------------------------------------------------------------------------- */

export type ApiAccountChange = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  /** The new name asked for, or null when the name was not part of it. */
  name: string | null;
  /** The new categories asked for, or null when they were not part of it. */
  categories: string[] | null;
  /** Why it waits for BTG; empty when it went through on its own. */
  holdReasons: string[];
  autoApproved: boolean;
  /** BTG's reason, when it was rejected. */
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export type ApiSponsorAccount = {
  company: {
    id: string;
    name: string;
    categories: string[];
    logoUrl: string | null;
    website: string | null;
    address: string | null;
    billingContact: { name: string | null; email: string | null; phone: string | null };
  };
  me: { name: string | null; jobTitle: string | null; email: string; signIn: "CLERK" };
  /** A Sponsor Admin edits; a Sponsor Viewer reads. */
  canEdit: boolean;
  pendingChange: ApiAccountChange | null;
  lastDecision: ApiAccountChange | null;
  notificationPreferences: ApiPreference[];
};

/**
 * The kinds of email a SPONSOR can turn off. GET /me/notification-preferences
 * answers with every kind anyone can mute, and today all seven are an
 * athlete's or a student's (invitations, posts due, a prospect's "no"): a
 * sponsor is sent none of them, so a switch for one would promise something
 * that never arrives. A kind is listed here when the API starts sending it to
 * sponsors; until then the page says plainly that there is nothing to turn off.
 */
export const SPONSOR_EMAIL_EVENTS: readonly string[] = [];

/** The preferences worth showing a sponsor: only the kinds a sponsor is sent. */
export function sponsorPrefs(prefs: readonly ApiPreference[]): ApiPreference[] {
  return prefs.filter((p) => SPONSOR_EMAIL_EVENTS.includes(p.event));
}

export const LOGO_MAX_BYTES = 1_000_000;
const LOGO_TYPES = ["image/png", "image/jpeg"] as const;

/* ------------------------------------------------------------------ words */

const known = (c: string): c is BrandCategory => (BRAND_CATEGORIES as readonly string[]).includes(c);

/** "ENERGY_DRINK" → "Energy drink"; a value the list doesn't know is shown as it is. */
export function categoryWord(c: string): string {
  return known(c) ? categoryLabel(c) : c;
}

/** The categories as one line: "Apparel, Footwear". */
export function categoriesLine(cs: readonly string[]): string {
  return cs.length ? cs.map(categoryWord).join(", ") : "None on file";
}

/** Every category a sponsor can pick, A to Z by its label. */
export const CATEGORY_OPTIONS: { value: string; label: string }[] = BRAND_CATEGORIES
  .map((c) => ({ value: c as string, label: categoryLabel(c) }))
  .sort((a, b) => a.label.localeCompare(b.label));

/** Two letters for a company with no logo: "Bluefin Tutoring" → BT. */
export function companyInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return ((words[0]![0] ?? "") + (words.length > 1 ? (words[words.length - 1]![0] ?? "") : (words[0]![1] ?? ""))).toUpperCase();
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayOf = (iso: string) => DAY.format(new Date(iso));

/** What a change asked for, in words: `the name "Bluefin Learning" and the categories Education, Fitness`. */
export function changeAsks(c: Pick<ApiAccountChange, "name" | "categories">): string {
  const parts = [c.name ? `the name “${c.name}”` : null, c.categories ? `the categories ${categoriesLine(c.categories)}` : null].filter(Boolean);
  return parts.join(" and ") || "a change";
}

export type ChangeNotice = {
  tone: "wait" | "late" | "live";
  title: string;
  text: string;
  /** Why it waits (BTG's hold reasons), or BTG's reason for saying no. */
  reasons: string[];
};

/** How long an approved change stays announced on the page. */
const ANNOUNCE_DAYS = 14;

/**
 * The one notice about the company's name and categories: a change that is
 * waiting for BTG; else BTG's last answer — a rejection always (the sponsor
 * reads why), an approval for two weeks. Null: nothing to say.
 */
export function changeNotice(a: Pick<ApiSponsorAccount, "pendingChange" | "lastDecision">, now: Date): ChangeNotice | null {
  const p = a.pendingChange;
  if (p) {
    return {
      tone: "wait",
      title: "Waiting for BTG",
      text: `You asked for ${changeAsks(p)} on ${dayOf(p.requestedAt)}. A BTG person checks it first. Until then your account keeps what is on file.`,
      reasons: p.holdReasons,
    };
  }
  const d = a.lastDecision;
  if (!d) return null;
  if (d.status === "REJECTED") {
    return {
      tone: "late",
      title: "BTG didn’t approve your change",
      text: `You asked for ${changeAsks(d)}. Your account keeps what was on file. You can ask again.`,
      reasons: d.reason ? [d.reason] : [],
    };
  }
  if (d.status === "APPROVED" && d.decidedAt && now.getTime() - new Date(d.decidedAt).getTime() < ANNOUNCE_DAYS * 86_400_000) {
    return {
      tone: "live",
      title: d.autoApproved ? "Your change is in effect" : "BTG approved your change",
      text: `${capital(changeAsks(d))} took effect on ${dayOf(d.decidedAt)}.`,
      reasons: [],
    };
  }
  return null;
}

const capital = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/* ------------------------------------------------------------------ the forms */

export type CompanyDraft = { website: string; address: string; billingName: string; billingEmail: string; billingPhone: string };
export type CompanyInput = {
  website: string | null; address: string | null; billingContactName: string | null; billingContactEmail: string | null; billingContactPhone: string | null;
};
export type Checked<I, D> = { ok: true; input: I } | { ok: false; errors: Partial<Record<keyof D, string>> };

const blank = (s: string) => (s.trim() ? s.trim() : null);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A website as someone types it: "bluefin.com" is taken as https://bluefin.com. */
export function websiteOf(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function validUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** The details that save at once. A field left empty is cleared. */
export function validateCompany(d: CompanyDraft): Checked<CompanyInput, CompanyDraft> {
  const errors: Partial<Record<keyof CompanyDraft, string>> = {};
  const website = websiteOf(d.website);
  if (website && (!validUrl(website) || website.length > 300)) errors.website = "That doesn’t look like a website address. Try something like https://yourcompany.com.";
  if (d.address.trim().length > 500) errors.address = "Keep the address under 500 characters.";
  if (d.billingName.trim().length > 120) errors.billingName = "Keep the name under 120 characters.";
  const email = d.billingEmail.trim();
  if (email && (!EMAIL.test(email) || email.length > 200)) errors.billingEmail = "That doesn’t look like an email address.";
  if (d.billingPhone.trim().length > 40) errors.billingPhone = "Keep the phone number under 40 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: { website, address: blank(d.address), billingContactName: blank(d.billingName), billingContactEmail: email || null, billingContactPhone: blank(d.billingPhone) },
  };
}

export type MeDraft = { name: string; jobTitle: string };
export type MeInput = { name: string | null; jobTitle: string | null };

/** The person's own name and job title. */
export function validateMe(d: MeDraft): Checked<MeInput, MeDraft> {
  const errors: Partial<Record<keyof MeDraft, string>> = {};
  if (d.name.trim().length > 120) errors.name = "Keep your name under 120 characters.";
  if (d.jobTitle.trim().length > 120) errors.jobTitle = "Keep your job title under 120 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: { name: blank(d.name), jobTitle: blank(d.jobTitle) } };
}

export type ChangeDraft = { name: string; categories: string[] };
export type ChangeInput = { name?: string; categories?: string[] };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * A new company name and/or categories. Only what differs from what is on
 * file is sent; asking for exactly what is on file is caught here, before
 * the API's 422.
 */
export function validateChange(current: Pick<ApiSponsorAccount["company"], "name" | "categories">, d: ChangeDraft): Checked<ChangeInput, ChangeDraft> & { same?: boolean } {
  const errors: Partial<Record<keyof ChangeDraft, string>> = {};
  const name = d.name.trim();
  if (!name) errors.name = "A company needs a name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";
  const categories = [...new Set(d.categories.filter(known))];
  if (!categories.length) errors.categories = "Keep at least one category.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const input: ChangeInput = {
    ...(name !== current.name ? { name } : {}),
    ...(!sameSet(categories, current.categories) ? { categories } : {}),
  };
  if (!Object.keys(input).length) return { ok: false, same: true, errors: { name: "That’s what’s on file already. Change the name or the categories first." } };
  return { ok: true, input };
}

/** A logo is PNG or JPEG, up to 1 MB (the API's own limits, said before the upload starts). */
export function validateLogoFile(file: { type: string; size: number }): { ok: true; contentType: string; bytes: number } | { ok: false; message: string } {
  if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return { ok: false, message: "A logo is a PNG or JPEG picture." };
  if (file.size < 1) return { ok: false, message: "That file is empty." };
  if (file.size > LOGO_MAX_BYTES) return { ok: false, message: "A logo is at most 1 MB. Pick a smaller picture." };
  return { ok: true, contentType: file.type, bytes: file.size };
}

/* ------------------------------------------------------------------ refusals */

/**
 * What a refused write says. A viewer's 403 in plain words; the API's own
 * sentence for a 409 or a 422 (they are written for the person: "A change is
 * already waiting for BTG."); the first field problem of a 400.
 */
export function accountRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 0) return "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute.";
  if (status === 401) return "Your session ended. Sign in again, then retry.";
  if (status === 403) return "Only a Sponsor Admin can change the account. Ask an admin on your team.";
  const err = (body as { error?: { message?: unknown; issues?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "";
  const issues = Array.isArray(err?.issues) ? (err.issues as { message?: unknown }[]) : [];
  const first = issues.find((i) => typeof i?.message === "string")?.message as string | undefined;
  if (status === 400) return first ?? (message || "That wasn’t accepted. Check it and try again.");
  if ((status === 409 || status === 422) && message) return message;
  return `${fallback} (${status}).`;
}
