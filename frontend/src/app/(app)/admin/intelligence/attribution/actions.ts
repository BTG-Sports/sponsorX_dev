"use server";

import { revalidatePath } from "next/cache";

import { dismissError } from "@/lib/attribution-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S6-FE-01 — the attribution desk's one write: a BTG admin dismisses a
   queued partner sale, with a reason.

   POST /intelligence/attribution/unmatched/:saleId/dismiss   { reason }

   The API (3S6-BE-04) is the authority: it refuses a role that may not
   dismiss (403 — Sales and campaign managers), a sale that is not open (404
   attribution_not_found, including one the nightly retry matched meanwhile)
   and a reason outside 10..500 characters (422), and it records, marks and
   audits the dismissal. This adds none of that — it checks the reason is
   there and says the API's words back. The sale is never assigned to a
   campaign by hand: dismissing is the only thing a person does here.
   -------------------------------------------------------------------------- */

const PATH = "/admin/intelligence/attribution";

export type DismissResult = { ok: true } | { ok: false; message: string };

export async function dismissUnmatchedAction(saleId: string, reason: string): Promise<DismissResult> {
  if (!saleId) return { ok: false, message: "No sale." };
  const invalid = dismissError(typeof reason === "string" ? reason : "");
  if (invalid) return { ok: false, message: invalid };
  try {
    const res = await writeEngine("attribution", `/intelligence/attribution/unmatched/${encodeURIComponent(saleId)}/dismiss`, { reason: reason.trim() });
    if (!res.ok) return { ok: false, message: res.error };
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
