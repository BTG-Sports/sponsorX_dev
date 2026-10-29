"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";
import { autoStaffingReasonProblem } from "@/lib/campaign-stage";
import type { DraftOrderInput, DraftOrderResult } from "@/lib/ops-live";
import { proposalOf, validCampaignId as validId, type ChangeProposal } from "@/lib/campaign-change-live";
import { postCancel, postChange, readCancelImpact, readChangeImpact, type ActResult, type ImpactRead } from "@/server/campaign-change";

/* --------------------------------------------------------------------------
   P8-FE-12 — Cancel and Change a campaign (P8-BE-12), from BTG's campaign
   page. The same rules as the sponsor's admin: the impact first, then
   applied at once or held for BTG with the reasons. The API's matrix
   decides who may (BTG admin, campaign manager), audits, and emails. Until
   the API lands, a 404 reads as "Not available yet".
   -------------------------------------------------------------------------- */

function refreshCampaign(campaignId: string) {
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/campaigns");
  revalidatePath("/admin/campaign-requests");
}

/** GET /campaigns/{id}/cancel-impact — what cancelling would affect. */
export async function adminCancelImpact(campaignId: string): Promise<ImpactRead> {
  if (!validId(campaignId)) return { ok: false, message: "No campaign." };
  return readCancelImpact(campaignId);
}

/** POST /campaigns/{id}/change-impact — what the proposed change would affect. */
export async function adminChangeImpact(campaignId: string, proposal: ChangeProposal): Promise<ImpactRead> {
  if (!validId(campaignId)) return { ok: false, message: "No campaign." };
  const p = proposalOf(proposal);
  if (!p) return { ok: false, message: "Nothing has changed yet." };
  return readChangeImpact(campaignId, p);
}

/** POST /campaigns/{id}/cancel { reason } */
export async function adminCancelCampaign(campaignId: string, reason: string): Promise<ActResult> {
  if (!validId(campaignId)) return { ok: false, message: "No campaign." };
  const text = typeof reason === "string" ? reason.trim() : "";
  if (!text) return { ok: false, message: "Write a reason first." };
  const r = await postCancel(campaignId, text);
  if (r.ok) refreshCampaign(campaignId);
  return r;
}

/** POST /campaigns/{id}/change { name?, startDate?, endDate?, budget?, reason? } */
export async function adminChangeCampaign(campaignId: string, proposal: ChangeProposal, reason: string): Promise<ActResult> {
  if (!validId(campaignId)) return { ok: false, message: "No campaign." };
  const p = proposalOf(proposal);
  if (!p) return { ok: false, message: "Nothing has changed yet." };
  const r = await postChange(campaignId, p, typeof reason === "string" ? reason : undefined);
  if (r.ok) refreshCampaign(campaignId);
  return r;
}

/**
 * P4-FE-09 — BTG turns a campaign's automatic staffing off or on, with a
 * reason (POST /campaigns/{id}/auto-staffing, P4-BE-12). On, the system
 * carries on at once; either way any stop is cleared.
 */
export async function setAutoStaffingAction(
  campaignId: string,
  on: boolean,
  why: string,
): Promise<{ ok: true; sent: number } | { ok: false; message: string }> {
  if (typeof campaignId !== "string" || !campaignId) return { ok: false, message: "No campaign." };
  const text = typeof why === "string" ? why.trim() : "";
  const problem = autoStaffingReasonProblem(text);
  if (problem) return { ok: false, message: problem };
  let res: Response;
  try {
    res = await apiFetch(`/campaigns/${encodeURIComponent(campaignId)}/auto-staffing`, {
      method: "POST",
      body: JSON.stringify({ on: on === true, reason: text }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  revalidatePath(`/admin/campaigns/${campaignId}`);
  revalidatePath("/admin/campaigns");
  if (!res.ok) return { ok: false, message: await reason(res, `Automatic staffing wasn't changed (HTTP ${res.status}).`) };
  const body = (await res.json().catch(() => null)) as { sent?: number } | null;
  return { ok: true, sent: typeof body?.sent === "number" ? body.sent : 0 };
}

/* --------------------------------------------------------------------------
   P5-FE-05 — BTG drafts and sends a Campaign Order from the operations board.

   The step between "the athlete accepted the invitation" and "the athlete
   signs the order" (§13 step 5, §24) had an endpoint and no screen. Two API
   calls: POST /campaigns/{id}/orders (DRAFT, terms frozen, refused below the
   1.4× floor — P3-BE-12) then POST /orders/{id}/transition → SENT. If the
   draft lands but the send fails, the order id comes back so the retry
   sends that draft instead of creating a second one.
   -------------------------------------------------------------------------- */

async function reason(res: Response, fallback: string): Promise<string> {
  try {
    const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
    return e.error?.issues?.[0]?.message ?? e.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function draftAndSendOrder(
  campaignId: string,
  input: DraftOrderInput,
  existingOrderId?: string,
): Promise<DraftOrderResult> {
  if (typeof campaignId !== "string" || !campaignId) return { ok: false, message: "No campaign." };

  let orderId = existingOrderId;
  try {
    if (!orderId) {
      const made = await apiFetch(`/campaigns/${encodeURIComponent(campaignId)}/orders`, {
        method: "POST",
        body: JSON.stringify({ ...input, exclusivity: input.exclusivity?.trim() || null }),
      });
      if (!made.ok) return { ok: false, message: await reason(made, `The order was not created (HTTP ${made.status}).`) };
      orderId = ((await made.json()) as { id: string }).id;
    }
    const sent = await apiFetch(`/orders/${encodeURIComponent(orderId)}/transition`, {
      method: "POST",
      body: JSON.stringify({ to: "SENT" }),
    });
    if (!sent.ok) {
      return {
        ok: false,
        orderId,
        message: `Drafted, but not sent: ${await reason(sent, `HTTP ${sent.status}`)}`,
      };
    }
  } catch {
    return {
      ok: false,
      ...(orderId ? { orderId } : {}),
      message: "The API is unreachable — try again in a minute.",
    };
  }
  return { ok: true, orderId };
}
