import { APPLICATION_COPY, type ApplicationState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Shared copy + helpers for the admin applications workspace (2026-09-14).
   Imported by both the server page and the ApplicationsDesk client island so
   the review language can't drift between them. All user-facing copy is
   plain English — the §11 / §14 spec references stay in code comments.

   P3-FE-02 widened the vocabulary: the real queue answers with §21's full
   athlete state machine, of which the fixtures' four states are the review
   slice. The four extra states are display-only here — the desk never moves
   an application into them directly.
   -------------------------------------------------------------------------- */

/** §21's full vocabulary. `ApplicationState` (fixtures) is the review slice. */
export type LiveApplicationState =
  | ApplicationState
  | "DRAFT"
  | "CHANGES_REQUESTED"
  | "ACTIVE"
  | "SUSPENDED";

export const STATE_TONE: Record<
  LiveApplicationState,
  "primary" | "warn" | "accent" | "danger" | "neutral"
> = {
  DRAFT: "neutral",
  SUBMITTED: "primary",
  UNDER_REVIEW: "warn",
  /* Neutral, not warn: the ball is with the athlete, not the desk. */
  CHANGES_REQUESTED: "neutral",
  APPROVED: "accent",
  ACTIVE: "accent",
  REJECTED: "danger",
  SUSPENDED: "danger",
};

/** Badge copy for every state the live queue can answer with. */
export const STATE_COPY: Record<LiveApplicationState, string> = {
  ...APPLICATION_COPY,
  DRAFT: "Draft",
  CHANGES_REQUESTED: "Info requested",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
};

/** One plain-English line per state, shown in the review drawer. */
export const STATE_DETAIL: Record<LiveApplicationState, string> = {
  DRAFT: "Not submitted yet — the athlete is still filling this in.",
  SUBMITTED: "New application — the review hasn't started yet.",
  UNDER_REVIEW: "A network manager is working through the checks.",
  CHANGES_REQUESTED:
    "Sent back with notes — waiting on the athlete to update and resubmit.",
  APPROVED:
    "In the network — approval confirmed this athlete's rate card, so sponsors can now be matched to them.",
  ACTIVE: "Live in the network and able to take paid work.",
  REJECTED: "Not a fit right now. The athlete was notified.",
  SUSPENDED: "Paused — no new work until a network manager reinstates them.",
};

/** Which tab a state belongs to. CHANGES_REQUESTED stays visible in the
 *  review tab (it is the desk's own decision, still in flight); DRAFT and
 *  SUSPENDED are not review work and appear under All only. */
export function stateBucket(
  s: LiveApplicationState,
): "review" | "approved" | "rejected" | "other" {
  if (s === "SUBMITTED" || s === "UNDER_REVIEW" || s === "CHANGES_REQUESTED")
    return "review";
  if (s === "APPROVED" || s === "ACTIVE") return "approved";
  if (s === "REJECTED") return "rejected";
  return "other";
}

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
  "Sponsor performance": "How their past sponsored work actually performed",
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

/* ------------------------------------------------------ the Scouting Board */

/** P1-ART-16 — a card's 48-hour bar: how full, whether overdue, and its words. */
export function waitMeter(hours: number): { pct: number; overdue: boolean; label: string } {
  if (hours <= 0) return { pct: 0, overdue: false, label: "Just in" };
  if (hours > AGING_HOURS) return { pct: 100, overdue: true, label: `Waiting ${Math.round(hours / 24)}d — past 48h` };
  return { pct: Math.round((hours / AGING_HOURS) * 100), overdue: false, label: `Waiting ${hours}h` };
}

