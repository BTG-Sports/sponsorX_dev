import { redirect } from "next/navigation";

import type { CloseResult } from "@/components/account-close";
import { refusalMessage } from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-08 / 2S1-BE-13 — closing the signed-in account, shared by the
   athlete and property Settings actions.

   POST /me/close {confirm: true, account} closes the account this login is;
   the API finds it from the login, so nothing in the body can name someone
   else's. On success the login is already switched off, so the person goes
   to the public reactivation page, which says what happened and how to come
   back. A refusal comes back as words; nothing has changed.
   -------------------------------------------------------------------------- */

export async function closeOwnAccount(account: "athlete" | "guardian" | "property"): Promise<CloseResult> {
  let res: Response;
  try {
    res = await apiFetch("/me/close", { method: "POST", body: JSON.stringify({ confirm: true, account }) });
  } catch (e) {
    return (e as Error)?.message === "Not signed in."
      ? { ok: false, message: "Your session ended — sign in again, then close your account. Nothing has changed." }
      : { ok: false, message: "Couldn’t reach SponsorX just now. Nothing has changed — try again." };
  }
  if (res.ok) redirect("/reactivate?closed=1");
  let said: string | undefined;
  try {
    said = refusalMessage(await res.json());
  } catch {
    /* no body */
  }
  if (res.status === 403) return { ok: false, message: said ?? "This login can’t close that account." };
  if (res.status === 409) return { ok: false, message: said ?? "This account is already closed." };
  return { ok: false, message: `Couldn’t close the account (HTTP ${res.status}). Nothing has changed — try again.` };
}
