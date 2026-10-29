/* --------------------------------------------------------------------------
   P8-FE-12 — the API calls behind Cancel and Change a campaign (P8-BE-12),
   shared by the sponsor's and BTG's campaign pages and BTG's queue. Every
   failure comes back as a value for the dialog to show; a 404 on the route
   (the API isn't built yet) reads as "Not available yet", never a crash.
   -------------------------------------------------------------------------- */

import "server-only";

import {
  NOT_AVAILABLE_YET,
  type ApiCampaignActionResult,
  type ApiCampaignImpact,
  type ApiCampaignRequest,
  type ChangeProposal,
} from "@/lib/campaign-change-live";
import { apiFetch } from "@/server/api";

export type Fail = { ok: false; message: string; unavailable?: boolean };
export type ImpactRead = { ok: true; impact: ApiCampaignImpact } | Fail;
export type ActResult = ({ ok: true } & ApiCampaignActionResult) | Fail;
export type RequestsRead = { ok: true; requests: ApiCampaignRequest[] } | Fail;
export type DecisionResult = { ok: true; request?: ApiCampaignRequest } | Fail;

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function call<T>(path: string, init: RequestInit, fallback: string): Promise<({ ok: true } & T) | Fail> {
  let res: Response;
  try {
    res = await apiFetch(path, init);
  } catch {
    return { ok: false, message: "Can't reach SponsorX right now — check your connection and try again." };
  }
  if (res.status === 404) return { ok: false, unavailable: true, message: NOT_AVAILABLE_YET };
  if (!res.ok) return { ok: false, message: await reason(res, `${fallback} (HTTP ${res.status}).`) };
  try {
    return { ok: true, ...((await res.json()) as T) };
  } catch {
    return { ok: false, message: `${fallback} — the answer couldn't be read.` };
  }
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body ?? {}) });
const id = (s: string) => encodeURIComponent(s);

/** A well-formed impact, or the read refused: the dialog never renders a half shape.
 *  Every group is normalised too — `items` and `count` may be missing or null
 *  in the unconfirmed P8-BE-12 shape (review 2026-10-29). */
export function impactOf(x: { impact?: unknown } | ApiCampaignImpact | null | undefined): ApiCampaignImpact | null {
  if (!x || typeof x !== "object") return null;
  const i = ("affected" in x ? x : (x as { impact?: unknown }).impact) as Partial<ApiCampaignImpact> | undefined;
  if (!i || typeof i !== "object" || !i.affected || !Array.isArray(i.affected.groups) || !i.money || typeof i.money !== "object") return null;
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  const groups = i.affected.groups
    .filter((g): g is NonNullable<typeof g> => Boolean(g) && typeof g === "object")
    .map((g, n) => {
      const items = Array.isArray(g.items)
        ? g.items.filter((it): it is NonNullable<typeof it> => Boolean(it) && typeof it === "object").map((it, k) => ({ id: typeof it.id === "string" ? it.id : `item-${n}-${k}`, name: typeof it.name === "string" ? it.name : "", detail: typeof it.detail === "string" ? it.detail : null }))
        : [];
      return {
        key: typeof g.key === "string" ? g.key : `group-${n}`,
        label: typeof g.label === "string" ? g.label : "Affected",
        count: typeof g.count === "number" ? g.count : items.length,
        outcome: typeof g.outcome === "string" ? g.outcome : "",
        items,
      };
    });
  return {
    allowed: i.allowed !== false,
    automatic: i.automatic === true,
    holdReasons: strings(i.holdReasons),
    refusals: strings(i.refusals),
    affected: { total: typeof i.affected.total === "number" ? i.affected.total : groups.reduce((n, g) => n + g.count, 0), groups },
    money: { refundCents: typeof i.money.refundCents === "number" ? i.money.refundCents : 0, owedCents: typeof i.money.owedCents === "number" ? i.money.owedCents : 0 },
  };
}

/** GET /campaigns/{id}/cancel-impact */
export async function readCancelImpact(campaignId: string): Promise<ImpactRead> {
  const r = await call<ApiCampaignImpact>(`/campaigns/${id(campaignId)}/cancel-impact`, {}, "Couldn't read what cancelling affects");
  if (!r.ok) return r;
  const impact = impactOf(r);
  return impact ? { ok: true, impact } : { ok: false, message: "Couldn't read what cancelling affects — the answer wasn't in the expected shape." };
}

/** POST /campaigns/{id}/change-impact */
export async function readChangeImpact(campaignId: string, proposal: ChangeProposal): Promise<ImpactRead> {
  const r = await call<ApiCampaignImpact>(`/campaigns/${id(campaignId)}/change-impact`, post(proposal), "Couldn't read what the change affects");
  if (!r.ok) return r;
  const impact = impactOf(r);
  return impact ? { ok: true, impact } : { ok: false, message: "Couldn't read what the change affects — the answer wasn't in the expected shape." };
}

/** POST /campaigns/{id}/cancel { reason } */
export async function postCancel(campaignId: string, reasonText: string): Promise<ActResult> {
  return call<ApiCampaignActionResult>(`/campaigns/${id(campaignId)}/cancel`, post({ reason: reasonText }), "The campaign wasn't cancelled");
}

/** POST /campaigns/{id}/change { name?, startDate?, endDate?, budget?, reason? } */
export async function postChange(campaignId: string, proposal: ChangeProposal, reasonText?: string): Promise<ActResult> {
  const body = reasonText?.trim() ? { ...proposal, reason: reasonText.trim() } : proposal;
  return call<ApiCampaignActionResult>(`/campaigns/${id(campaignId)}/change`, post(body), "The changes weren't saved");
}

/** GET /campaign-requests — the held requests, BTG's queue. */
export async function readCampaignRequests(): Promise<RequestsRead> {
  const r = await call<{ requests?: ApiCampaignRequest[]; campaignRequests?: ApiCampaignRequest[] }>("/campaign-requests", {}, "Couldn't read the campaign requests");
  if (!r.ok) return r;
  const rows = r.requests ?? r.campaignRequests;
  if (!Array.isArray(rows)) return { ok: false, message: "Couldn't read the campaign requests — the answer wasn't in the expected shape." };
  /* The P8-BE-12 contract gives no row shape: accept `campaign: { id, name }`
     or flat `campaignId` / `campaignName`, and never let a row without a
     campaign crash the desk (QA 2026-10-29). */
  const requests = rows
    .filter((row): row is ApiCampaignRequest => Boolean(row && typeof row === "object" && typeof (row as { id?: unknown }).id === "string"))
    .map((row) => {
      const flat = row as ApiCampaignRequest & { campaignId?: string; campaignName?: string };
      const campaign = row.campaign && typeof row.campaign.id === "string"
        ? row.campaign
        : { id: flat.campaignId ?? "", name: flat.campaignName ?? "Campaign" };
      /* The row's impact goes through the same guard as the modal's: a half shape reads as "not sent". */
      return { ...row, campaign, impact: impactOf(row.impact) };
    });
  return { ok: true, requests };
}

/** POST /campaign-requests/{id}/decision { decision: "APPROVE" } | { decision: "DECLINE", note } */
export async function decideCampaignRequest(requestId: string, decision: "APPROVE" | "DECLINE", note?: string): Promise<DecisionResult> {
  const body = decision === "DECLINE" ? { decision, note: note?.trim() ?? "" } : { decision };
  return call<{ request?: ApiCampaignRequest }>(`/campaign-requests/${id(requestId)}/decision`, post(body), "The decision wasn't recorded");
}
