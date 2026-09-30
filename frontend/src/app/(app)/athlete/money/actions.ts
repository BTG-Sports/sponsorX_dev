"use server";

import { revalidatePath } from "next/cache";

import type { ApiPayout, PayoutWriteFailure } from "@/lib/payouts-live";
import { openPayoutAccountLink, payoutWrite } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S5-FE-03 — My money's two writes (the athlete only; the API applies the
   matrix):
     moneyAccountLinkAction   POST /payouts/account/link {returnPath} → the
                              provider's set-up / manage page (redirect).
     moneyRequestAction       POST /payouts — the whole requestable balance.
   -------------------------------------------------------------------------- */

const HOME = "/athlete/money";

export async function moneyAccountLinkAction(returnPath: string): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(returnPath, HOME);
}

export async function moneyRequestAction(): Promise<{ ok: true; count: number } | PayoutWriteFailure> {
  const r = await payoutWrite<{ payouts?: ApiPayout[] }>("/payouts");
  revalidatePath(HOME);
  return r.ok ? { ok: true, count: r.data?.payouts?.length ?? 0 } : r;
}
