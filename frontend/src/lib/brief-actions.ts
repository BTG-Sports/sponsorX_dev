/* --------------------------------------------------------------------------
   POL-FE-17 — a sponsor opens, edits or withdraws a request (POL-BE-17).

   Pure, so the page and its client island carry no rules of their own:
     - which buttons show (`youCan` from the API — never guessed from state;
       a read-only sponsor gets no flags and so no buttons);
     - the edit form's starting values from the brief, and the PATCH body
       built from the form against the original with ONLY what changed;
     - the words for each refusal (a 409 is "BTG moved it on — reload").

   The vocabularies and the cents / date parsing are lib/brief-request.ts's,
   the same ones the create drawer sends, so an edit cannot send a shape the
   create never could. The API (CampaignBriefPatch) is the enforcement.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "./brand-categories";
import {
  AUDIENCE_TIERS,
  BriefRequestInvalid,
  CHANNEL_LABEL,
  MATCH_CHANNELS,
  TIER_LABEL,
  budgetCents,
  followersCount,
  stateCodesFor,
  type AudienceTier,
  type MatchChannel,
} from "./brief-request";
import type { ApiSponsorRequest } from "./brief-status";

/** GET /briefs/:id, as a sponsor reads it. BTG-only fields (heldReasons,
 *  closeReason, readiness) are not named here and never rendered. */
export type ApiSponsorRequestDetail = ApiSponsorRequest & {
  startDate: string;
  endDate: string;
  sports: string[];
  stateCodes: string[];
  categories: string[];
  excludedCategories: string[];
  channels: string[];
  audienceTiers: string[];
  audienceMinFollowers: number | null;
  package: {
    code: string;
    name: string;
    lineItems: unknown;
    athleteCountMin: number;
    athleteCountMax: number;
    /** Whole dollars — the catalogue's unit. */
    priceLow: number;
    priceHigh: number;
  } | null;
};

export type RequestActions = { edit: boolean; withdraw: boolean };

/** The buttons a request shows: exactly the API's flags. An older API, or a
 *  read-only sponsor (SPONSOR_ANALYST), sends none → nothing to click. */
export function requestActions(b: { youCan?: Partial<RequestActions> | null }): RequestActions {
  return { edit: b.youCan?.edit === true, withdraw: b.youCan?.withdraw === true };
}

/* --------------------------------------------------------------- the form */

/** What the edit island holds — text as typed, lists as picked. */
export type RequestEditForm = {
  objective: string;
  /** Dollars as typed — "1,500" or "1500.50". */
  budget: string;
  /** yyyy-mm-dd. */
  startDate: string;
  endDate: string;
  /** Comma-separated as typed — "Basketball, Soccer". */
  sports: string;
  /** Comma-separated codes as typed — "DC, MD, VA". */
  stateCodes: string;
  categories: string[];
  excludedCategories: string[];
  channels: string[];
  audienceTiers: string[];
  /** As typed — "10,000", "10k", "" for no minimum. */
  minFollowers: string;
};

/** PATCH /briefs/:id — every field optional, only what changed is sent. */
export type BriefPatch = {
  objective?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
  sports?: string[];
  stateCodes?: string[];
  categories?: BrandCategory[];
  excludedCategories?: BrandCategory[];
  channels?: MatchChannel[];
  audienceTiers?: AudienceTier[];
  audienceMinFollowers?: number | null;
};

export const PATCH_KEYS = [
  "objective", "budget", "startDate", "endDate", "sports", "stateCodes",
  "categories", "excludedCategories", "channels", "audienceTiers", "audienceMinFollowers",
] as const satisfies readonly (keyof BriefPatch)[];

/** An ISO instant (or a bare date) → the calendar day, yyyy-mm-dd. */
export const isoDay = (iso: string): string => (iso ?? "").slice(0, 10);

/** 150000 → "1500"; 150050 → "1500.50". */
export function dollarsText(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const rest = Math.abs(cents % 100);
  return rest === 0 ? String(whole) : `${whole}.${String(rest).padStart(2, "0")}`;
}

/** The form as the brief stands now. */
export function editFormFrom(b: ApiSponsorRequestDetail): RequestEditForm {
  return {
    objective: b.objective,
    budget: dollarsText(b.budget),
    startDate: isoDay(b.startDate),
    endDate: isoDay(b.endDate),
    sports: b.sports.join(", "),
    stateCodes: b.stateCodes.join(", "),
    categories: [...b.categories],
    excludedCategories: [...b.excludedCategories],
    channels: [...b.channels],
    audienceTiers: [...b.audienceTiers],
    minFollowers: b.audienceMinFollowers === null ? "" : String(b.audienceMinFollowers),
  };
}

