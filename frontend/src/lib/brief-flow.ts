/* --------------------------------------------------------------------------
   /brief sponsor intake flow (B3 front half · §13). Pure data + logic.

   Phase 1 is managed: a sponsor tells BTG the goal, budget band and market;
   BTG matches athletes, checks conflicts (§26) and prices the proposal.
   Nothing is signed and nothing is charged here — this is a request, not a
   contract, which is why there is no agreement step. The B3 API wiring
   replaces only where the request goes on submit.

   POL-FE-114 (2026-11-19): one question per screen. Five short steps and a
   review, each with one thing that must be answered and at most one
   optional follow-up. The answers, their keys and what is sent
   (brief-inquiry.ts) are unchanged; only the order and the words moved.
   The 2026-09-21 spec (docs/superpowers/specs) describes the four-step card
   this replaced.
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "./brand-categories";
import { marketplacePackages } from "./fixtures";
import { placeRegion, placeWords, regionLabel, type Place } from "./places";

export const GOALS = [
  "Awareness",
  "Foot traffic",
  "Product launch",
  "Event push",
] as const;

/** What each goal means, in one plain line under its name. */
export const GOAL_HINTS: Record<(typeof GOALS)[number], string> = {
  Awareness: "More people know your name.",
  "Foot traffic": "More people come through your door.",
  "Product launch": "People hear about something new you sell.",
  "Event push": "More people come to your event.",
};

/** Bands, not invoices — they bracket §7's package price points. */
export const BUDGET_BANDS = [
  "Under $1k",
  "$1–3k",
  "$3–8k",
  "$8–20k",
  "$20k+",
] as const;

/** Optional: when the sponsor wants to start. Sent as words in the message. */
export const TIMINGS = [
  "As soon as possible",
  "Within a month",
  "In 2–3 months",
  "Not sure yet",
] as const;

export type BriefFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: "text" | "email" | "tel";
};

export type BriefStepId = "goal" | "business" | "budget" | "market" | "contact" | "review";

export type BriefStepDef = {
  id: BriefStepId;
  /** The step's short name: the list of steps and "Step 2 of 6 · Business". */
  label: string;
  heading: string;
  sub: string;
  /** The step's typed answers. Choices (goal, business type, budget) are checked by name. */
  fields: BriefFieldDef[];
};

export const BRIEF_STEPS: BriefStepDef[] = [
  {
    id: "goal",
    label: "Goal",
    heading: "What should this campaign do for you?",
    sub: "Pick the one that matters most. You can send another brief later for a different goal.",
    fields: [
      { key: "success", label: "What would a good result look like?", placeholder: "e.g. 500 reward redemptions in March", required: false },
    ],
  },
  {
    id: "business",
    label: "Business",
    heading: "Tell us about your business.",
    sub: "We use this to find athletes who are a good fit for you.",
    /* The business type is a set of choices under this (2S1-FE-11), not a field. */
    fields: [
      { key: "company", label: "Business name", placeholder: "Midwest Running Co.", required: true },
    ],
  },
  {
    id: "budget",
    label: "Budget",
    heading: "How much do you want to spend?",
    sub: "A rough range is enough. There is no card and no payment on this form.",
    fields: [],
  },
  {
    id: "market",
    label: "Where",
    heading: "Where are your customers?",
    sub: "We match you with athletes near them. Today the network is strongest around Washington, DC, Maryland and Virginia, with a hub in Kigali.",
    /* POL-FE-117 — picked, not typed: Country → State or region → City (optional). */
    fields: [],
  },
  {
    id: "contact",
    label: "Contact",
    heading: "Who should we reply to?",
    sub: "A person at BTG reads your brief and replies, usually within 2 business days. This is not a mailing list.",
    fields: [
      { key: "name", label: "Your name", placeholder: "Jordan Avery", required: true },
      { key: "email", label: "Work email", placeholder: "you@company.com", required: true, type: "email" },
      { key: "phone", label: "Phone", placeholder: "Optional", required: false, type: "tel" },
    ],
  },
  {
    id: "review",
    label: "Review and send",
    heading: "Check your brief, then send it.",
    sub: "Change anything that looks wrong. Nothing is sent until you press Send.",
    fields: [],
  },
];

/* ---------------------------------------------------------- business type */

