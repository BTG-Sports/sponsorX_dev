"use server";

import { revalidatePath } from "next/cache";

import { sendBackProblem, sendBackRefusal } from "@/lib/document-checks-live";
import { legalDecisions, decisionNeedsNote, refusalMessage, type OnboardingDecision, type OnboardingState } from "@/lib/onboarding-live";
import { explainStaffRefusal } from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-02 — BTG's decision on a property application, as a server action.
   POST /onboarding/:id/decision {decision, notes}. The API decides: the
   propertyOnboarding.approve scope, the §1 state machine (409 on an illegal
   move), notes for REQUEST_CHANGES / REJECT / SUSPEND (422), and — on the
   first APPROVE — creating the property and its manager login, refused 409
   when the primary contact's email already has an account. That refusal's
   words are returned as they are, so the reviewer sees exactly why.
   -------------------------------------------------------------------------- */

export type DecisionResult = { ok: true; state: OnboardingState } | { ok: false; message: string };

/* 2S1-FE-05 — Reject after approval and Reinstate (2S1-BE-06) go through the
   same route; `hadProperty` says whether the organisation was ever approved,
   which is what makes Reinstate available from REJECTED. */
export async function decideOnboardingAction(id: string, from: OnboardingState, decision: OnboardingDecision, notes: string, hadProperty = false): Promise<DecisionResult> {
  if (typeof id !== "string" || !id || !legalDecisions(from, hadProperty === true).includes(decision)) return { ok: false, message: "That decision isn't available for this application." };
  const trimmed = typeof notes === "string" ? notes.trim() : "";
  if (decisionNeedsNote(decision) && !trimmed) return { ok: false, message: "Write a note — the applicant is told why." };
  if (trimmed.length > 4000) return { ok: false, message: "Keep the note under 4,000 characters." };

  let res: Response;
  try {
    res = await apiFetch(`/onboarding/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, notes: trimmed || null }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was recorded. Try again in a minute." };
  }
  if (res.ok) {
    const d = (await res.json()) as { state: OnboardingState };
    revalidatePath("/admin/onboarding");
    revalidatePath(`/admin/onboarding/${id}`);
    revalidatePath("/admin/marketplace");
    revalidatePath("/admin/new-signups");
    return { ok: true, state: d.state };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { ok: false, message: explainStaffRefusal(res.status, refusalMessage(body)) };
}

export type ViewResult = { ok: true; url: string; expiresInSeconds: number } | { ok: false; message: string };

/**
 * 2S1-FE-05 — open one verification document: GET
 * /onboarding/:id/documents/:documentId answers a five-minute link into the
 * private bucket, and the API records the view against this reviewer.
 */
export async function viewOrgDocumentAction(id: string, documentId: string): Promise<ViewResult> {
  const ok = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);
  if (!ok(id) || !ok(documentId)) return { ok: false, message: "Unknown document." };
  let res: Response;
  try {
    res = await apiFetch(`/onboarding/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}`);
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
  if (res.ok) return { ok: true, ...((await res.json()) as { url: string; expiresInSeconds: number }) };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return { ok: false, message: explainStaffRefusal(res.status, refusalMessage(body)) };
}

export type SendBackResult = { ok: true } | { ok: false; message: string };

/**
 * P8-FE-11 / P8-BE-10 — send one of the organisation's documents back with a
 * reason: POST /onboarding/:id/documents/:documentId/send-back { reason }.
 * The document stops counting and its file is deleted; a PENDING_REVIEW
 * application goes back to the applicant (CHANGES_REQUESTED), an approved
 * organisation missing a required paper is flagged; the primary contact is
 * emailed the reason and where to upload.
 */
export async function sendBackOrgDocumentAction(id: string, documentId: string, reason: string): Promise<SendBackResult> {
  const ok = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);
  if (!ok(id) || !ok(documentId)) return { ok: false, message: "Unknown document." };
  const problem = sendBackProblem(typeof reason === "string" ? reason : "");
  if (problem) return { ok: false, message: problem };
  let res: Response;
  try {
    res = await apiFetch(`/onboarding/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/send-back`, {
      method: "POST",
      body: JSON.stringify({ reason: reason.trim() }),
    });
  } catch {
    return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${id}`);
  return res.ok ? { ok: true } : { ok: false, message: sendBackRefusal(res.status, body) };
}