const splitList = (text: string): string[] => [...new Set(text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))];

const inVocabulary = <T extends string>(list: readonly T[], values: readonly string[]): T[] =>
  [...new Set(values.filter((v): v is T => (list as readonly string[]).includes(v)))];

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
function calendarDay(text: string, which: "start" | "end"): string {
  const t = text.trim();
  if (!DAY_RE.test(t) || Number.isNaN(new Date(`${t}T00:00:00Z`).getTime())) {
    throw new BriefRequestInvalid(`That ${which} date is not a date.`);
  }
  return t;
}

/** "Basketball, Soccer" → the sports the API takes: ≤20, each ≤60 characters. */
export function sportsList(text: string): string[] {
  const list = splitList(text);
  if (list.length > 20) throw new BriefRequestInvalid("Pick up to 20 sports.");
  const long = list.find((s) => s.length > 60);
  if (long) throw new BriefRequestInvalid(`"${long.slice(0, 20)}…" is too long for a sport's name.`);
  return list;
}

/** "DC, md, Baltimore, MD" → ["DC", "MD"]; a token that is no US state is refused by name. */
export function stateCodeList(text: string): string[] {
  const out: string[] = [];
  for (const token of splitList(text)) {
    const codes = stateCodesFor(token.toUpperCase());
    if (codes.length === 0) throw new BriefRequestInvalid(`"${token}" isn't a US state code — use two letters, e.g. MD.`);
    for (const c of codes) if (!out.includes(c)) out.push(c);
  }
  if (out.length > 60) throw new BriefRequestInvalid("Pick up to 60 states.");
  return out;
}

/**
 * The PATCH body: the form parsed by the create drawer's rules, with only
 * the fields that differ from the original. Throws BriefRequestInvalid, in
 * the sponsor's words, before anything is sent. An empty object means
 * nothing changed.
 */
export function requestPatch(form: RequestEditForm, original: ApiSponsorRequestDetail): BriefPatch {
  const objective = form.objective.trim();
  if (!objective) throw new BriefRequestInvalid("Say what the campaign should achieve.");
  if (objective.length > 2000) throw new BriefRequestInvalid("Keep the objective under 2,000 characters.");
  const budget = budgetCents(form.budget);
  const startDate = calendarDay(form.startDate, "start");
  const endDate = calendarDay(form.endDate, "end");
  if (endDate <= startDate) throw new BriefRequestInvalid("The end date must be after the start date.");
  const sports = sportsList(form.sports);
  const stateCodes = stateCodeList(form.stateCodes);
  const categories = inVocabulary(BRAND_CATEGORIES, form.categories);
  const excludedCategories = inVocabulary(BRAND_CATEGORIES, form.excludedCategories);
  if (excludedCategories.some((c) => categories.includes(c))) {
    throw new BriefRequestInvalid("Your own category can't also be one to avoid.");
  }
  const channels = inVocabulary(MATCH_CHANNELS, form.channels);
  const audienceTiers = inVocabulary(AUDIENCE_TIERS, form.audienceTiers);
  const audienceMinFollowers = followersCount(form.minFollowers);

  const patch: BriefPatch = {};
  if (objective !== original.objective) patch.objective = objective;
  if (budget !== original.budget) patch.budget = budget;
  if (startDate !== isoDay(original.startDate)) patch.startDate = startDate;
  if (endDate !== isoDay(original.endDate)) patch.endDate = endDate;
  if (!sameSet(sports, original.sports)) patch.sports = sports;
  if (!sameSet(stateCodes, original.stateCodes)) patch.stateCodes = stateCodes;
  if (!sameSet(categories, original.categories)) patch.categories = categories;
  if (!sameSet(excludedCategories, original.excludedCategories)) patch.excludedCategories = excludedCategories;
  if (!sameSet(channels, original.channels)) patch.channels = channels;
  if (!sameSet(audienceTiers, original.audienceTiers)) patch.audienceTiers = audienceTiers;
  if (audienceMinFollowers !== original.audienceMinFollowers) patch.audienceMinFollowers = audienceMinFollowers;
  return patch;
}

export const patchIsEmpty = (p: BriefPatch): boolean => Object.keys(p).length === 0;

/** The server action's guard: only the PATCH's own keys, nothing else a
 *  client could add travels to the API. */
export function pickPatch(input: unknown): BriefPatch {
  const src = (input ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of PATCH_KEYS) if (k in src && src[k] !== undefined) out[k] = src[k];
  return out as BriefPatch;
}

/* ------------------------------------------------------------- withdraw */

export const WITHDRAW_NOTE_MAX = 500;

