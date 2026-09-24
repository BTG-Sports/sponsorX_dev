"use server";

/* --------------------------------------------------------------------------
   Submit a brief — P4-FE-01, §13 step 2, §17.

   The marketplace drawer's "Submit brief to BTG". A Server Function is
   reachable by a direct POST, not only from our UI, so it re-establishes who
   is asking every time (fetchActor → GET /me) and files the brief against
   THAT user's sponsor — never one the caller names. The API then applies the
   matrix again (campaignBrief.write, sponsor scope), so this is identity and
   plumbing, not the authorisation.

   A request, not a purchase: the brief lands in DRAFT and BTG qualifies,
   matches and prices it.
   -------------------------------------------------------------------------- */

import { apiFetch, fetchActor } from "@/server/api";
import { BriefRequestInvalid, toBriefBody, type BriefRequest } from "@/lib/brief-request";

export type BriefResult = { ok: true; id: string } | { ok: false; error: string };

export async function submitBrief(input: Omit<BriefRequest, "sponsorId">): Promise<BriefResult> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.sponsorId) {
    return { ok: false, error: "Sign in with your sponsor account to send a brief." };
  }

  let body;
  try {
    body = toBriefBody({ ...input, sponsorId: who.actor.sponsorId });
  } catch (e) {
    if (e instanceof BriefRequestInvalid) return { ok: false, error: e.message };
    throw e;
  }

  const res = await apiFetch("/briefs", { method: "POST", body: JSON.stringify(body) });
  if (res.status === 201) return { ok: true, id: ((await res.json()) as { id: string }).id };
  if (res.status === 403) return { ok: false, error: "This account can't file briefs for this sponsor." };
  if (res.status === 400) return { ok: false, error: "Some details weren't accepted — check the dates and budget." };
  return { ok: false, error: "BTG couldn't receive the brief just now — please try again." };
}
