"use server";

import type { CloseResult, WithdrawResult } from "@/components/account-close";
import type { PayoutWriteFailure } from "@/lib/payouts-live";
import { closeOwnAccount, withdrawClosure, type ClosingAccountKey } from "@/server/account";
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

   POL-FE-11: a 202 (held for BTG) comes back as words, not a redirect, and
   POST /me/close/withdraw takes it back. A guardian acting for a minor
   closes the minor's account with {account: "athlete"} — the ward header
   the portal already sends names which minor, and the API checks the
   guardian really acts for them (the same rule as accepting a deal).
   -------------------------------------------------------------------------- */

const HOME = "/athlete/settings";
const SESSION_ENDED = "Your session ended — sign in again, then try once more. Nothing has changed.";

/** The login's own account: the athlete's, or for a guardian-only login the guardian's. */
async function ownAccount(): Promise<ClosingAccountKey | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  const guardianOnly = who.actor.roles.includes("GUARDIAN") && !who.actor.roles.includes("ATHLETE");
  return guardianOnly ? "guardian" : "athlete";
}

/** The minor this guardian's login is acting for, or null when it isn't. */
async function actingForWard(): Promise<boolean> {
  const who = await fetchActor();
  return who.status === "linked" && who.actor.roles.includes("GUARDIAN") && Boolean(who.actor.actingFor);
}

export async function athleteSettingsLinkAction(): Promise<PayoutWriteFailure> {
  return openPayoutAccountLink(HOME, HOME);
}

export async function athleteCloseAccountAction(): Promise<CloseResult> {
  const account = await ownAccount();
  if (!account) return { ok: false, message: SESSION_ENDED };
  return closeOwnAccount(account);
}

export async function athleteWithdrawCloseAction(): Promise<WithdrawResult> {
  const account = await ownAccount();
  if (!account) return { ok: false, message: SESSION_ENDED };
  return withdrawClosure(account);
}

/** POL-FE-11 — the guardian closes the minor's account they are acting for. */
export async function wardCloseAccountAction(): Promise<CloseResult> {
  if (!(await actingForWard())) return { ok: false, message: "Pick which athlete you’re acting for first, then close their account from here." };
  return closeOwnAccount("athlete");
}

export async function wardWithdrawCloseAction(): Promise<WithdrawResult> {
  if (!(await actingForWard())) return { ok: false, message: "Pick which athlete you’re acting for first." };
  return withdrawClosure("athlete");
}
