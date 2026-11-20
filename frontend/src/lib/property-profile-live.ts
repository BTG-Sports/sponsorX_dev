import {
  BUSINESS_FIELDS, ORG_TYPE_COPY, US_STATES, businessBody, businessFormFrom, isOrgType, isUsState, validateBusiness,
  type BusinessForm, type OrgType,
} from "@/lib/onboarding-live";
import type { ApiPreference } from "@/lib/notification-prefs-live";

/* --------------------------------------------------------------------------
   POL-FE-104 — a team's own Profile page in the property portal: the
   organisation's details and the manager's own (backend POL-BE-104,
   GET /property/profile), and BTG's list of the changes held for it.

   Network-free: the shape the API answers with, the checks a form makes
   before it asks, and every word the page says about a change that is
   waiting for BTG or was decided. The read is the page's; the writes are
   app/(app)/property/profile/actions.ts.

   Three kinds of field, and the page keeps them apart:
     saved at once   the public description; the main contact's name and
                     phone; the manager's own name, job title and phone;
     checked first   the organisation's name, city, state and its type's
                     details (a team's league and sport, a school's district
                     and sports…) — they drive matching and conflict checks,
                     so a change takes effect at once only when every safety
                     check passes, and otherwise waits for BTG with the
                     reasons;
     BTG's           the type itself (team, school, event…), and the main
                     contact's email, which was confirmed at sign-up.
   Email, password and two-step sign-in are Clerk's; the page links there.
   -------------------------------------------------------------------------- */

export type Details = Record<string, unknown>;
/** What a change asks for (or what was on file before it): only the fields that differ. */
export type IdentityChange = { name?: string; city?: string | null; stateCode?: string; details?: Details };

export type ApiPropertyChange = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  changes: IdentityChange;
  before: IdentityChange;
  /** Why it waits for BTG; empty when it went through on its own. */
  holdReasons: string[];
  autoApproved: boolean;
  /** BTG's reason, when it was rejected. */
  reason: string | null;
  requestedAt: string;
  decidedAt: string | null;
};

export type ApiPropertyProfile = {
  property: {
    id: string;
    name: string;
    kind: string;
    /** The type is BTG's to change. */
    kindManagedBy: "BTG";
    city: string | null;
    stateCode: string | null;
    /** The type's details; null for an organisation BTG set up without a sign-up. */
    details: Details | null;
    description: string | null;
    contact: { name: string | null; email: string | null; phone: string | null } | null;
  };
  me: { name: string | null; jobTitle: string | null; phone: string | null; email: string; signIn: "CLERK" };
  pendingChange: ApiPropertyChange | null;
  lastDecision: ApiPropertyChange | null;
  notificationPreferences: ApiPreference[];
};

/** BTG's desk: a held change, with the organisation it is about. */
export type ApiHeldPropertyChange = ApiPropertyChange & { property: { id: string; name: string; kind: string } };

/** Enough of the answer to draw the page; anything else is "couldn't be read". */
export function isPropertyProfile(a: unknown): a is ApiPropertyProfile {
  const x = a as Partial<ApiPropertyProfile> | null;
  return !!x && typeof x.property?.id === "string" && typeof x.property.name === "string" && typeof x.property.kind === "string"
    && typeof x.me?.email === "string";
}

/* ------------------------------------------------------------------ words */

/** "TEAM" → "Team"; a kind the list doesn't know is shown in plain case. */
export function kindWord(kind: string): string {
  if (isOrgType(kind)) return ORG_TYPE_COPY[kind].label;
  return kind ? kind[0]!.toUpperCase() + kind.slice(1).toLowerCase().replace(/_/g, " ") : "Organisation";
}

/** "your team" / "your school" — the organisation, as the page speaks of it. */
export function kindNoun(kind: string): string {
  return isOrgType(kind) ? ORG_TYPE_COPY[kind].label.toLowerCase() : "organisation";
}

export const stateName = (code: string | null | undefined) => US_STATES.find((s) => s.code === code)?.name ?? code ?? "";

/** "Portland, Maine" / "Maine" / "" — where the organisation is. */
export function placeLine(p: { city: string | null; stateCode: string | null }): string {
  return [p.city?.trim(), stateName(p.stateCode)].filter(Boolean).join(", ");
}