/** The optional note with a withdrawal: trimmed, capped, absent when empty. */
export function withdrawNote(note: unknown): string | undefined {
  const t = typeof note === "string" ? note.trim() : "";
  return t ? t.slice(0, WITHDRAW_NOTE_MAX) : undefined;
}

export const WITHDRAW_BODY = { to: "CLOSED" } as const;

/* -------------------------------------------------------------- refusals */

export type Refusal = { message: string; /** BTG moved the request on: reload what it says now. */ moved: boolean };

const issueOf = (body: unknown): string | null => {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  return typeof issue === "string" ? issue : null;
};

/** Why an edit was refused, in the sponsor's words. The API's own issue
 *  text is never shown — it names columns, not what the sponsor typed. */
export function editRefusal(status: number): Refusal {
  if (status === 409) return { message: "BTG has already moved this request on, so it can't be changed now. Here is where it stands.", moved: true };
  if (status === 400 || status === 422) return { message: "Some details weren't accepted — check the dates and budget.", moved: false };
  if (status === 403) return { message: "You're not allowed to change this request. Ask your sponsor admin.", moved: false };
  return { message: `Your changes weren't saved (HTTP ${status}). Try again in a minute.`, moved: false };
}

/** Why a withdrawal was refused. */
export function withdrawRefusal(status: number, body?: unknown): Refusal {
  if (status === 409) return { message: "This request has already moved on — it can't be withdrawn from here. Here is where it stands.", moved: true };
  if (status === 403) return { message: "Only your sponsor admin can withdraw a request.", moved: false };
  if (status === 400 || status === 422) return { message: issueOf(body) ?? "That note wasn't accepted — keep it under 500 characters.", moved: false };
  return { message: `It wasn't withdrawn (HTTP ${status}). Try again in a minute.`, moved: false };
}

/** The line under the Edit / Withdraw buttons when a request has none —
 *  a sponsor should know why, not wonder. Null while it can still be edited. */
export function noActionsLine(b: { state: string; youCan?: Partial<RequestActions> | null }): string | null {
  const acts = requestActions(b);
  if (acts.edit) return null;
  switch (b.state) {
    case "QUALIFIED":
      return acts.withdraw
        ? "BTG has started matching this request, so its details are fixed now — you can still withdraw it."
        : "BTG has started matching this request, so its details are fixed now.";
    case "APPROVED":
      return acts.withdraw
        ? "Approved and being staffed — its details are fixed now, but you can still withdraw it."
        : "Approved and being staffed — its details are fixed now.";
    case "CAMPAIGN_CREATED":
      return "This request became a campaign. Changes and cancellations happen on the campaign's page.";
    case "CLOSED":
      return "This request is closed.";
    default:
      return acts.withdraw ? null : "Only your sponsor admin can change or withdraw a request.";
  }
}

/* ------------------------------------------------------- what was asked */

export type AskedLine = { label: string; value: string };

const humanize = (s: string) => {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const labelOf = <K extends string>(map: Record<K, string>, v: string) => (map as Record<string, string>)[v] ?? humanize(v);
const listOr = (xs: string[], none: string) => (xs.length ? xs.join(", ") : none);

/** The targeting the sponsor asked for, as plain lines. Budget and dates
 *  are rendered by the page (they carry their own components). */
export function askedLines(b: ApiSponsorRequestDetail): AskedLine[] {
  const cats = (xs: string[]) => xs.map((c) => ((BRAND_CATEGORIES as readonly string[]).includes(c) ? categoryLabel(c as BrandCategory) : humanize(c)));
  return [
    { label: "Sports", value: listOr(b.sports, "Any sport") },
    { label: "States", value: listOr(b.stateCodes, "Anywhere in the US") },
    { label: "Your category", value: listOr(cats(b.categories), "Not given") },
    { label: "Categories to avoid", value: listOr(cats(b.excludedCategories), "None") },
    { label: "Where to be seen", value: listOr(b.channels.map((c) => labelOf(CHANNEL_LABEL, c)), "No preference") },
    { label: "Athlete tiers", value: listOr(b.audienceTiers.map((t) => labelOf(TIER_LABEL, t)), "Any tier") },
    { label: "Minimum audience", value: b.audienceMinFollowers === null ? "No minimum" : `${b.audienceMinFollowers.toLocaleString("en-US")} followers` },
  ];
}

/** A package's athlete count as words: "3–5 athletes", "1 athlete". */
export function athleteCountWord(p: { athleteCountMin: number; athleteCountMax: number }): string {
  if (p.athleteCountMin === p.athleteCountMax) return `${p.athleteCountMin} athlete${p.athleteCountMin === 1 ? "" : "s"}`;
  return `${p.athleteCountMin}–${p.athleteCountMax} athletes`;
}
