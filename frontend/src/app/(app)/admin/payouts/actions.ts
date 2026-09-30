"use server";

import { revalidatePath } from "next/cache";

import type { ApiPayout, PayoutWriteFailure } from "@/lib/payouts-live";
import { payoutWrite } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S5-FE-04 — BTG's payout decisions (BTG admin, Finance; the API applies
   the matrix and records the reviewer in the audit log):
     decidePayoutAction   POST /payouts/:id/decision {APPROVE | REJECT, note}
                          — REJECT (send back) needs the note the payee reads.
     retryPayoutAction    POST /payouts/:id/retry — a payout the provider
                          couldn't send goes back to the provider.
   -------------------------------------------------------------------------- */

export async function decidePayoutAction(
  id: string,
  decision: "APPROVE" | "REJECT",
  note: string | null,
): Promise<{ ok: true; state: string } | PayoutWriteFailure> {
  const r = await payoutWrite<ApiPayout>(`/payouts/${encodeURIComponent(id)}/decision`, { decision, note });
  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${id}`);
  return r.ok ? { ok: true, state: r.data.state } : r;
}

export async function retryPayoutAction(id: string): Promise<{ ok: true; state: string } | PayoutWriteFailure> {
  const r = await payoutWrite<ApiPayout>(`/payouts/${encodeURIComponent(id)}/retry`);
  revalidatePath("/admin/payouts");
  revalidatePath(`/admin/payouts/${id}`);
  return r.ok ? { ok: true, state: r.data.state } : r;
}
