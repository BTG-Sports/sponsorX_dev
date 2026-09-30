"use server";

import { revalidatePath } from "next/cache";

import type { ApiPayout, PayoutWriteFailure } from "@/lib/payouts-live";
import { openPayoutAccountLink, payoutWrite } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S5-FE-02 / 2S5-FE-03 (team part) — the Earnings page's two writes.

   payoutAccountLinkAction   POST /payouts/account/link {returnPath} → the
                             provider's set-up / manage page (redirect).
   requestPayoutAction       POST /payouts — the whole requestable balance.
                             A 409 (not allowed yet) comes back as the API's
                             error.message; the page then refreshes.

   PROPERTY_MGR only; the API applies the matrix. Returning here does not
   change the account — the provider's confirmation does.
   -------------------------------------------------------------------------- */

const HOME = "/property/earnings";

export async function payoutAccountLinkAction(returnPath: string): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(returnPath, HOME);
}

export async function requestPayoutAction(): Promise<{ ok: true; count: number } | PayoutWriteFailure> {
  const r = await payoutWrite<{ payouts?: ApiPayout[] }>("/payouts");
  revalidatePath(HOME);
  return r.ok ? { ok: true, count: r.data?.payouts?.length ?? 0 } : r;
}
