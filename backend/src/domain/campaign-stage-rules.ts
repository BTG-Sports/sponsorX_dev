/**
 * Campaign stages that move by themselves — P4-BE-09 (BTG admin review,
 * item 20). Pure, like every other rule file: the facts come in, the answer
 * goes out, and persistence lives in campaign-stages.ts.
 *
 * The programme owner (2026-10-03): BTG keeps its DECISIONS — launching
 * (APPROVAL → ACTIVE) and cancelling — and the stage moves that are only
 * facts happen on their own:
 *
 *   STAFFING  → APPROVAL   every athlete order is signed and nobody is still
 *                          being asked: at least one ACCEPTED order, no DRAFT
 *                          or SENT order, no SENT offer or open invitation
 *                          still inside its window, and no accepted
 *                          invitation BTG has not yet turned into an order.
 *                          REJECTED and CANCELLED orders are settled and do
 *                          not count either way (the launch's rule, which
 *                          activates ACCEPTED orders only).
 *   ACTIVE    → REPORTING  every deliverable on the signed orders (ACCEPTED,
 *                          ACTIVE, COMPLETED) is VERIFIED — at least one —
 *                          and no order or offer is still waiting for an
 *                          answer, since a yes would add deliverables.
 *   REPORTING → COMPLETED  the sponsor has their final report: a ReportFile
 *                          for the campaign rendered at or after the moment it
 *                          entered REPORTING (see FINAL REPORT below).
 *
 * FINAL REPORT — defined here, because the code had no such notion. The
 * report code has two triggers, COMPLETED (the renewal hand-off) and
 * REQUESTED (BTG asked). Entering REPORTING now queues a third, FINAL. A
 * file rendered after the campaign entered REPORTING, whatever its trigger,
 * shows every deliverable verified, so it is the final report; one rendered
 * before cannot be. The move to COMPLETED is made in the render's own
 * transaction, so it always follows the render.
 *
 * AN AD-ONLY CAMPAIGN (P9-BE-09) is never moved here: it has no athletes to
 * staff or deliverables to verify, and it keeps the path BTG walks by hand.
 */
import { isAdOnly, type CampaignState } from "./campaign-state";

export type StageFacts = {
  state: CampaignState;
  /** Every order, settled or not — what `isAdOnly` counts, as the transition does. */
  ordersAll: number;
  /** ACCEPTED, ACTIVE or COMPLETED — signed. */
  ordersSigned: number;
  /** SENT — in front of an athlete. */
  ordersSent: number;
  /** DRAFT — BTG has not sent it yet. */
  ordersDraft: number;
  /** SENT offers still inside their window. */
  offersWaiting: number;
  /** INVITED / VIEWED invitations still inside their window. */
  invitesWaiting: number;
  /** ACCEPTED invitations with no order yet for that athlete and job. */
  invitesWithoutOrder: number;
  adSlots: number;
  /** Deliverables on signed orders. */
  deliverables: { total: number; published: number; verified: number };
  /** When the campaign last entered REPORTING, from the audit; null if never recorded. */
  reportingSince: Date | null;
  /** The newest report file rendered at or after `reportingSince`; null when there is none, or no recorded entry. */
  finalReportAt: Date | null;
};

