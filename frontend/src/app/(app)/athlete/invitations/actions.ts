"use server";

import { apiFetch } from "@/server/api";
import type { InviteState } from "@/lib/fixtures";
import type { InviteActionResult } from "@/lib/invitations-live";

/* --------------------------------------------------------------------------
   P4-FE-04 — the athlete's answers to an invitation, as a server action.

   The P3-FE-02 precedent: API_URL is server-side only, apiFetch forwards the
   athlete's own Clerk token, and the API's own-scope check (whereFor
   invitation.write) is what stops anyone answering someone else's invite.
   This adds no authority — it whitelists the three moves an athlete makes
   and hands refusals back as values for the card to show.
   -------------------------------------------------------------------------- */

/** The athlete's three moves. EXPIRED is the sweep's, INVITED is BTG's. */
const MOVES: ReadonlySet<InviteState> = new Set(["VIEWED", "ACCEPTED", "DECLINED"]);

export async function respondToInvite(
  id: string,
  to: InviteState,
): Promise<InviteActionResult> {
  if (typeof id !== "string" || !id || !MOVES.has(to)) {
    return { ok: false, message: "Unknown invitation action." };
  }

  let response: Response;
  try {
    response = await apiFetch(`/invitations/${encodeURIComponent(id)}/respond`, {
      method: "POST",
      body: JSON.stringify({ to }),
    });
  } catch {
    return {
      ok: false,
      message: "The API is unreachable — nothing was recorded. Try again in a minute.",
    };
  }

  if (response.ok) {
    const d = (await response.json()) as { id: string; state: InviteState };
    return { ok: true, state: d.state };
  }

  /* 409 is the state machine talking (already answered, or expired under
     us); 403 is someone else's invitation. The API words both. */
  let message = `Your answer was not recorded (HTTP ${response.status}).`;
  try {
    const parsed = (await response.json()) as {
      error?: { message?: string; issues?: Array<{ message: string }> };
    };
    message = parsed.error?.issues?.[0]?.message ?? parsed.error?.message ?? message;
  } catch {
    /* Non-JSON error body — keep the status-line message. */
  }
  return { ok: false, message };
}
