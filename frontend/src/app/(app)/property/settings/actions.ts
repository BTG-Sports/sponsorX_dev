"use server";

import type { CloseResult, WithdrawResult } from "@/components/account-close";
import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { closeOwnAccount, withdrawClosure } from "@/server/account";
import { openPayoutAccountLink } from "@/server/payouts";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the property Settings page's writes.

   POST /payouts/account/link {returnPath:"/property/settings"} → redirect
   to the provider's set-up / manage page. PROPERTY_MGR for their own
   property (payoutAccount own-property); the API applies the matrix.

   POST /me/close {account:"property"} (2S1-BE-13) → the public reactivation
   page. The property closed is the one this login manages; the API checks.
   POL-FE-11: a 202 (held for BTG — a live sale, or money earned with no
   payout account) comes back as words, and POST /me/close/withdraw takes
   it back.
   -------------------------------------------------------------------------- */

const HOME = "/property/settings";

export async function propertySettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}

export async function propertyCloseAccountAction(): Promise<CloseResult> {
  return closeOwnAccount("property");
}

export async function propertyWithdrawCloseAction(): Promise<WithdrawResult> {
  return withdrawClosure("property");
}
