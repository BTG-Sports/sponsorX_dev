"use server";

import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { openPayoutAccountLink } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S5-FE-03 (athlete part) — the athlete home's payout-account banner.

   POST /payouts/account/link {returnPath:"/athlete"} → redirect to the
   provider's set-up page. The athlete only (payoutAccount own); a guardian
   login has no payee and never sees the button. A refusal (409 provider not
   connected) comes back as the API's message.
   -------------------------------------------------------------------------- */

export async function athletePayoutLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink("/athlete", "/athlete");
}
