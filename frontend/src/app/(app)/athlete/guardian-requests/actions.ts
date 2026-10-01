"use server";

import { revalidatePath } from "next/cache";

import { refusalMessage } from "@/lib/onboarding-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-10 / 2S1-BE-15 — the current guardian's answer to a handoff.

   POST /guardian-handoffs/:id/decision {decision: "HAND_OFF" | "DECLINE"}.
   Only the athlete's current guardian may answer (guardianHandoff write at
   `ward`); the API refuses anyone else, the athlete included. HAND_OFF
   switches the guardian in one transaction; DECLINE closes the request and
   the new guardian is pointed to BTG support. Errors come back as words.
   -------------------------------------------------------------------------- */

export type DecisionResult = { ok: true } | { ok: false; message: string };

export async function decideHandoffAction(id: string, decision: "HAND_OFF" | "DECLINE"): Promise<DecisionResult> {
  if (typeof id !== "string" || !id || (decision !== "HAND_OFF" && decision !== "DECLINE")) return { ok: false, message: "Unknown request." };
  let res: Response;
  try {
    res = await apiFetch(`/guardian-handoffs/${encodeURIComponent(id)}/decision`, { method: "POST", body: JSON.stringify({ decision }) });
  } catch (e) {
    return (e as Error)?.message === "Not signed in."
      ? { ok: false, message: "Your session ended — sign in again. Nothing has changed." }
      : { ok: false, message: "Couldn’t reach SponsorX just now. Nothing has changed — try again." };
  }
  if (res.ok) {
    revalidatePath("/athlete/guardian-requests");
    return { ok: true };
  }
  let said: string | undefined;
  try {
    said = refusalMessage(await res.json());
  } catch {
    /* no body */
  }
  if (res.status === 403) return { ok: false, message: "Only the athlete’s current guardian can answer this request." };
  return { ok: false, message: said ?? `Couldn’t send your answer (HTTP ${res.status}). Nothing has changed.` };
}
