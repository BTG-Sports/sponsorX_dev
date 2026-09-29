"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   P3-BE-16 — the two decisions on a proposed profile edit, as server actions.

   Identity rides with the call (apiFetch forwards the reviewer's own token),
   so the API's matrix decides — athleteProfileChange.approve: SUPER_ADMIN,
   BTG_ADMIN, NETWORK_MGR — and this adds no authority of its own. Errors
   come back as values for the row to show; only the transport failing is an
   outage, and even that is a value here (the desk must not crash mid-queue).
   -------------------------------------------------------------------------- */

export type DecisionKind = "approve" | "decline";
export type DecisionResult = { ok: true; state: string } | { ok: false; message: string };

export async function decideChange(id: string, kind: DecisionKind, notes?: string): Promise<DecisionResult> {
  if ((kind !== "approve" && kind !== "decline") || typeof id !== "string" || !id) return { ok: false, message: "Unknown decision." };
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  if (kind === "decline" && !trimmed) return { ok: false, message: "Say why — the athlete is sent your notes." };

  let res: Response;
  try {
    res = await apiFetch(`/profile-changes/${encodeURIComponent(id)}/${kind}`, {
      method: "POST",
      body: JSON.stringify(trimmed ? { reviewerNotes: trimmed } : {}),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was decided. Try again in a minute." };
  }
  if (res.ok) {
    revalidatePath("/admin/profile-changes");
    const d = (await res.json()) as { state: string };
    return { ok: true, state: d.state };
  }
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code;
    message = body.error?.message;
  } catch {
    /* Non-JSON — fall through to the status line. */
  }
  if (res.status === 409 && code === "change_not_pending") return { ok: false, message: "Already decided — someone got there first. Reload to see it." };
  if (res.status === 409) return { ok: false, message: message ?? "This athlete's profile can't take changes right now." };
  if (res.status === 422) return { ok: false, message: message ?? "Reviewer notes are required to decline." };
  if (res.status === 403) return { ok: false, message: "Your role can't decide profile changes." };
  return { ok: false, message: `Couldn't decide (HTTP ${res.status}). Nothing changed — try again.` };
}
