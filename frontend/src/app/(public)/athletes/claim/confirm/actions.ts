"use server";

import { redirect } from "next/navigation";

import { linkExpiredFrom } from "@/lib/link-expired";
import { refusalMessage } from "@/lib/onboarding-live";
import { publicApi } from "../../../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S8-FE-02 — "Confirm my email" on /athletes/claim/confirm. The POST the
   button makes (never the page's GET: a mail scanner opening the link
   confirms nothing). POST /public/athlete-claims/confirm-email {token}:
     200 { state: SUBMITTED | VERIFIED | REJECTED, slug | null } → the profile,
         ?claim=confirmed (REJECTED → closed); no slug → the home page
     410 link_expired (kind claim-email)      → the "send me a fresh link" notice
     400 bad link / 404 the claim is gone      → the page's invalid notice
     429                                        → its words
   The visitor's address is forwarded (public-api.ts) for the API's
   30-an-hour limit.
   -------------------------------------------------------------------------- */

export type ClaimConfirmOutcome =
  | { kind: "expired"; linkKind: string }
  | { kind: "invalid"; message?: string }
  | { kind: "limited" }
  | { kind: "failed"; status: number };

export async function confirmClaimAction(token: string): Promise<ClaimConfirmOutcome> {
  const t = typeof token === "string" ? token.trim() : "";
  if (!t || t.length > 600) return { kind: "invalid" };
  let res: Response;
  try {
    res = await publicApi("/public/athlete-claims/confirm-email", { method: "POST", body: JSON.stringify({ token: t }) });
  } catch {
    return { kind: "failed", status: 0 };
  }
  if (res.ok) {
    const c = (await res.json().catch(() => null)) as { state?: string; slug?: string | null } | null;
    if (!c?.slug) redirect("/?claim=invalid");
    redirect(`/athletes/${encodeURIComponent(c.slug)}?claim=${c.state === "REJECTED" ? "closed" : "confirmed"}`);
  }
  const body: unknown = await res.json().catch(() => null);
  const gone = linkExpiredFrom(res.status, body, "claim-email");
  if (gone) return { kind: "expired", linkKind: gone.kind };
  if (res.status === 400 || res.status === 404) return { kind: "invalid", message: res.status === 404 ? refusalMessage(body) : undefined };
  if (res.status === 429) return { kind: "limited" };
  return { kind: "failed", status: res.status };
}
