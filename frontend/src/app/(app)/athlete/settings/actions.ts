"use server";

import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { openPayoutAccountLink } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the athlete Settings page's one live write.

   POST /payouts/account/link {returnPath:"/athlete/settings"} → redirect to
   the provider's set-up / manage page. The athlete only (payoutAccount
   own); the API applies the matrix. A refusal (409 provider not connected)
   comes back as the API's message. Closing the account is 2S1-BE-13 and
   has no action here — its button is disabled.
   -------------------------------------------------------------------------- */

const HOME = "/athlete/settings";

export async function athleteSettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}
