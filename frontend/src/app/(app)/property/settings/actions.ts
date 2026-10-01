"use server";

import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { openPayoutAccountLink } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the property Settings page's one live write.

   POST /payouts/account/link {returnPath:"/property/settings"} → redirect
   to the provider's set-up / manage page. PROPERTY_MGR for their own
   property (payoutAccount own-property); the API applies the matrix.
   Closing the account is 2S1-BE-13 and has no action here.
   -------------------------------------------------------------------------- */

const HOME = "/property/settings";

export async function propertySettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}
