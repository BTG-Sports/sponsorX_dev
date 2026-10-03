"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";
import { autoStaffingReasonProblem } from "@/lib/campaign-stage";
import type { DraftOrderInput, DraftOrderResult } from "@/lib/ops-live";

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
