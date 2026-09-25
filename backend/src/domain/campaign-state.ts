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
 * sit there indefinitely.
 *
 * DECIDED (P9-BE-09, spec §5.2): a SponsorX NEXT sale IS an ordinary Campaign
 * — placements, dates, a Zoho Deal — with NO CampaignOrder, because an order
 * needs an athlete and a job and an ad has neither. So an AD-ONLY campaign
 * (zero orders, at least one sold ad slot) skips STAFFING: DRAFT → APPROVAL.
 * That one extra edge exists only for ad-only campaigns; a campaign with
 * athlete work still has to be staffed, and an empty campaign with neither
 * cannot skip anything. From APPROVAL the path is the ordinary one, to a
 * terminal COMPLETED, with no fake athlete or job anywhere in the record.
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

/** What the campaign holds, for the one rule that depends on it. */
export type CampaignShape = { orders: number; adSlots: number };

/** An ad bought on its own: nothing to staff, something sold (P9-BE-09). */
export function isAdOnly(shape: CampaignShape): boolean {
  return shape.orders === 0 && shape.adSlots > 0;
}

export function canTransitionCampaign(
  from: CampaignState,
  to: CampaignState,
  shape: CampaignShape = { orders: 0, adSlots: 0 },
): boolean {
  return legalCampaignTransitions(from, shape).includes(to);
}

export function legalCampaignTransitions(
  from: CampaignState,
  shape: CampaignShape = { orders: 0, adSlots: 0 },
): readonly CampaignState[] {
  if (from === "DRAFT" && isAdOnly(shape)) return [...TRANSITIONS.DRAFT, "APPROVAL"];
  return TRANSITIONS[from];
}
