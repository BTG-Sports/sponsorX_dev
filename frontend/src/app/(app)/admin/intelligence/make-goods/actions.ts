"use server";

import { revalidatePath } from "next/cache";

import { approvalError } from "@/lib/makegood-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S5-FE-01 — the make-good centre's one write: a manager approves a
   substitute, with a note.

   POST /intelligence/make-goods/:shortfallId/approve   { optionId, note }

   The API (3S5-BE-02) is the authority: it refuses an option failing a
   check, a shortfall already decided, and a role that may not approve, and
   it records, audits and reflects the approval in the campaign. This adds
   none of that — it only checks the note is there and says the API's words
   back. Until the engine is mounted, writeEngine answers "isn't live yet".
   -------------------------------------------------------------------------- */

export type ApproveResult = { ok: true } | { ok: false; message: string };

export async function approveMakeGoodAction(shortfallId: string, input: { optionId: string; note: string }): Promise<ApproveResult> {
  if (!shortfallId) return { ok: false, message: "No shortfall." };
  const invalid = approvalError({ optionId: input?.optionId ?? "", note: input?.note ?? "" });
  if (invalid) return { ok: false, message: invalid };
  try {
    const res = await writeEngine("makegood", `/intelligence/make-goods/${encodeURIComponent(shortfallId)}/approve`, {
      optionId: input.optionId,
      note: input.note.trim(),
    });
    if (!res.ok) return { ok: false, message: res.error };
    revalidatePath("/admin/intelligence/make-goods");
    revalidatePath("/admin/intelligence/forecasts", "layout");
    return { ok: true };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
