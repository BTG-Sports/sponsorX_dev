"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";
import { isTier, parseRateDollars, rateRefusal, savedRateLine, tierWords, validId } from "@/lib/athlete-rates-live";

/* --------------------------------------------------------------------------
   POL-FE-51 — the rate card editor's two writes, through the existing API:
     POST /athletes/{id}/rates  { jobId, amount }   (P3-BE-09; amount in CENTS)
     PUT  /athletes/{id}/tier   { tier }             (a rate needs a tier)
   The API decides who may (BTG admin, network manager), versions every rate,
   audits it, and answers the sponsor floor the rate implies. A refusal comes
   back as words for the editor to show; nothing here throws.
   -------------------------------------------------------------------------- */

export type RateSaveResult = { ok: true; message: string } | { ok: false; message: string };

const UNREACHABLE = "Can't reach SponsorX right now, so nothing was saved. Check your connection and try again.";

function refresh(athleteId: string) {
  revalidatePath(`/admin/athletes/${athleteId}/rates`);
  /* The Studio's rows read the card: a row that needed this rate is Add-able on its next render. */
  revalidatePath("/admin/campaigns/match");
}

/** `athleteName` and `jobName` are for the confirmation only; the write is by id. */
export async function saveAthleteRate(
  athleteId: string,
  jobId: string,
  amountDollars: string,
  words: { athleteName: string; jobName: string },
): Promise<RateSaveResult> {
  if (!validId(athleteId) || !validId(jobId)) return { ok: false, message: "No athlete or job was chosen." };
  const parsed = parseRateDollars(amountDollars);
  if (!parsed.ok) return parsed;
  let res: Response;
  try {
    res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/rates`, {
      method: "POST",
      body: JSON.stringify({ jobId, amount: parsed.cents }),
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  const body = (await res.json().catch(() => null)) as
    | { jobId: string; amount: number; version: number; impliedMinimumSellPrice: number }
    | null;
  if (!res.ok || !body) return { ok: false, message: rateRefusal(res.status, body, "rate") };
  refresh(athleteId);
  const name = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : fallback);
  return {
    ok: true,
    message: savedRateLine(
      { jobId: body.jobId, jobName: name(words?.jobName, ""), amount: body.amount, version: body.version, impliedMinimumSellPrice: body.impliedMinimumSellPrice },
      name(words?.athleteName, "The athlete"),
    ),
  };
}

export async function saveAthleteTier(athleteId: string, tier: string): Promise<RateSaveResult> {
  if (!validId(athleteId)) return { ok: false, message: "No athlete was chosen." };
  if (!isTier(tier)) return { ok: false, message: "Choose a tier: Emerging, Creator, Premium or Anchor." };
  let res: Response;
  try {
    res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/tier`, {
      method: "PUT",
      body: JSON.stringify({ tier }),
    });
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
  if (!res.ok) return { ok: false, message: rateRefusal(res.status, await res.json().catch(() => null), "tier") };
  refresh(athleteId);
  return { ok: true, message: `Saved. The tier is now ${tierWords(tier)}. Rates can be set.` };
}
