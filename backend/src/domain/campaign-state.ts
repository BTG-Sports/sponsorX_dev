/**
 * The campaign lifecycle — P4-BE-06, §21.
 *
 * Pure, and separate from persistence for the same reason as every other
 * rule file here.
 *
 * DRAFT → STAFFING → APPROVAL → ACTIVE → REPORTING → COMPLETED, with
 * CANCELLED reachable until the work is done.
 *
 * WHY CANCELLED STOPS AT ACTIVE. A campaign that has been delivered and is
 * being reported on cannot be cancelled — the athletes did the work and the
 * sponsor owes for it. Cancelling there would be a billing decision dressed
 * as a state change. REPORTING and COMPLETED therefore have no route out,
 * which is deliberate rather than an omission.
 *
 * STAFFING ASSUMES ATHLETES TO STAFF. A campaign with no athlete work — an
 * advertisement bought on its own — has nothing to do in this state and would
 * sit there indefinitely. That case is real but is not Phase 1's: it belongs
 * to SponsorX NEXT and is tracked as `P9-BE-09`. Nothing here should be bent
 * to accommodate it in advance.
 */

export type CampaignState =
  | "DRAFT"
  | "STAFFING"
  | "APPROVAL"
  | "ACTIVE"
  | "REPORTING"
  | "COMPLETED"
  | "CANCELLED";

export const CAMPAIGN_STATES: readonly CampaignState[] = [
  "DRAFT", "STAFFING", "APPROVAL", "ACTIVE", "REPORTING", "COMPLETED", "CANCELLED",
] as const;

const TRANSITIONS: Readonly<Record<CampaignState, readonly CampaignState[]>> = {
  DRAFT: ["STAFFING", "CANCELLED"],
  /* Back to DRAFT from STAFFING: matching can reveal that the brief itself is
     wrong — no athlete in the state covers the sport — and the answer is to
     rework the campaign, not to cancel the sponsor. */
  STAFFING: ["APPROVAL", "DRAFT", "CANCELLED"],
  APPROVAL: ["ACTIVE", "STAFFING", "CANCELLED"],
  ACTIVE: ["REPORTING", "CANCELLED"],
  REPORTING: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export class IllegalCampaignTransitionError extends Error {
  readonly status = 409;
  constructor(from: CampaignState, to: CampaignState) {
    super(
      `A campaign cannot go from ${from} to ${to}. Legal moves from ${from}: ` +
        `${legalCampaignTransitions(from).join(", ") || "none — it is terminal"}.`,
    );
    this.name = "IllegalCampaignTransitionError";
  }
}

export function canTransitionCampaign(from: CampaignState, to: CampaignState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function legalCampaignTransitions(from: CampaignState): readonly CampaignState[] {
  return TRANSITIONS[from];
}
