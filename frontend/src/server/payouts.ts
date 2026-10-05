import "server-only";
import { redirect } from "next/navigation";

import { apiFetch } from "@/server/api";
import { UNREACHABLE, payoutRefusal, providerUrl, safeReturnPath, type PayoutWriteFailure } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   2S5-FE-02 / 2S5-FE-03 — the one write path the payee's payout server
   actions share (property Earnings, athlete home). It adds no authority: the
   signed-in user's Clerk token is forwarded and the API decides (payout /
   payoutAccount write — the athlete for themselves, PROPERTY_MGR for their
   property). A refusal comes back as the API's own message, and an
   unreachable API as "nothing changed", never as a thrown error.
   -------------------------------------------------------------------------- */

export type PayoutWriteResult<T> = { ok: true; data: T } | PayoutWriteFailure;

export async function payoutWrite<T>(path: string, body: unknown = {}): Promise<PayoutWriteResult<T>> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    return UNREACHABLE;
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (res.ok) return { ok: true, data: parsed as T };
  return payoutRefusal(res.status, parsed);
}

/** POST /payouts/account/link, then off to the provider's page. Returns only
 *  on a refusal (e.g. the 409 "Payout set-up opens once SponsorX's payment
 *  provider is connected…"); on success it redirects and never returns. */
export async function openPayoutAccountLink(returnPath: unknown, fallback: string): Promise<PayoutWriteFailure> {
  const r = await payoutWrite<{ url?: unknown }>("/payouts/account/link", { returnPath: safeReturnPath(returnPath, fallback) });
  if (!r.ok) return r;
  const url = providerUrl(r.data?.url);
  if (!url) return { ok: false, status: 502, message: "The payment provider didn't send a link back — nothing changed. Try again in a minute.", reasons: [] };
  redirect(url);
}
