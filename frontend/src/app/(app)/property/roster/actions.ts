"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { apiErrorMessage, parseSharePercent, validateRosterDraft, type RosterDraft } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S2-FE-04 — the roster's two writes, as server actions.

     POST  /team/roster              add an athlete (RosterAthleteInput); 409
                                     when the email already has an account
     PATCH /team/roster/:athleteId   the team's share, { teamShareBps | null }

   The API decides (teamMember: PROPERTY_MGR, own property only); these add
   no authority. They re-validate what the form built and turn a refusal
   into the API's own sentence.
   -------------------------------------------------------------------------- */

export type RosterResult = { ok: true } | { ok: false; message: string; errors?: Partial<Record<keyof RosterDraft, string>> };

const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";

async function refusal(res: Response, fallback: string): Promise<string> {
  if (res.status === 403) return "Only your property's manager can change its roster.";
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return apiErrorMessage(body, res.status, fallback).message;
}

export async function addRosterAthleteAction(draft: RosterDraft): Promise<RosterResult> {
  const v = validateRosterDraft(draft);
  if (!v.ok) return { ok: false, message: "Check the highlighted fields.", errors: v.errors };
  let res: Response;
  try {
    res = await apiFetch("/team/roster", { method: "POST", body: JSON.stringify(v.input) });
  } catch {
    return { ok: false, message: unreachable };
  }
  if (!res.ok) return { ok: false, message: await refusal(res, "The athlete was not added") };
  revalidatePath("/property/roster");
  revalidatePath("/property");
  return { ok: true };
}

export async function setTeamShareAction(athleteId: string, percent: string): Promise<RosterResult> {
  if (typeof athleteId !== "string" || !athleteId) return { ok: false, message: "Unknown athlete." };
  const share = parseSharePercent(percent);
  if (!share.ok) return { ok: false, message: share.message };
  let res: Response;
  try {
    res = await apiFetch(`/team/roster/${encodeURIComponent(athleteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ teamShareBps: share.bps }),
    });
  } catch {
    return { ok: false, message: unreachable };
  }
  if (!res.ok) return { ok: false, message: await refusal(res, "The share was not saved") };
  revalidatePath("/property/roster");
  revalidatePath("/property");
  return { ok: true };
}