/** Two letters for an organisation's mark: "Casco Bay Rowing" → CR. */
export function orgInitials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return ((words[0]![0] ?? "") + (words.length > 1 ? (words[words.length - 1]![0] ?? "") : (words[0]![1] ?? ""))).toUpperCase();
}

const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dayOf = (iso: string) => DAY.format(new Date(iso));

const text = (v: unknown): string => (Array.isArray(v) ? v.filter((x) => typeof x === "string").join(", ") : typeof v === "string" ? v : "");

/** The label a detail goes by: the sign-up form's own, or the key in plain words for one it doesn't know. */
export function detailLabel(kind: string, key: string): string {
  const known = isOrgType(kind) ? BUSINESS_FIELDS[kind].find((f) => f.key === key)?.label : undefined;
  return known ?? key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
}

/**
 * The type's details as rows, in the sign-up form's order: every field of a
 * known type (an empty one reads "Not on file"), then anything else on file.
 */
export function detailRows(kind: string, details: Details | null): { key: string; label: string; value: string }[] {
  if (!details) return [];
  const known = isOrgType(kind) ? BUSINESS_FIELDS[kind].map((f) => f.key) : [];
  const keys = [...known, ...Object.keys(details).filter((k) => !known.includes(k))];
  return keys.map((key) => ({ key, label: detailLabel(kind, key), value: text(details[key]) }));
}

export type ChangeRow = { key: string; label: string; before: string; after: string };

/** A change, field by field: what was on file and what was asked for. */
export function changeRows(c: Pick<ApiPropertyChange, "changes" | "before">, kind: string): ChangeRow[] {
  const rows: ChangeRow[] = [];
  const none = "none on file";
  if (c.changes.name !== undefined) rows.push({ key: "name", label: "Name", before: c.before.name ?? none, after: c.changes.name });
  if (c.changes.city !== undefined) rows.push({ key: "city", label: "City", before: c.before.city ?? none, after: c.changes.city ?? "removed" });
  if (c.changes.stateCode !== undefined) rows.push({ key: "stateCode", label: "State", before: stateName(c.before.stateCode) || none, after: stateName(c.changes.stateCode) });
  const after = c.changes.details;
  if (after) {
    const before = c.before.details ?? {};
    const known = isOrgType(kind) ? BUSINESS_FIELDS[kind].map((f) => f.key) : [];
    const keys = [...new Set([...known, ...Object.keys(before), ...Object.keys(after)])];
    for (const key of keys) {
      const was = text(before[key]);
      const now = text(after[key]);
      if (was !== now) rows.push({ key: `details.${key}`, label: detailLabel(kind, key), before: was || none, after: now || "removed" });
    }
  }
  return rows;
}

