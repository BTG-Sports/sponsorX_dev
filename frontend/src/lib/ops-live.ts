import type { RosterRow } from "@/lib/campaign-ui";

/* --------------------------------------------------------------------------
   P5-FE-05 — the campaign operations board's live translation:
   GET /campaigns/{id}/ops → the RosterOps rows and the hero's numbers. Pure.

   Row vocabulary is the island's (ACCEPTED / SENT / DECLINED + one flag), so
   the demo and the real board stay one component. The mapping, per §21:
     order ACCEPTED/ACTIVE/COMPLETED → ACCEPTED
     order SENT                      → SENT      "Awaiting acceptance"
     order REJECTED/CANCELLED        → DECLINED  "Replacement needed"
     invite only, INVITED/VIEWED     → SENT      "Awaiting acceptance"
     invite only, DECLINED/EXPIRED   → DECLINED  "Replacement needed"
     invite only, ACCEPTED           → ACCEPTED  "Order not drafted" — BTG's
                                        move: the drawer drafts & sends it
   "Under-delivering" wins over the others when work is actually overdue.
   Views are VERIFIED only (the API already refuses to count the rest).
   -------------------------------------------------------------------------- */

export type ApiOpsRow = {
  athleteId: string;
  name: string;
  slug: string;
  order: { id: string; state: string; jobIds: string[] } | null;
  invite: { id: string; state: string; jobId: string; offered?: number } | null;
  delivered: number;
  /** Of `delivered`, how many BTG has VERIFIED — published is not done. */
  verified?: number;
  planned: number;
  overdue: number;
  inReview: number;
  nextDue: string | null;
  verifiedViews: number;
};

export type ApiOps = {
  campaign: { id: string; name: string; state: string; sponsorName: string; startDate: string; endDate: string };
  health: {
    deliverablesTotal: number;
    deliverablesVerified: number;
    deliverablesOverdue: number;
    projectedImpressions: number | null;
    verifiedImpressions: number;
    underDeliveringWork: boolean;
    underDeliveringReach: boolean;
  };
  roster: ApiOpsRow[];
};

export type LiveRosterRow = RosterRow & {
  live: {
    athleteId: string;
    /** P8-FE-05 — the Campaign Order's id, so the drawer can pause it and find its dispute. */
    orderId: string | null;
    orderState: string | null;
    inviteState: string | null;
    inviteJobId: string | null;
    /** cents — the accepted invitation's offer, to prefill the order. */
    offered: number | null;
    /** Deliverables BTG has verified — the order is complete only when this
     *  reaches planned (staging dry run, 2026-10-26: "Complete" showed over
     *  posts the athlete's own page still called "BTG verifying"). */
    verified: number;
    overdue: number;
    inReview: number;
    nextDue: string | null;
  };
};

export type DraftOrderInput = {
  athleteId: string;
  jobId: string;
  compensation: number;
  sellPrice: number;
  usageRights: string;
  exclusivity: string | null;
  dueDate: string;
};
export type DraftOrderResult = { ok: true; orderId: string } | { ok: false; message: string; orderId?: string };

const ACCEPTED_ORDER = new Set(["ACCEPTED", "ACTIVE", "COMPLETED"]);
const LOST = new Set(["REJECTED", "CANCELLED"]);

export function toRosterRow(r: ApiOpsRow): LiveRosterRow {
  let order: string;
  let flag: string | null = null;
  if (r.order) {
    if (ACCEPTED_ORDER.has(r.order.state)) order = "ACCEPTED";
    else if (LOST.has(r.order.state)) {
      order = "DECLINED";
      flag = "Replacement needed";
    } else {
      order = "SENT";
      flag = "Awaiting acceptance";
    }
  } else if (r.invite) {
    if (r.invite.state === "ACCEPTED") {
      order = "ACCEPTED";
      flag = "Order not drafted";
    } else if (r.invite.state === "DECLINED" || r.invite.state === "EXPIRED") {
      order = "DECLINED";
      flag = "Replacement needed";
    } else {
      order = "SENT";
      flag = "Awaiting acceptance";
    }
  } else {
    order = "SENT";
  }
  if (r.overdue > 0) flag = "Under-delivering";

  return {
    name: r.name,
    slug: r.slug,
    order,
    delivered: r.delivered,
    planned: r.planned,
    views: r.verifiedViews,
    flag,
    live: {
      athleteId: r.athleteId,
      orderId: r.order?.id ?? null,
      orderState: r.order?.state ?? null,
      inviteState: r.invite?.state ?? null,
      inviteJobId: r.invite?.jobId ?? null,
      offered: r.invite?.offered ?? null,
      verified: r.verified ?? 0,
      overdue: r.overdue,
      inReview: r.inReview,
      nextDue: r.nextDue,
    },
  };
}

export function isLiveRow(r: RosterRow): r is LiveRosterRow {
  return "live" in r && Boolean((r as LiveRosterRow).live);
}

export type StepState = "done" | "current" | "todo" | "danger";
export type JourneyStep = { label: string; note: string; state: StepState };

/**
 * A Campaign Order's lifecycle as the order drawer shows it (roster-ops
 * Journey). Published is not done: the order is complete once BTG has
 * VERIFIED every deliverable, matching the athlete's own "Published — BTG
 * verifying" (staging dry run, 2026-10-26). The sample rows carry no
 * verified count, so there delivered stands in, as before.
 */
export function orderJourney(r: RosterRow): JourneyStep[] {
  if (r.order === "DECLINED") {
    return [
      { label: "Order sent", note: "The Campaign Order went out to the athlete.", state: "done" },
      { label: "Declined", note: "The athlete turned this order down — the slot needs a new match.", state: "danger" },
    ];
  }
  const accepted = r.order === "ACCEPTED";
  const verified = isLiveRow(r) ? r.live.verified : r.delivered;
  const published = accepted && r.planned > 0 && r.delivered >= r.planned;
  const complete = accepted && r.planned > 0 && verified >= r.planned;
  return [
    { label: "Order sent", note: "The Campaign Order went out to the athlete.", state: "done" },
    {
      label: "Accepted",
      note: accepted ? "The athlete committed to the deliverables." : "Waiting on the athlete to accept.",
      state: accepted ? "done" : "current",
    },
    {
      label: "Delivering",
      note: `${r.delivered} of ${r.planned} deliverables published.`,
      state: !accepted ? "todo" : published ? "done" : "current",
    },
    {
      label: "Complete",
      note:
        published && !complete
          ? `Every deliverable published — BTG verifying (${verified} of ${r.planned} verified).`
          : "Every deliverable published and verified.",
      state: complete ? "done" : published ? "current" : "todo",
    },
  ];
}

/** Whole days left in the window (0 once it has ended). */
export function daysRemaining(endIso: string, now: Date): number {
  return Math.max(0, Math.ceil((Date.parse(endIso) - now.getTime()) / 86_400_000));
}

/** Share of verified deliverables, whole percent; null with nothing planned. */
export function verifiedPct(h: ApiOps["health"]): number | null {
  return h.deliverablesTotal ? Math.round((100 * h.deliverablesVerified) / h.deliverablesTotal) : null;
}

/** Verified reach against the frozen projection; null without a projection. */
export function reachPct(h: ApiOps["health"]): number | null {
  return h.projectedImpressions ? Math.round((100 * h.verifiedImpressions) / h.projectedImpressions) : null;
}
