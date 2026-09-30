"use server";

import { redirect } from "next/navigation";

import { publicApi } from "@/app/(public)/onboarding/public-api";
import { safeReturnPath } from "@/lib/order-payment-live";

/* --------------------------------------------------------------------------
   2S5-FE-05 / 2S5-FE-03 — the stand-in payment provider's two buttons, as
   server actions (staging only; public, no login — the signed `t` token from
   the page's URL is the only key).

     account   POST /public/test-provider/account  { token, outcome: READY | NEEDS_INFO }
     checkout  POST /public/test-provider/checkout { token, outcome: SUCCEED | DECLINE }

   Each answers { returnPath } — a path on SponsorX — and the browser is sent
   back there, exactly as the real provider would. A refusal (400: the link is
   invalid or expired, or the stand-in is switched off) returns to the same
   page with ?e=… so it can say so; nothing is thrown at the visitor.
   -------------------------------------------------------------------------- */

const ACCOUNT_OUTCOMES = new Set(["READY", "NEEDS_INFO"]);
const CHECKOUT_OUTCOMES = new Set(["SUCCEED", "DECLINE"]);

async function answer(page: "account" | "checkout", formData: FormData, allowed: Set<string>): Promise<never> {
  const token = String(formData.get("token") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const back = (e: string) => `/test-provider/${page}?t=${encodeURIComponent(token)}&e=${e}`;
  if (!token || !allowed.has(outcome)) redirect(back("invalid"));

  let returnPath: string | null = null;
  let error = "down";
  try {
    const res = await publicApi(`/public/test-provider/${page}`, { method: "POST", body: JSON.stringify({ token, outcome }) });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { returnPath?: unknown } | null;
      returnPath = safeReturnPath(body?.returnPath);
    } else if (res.status === 400) {
      error = "invalid";
    }
  } catch {
    /* unreachable — "down" */
  }
  /* redirect() throws, so it stays outside the try. */
  redirect(returnPath ?? back(error));
}

export async function standinAccountAction(formData: FormData): Promise<void> {
  await answer("account", formData, ACCOUNT_OUTCOMES);
}

export async function standinCheckoutAction(formData: FormData): Promise<void> {
  await answer("checkout", formData, CHECKOUT_OUTCOMES);
}
