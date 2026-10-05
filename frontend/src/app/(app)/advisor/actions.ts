"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import type { ApiStudentState } from "@/lib/students-live";

/* --------------------------------------------------------------------------
   P9-FE-02 — the advisor's one write: move a student application on
   (POST /students/:id/transition). The matrix scopes it to the advisor's own
   school (student.approve = own-property) and the state machine decides the
   move; a minor is refused ACTIVE until a guardian is verified. Nothing here
   adds authority.
   -------------------------------------------------------------------------- */

const MOVES: ApiStudentState[] = ["UNDER_REVIEW", "APPROVED", "CHANGES_REQUESTED", "REJECTED", "ACTIVE", "SUSPENDED"];

export async function reviewStudentAction(
  studentId: string,
  to: ApiStudentState,
  note?: string,
): Promise<{ ok: boolean; message: string }> {
  if (typeof studentId !== "string" || !studentId || !MOVES.includes(to)) return { ok: false, message: "That decision isn't offered here." };
  const reviewerNotes = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : undefined;
  if ((to === "CHANGES_REQUESTED" || to === "REJECTED" || to === "SUSPENDED") && !reviewerNotes) {
    return { ok: false, message: "Say why — the student reads this note." };
  }
  try {
    const res = await apiFetch(`/students/${encodeURIComponent(studentId)}/transition`, {
      method: "POST",
      body: JSON.stringify({ to, ...(reviewerNotes ? { reviewerNotes } : {}) }),
    });
    if (!res.ok) {
      let message = `The decision was not saved (HTTP ${res.status}).`;
      try {
        const e = (await res.json()) as { error?: { message?: string } };
        if (e.error?.message) message = e.error.message;
      } catch {
        /* keep the status line */
      }
      return { ok: false, message };
    }
    revalidatePath("/advisor");
    return { ok: true, message: "Saved." };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}

/** P9-FE-11 — the school's email domain (PUT /properties/:id/email-domain).
 *  An adult applicant on the roster is approved automatically only with an
 *  email on it; the API refuses a public mail provider and says so. An empty
 *  field clears it — adults then always come to the advisor. */
export async function setEmailDomainAction(propertyId: string, domain: string): Promise<{ ok: boolean; message: string }> {
  if (typeof propertyId !== "string" || !propertyId || typeof domain !== "string") return { ok: false, message: "That isn't offered here." };
  const emailDomain = domain.trim().slice(0, 253) || null;
  try {
    const res = await apiFetch(`/properties/${encodeURIComponent(propertyId)}/email-domain`, {
      method: "PUT",
      body: JSON.stringify({ emailDomain }),
    });
    if (!res.ok) {
      let message = `Not saved (HTTP ${res.status}).`;
      try {
        const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message: string }> } };
        message = e.error?.issues?.[0]?.message ?? e.error?.message ?? message;
      } catch {
        /* keep the status line */
      }
      return { ok: false, message };
    }
    const saved = (await res.json()) as { emailDomain: string | null };
    revalidatePath("/advisor");
    return { ok: true, message: saved.emailDomain ? `Saved — ${saved.emailDomain}.` : "Cleared — adult applicants will come to you." };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}

/** P9-FE-08 — step two of a claim: the school confirms it (roster match
 *  required by the API) or rejects it. Verifying moves the profile into
 *  ordinary review — it never activates, and never represents. */
export async function decideClaimAction(claimId: string, decision: "verify" | "reject"): Promise<{ ok: boolean; message: string }> {
  if (typeof claimId !== "string" || !claimId || (decision !== "verify" && decision !== "reject")) {
    return { ok: false, message: "That decision isn't offered here." };
  }
  try {
    const res = await apiFetch(`/claims/${encodeURIComponent(claimId)}/${decision}`, { method: "POST" });
    if (!res.ok) {
      let message = `Not saved (HTTP ${res.status}).`;
      try {
        const e = (await res.json()) as { error?: { message?: string } };
        if (e.error?.message) message = e.error.message;
      } catch {
        /* keep the status line */
      }
      return { ok: false, message };
    }
    revalidatePath("/advisor");
    return {
      ok: true,
      message: decision === "verify" ? "Verified — the profile moves to review. A minor still needs a guardian's authorisation." : "Claim rejected.",
    };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
