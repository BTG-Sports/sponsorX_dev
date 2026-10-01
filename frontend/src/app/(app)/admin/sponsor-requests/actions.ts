"use server";

import { revalidatePath } from "next/cache";

import type { BrandCategory } from "@/lib/brand-categories";
import { requestRefusal, type RequestWriteFailure } from "@/lib/sponsor-requests-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-03 — BTG's decision on a sponsor request (BTG admin and Sales; the
   API applies the matrix, records the reviewer and sends the email):

     POST /sponsor-requests/:id/decision
       APPROVE {categories, linkSponsorId?, newSponsor?} — opens the account
       DECLINE {note}                                    — emails the note
   -------------------------------------------------------------------------- */

export type DecisionInput =
  | { decision: "APPROVE"; categories: BrandCategory[]; linkSponsorId?: string | null; newSponsor?: boolean }
  | { decision: "DECLINE"; note: string };

export async function decideSponsorRequestAction(id: string, input: DecisionInput): Promise<{ ok: true; state: string } | RequestWriteFailure> {
  let res: Response;
  try {
    res = await apiFetch(`/sponsor-requests/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify(input) });
  } catch {
    return { ok: false, status: 0, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  revalidatePath("/admin/sponsor-requests");
  revalidatePath(`/admin/sponsor-requests/${id}`);
  if (!res.ok) return requestRefusal(res.status, body);
  return { ok: true, state: String((body as { state?: unknown } | null)?.state ?? "") };
}
