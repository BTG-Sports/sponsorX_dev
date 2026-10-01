"use server";

import type { CloseResult } from "@/components/account-close";
import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { closeOwnAccount } from "@/server/account";
import { openPayoutAccountLink } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the property Settings page's writes.

   POST /payouts/account/link {returnPath:"/property/settings"} → redirect
   to the provider's set-up / manage page. PROPERTY_MGR for their own
   property (payoutAccount own-property); the API applies the matrix.

   POST /me/close {account:"property"} (2S1-BE-13) → the public reactivation
   page. The property closed is the one this login manages; the API checks.
   -------------------------------------------------------------------------- */

const HOME = "/property/settings";

export async function propertySettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}

export async function propertyCloseAccountAction(): Promise<CloseResult> {
  return closeOwnAccount("property");
}