/** 2S1-FE-11 — what the business is: one of the brand categories, or OTHER
    in its own words. The same list as the API's BUSINESS_TYPES
    (backend sponsor-request-rules.ts); the system approves the sponsor by
    itself unless the type needs BTG's look, which the form never says. */
export const OTHER_BUSINESS_TYPE = "OTHER";
export const BUSINESS_TYPES = [...BRAND_CATEGORIES, OTHER_BUSINESS_TYPE] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export function isBusinessType(v: unknown): v is BusinessType {
  return typeof v === "string" && (BUSINESS_TYPES as readonly string[]).includes(v);
}

/** The select's words for a type — "Other — tell us what your business does" for OTHER. */
export function businessTypeLabel(t: BusinessType): string {
  return t === OTHER_BUSINESS_TYPE ? "Other — tell us what your business does" : categoryLabel(t as BrandCategory);
}

/** What the business said it is, in words: the category, or its own description. */
export function businessTypeText(d: Pick<BriefDraft, "businessType" | "businessTypeOther">): string {
  if (!isBusinessType(d.businessType)) return "";
  return d.businessType === OTHER_BUSINESS_TYPE ? (d.businessTypeOther ?? "").trim() : categoryLabel(d.businessType as BrandCategory);
}

/** The types shown first: the everyday local businesses most sponsors are.
    Display order only. The rest of BUSINESS_TYPES sits behind "More types",
    and OTHER ("Something else") is always shown. */
export const COMMON_BUSINESS_TYPES: readonly BusinessType[] = [
  "RESTAURANT",
  "LOCAL_RETAIL",
  "FITNESS",
  "APPAREL",
  "HEALTHCARE",
  "EDUCATION",
  "AUTOMOTIVE",
  "FINANCIAL",
  "NONPROFIT",
];

/** Every other type on the list, in the list's order. */
export const MORE_BUSINESS_TYPES: readonly BusinessType[] = BUSINESS_TYPES.filter(
  (t) => t !== OTHER_BUSINESS_TYPE && !COMMON_BUSINESS_TYPES.includes(t),
);

/* -------------------------------------------------------------- audiences */

/** The audiences this product actually reaches — high-school and college
    athletes' followings and event crowds (§4, §16). Optional on the form.
    The market itself is picked from the place catalogue (POL-FE-117, below). */
export const AUDIENCES = [
  "High-school students & families",
  "College students & fans",
  "Youth sports parents",
  "Local event-goers",
  "General local community",
] as const;

/* --------------------------------------------------------------- packages */

export type PackageOption = { id: string; name: string; price?: string };

const UNSURE: PackageOption = { id: "unsure", name: "Not sure yet" };

export const PACKAGE_OPTIONS: PackageOption[] = [
  UNSURE,
  ...marketplacePackages.map((p) => ({ id: p.id, name: p.name, price: p.price })),
];

/** Unknown or missing ids fall back to "Not sure yet" — a bad ?package=
    param must never break the intake. */
export function packageOption(id: string | undefined): PackageOption {
  return PACKAGE_OPTIONS.find((p) => p.id === id) ?? UNSURE;
}

/* ---------------------------------------------------------------- market */

/** POL-FE-117 (owner, 2026-11-20: "the /brief page still in free text") — the
    market is picked: a country (United States · East Africa), its state or
    region, and optionally a city, kept as three answers. `market`, the text BTG
    reads and the inquiry sends, is written from them ("Takoma Park, MD",
    "Arusha, Tanzania"), so the body sent to POST /public/inquiries keeps its shape. */
export function marketPlace(d: Pick<BriefDraft, "answers">): Place {
  return { countryCode: d.answers.marketCountry || "US", regionCode: d.answers.marketRegion ?? "", city: d.answers.marketCity ?? "" };
}

/** The answers with a new market picked: the three parts and the words for them. */
export function withMarket(answers: Record<string, string>, p: Place): Record<string, string> {
  const picked = placeRegion(p.countryCode, p.regionCode) !== null;
  return {
    ...answers,
    marketCountry: p.countryCode,
    marketRegion: p.regionCode,
    marketCity: p.city,
    /* A US state with no city reads "Maryland", not "MD". */
    market: !picked ? "" : p.countryCode === "US" && !p.city.trim() ? placeRegion("US", p.regionCode)!.name : placeWords({ countryCode: p.countryCode, stateCode: p.regionCode, city: p.city }),
  };
}

