"use server";

import type { CloseResult } from "@/components/account-close";
import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { closeOwnAccount } from "@/server/account";
import { openPayoutAccountLink } from "@/server/payouts";
import { fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the athlete Settings page's writes.

   POST /payouts/account/link {returnPath:"/athlete/settings"} → redirect to
   the provider's set-up / manage page. The athlete only (payoutAccount
   own); the API applies the matrix. A refusal (409 provider not connected)
   comes back as the API's message.

   POST /me/close (2S1-BE-13) → the public reactivation page. Which account
   closes is the login's own: the athlete's, or for a guardian-only login
   the guardian's. The API checks it again; nothing here can name another.
   -------------------------------------------------------------------------- */

const HOME = "/athlete/settings";

export async function athleteSettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}

export async function athleteCloseAccountAction(): Promise<CloseResult> {
  const who = await fetchActor();
  if (who.status !== "linked") return { ok: false, message: "Your session ended — sign in again, then close your account. Nothing has changed." };
  const guardianOnly = who.actor.roles.includes("GUARDIAN") && !who.actor.roles.includes("ATHLETE");
  return closeOwnAccount(guardianOnly ? "guardian" : "athlete");
}
