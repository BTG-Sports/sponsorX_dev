/* --------------------------------------------------------------------------
   /brief sponsor intake flow (B3 front half · §13). Pure data + logic.

   Phase 1 is managed: a sponsor tells BTG the goal, budget band and market;
   BTG matches athletes, checks conflicts (§26) and prices the proposal.
   Nothing is signed and nothing is charged here — this is a request, not a
   contract, which is why there is no agreement step. The B3 API wiring
   replaces only where the request goes on submit.

   Spec: docs/superpowers/specs/2026-09-21-brief-wizard-design.md
   -------------------------------------------------------------------------- */

import { marketplacePackages } from "./fixtures";

export const GOALS = [
  "Awareness",
  "Foot traffic",
  "Product launch",
  "Event push",
] as const;

/** Bands, not invoices — they bracket §7's package price points. */
export const BUDGET_BANDS = [
  "Under $1k",
  "$1–3k",
  "$3–8k",
  "$8–20k",
  "$20k+",
] as const;

export type BriefFieldDef = {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  type?: "text" | "email" | "tel";
};

export type BriefStepDef = {
  id: "goal" | "budget" | "market" | "contact";
  heading: string;
  sub: string;
  fields: BriefFieldDef[];
};

export const BRIEF_STEPS: BriefStepDef[] = [
  {
    id: "goal",
    heading: "What are you trying to do?",
    sub: "One goal per brief keeps the match sharp — you can always brief again.",
    fields: [
      { key: "category", label: "Brand category", placeholder: "Quick-service restaurant", required: true },
      { key: "success", label: "What success looks like", placeholder: "Optional — e.g. 500 reward redemptions in March", required: false },
    ],
  },
  {
    id: "budget",
    heading: "Budget and starting point",
    sub: "Bands, not invoices — BTG prices the final proposal against real rates.",
    fields: [
      { key: "timing", label: "Timing", placeholder: "Optional — e.g. March, flexible", required: false },
    ],
  },
  {
    id: "market",
    heading: "Where should it land?",
    sub: "Campaigns are matched to athletes in your market (§13).",
    fields: [
      { key: "market", label: "City / region", placeholder: "Silver Spring, MD", required: true },
      { key: "audience", label: "Audience", placeholder: "Optional — e.g. high-school families", required: false },
    ],
  },
  {
    id: "contact",
    heading: "Where does the proposal go?",
    sub: "A person at BTG replies, usually within 2 business days — this is not a mailing list.",
    fields: [
      { key: "company", label: "Company", placeholder: "Midwest Running Co.", required: true },
      { key: "name", label: "Your name", placeholder: "Jordan Avery", required: true },
      { key: "email", label: "Work email", placeholder: "you@company.com", required: true, type: "email" },
      { key: "phone", label: "Phone", placeholder: "Optional", required: false, type: "tel" },
    ],
  },
];

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

/* ------------------------------------------------------------- validation */

export function validateBriefStep(
  step: number,
  draft: BriefDraft,
): Record<string, string> {
  const errs: Record<string, string> = {};
  const def = BRIEF_STEPS[step];
  if (!def) return errs;
  for (const f of def.fields) {
    if (f.required && !(draft.answers[f.key] ?? "").trim()) errs[f.key] = "Required";
  }
  if (def.id === "goal" && !draft.goal) errs.goal = "Pick a goal";
  if (def.id === "budget" && !draft.budget) errs.budget = "Pick a band";
  if (def.id === "contact") {
    const email = (draft.answers.email ?? "").trim();
    if (email && !email.includes("@")) errs.email = "Enter a valid email";
  }
  return errs;
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
  submittedAt?: string;
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
