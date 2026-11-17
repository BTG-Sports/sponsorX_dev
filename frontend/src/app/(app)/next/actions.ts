"use server";

import { revalidatePath } from "next/cache";

import { apiFetch, fetchActor } from "@/server/api";
import { STUDENT_CATEGORIES, displayNameProblem, prospectOutcome, type ProspectOutcome } from "@/lib/students-live";

/* --------------------------------------------------------------------------
   P9-FE-01 — the student's one write: log a prospect for SponsorX's
   acceptance check (POST /students/:id/prospects, §5.6). It is always the
   signed-in student's own record — the id comes from /me, never the form —
   and the API refuses an inactive student or a category the programme
   doesn't sell.

   POL-FE-49 — the API decides it at once (P9-BE-21) and answers
   `{ id, state }`; the result carries that state and the plain-English
   outcome (prospectOutcome) so the form can say where it landed.
   -------------------------------------------------------------------------- */

export type ProspectResult =
  | { ok: true; state: "SUBMITTED" | "ACCEPTED" | "REJECTED"; tone: ProspectOutcome["tone"]; message: string }
  | { ok: false; message: string };

export async function submitProspectAction(input: { businessName: string; category: string }): Promise<ProspectResult> {
  const businessName = typeof input?.businessName === "string" ? input.businessName.trim().slice(0, 200) : "";
  if (!businessName) return { ok: false, message: "Type the business's name." };
  if (!STUDENT_CATEGORIES.some(([c]) => c === input.category)) return { ok: false, message: "Pick what kind of business it is." };
  try {
    const who = await fetchActor();
    if (who.status !== "linked" || !who.actor.studentId) return { ok: false, message: "Only a signed-in student can log a business." };
    const res = await apiFetch(`/students/${encodeURIComponent(who.actor.studentId)}/prospects`, {
      method: "POST",
      body: JSON.stringify({ businessName, category: input.category }),
    });
    if (!res.ok) {
      let message = `Not logged (HTTP ${res.status}).`;
      try {
        const e = (await res.json()) as { error?: { message?: string } };
        if (e.error?.message) message = e.error.message;
      } catch {
        /* keep the status line */
      }
      return { ok: false, message };
    }
    let state: "SUBMITTED" | "ACCEPTED" | "REJECTED" = "SUBMITTED";
    try {
      const body = (await res.json()) as { state?: string };
      if (body.state === "ACCEPTED" || body.state === "REJECTED") state = body.state;
    } catch {
      /* logged, but no state in the answer: say it is waiting */
    }
    revalidatePath("/next/sales");
    revalidatePath("/next");
    return { ok: true, state, ...prospectOutcome(state, businessName) };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}

/* --------------------------------------------------------------------------
   POL-FE-101 — the student changes their display name (PATCH /students/me,
   POL-BE-101). The one field a student edits on their profile. The API
   resolves the record from the sign-in — nothing here names a student — and
   sends `displayName` alone; the API refuses any other key.
   -------------------------------------------------------------------------- */

export type DisplayNameResult = { ok: true; displayName: string } | { ok: false; message: string };

export async function updateDisplayNameAction(input: { displayName: string }): Promise<DisplayNameResult> {
  const raw = typeof input?.displayName === "string" ? input.displayName : "";
  const problem = displayNameProblem(raw);
  if (problem) return { ok: false, message: problem };
  const displayName = raw.replace(/\s+/g, " ").trim();
  try {
    const who = await fetchActor();
    if (who.status !== "linked" || !who.actor.roles.includes("STUDENT") || !who.actor.studentId) {
      return { ok: false, message: "Only a signed-in student can change their display name." };
    }
    const res = await apiFetch("/students/me", { method: "PATCH", body: JSON.stringify({ displayName }) });
    if (!res.ok) {
      let message = `Not saved (HTTP ${res.status}).`;
      try {
        const e = (await res.json()) as { error?: { message?: string; issues?: Array<{ message?: string }> } };
        message = e.error?.issues?.[0]?.message ?? e.error?.message ?? message;
      } catch {
        /* keep the status line */
      }
      return { ok: false, message };
    }
    const body = (await res.json().catch(() => null)) as { displayName?: string } | null;
    /* The name shows in the portal header and on every NEXT page. */
    revalidatePath("/next", "layout");
    return { ok: true, displayName: body?.displayName ?? displayName };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
