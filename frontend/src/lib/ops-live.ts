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
    orderState: string | null;
    inviteState: string | null;
    inviteJobId: string | null;
    /** cents — the accepted invitation's offer, to prefill the order. */
    offered: number | null;
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
      orderState: r.order?.state ?? null,
      inviteState: r.invite?.state ?? null,
      inviteJobId: r.invite?.jobId ?? null,
      offered: r.invite?.offered ?? null,
      overdue: r.overdue,
      inReview: r.inReview,
      nextDue: r.nextDue,
    },
  };
}

export function isLiveRow(r: RosterRow): r is LiveRosterRow {
  return "live" in r && Boolean((r as LiveRosterRow).live);
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