/* ------------------------------------------------------------- validation */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateBriefStep(
  step: number,
  draft: BriefDraft,
): Record<string, string> {
  const errs: Record<string, string> = {};
  const def = BRIEF_STEPS[step];
  if (!def) return errs;
  for (const f of def.fields) {
    if (f.required && !(draft.answers[f.key] ?? "").trim()) errs[f.key] = `Add ${f.label.toLowerCase()}`;
  }
  if (def.id === "goal" && !draft.goal) errs.goal = "Pick a goal";
  if (def.id === "business") {
    /* The contract's limits: OTHER needs its own words, 2–200 characters. */
    const other = (draft.businessTypeOther ?? "").trim();
    if (!isBusinessType(draft.businessType)) errs.businessType = "Pick what kind of business it is";
    else if (draft.businessType === OTHER_BUSINESS_TYPE && other.length < 2) errs.businessTypeOther = "Say what your business does";
    else if (draft.businessType === OTHER_BUSINESS_TYPE && other.length > 200) errs.businessTypeOther = "Keep it under 200 characters";
  }
  if (def.id === "budget" && !draft.budget) errs.budget = "Pick a range";
  if (def.id === "market") {
    const p = marketPlace(draft);
    if (!placeRegion(p.countryCode, p.regionCode)) errs.market = `Pick where your customers are: a country and a ${regionLabel(p.countryCode).toLowerCase()}`;
  }
  if (def.id === "contact") {
    const email = (draft.answers.email ?? "").trim();
    if (email && !EMAIL.test(email)) errs.email = "Enter a valid email, like you@company.com";
  }
  return errs;
}

/** The first step with something still missing; the review when nothing is. */
export function firstOpenStep(draft: BriefDraft): number {
  const review = BRIEF_STEPS.length - 1;
  for (let i = 0; i < review; i++) {
    if (Object.keys(validateBriefStep(i, draft)).length > 0) return i;
  }
  return review;
}

/** Where a draft opens: the step it was left on, but never past a step that
    is still missing an answer. A draft saved by the four-step form, or one
    edited by hand, lands on the first gap instead of skipping it. */
export function resumeStep(draft: BriefDraft): number {
  const at = Number.isInteger(draft.step) ? Math.max(0, Math.min(draft.step, BRIEF_STEPS.length - 1)) : 0;
  return Math.min(at, firstOpenStep(draft));
}

/** A step's answer in a few words, for the list of steps. "" when unanswered. */
export function stepAnswer(id: BriefStepId, d: BriefDraft): string {
  const a = (k: string) => (d.answers[k] ?? "").trim();
  switch (id) {
    case "goal":
      return d.goal;
    case "business":
      return a("company") || businessTypeText(d);
    case "budget":
      return d.budget;
    case "market":
      return a("market");
    case "contact":
      return a("name") || a("email");
    default:
      return "";
  }
}

/* ------------------------------------------------------------------ draft */

export type BriefDraft = {
  v: 1;
  phase: "steps" | "submitted";
  step: number;
  goal: string;
  budget: string;
  package: string;
  answers: Record<string, string>;
  /** 2S1-FE-11 — one of BUSINESS_TYPES. Optional: drafts saved before it existed still parse. */
  businessType?: string;
  /** The business's own words, sent only with OTHER. */
  businessTypeOther?: string;
  submittedAt?: string;
  /** The API's requestToken, kept so this device can upload the proof and come back to the status page. */
  requestToken?: string;
  /** Set once the API has counted an uploaded proof of business. */
  proofUploaded?: boolean;
};

export const BRIEF_DRAFT_KEY = "sx-brief-draft-v1";

export function emptyBriefDraft(pkg?: string): BriefDraft {
  return {
    v: 1,
    phase: "steps",
    step: 0,
    goal: "",
    budget: "",
    package: packageOption(pkg).id,
    answers: {},
  };
}

/** Safe parse: anything malformed → null (start fresh, never crash). */
export function parseBriefDraft(raw: string | null): BriefDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as BriefDraft;
    if (
      d?.v !== 1 ||
      typeof d.step !== "number" ||
      typeof d.answers !== "object" ||
      typeof d.goal !== "string" ||
      typeof d.budget !== "string" ||
      !["steps", "submitted"].includes(d.phase)
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
