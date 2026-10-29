"use server";

import { revalidatePath } from "next/cache";

import { declineNoteProblem } from "@/lib/campaign-change-live";
import { decideCampaignRequest, type DecisionResult } from "@/server/campaign-change";

/* --------------------------------------------------------------------------
   P8-FE-12 — BTG decides a held cancel or change request (P8-BE-12):
   POST /campaign-requests/{id}/decision { decision: "APPROVE" } or
   { decision: "DECLINE", note }. The API applies an approved request,
   emails the requester the answer, and audits. Until it lands, a 404 reads
   as "Not available yet".
   -------------------------------------------------------------------------- */

const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length < 200;

export async function decideCampaignRequestAction(requestId: string, decision: "APPROVE" | "DECLINE", note?: string): Promise<DecisionResult> {
  if (!validId(requestId)) return { ok: false, message: "No request." };
  if (decision !== "APPROVE" && decision !== "DECLINE") return { ok: false, message: "Unknown decision." };
  const text = typeof note === "string" ? note.trim() : "";
  if (decision === "DECLINE") {
    const problem = declineNoteProblem(text);
    if (problem) return { ok: false, message: problem };
  }
  const r = await decideCampaignRequest(requestId, decision, text || undefined);
  if (r.ok) {
    revalidatePath("/admin/campaign-requests");
    revalidatePath("/admin/campaigns");
    revalidatePath("/(app)/admin/campaigns/[id]", "page");
  }
  return r;
}
