/* --------------------------------------------------------------------------
   P4-FE-09 — what a sponsor is told about their request (P4-BE-11).

   A brief is approved automatically when every safety check passes, or held
   for BTG. The API sends a sponsor-safe `status` with every brief; these
   helpers turn it into the lines the sponsor's screens show. A sponsor is
   never told WHY a request waits — the API never sends them the reasons,
   and nothing here invents one.
   -------------------------------------------------------------------------- */

export type BriefStatusKey = "REVIEWING" | "APPROVED" | "CLOSED";
export type BriefStatus = { key: BriefStatusKey; text: string };

export const REVIEWING_TEXT = "BTG is reviewing your request — usually within a working day";
export const APPROVED_TEXT = "Approved — your campaign is being staffed";
export const CLOSED_TEXT = "This request is closed";

/** The API's line, or the same rule from the state when an older API sent none. */
export function requestStatus(b: { state: string; status?: BriefStatus | null }): BriefStatus {
  if (b.status?.text) return b.status;
  if (b.state === "APPROVED" || b.state === "CAMPAIGN_CREATED") return { key: "APPROVED", text: APPROVED_TEXT };
  if (b.state === "CLOSED") return { key: "CLOSED", text: CLOSED_TEXT };
  return { key: "REVIEWING", text: REVIEWING_TEXT };
}

export function statusTone(key: BriefStatusKey): "accent" | "warn" | "neutral" {
  return key === "APPROVED" ? "accent" : key === "REVIEWING" ? "warn" : "neutral";
}

/** A brief as the sponsor's own list reads it (GET /briefs, own scope). */
export type ApiSponsorRequest = {
  id: string;
  state: string;
  objective: string;
  /** cents */
  budget: number;
  createdAt: string;
  package: { name: string } | null;
  campaign: { id: string; name: string; state: string } | null;
  status?: BriefStatus;
};

/** The requests still waiting to become a campaign — the campaign list shows the rest. */
export function openRequests(rows: ApiSponsorRequest[]): ApiSponsorRequest[] {
  return rows.filter((b) => !b.campaign && b.state !== "CLOSED" && b.state !== "CAMPAIGN_CREATED");
}

/** P1-ART-23 — the Requests page's mini `StadiumSteps`: where a request
 *  stands in plain steps. `now` is the CURRENT step (the ones before it are
 *  done; `steps.length` means every step is done). -1 (CLOSED, a cancelled
 *  campaign, or anything unrecognised) shows no step lit rather than guess.
 *
 *  POL-FE-21 — each step is something that has actually happened, from the
 *  brief's state and, once it became one, the campaign's:
 *    Sent          the brief exists (DRAFT / QUALIFIED are BTG's review)
 *    BTG review    done when the brief is APPROVED
 *    Athletes signed  done when the campaign is fully staffed (APPROVAL:
 *                  every athlete signed, the campaign waits for its start
 *                  date) — before that it is STAFFING / DRAFT
 *    Campaign live done once the campaign is ACTIVE (or past it)
 *  Nothing here says a price was agreed or a campaign is live before the
 *  API's own state does. */
export const REQUEST_STEPS = ["Sent", "BTG review", "Athletes signed", "Campaign live"];
export function requestStepNow(state: string, campaignState?: string | null): number {
  switch (state) {
    case "DRAFT":
    case "QUALIFIED":
      return 1;
    case "APPROVED":
      return 2;
    case "CAMPAIGN_CREATED":
      switch (campaignState) {
        case "ACTIVE":
        case "REPORTING":
        case "COMPLETED":
          return 4;
        case "APPROVAL":
          return 3;
        case "CANCELLED":
          return -1;
        default:
          /* DRAFT / STAFFING, or an older API that sent no campaign state: athletes are still being signed. */
          return 2;
      }
    default:
      return -1;
  }
}

/** The word under a request's steps when no step is lit. */
export function requestStepsClosedWord(state: string, campaignState?: string | null): string {
  return state === "CAMPAIGN_CREATED" && campaignState === "CANCELLED" ? "Campaign cancelled" : "Closed";
}

/** The campaign page's line while it is being staffed: it was approved. */
export function campaignApprovalLine(campaignState: string): string | null {
  return campaignState === "DRAFT" || campaignState === "STAFFING" ? APPROVED_TEXT : null;
}

/** What the brief drawer says once a request is sent. */
export function submittedMessage(status?: BriefStatus | null): { title: string; body: string; approved: boolean } {
  if (status?.key === "APPROVED") {
    return {
      title: status.text,
      body: "Every check passed, so your request was approved straight away. Follow it on your Campaigns page.",
      approved: true,
    };
  }
  return {
    title: "Request received",
    body: `${status?.text ?? REVIEWING_TEXT}. You can follow it on your Campaigns page.`,
    approved: false,
  };
}
