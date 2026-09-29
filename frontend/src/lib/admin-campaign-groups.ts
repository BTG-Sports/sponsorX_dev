/* --------------------------------------------------------------------------
   The admin Campaigns desk's tabs, SERVER-PAGED (2026-09-29) — pure.

   The desk used to fetch every campaign and group it in the browser into
   Needs attention / Delivering / Staffing / Closed. Now each group is a tab:
   a filter the API applies (states, plus delivery health's own flag), and a
   count from DB aggregates (GET /campaigns/summary's byState, and the
   flagged count GET /campaigns answers with `?health=true`).

   "Delivering" excludes the flagged ones where delivery health is readable,
   exactly as the grouped list did — every flagged campaign is ACTIVE or
   REPORTING (delivery health reads no others), so its count is those two
   states minus the flagged. A role that doesn't read delivery health has no
   attention tab and an unsplit Delivering.
   -------------------------------------------------------------------------- */

import { apiListQuery, textParam, type SearchParams } from "@/lib/list-query";

export const CAMPAIGN_GROUPS = ["attention", "delivering", "staffing", "closed"] as const;
export type CampaignGroup = (typeof CAMPAIGN_GROUPS)[number];

export const GROUP_LABEL: Record<CampaignGroup | "all", string> = {
  all: "All",
  attention: "Needs attention",
  delivering: "Delivering",
  staffing: "Staffing",
  closed: "Closed",
};

export const STAFFING_STATES = ["DRAFT", "STAFFING", "APPROVAL"] as const;
export const DELIVERING_STATES = ["ACTIVE", "REPORTING"] as const;
export const CLOSED_STATES = ["COMPLETED", "CANCELLED"] as const;

export const ADMIN_CAMPAIGN_SORTS = ["name", "ending"] as const;

/** ?group from the URL; the attention tab only where health is readable. */
export function groupParam(sp: SearchParams, healthVisible = true): CampaignGroup | "" {
  const g = textParam(sp, "group", CAMPAIGN_GROUPS);
  if (g === "attention" && !healthVisible) return "";
  return g as CampaignGroup | "";
}

/** The API filter a tab stands for. */
export function groupFilter(group: CampaignGroup | "", healthVisible: boolean): Record<string, string> {
  switch (group) {
    case "attention":
      return { attention: "true" };
    case "delivering":
      return { state: DELIVERING_STATES.join(","), ...(healthVisible ? { attention: "false" } : {}) };
    case "staffing":
      return { state: STAFFING_STATES.join(",") };
    case "closed":
      return { state: CLOSED_STATES.join(",") };
    default:
      return {};
  }
}

/** GET /campaigns for one tab's page, rows carrying their health flags. */
export function adminCampaignsQuery(sp: SearchParams, healthVisible: boolean): string {
  return apiListQuery(sp, {
    health: "true",
    ...groupFilter(groupParam(sp, healthVisible), healthVisible),
    q: textParam(sp, "q"),
    sort: textParam(sp, "sort", ADMIN_CAMPAIGN_SORTS),
  });
}

/** Tab counts from the aggregates; `attention` null = not readable. */
export function groupCounts(
  byState: Record<string, number>,
  total: number,
  attention: number | null,
): Record<CampaignGroup | "all", number | null> {
  const sum = (states: readonly string[]) => states.reduce((n, s) => n + (byState[s] ?? 0), 0);
  return {
    all: total,
    attention,
    delivering: Math.max(0, sum(DELIVERING_STATES) - (attention ?? 0)),
    staffing: sum(STAFFING_STATES),
    closed: sum(CLOSED_STATES),
  };
}
