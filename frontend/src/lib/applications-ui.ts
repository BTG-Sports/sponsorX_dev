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
  /* POL-FE-64 (app review §2) — approved is not yet matchable: an invitation refuses an athlete who isn't ACTIVE. */
  APPROVED:
    "Approved, not active yet — they can't be invited to campaigns until they're activated. Activate them once their rate card is set (a minor also needs a verified guardian).",
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

/* ------------------------------------------- POL-FE-106 · plain words */

/** How long an application has waited, short: "Just in", "5 hours", "3 days". */
export function waitShort(hours: number): string {
  if (hours <= 0) return "Just in";
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export type StageTone = "blue" | "cyan" | "amber" | "green" | "red" | "muted";

/** A state's colour and what happens next, in a few words — the list's status
 *  pill. `act`: the desk itself is the next mover (the pill's dot pulses). */
export const STATE_NEXT: Record<LiveApplicationState, { tone: StageTone; next: string; act: boolean }> = {
  DRAFT: { tone: "muted", next: "Not sent yet", act: false },
  SUBMITTED: { tone: "blue", next: "Start the review", act: true },
  UNDER_REVIEW: { tone: "cyan", next: "Make a decision", act: true },
  CHANGES_REQUESTED: { tone: "amber", next: "Waiting on the athlete", act: false },
  APPROVED: { tone: "green", next: "Activate them next", act: true },
  ACTIVE: { tone: "green", next: "Live, nothing to do", act: false },
  REJECTED: { tone: "red", next: "Closed", act: false },
  SUSPENDED: { tone: "red", next: "Paused", act: false },
};

export type TrackStep = { label: string; status: "done" | "now" | "todo" | "stop" };

/** The review drawer's tracker: Applied → In review → Approved → Active, and
 *  where this application stands on it. A rejection ends the track at its
 *  third step; info requested holds it at the second. */
export function trackSteps(s: LiveApplicationState): TrackStep[] {
  const step = (label: string, status: TrackStep["status"]): TrackStep => ({ label, status });
  switch (s) {
    case "DRAFT":
      return [step("Applying", "now"), step("In review", "todo"), step("Approved", "todo"), step("Active", "todo")];
    case "SUBMITTED":
      return [step("Applied", "done"), step("Review", "now"), step("Approved", "todo"), step("Active", "todo")];
    case "UNDER_REVIEW":
      return [step("Applied", "done"), step("In review", "now"), step("Approved", "todo"), step("Active", "todo")];
    case "CHANGES_REQUESTED":
      return [step("Applied", "done"), step("Info requested", "now"), step("Approved", "todo"), step("Active", "todo")];
    case "APPROVED":
      return [step("Applied", "done"), step("Reviewed", "done"), step("Approved", "done"), step("Activate", "now")];
    case "ACTIVE":
      return [step("Applied", "done"), step("Reviewed", "done"), step("Approved", "done"), step("Active", "done")];
    case "REJECTED":
      return [step("Applied", "done"), step("Reviewed", "done"), step("Rejected", "stop")];
    case "SUSPENDED":
      return [step("Applied", "done"), step("Reviewed", "done"), step("Approved", "done"), step("Suspended", "stop")];
  }
}

/** The one sentence at the top of the drawer: what the reviewer does now.
 *  `live`: the real desk, where a new application is claimed first. */
export function nextMove(s: LiveApplicationState, live: boolean): string {
  switch (s) {
    case "DRAFT":
      return "Nothing yet. The athlete hasn't sent it.";
    case "SUBMITTED":
      return live
        ? "Press Start review below. It claims this application, so nobody else decides it at the same time."
        : "Check the facts below, then pick Approve, Ask for more info or Reject under Your decision.";
    case "UNDER_REVIEW":
      return "Check the facts below, then pick Approve, Ask for more info or Reject under Your decision.";
    case "CHANGES_REQUESTED":
      return "Nothing for now. The athlete has your notes and will send it back.";
    case "APPROVED":
      return live
        ? "Press Activate athlete below when they're ready to take paid work."
        : "Nothing for now. They're approved.";
    case "ACTIVE":
      return "Nothing. They're live and can take paid work.";
    case "REJECTED":
      return "Nothing. This application is closed.";
    case "SUSPENDED":
      return "Nothing here. A network manager reinstates them from the roster.";
  }
}

/** P1-ART-16 — a card's 48-hour bar: how full, whether overdue, and its words. */
export function waitMeter(hours: number): { pct: number; overdue: boolean; label: string } {
  if (hours <= 0) return { pct: 0, overdue: false, label: "Just in" };
  if (hours > AGING_HOURS) return { pct: 100, overdue: true, label: `Waiting ${Math.round(hours / 24)}d — past 48h` };
  return { pct: Math.round((hours / AGING_HOURS) * 100), overdue: false, label: `Waiting ${hours}h` };
}