export type AutomaticMove = { to: CampaignState; reason: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Athletes (or their offers) still to answer. */
function answersWaiting(f: StageFacts): number {
  return f.ordersSent + f.offersWaiting + f.invitesWaiting;
}

function adOnly(f: StageFacts): boolean {
  return isAdOnly({ orders: f.ordersAll, adSlots: f.adSlots });
}

/**
 * The one move the facts make true, or null. The caller still asks
 * `canTransitionCampaign` — this names a destination, it does not license it.
 */
export function automaticMove(f: StageFacts): AutomaticMove | null {
  if (adOnly(f)) return null;
  switch (f.state) {
    case "STAFFING":
      if (f.ordersSigned > 0 && f.ordersDraft === 0 && answersWaiting(f) === 0 && f.invitesWithoutOrder === 0) {
        return {
          to: "APPROVAL",
          reason: `Every athlete has accepted (${plural(f.ordersSigned, "signed order")}) and no offer or invitation is waiting for an answer.`,
        };
      }
      return null;
    case "ACTIVE":
      if (
        f.deliverables.total > 0 &&
        f.deliverables.verified === f.deliverables.total &&
        f.ordersSent === 0 && f.ordersDraft === 0 && f.offersWaiting === 0
      ) {
        return { to: "REPORTING", reason: `All ${plural(f.deliverables.total, "deliverable")} verified.` };
      }
      return null;
    case "REPORTING":
      if (f.finalReportAt) return { to: "COMPLETED", reason: "The final report was rendered for the sponsor." };
      return null;
    default:
      return null;
  }
}

export type NextStepWho = "BTG" | "SYSTEM" | "ATHLETES" | "SPONSOR";
export type NextStep = { who: NextStepWho; text: string };
export type Audience = "staff" | "sponsor";

/**
 * What happens next, in words. BTG's desk gets the operational line; the
 * sponsor gets the plain one — never "BTG to send 2 orders" or a state name.
 */
export function nextStep(f: StageFacts, audience: Audience): NextStep {
  const sponsor = audience === "sponsor";
  const waiting = answersWaiting(f);
  const ad = adOnly(f);
  switch (f.state) {
    case "DRAFT":
      if (sponsor) return { who: "BTG", text: "We're setting up your campaign" };
      return ad
        ? { who: "BTG", text: "Ready for BTG to send for approval" }
        : { who: "BTG", text: "Ready for BTG to start staffing" };
    case "STAFFING":
      /* A sponsor sees orders on their campaign page, never the invitations
         or offers BTG is still negotiating — so their count is orders only. */
      if (sponsor) {
        return f.ordersSent > 0
          ? { who: "ATHLETES", text: `Waiting for ${plural(f.ordersSent, "athlete")} to accept` }
          : { who: "BTG", text: "We're lining up athletes for your campaign" };
      }
      if (waiting > 0) return { who: "ATHLETES", text: `Waiting for ${plural(waiting, "athlete")} to accept` };
      if (f.ordersDraft + f.invitesWithoutOrder > 0) {
        return { who: "BTG", text: `BTG to send ${plural(f.ordersDraft + f.invitesWithoutOrder, "order")}` };
      }
      return { who: "BTG", text: "BTG to invite athletes" };
    case "APPROVAL":
      return sponsor
        ? { who: "BTG", text: "Your athletes are confirmed — your campaign launches soon" }
        : { who: "BTG", text: "Ready for BTG to launch" };
    case "ACTIVE": {
      if (ad) {
        return sponsor
          ? { who: "BTG", text: "Your ads are running" }
          : { who: "BTG", text: "BTG moves it to reporting when the ads have run" };
      }
      const asked = sponsor ? f.ordersSent : f.ordersSent + f.offersWaiting;
      if (asked > 0) return { who: "ATHLETES", text: `Waiting for ${plural(asked, "athlete")} to accept` };
      const left = f.deliverables.total - f.deliverables.verified;
      if (f.deliverables.total === 0) {
        return sponsor
          ? { who: "BTG", text: "We're scheduling your athletes' content" }
          : { who: "BTG", text: "No deliverables yet — BTG to staff the campaign" };
      }
      if (left > 0) {
        /* Still being made is the athletes' move; published and waiting to be
           checked is BTG's. */
        const notPublished = f.deliverables.total - f.deliverables.verified - f.deliverables.published;
        if (sponsor) return { who: notPublished > 0 ? "ATHLETES" : "BTG", text: `${plural(left, "piece")} of content still to be checked` };
        return { who: notPublished > 0 ? "ATHLETES" : "BTG", text: `Waiting for ${plural(left, "deliverable")} to be verified` };
      }
      return sponsor
        ? { who: "SYSTEM", text: "All your content is in — your final report is next" }
        : { who: "SYSTEM", text: "Moves to reporting on its own" };
    }
    case "REPORTING":
      if (ad) {
        return sponsor
          ? { who: "BTG", text: "Your final report is being prepared" }
          : { who: "BTG", text: "BTG completes it once the report is sent" };
      }
      return sponsor
        ? { who: "SYSTEM", text: "Your final report is being prepared" }
        : { who: "SYSTEM", text: "Moves to completed when the final report is sent" };
    case "COMPLETED":
      return sponsor
        ? { who: "SPONSOR", text: "Your final report is ready" }
        : { who: "SPONSOR", text: "Complete — the sponsor has the final report" };
    case "CANCELLED":
      return sponsor
        ? { who: "BTG", text: "This campaign was cancelled" }
        : { who: "BTG", text: "Cancelled — nothing left to do" };
  }
}

/**
 * The audit actions a stage change is written under (CAMPAIGN_AUDIT_ACTIONS
 * in campaign-stages.ts). Creation is not a move, so it is not one of them.
 */
export const STAGE_AUDIT_ACTIONS = [
  "campaign.draft",
  "campaign.staff",
  "campaign.submitForApproval",
  "campaign.launch",
  "campaign.report",
  "campaign.complete",
  "campaign.cancel",
] as const;

/** A stage change as the audit row records it. */
export type StageChangeRow = { action: string; at: Date; actorId: string | null; after: unknown };

export type StageChange = { state: CampaignState; at: string; movedAutomatically: boolean; reason: string | null };

/** Read one audit row as a stage change. An automatic move is written by the
 *  system (no actor) with `automatic: true` on its `after`. */
export function stageChangeOf(row: StageChangeRow): StageChange | null {
  const after = (row.after ?? {}) as { state?: unknown; automatic?: unknown; reason?: unknown };
  const state = typeof after.state === "string" ? after.state : null;
  if (!state) return null;
  const automatic = row.actorId === null && after.automatic === true;
  return {
    state: state as CampaignState,
    at: row.at.toISOString(),
    movedAutomatically: automatic,
    reason: automatic && typeof after.reason === "string" ? after.reason : null,
  };
}
