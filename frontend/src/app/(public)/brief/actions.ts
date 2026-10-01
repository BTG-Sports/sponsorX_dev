"use server";

import { headers } from "next/headers";
import type { BriefDraft } from "@/lib/brief-flow";
import { toInquiry } from "@/lib/brief-inquiry";
import { edgeHeadersFrom } from "@/server/edge";

/* --------------------------------------------------------------------------
   The public brief's submit path — P2-FE-01, §13 / §18 row 3.

   POST /public/inquiries: one Inquiry row and a queued Zoho Lead push in the
   same transaction (Zoho never on the request path). The inquiry contract is
   the Lead's shape — name, company, email, phone, message — so the brief's
   structured answers (goal, budget band, package, category, market,
   audience, timing, success) travel in `message`, labelled, for the BTG
   staff member who picks the Lead up. A server action, like /join's, because
   API_URL is server-side; the edge headers let the API rate-limit the
   visitor rather than the web server (P8-SEC-03).

   2S1-FE-11: the body also carries businessType / businessTypeOther, and the
   API answers with a requestToken — the key this browser uses to upload the
   proof of business and read the request's status (2S1-BE-17), and nothing
   else. It is handed back to the wizard to keep in the draft.
   -------------------------------------------------------------------------- */

const API_URL = process.env.API_URL ?? "http://localhost:4000";

export type BriefResult = { ok: true; id: string; requestToken: string } | { ok: false; message: string };

export async function submitBriefRequest(draft: BriefDraft): Promise<BriefResult> {
  /* A server action is a public endpoint: the argument is whatever the caller
     sent, not necessarily a BriefDraft. */
  if (!draft || typeof draft !== "object" || !draft.answers || typeof draft.answers !== "object") {
    return { ok: false, message: "Something in the form wasn't accepted — check your name and email and try again." };
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/public/inquiries`, {
      method: "POST",
      headers: { "content-type": "application/json", ...edgeHeadersFrom(await headers()) },
      body: JSON.stringify(toInquiry(draft)),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    /* A timeout is NOT "nothing was sent" (QA pass 9): the API may have
       committed the Inquiry and queued the Lead after we stopped waiting, and
       a prompt retry would file it twice. Only a refused connection is known
       not to have arrived. */
    if ((e as Error)?.name === "TimeoutError") {
      return {
        ok: false,
        message: "BTG is slow to answer, so we can't confirm your brief arrived — it may have. Please wait a few minutes before sending it again; your answers are saved on this device.",
      };
    }
    return {
      ok: false,
      message: "We couldn't reach BTG just now — nothing was sent. Your answers are saved on this device; try again in a minute.",
    };
  }
  if (res.status === 201) {
    const body = (await res.json()) as { id: string; requestToken: string };
    return { ok: true, id: body.id, requestToken: body.requestToken };
  }
  if (res.status === 429) {
    return { ok: false, message: "Too many requests from this connection in the last hour. Your answers are saved — try again later." };
  }
  if (res.status === 400) {
    return { ok: false, message: "Something in the form wasn't accepted — check your name, email and business type and try again." };
  }
  return { ok: false, message: `The request wasn't accepted (HTTP ${res.status}). Your answers are saved — try again.` };
}
