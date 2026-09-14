import type { ApplicationState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Shared copy + helpers for the admin applications workspace (2026-09-14).
   Imported by both the server page and the ApplicationsDesk client island so
   the review language can't drift between them. All user-facing copy is
   plain English — the §11 / §14 spec references stay in code comments.
   -------------------------------------------------------------------------- */

export const STATE_TONE: Record<
  ApplicationState,
  "primary" | "warn" | "accent" | "danger"
> = {
  SUBMITTED: "primary",
  UNDER_REVIEW: "warn",
  APPROVED: "accent",
  REJECTED: "danger",
};

/** One plain-English line per state, shown in the review drawer. */
export const STATE_DETAIL: Record<ApplicationState, string> = {
  SUBMITTED: "New application — the review hasn't started yet.",
  UNDER_REVIEW: "A network manager is working through the checks.",
  APPROVED:
    "In the network — approval confirmed this athlete's rate card, so sponsors can now be matched to them.",
  REJECTED: "Not a fit right now. The athlete was notified.",
};

/* ------------------------------------------------------------ score bands */

export type ScoreTone = "accent" | "primary" | "warn" | "danger";

export type ScoreBand = { label: string; tone: ScoreTone; blurb: string };

/**
 * §14 Content Value Score, bucketed for reviewers. The number is rules-based
 * in Phase 1 (`rules-v1`) and every factor is stored, so a band is a summary
 * of an explainable score — never a black-box verdict.
 */
export function scoreBand(total: number): ScoreBand {
  if (total >= 70)
    return {
      label: "Strong fit",
      tone: "accent",
      blurb: "Scores well across the board — a straightforward approve if the safeguards clear.",
    };
  if (total >= 55)
    return {
      label: "Solid fit",
      tone: "primary",
      blurb: "A dependable profile with room to grow — most of the network sits in this band.",
    };
  if (total >= 40)
    return {
      label: "Developing",
      tone: "warn",
      blurb: "Promising but early — worth a closer read of the weaker factors before deciding.",
    };
  return {
    label: "Weak fit",
    tone: "danger",
    blurb: "Scores low on the factors sponsors buy against — approval would need a strong reason.",
  };
}

/** What each score factor measures, in one reviewer-friendly line. */
export const FACTOR_HINTS: Record<string, string> = {
  Engagement: "How actively their audience responds to posts",
  "Content quality": "Production value and consistency of their content",
  Audience: "Reach — the size of the audience a sponsor buys",
  Reliability: "Track record of delivering commitments on time",
  Geography: "Overlap with the regions our sponsors care about",
  Fit: "Match with the sponsor categories we actually sell",
};

/* ---------------------------------------------------------------- aging */

/** Applications waiting past this many hours get the overdue treatment. */
export const AGING_HOURS = 48;

/** Parse the fixtures' relative "2 hours ago" / "3 days ago" into hours. */
export function waitHours(submittedAt: string): number {
  const m = /^(\d+)\s+(hour|day)s?\s+ago$/.exec(submittedAt.trim());
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "day" ? n * 24 : n;
}
