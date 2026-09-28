"use server";

import { apiFetch } from "@/server/api";
import type { LiveApplicationState } from "@/lib/applications-ui";
import type {
  ReviewActionKind,
  ReviewActionResult,
} from "@/lib/applications-live";

/* --------------------------------------------------------------------------
   P3-FE-02 — the review decisions, as server actions.

   Server actions rather than browser fetches for the same reason as /join's
   submit: API_URL is server-side only. Identity rides with the call —
   apiFetch forwards the reviewer's own Clerk token, so the API's matrix
   (athleteApplication.approve: the three BTG roles) is what decides, not
   anything here. A server action is a public endpoint; it must add no
   authority of its own, and this one doesn't.

   Errors come back as VALUES, not throws: a 409 ("someone else decided this
   first") and a 422 ("notes are required") are answers for the drawer to
   show, not crashes. Only the transport failing is left to throw — the error
   boundary is the right place for an outage (the marketplace precedent,
   QA pass 4).
   -------------------------------------------------------------------------- */

/** Route map doubles as the whitelist: an unknown kind never reaches the API. */
const PATHS: Record<ReviewActionKind, string> = {
  begin: "begin-review",
  approve: "approve",
  changes: "request-changes",
  reject: "reject",
};

export async function reviewAction(
  id: string,
  kind: ReviewActionKind,
  notes?: string,
): Promise<ReviewActionResult> {
  const path = PATHS[kind];
  if (!path || typeof id !== "string" || !id) {
    return { ok: false, message: "Unknown review action." };
  }

  /* The API requires notes for changes/reject (they are sent to the athlete
     verbatim) and accepts them for approve. `begin` takes no body. */
  const trimmed = notes?.trim();
  const body =
    kind === "begin"
      ? undefined
      : JSON.stringify(trimmed ? { reviewerNotes: trimmed } : {});

  let response: Response;
  try {
    response = await apiFetch(`/applications/${encodeURIComponent(id)}/${path}`, {
      method: "POST",
      ...(body ? { body } : {}),
    });
  } catch {
    return {
      ok: false,
      message: "The API is unreachable — nothing was decided. Try again in a minute.",
    };
  }

  if (response.ok) {
    const d = (await response.json()) as { id: string; state: LiveApplicationState };
    return { ok: true, state: d.state };
  }

  /* The API can articulate its refusals — 409 illegal transition, 422 notes
     required, 403 not permitted — through the one error envelope. */
  let message = `The decision was not accepted (HTTP ${response.status}).`;
  try {
    const parsed = (await response.json()) as {
      error?: { message?: string; issues?: Array<{ path: string; message: string }> };
    };
    message =
      parsed.error?.issues?.[0]?.message ?? parsed.error?.message ?? message;
  } catch {
    /* Non-JSON error body — keep the status-line message. */
  }
  return { ok: false, message };
}
