"use server";

import { isRenewable } from "@/lib/link-expired";
import { publicApi } from "../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S8-FE-01 — "Send me a fresh link". POST /public/links/renew { kind, token }
   emails a fresh link to the address on file (2S8-PMO-02, owner decision 4).
   A server action because API_URL is server-side; the visitor's address is
   forwarded (public-api.ts) so the API's 10-an-hour limit counts them, not
   this server. The answer is only the status: the API never returns the
   fresh link (it is emailed), and 202 is the answer for a token that names
   nobody too — nothing here can be used to probe.
   -------------------------------------------------------------------------- */

export type RenewResult = { status: number };

export async function renewLinkAction(kind: string, token: string): Promise<RenewResult> {
  if (!isRenewable(kind)) return { status: 400 };
  if (typeof token !== "string" || token.length < 1 || token.length > 600) return { status: 400 };
  try {
    const res = await publicApi("/public/links/renew", { method: "POST", body: JSON.stringify({ kind, token }) });
    return { status: res.status };
  } catch {
    return { status: 0 };
  }
}
