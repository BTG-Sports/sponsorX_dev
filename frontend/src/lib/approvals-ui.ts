import { DELIVERABLE_COPY, type DeliverableState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   approvals-ui — copy maps and state-machine helpers shared by the admin
   approvals page (server) and the ApprovalsDesk island (client), the same
   split applications-ui.ts gives the applications desk.

   The §21 pipeline is NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW →
   SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED; a revision request sends
   the deliverable back to the athlete. "REVISION" is the desk's local view of
   that send-back before the backend lands.
   -------------------------------------------------------------------------- */

export type EffectiveState = DeliverableState | "REVISION";

/** Content review is expected to turn around same-day (median 9h) — anything
 *  waiting past this many hours is flagged as aging. */
export const AGING_HOURS = 24;

export const STATE_TONE: Record<
  EffectiveState,
  "neutral" | "primary" | "warn" | "accent"
> = {
  NOT_STARTED: "neutral",
  DRAFT_SUBMITTED: "primary",
  BTG_REVIEW: "warn",
  SPONSOR_REVIEW: "warn",
  APPROVED: "accent",
  PUBLISHED: "accent",
  VERIFIED: "accent",
  REVISION: "warn",
};

export const stateLabel = (s: EffectiveState): string =>
  s === "REVISION" ? "Revision requested" : DELIVERABLE_COPY[s];

/** The primary action that advances a deliverable one step (§21), plus the
 *  confirmation line the drawer shows once it has happened. */
export const ADVANCE: Partial<
  Record<DeliverableState, { label: string; next: DeliverableState }>
> = {
  DRAFT_SUBMITTED: { label: "Start BTG review", next: "BTG_REVIEW" },
  BTG_REVIEW: { label: "Send to sponsor", next: "SPONSOR_REVIEW" },
  SPONSOR_REVIEW: { label: "Approve & publish", next: "APPROVED" },
};

/** Plain-English "where it is and what happens next" for the drawer. */
export const STATE_DETAIL: Record<EffectiveState, string> = {
  NOT_STARTED: "The athlete hasn't submitted a draft yet.",
  DRAFT_SUBMITTED:
    "A new draft is waiting to be picked up. Starting the review moves it onto the BTG desk.",
  BTG_REVIEW:
    "BTG is checking brand safety and brief fit. Sending it on asks the sponsor for their sign-off.",
  SPONSOR_REVIEW:
    "The sponsor has the final say on their own campaign. Approving clears it to publish on the agreed schedule.",
  APPROVED:
    "Cleared both reviews — it publishes on the campaign schedule.",
  PUBLISHED:
    "Live. The usage-rights window is counting from publication.",
  VERIFIED:
    "Published and verified — engagement is being tracked for the sponsor report.",
  REVISION:
    "Sent back to the athlete with notes. The next version lands at the top of this queue when they resubmit.",
};

/** The four desks a deliverable crosses — the hero strip and the drawer's
 *  stage tracker read the same labels so the mental model matches. */
export const PIPELINE_STEPS = [
  "Athlete submits",
  "BTG review",
  "Sponsor review",
  "Cleared",
] as const;

/** Which desk (0-based index into PIPELINE_STEPS) a state sits on. */
export function deskIndex(s: EffectiveState): number {
  if (s === "NOT_STARTED" || s === "REVISION") return 0;
  if (s === "DRAFT_SUBMITTED" || s === "BTG_REVIEW") return 1;
  if (s === "SPONSOR_REVIEW") return 2;
  return 3;
}

/** Still on a review desk (or sent back) — i.e. not yet cleared. */
export const inQueue = (s: EffectiveState): boolean =>
  s === "DRAFT_SUBMITTED" ||
  s === "BTG_REVIEW" ||
  s === "SPONSOR_REVIEW" ||
  s === "REVISION";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "May 15" → 515, so due dates sort without real timestamps. */
export const dueValue = (due: string): number => {
  const [m, d] = due.split(" ");
  return (MONTHS.indexOf(m) + 1) * 100 + (Number(d) || 0);
};

/** "50h" → "2d" past two days, matching how reviewers talk about the queue. */
export const waitLabel = (hours: number): string =>
  hours >= 48 ? `${Math.round(hours / 24)}d` : `${hours}h`;