/** What a change asked for, in a few words: "a new name, state and league". */
export function changeAsks(c: Pick<ApiPropertyChange, "changes" | "before">, kind: string): string {
  const labels = changeRows(c, kind).map((r) => r.label.toLowerCase());
  if (!labels.length) return "a change";
  const list = labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]!}`;
  return `a new ${list}`;
}

export type ChangeNotice = {
  tone: "wait" | "late" | "live";
  title: string;
  text: string;
  /** Why it waits (BTG's hold reasons), or BTG's reason for saying no. */
  reasons: string[];
  /** The fields it touched, before → after. */
  rows: ChangeRow[];
};

/** How long a change that took effect stays announced on the page. */
const ANNOUNCE_DAYS = 14;
const capital = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t);

/**
 * The one notice about the name, place and type details: a change waiting
 * for BTG; else the last answer — a rejection always (the manager reads why),
 * a change that took effect for two weeks. Null: nothing to say.
 */
export function changeNotice(p: Pick<ApiPropertyProfile, "pendingChange" | "lastDecision"> & { property: { kind: string } }, now: Date): ChangeNotice | null {
  const kind = p.property.kind;
  const w = p.pendingChange;
  if (w) {
    return {
      tone: "wait",
      title: "Waiting for BTG",
      text: `You asked for ${changeAsks(w, kind)} on ${dayOf(w.requestedAt)}. A BTG person checks it first. Until then your ${kindNoun(kind)} keeps what is on file.`,
      reasons: w.holdReasons,
      rows: changeRows(w, kind),
    };
  }
  const d = p.lastDecision;
  if (!d) return null;
  if (d.status === "REJECTED") {
    return {
      tone: "late",
      title: "BTG didn’t approve your change",
      text: `You asked for ${changeAsks(d, kind)}. Your ${kindNoun(kind)} keeps what was on file. You can ask again.`,
      reasons: d.reason ? [d.reason] : [],
      rows: changeRows(d, kind),
    };
  }
  if (d.status === "APPROVED" && d.decidedAt && now.getTime() - new Date(d.decidedAt).getTime() < ANNOUNCE_DAYS * 86_400_000) {
    return {
      tone: "live",
      title: d.autoApproved ? "Your change is in effect" : "BTG approved your change",
      text: `${capital(changeAsks(d, kind).replace(/^a new /, "the new "))} took effect on ${dayOf(d.decidedAt)}.`,
      reasons: [],
      rows: [],
    };
  }
  return null;
}

/* ------------------------------------------------------------------ the forms */

export type Checked<I, D> = { ok: true; input: I } | { ok: false; errors: Partial<Record<keyof D, string>> };

const blank = (s: string) => (s.trim() ? s.trim() : null);
/* Digits, spaces and the marks a phone number is written with; at least 7 digits. */
const PHONE = /^[0-9+().\-\s/x#,]*$/i;
function phoneProblem(raw: string): string | null {
  const phone = raw.trim();
  if (phone.length > 40) return "Keep the phone number under 40 characters.";
  if (phone && (!PHONE.test(phone) || phone.replace(/\D/g, "").length < 7)) return "That doesn’t look like a phone number.";
  return null;
}

export const DESCRIPTION_MAX = 2000;

/** The public description. Left empty, it is cleared. */
export function validateDescription(raw: string): Checked<{ description: string | null }, { description: string }> {
  if (raw.trim().length > DESCRIPTION_MAX) return { ok: false, errors: { description: `Keep the description under ${DESCRIPTION_MAX.toLocaleString("en-US")} characters.` } };
  return { ok: true, input: { description: blank(raw) } };
}

export type ContactDraft = { name: string; phone: string };
export type ContactInput = { contactName: string; contactPhone: string | null };

/** The main contact's name and phone. A contact keeps a name; an empty phone is cleared. Their email isn't changed here. */
export function validateContact(d: ContactDraft): Checked<ContactInput, ContactDraft> {
  const errors: Partial<Record<keyof ContactDraft, string>> = {};
  const name = d.name.trim();
  if (!name) errors.name = "A contact needs a name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";
  const phone = phoneProblem(d.phone);
  if (phone) errors.phone = phone;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: { contactName: name, contactPhone: blank(d.phone) } };
}

export type ManagerDraft = { name: string; jobTitle: string; phone: string };
export type ManagerInput = { name: string | null; jobTitle: string | null; phone: string | null };

/** The manager's own name, job title and phone. A field left empty is cleared. */
export function validateManager(d: ManagerDraft): Checked<ManagerInput, ManagerDraft> {
  const errors: Partial<Record<keyof ManagerDraft, string>> = {};
  if (d.name.trim().length > 120) errors.name = "Keep your name under 120 characters.";
  if (d.jobTitle.trim().length > 120) errors.jobTitle = "Keep your job title under 120 characters.";
  const phone = phoneProblem(d.phone);
  if (phone) errors.phone = phone;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, input: { name: blank(d.name), jobTitle: blank(d.jobTitle), phone: blank(d.phone) } };
}

/** What the change form holds: the name and place, and the type's details as the sign-up form's strings. */
export type IdentityDraft = { name: string; city: string; stateCode: string; details: BusinessForm };
export type IdentityInput = { name?: string; city?: string | null; stateCode?: string; details?: Record<string, string | string[]> };
type IdentityCurrent = Pick<ApiPropertyProfile["property"], "name" | "kind" | "city" | "stateCode" | "details">;

/** The type's detail fields this organisation can change here: none for one BTG set up without a sign-up, or of a type the form doesn't know. */
export function detailFields(p: Pick<IdentityCurrent, "kind" | "details">) {
  return p.details && isOrgType(p.kind) ? BUSINESS_FIELDS[p.kind] : [];
}

/** The change form, started from what is on file. */
export function identityDraftFrom(p: IdentityCurrent): IdentityDraft {
  return {
    name: p.name,
    city: p.city ?? "",
    stateCode: p.stateCode ?? "",
    details: p.details && isOrgType(p.kind) ? businessFormFrom(p.kind, p.details) : {},
  };
}

const sameForm = (a: BusinessForm, b: BusinessForm, keys: readonly string[]) => keys.every((k) => (a[k] ?? "").trim() === (b[k] ?? "").trim());

/**
 * A new name, city, state and/or type details. Only what differs from what is
 * on file is sent — the details as a whole, and only when one of them changed,
 * checked the way the sign-up form checks them. Asking for exactly what is on
 * file is caught here, before the API's 422.
 */
export function validateIdentity(current: IdentityCurrent, d: IdentityDraft): (Checked<IdentityInput, Record<string, string>> & { same?: boolean }) {
  const errors: Record<string, string> = {};
  const name = d.name.trim();
  if (!name) errors.name = "Give the organisation’s name.";
  else if (name.length > 200) errors.name = "Keep the name under 200 characters.";
  else if (!/[\p{L}\p{N}]/u.test(name)) errors.name = "Use letters or numbers in the name.";
  const city = d.city.trim();
  if (city.length > 120) errors.city = "Keep the city under 120 characters.";
  const stateCode = d.stateCode.trim().toUpperCase();
  /* A state on file can be changed, not removed; an organisation with none on file may leave it so. */
  if (!stateCode && current.stateCode) errors.stateCode = "Pick the state you operate in.";
  else if (stateCode && !isUsState(stateCode)) errors.stateCode = "SponsorX operates in the United States. Pick a US state.";

  const fields = detailFields(current);
  const keys = fields.map((f) => f.key);
  const kind = current.kind as OrgType;
  const detailsChanged = fields.length > 0 && !sameForm(d.details, businessFormFrom(kind, current.details), keys);
  if (detailsChanged) {
    for (const [k, v] of Object.entries(validateBusiness(kind, d.details, stateCode || current.stateCode))) errors[`details.${k}`] = v;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const input: IdentityInput = {
    ...(name !== current.name ? { name } : {}),
    ...((city || null) !== (current.city ?? null) ? { city: city || null } : {}),
    ...(stateCode && stateCode !== (current.stateCode ?? "") ? { stateCode } : {}),
    ...(detailsChanged ? { details: businessBody(kind, d.details) } : {}),
  };
  if (!Object.keys(input).length) return { ok: false, same: true, errors: { name: "That’s what’s on file already. Change something first." } };
  return { ok: true, input };
}

/* ------------------------------------------------------------------ refusals */

/**
 * What a refused write says. A 403 in plain words; the API's own sentence
 * for a 409 or a 422 (they are written for the person: "A change is already
 * waiting for BTG…"); the first field problem of a 400.
 */
export function propertyRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 0) return "We couldn’t reach SponsorX, so nothing was saved. Try again in a minute.";
  if (status === 401) return "Your session ended. Sign in again, then retry.";
  if (status === 403) return "Only this organisation’s own manager can change its profile.";
  const err = (body as { error?: { message?: unknown; issues?: unknown } } | null)?.error;
  const message = typeof err?.message === "string" ? err.message : "";
  const issues = Array.isArray(err?.issues) ? (err.issues as { message?: unknown }[]) : [];
  const first = issues.find((i) => typeof i?.message === "string")?.message as string | undefined;
  if (status === 400) return first ?? (message || "That wasn’t accepted. Check it and try again.");
  if ((status === 404 || status === 409 || status === 422) && message) return message;
  return `${fallback} (${status}).`;
}

/* ------------------------------------------------------------------ BTG's desk */

/** What BTG's refused answer says: only a BTG Admin decides; the API's own sentence for a change already answered or a name since taken. */
export function deskRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "Only a BTG Admin decides these changes.";
  if (status >= 500) return "Something went wrong on our side, so nothing changed. Try again in a minute.";
  return propertyRefusal(status, body, fallback);
}

/** How long a held change has waited: "today", "1 day", "6 days". */
export function waitedLine(requestedAt: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(requestedAt).getTime()) / 86_400_000));
  return days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`;
}
