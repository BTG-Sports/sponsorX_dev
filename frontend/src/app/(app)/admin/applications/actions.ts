"use server";

import { apiFetch } from "@/server/api";
import type { LiveApplicationState } from "@/lib/applications-ui";
import {
  explainRefusal,
  type ApiErrorBody,
  type ReviewActionKind,
  type ReviewActionResult,
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
  activate: "activate",
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
     verbatim) and accepts them for approve. `begin` and `activate` take no
     body. */
  const trimmed = notes?.trim();
  const body =
    kind === "begin" || kind === "activate"
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
     required or profile incomplete, 403 not permitted — through the one error
     envelope. explainRefusal turns them into product copy by `code`, and
     hands back the row's real state on a stale click (F-10). */
  let error: ApiErrorBody | undefined;
  try {
    error = ((await response.json()) as { error?: ApiErrorBody }).error;
  } catch {
    /* Non-JSON error body — explainRefusal falls back to the status line. */
  }
  const { message, state, missing } = explainRefusal(kind, response.status, error);
  return { ok: false, message, ...(state ? { state } : {}), ...(missing ? { missing } : {}) };
}
