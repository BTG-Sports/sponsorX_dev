/* --------------------------------------------------------------------------
   P9-FE-11 — BTG and Sales's prospect desk, as GET /prospects answers it
   (P9-BE-21). The system decides a prospect on submit — refused when another
   sponsor holds the category, accepted when nothing is in the way — and
   holds the rest for a person with the reasons. The desk opens on the held
   ones; decisions are POST /prospects/:id/decision, unchanged.
   -------------------------------------------------------------------------- */

import { pageParams, type PageInfo } from "@/lib/list-query";

export type ProspectDeskView = "held" | "auto" | "all";

export const PROSPECT_DESK_VIEWS: Array<{ value: ProspectDeskView; label: string; hint: string }> = [
  { value: "held", label: "Waiting on you", hint: "The system held these — the reasons are on each one" },
  { value: "auto", label: "Decided automatically", hint: "Accepted clean, or refused for a category another sponsor holds" },
  { value: "all", label: "All", hint: "Every prospect students have brought in" },
];

export type ApiDeskProspect = {
  id: string;
  businessName: string;
  category: string;
  state: "SUBMITTED" | "ACCEPTED" | "REJECTED";
  reasonCode: string | null;
  redirectCategories: string[];
  decidedAt: string | null;
  createdAt: string;
  reviewReasons: string[];
  decidedAutomatically: boolean;
  student: { id: string; displayName: string; property: { name: string } };
};

export type ProspectDeskPage = { prospects: ApiDeskProspect[]; page: PageInfo; summary: { held: number; auto: number; all: number } };

/** `?view=` → a desk view; anything else is the default, the held ones. */
export function deskView(raw: string | string[] | undefined): ProspectDeskView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "auto" || v === "all" ? v : "held";
}

/** The API query for one page of one view. */
export function prospectDeskQuery(sp: Record<string, string | string[] | undefined>, view: ProspectDeskView): string {
  const { page, size } = pageParams(sp);
  return `?${new URLSearchParams({ page: String(page), size: String(size), view })}`;
}

/** The reasons SALES picks from when refusing (the API's PROSPECT_REJECTION_REASONS). */
export const REJECTION_REASONS: Array<[string, string]> = [
  ["CATEGORY_EXCLUSIVE", "Another sponsor holds the category"],
  ["SCHOOL_RESTRICTION", "The school restricts it"],
  ["ATHLETE_CONFLICT", "Conflicts with an athlete"],
  ["BRAND_SAFETY", "Brand safety"],
  ["OTHER", "Other"],
];

/** Who decided, in a word, for the row's badge. */
export function decidedBy(p: Pick<ApiDeskProspect, "state" | "decidedAutomatically" | "reviewReasons">): {
  label: string;
  tone: "accent" | "warn" | "neutral";
} {
  if (p.state === "SUBMITTED") return { label: "Waiting on you", tone: "warn" };
  if (p.decidedAutomatically) return { label: "Decided automatically", tone: "accent" };
  return { label: p.reviewReasons.length ? "Decided by staff after a hold" : "Decided by staff", tone: "neutral" };
}

export const PROSPECT_STATE_WORDS: Record<ApiDeskProspect["state"], string> = {
  SUBMITTED: "Undecided",
  ACCEPTED: "Accepted",
  REJECTED: "Not accepted",
};
