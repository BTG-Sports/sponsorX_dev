"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { explainBriefRefusal, type BriefState } from "@/lib/briefs-live";

/* --------------------------------------------------------------------------
   P4-FE-07 — qualify, approve or close a brief, as a server action.

   The API decides: POST /briefs/:id/transition checks campaignBrief.approve
   (qualify, approve) or .write (close) and the §21 machine, and requires a
   reason when BTG staff close one. This adds no authority of its own; it
   forwards the reviewer's own Clerk token and turns refusals into copy.
   -------------------------------------------------------------------------- */

const MOVES: BriefState[] = ["QUALIFIED", "APPROVED", "CLOSED"];

export type BriefMoveResult = { ok: true; state: BriefState } | { ok: false; message: string };

export async function moveBriefAction(id: string, to: BriefState, reason?: string): Promise<BriefMoveResult> {
  if (typeof id !== "string" || !id || !MOVES.includes(to)) return { ok: false, message: "Unknown brief action." };
  const trimmed = reason?.trim();
  if (to === "CLOSED" && !trimmed) return { ok: false, message: "Say why this brief is being closed." };

  let res: Response;
  try {
    res = await apiFetch(`/briefs/${encodeURIComponent(id)}/transition`, {
      method: "POST",
      body: JSON.stringify(to === "CLOSED" ? { to, reason: trimmed } : { to }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing moved. Try again in a minute." };
  }

  if (res.ok) {
    const d = (await res.json()) as { state: BriefState };
    revalidatePath("/admin/briefs");
    revalidatePath("/admin/campaigns");
    revalidatePath("/admin");
    return { ok: true, state: d.state };
  }
  let message: string | undefined;
  try {
    message = ((await res.json()) as { error?: { message?: string } }).error?.message;
  } catch {
    /* no body */
  }
  if (res.status === 409) revalidatePath("/admin/briefs");
  return { ok: false, message: explainBriefRefusal(res.status, message) };
}
