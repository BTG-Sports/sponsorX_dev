"use server";

import { redirect } from "next/navigation";

import { publicApi } from "../onboarding/public-api";

/* --------------------------------------------------------------------------
   2S1-FE-08 / 2S1-BE-13 — the reactivation page's writes. Public: the
   person's login is closed, so the signed link from their email (the `t`
   token) is the only key. Plain form actions that redirect back to the page,
   which reads the outcome from the API — no client JS, and nothing is ever
   shown as done that the API didn't do. Every export of a "use server" file
   is a callable endpoint, so arguments are checked, not trusted.

     sendLinkAction      POST /public/account/reactivation-link  {email}
     reactivateAction    POST /public/account/reactivation/:t    {action: REACTIVATE}
     requestReviewAction POST /public/account/reactivation/:t    {action: REQUEST, note}
   -------------------------------------------------------------------------- */

const back = (token: string, error?: string) =>
  `/reactivate?t=${encodeURIComponent(token)}${error ? `&e=${encodeURIComponent(error)}` : ""}`;

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await publicApi(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    return null;
  }
}

/** The answer is the same whether or not an account uses the address. */
export async function sendLinkAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email || !email.includes("@")) redirect("/reactivate?e=email");
  const res = await post("/public/account/reactivation-link", { email });
  if (!res) redirect("/reactivate?e=unreachable");
  if (res.status === 429) redirect("/reactivate?e=busy");
  redirect("/reactivate?sent=1");
}

export async function reactivateAction(token: string): Promise<void> {
  if (typeof token !== "string" || !token) redirect("/reactivate?e=link");
  const res = await post(`/public/account/reactivation/${encodeURIComponent(token)}`, { action: "REACTIVATE" });
  if (!res) redirect(back(token, "unreachable"));
  if (res.status === 429) redirect(back(token, "busy"));
  if (!res.ok && res.status !== 410 && res.status !== 403) redirect(back(token, "failed"));
  redirect(back(token));
}

export async function requestReviewAction(token: string, formData: FormData): Promise<void> {
  if (typeof token !== "string" || !token) redirect("/reactivate?e=link");
  const note = String(formData.get("note") ?? "").trim().slice(0, 2000);
  const res = await post(`/public/account/reactivation/${encodeURIComponent(token)}`, { action: "REQUEST", ...(note ? { note } : {}) });
  if (!res) redirect(back(token, "unreachable"));
  if (res.status === 429) redirect(back(token, "busy"));
  if (!res.ok && res.status !== 410) redirect(back(token, "failed"));
  redirect(back(token));
}
