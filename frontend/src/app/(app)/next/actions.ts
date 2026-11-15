"use server";

import { revalidatePath } from "next/cache";

import { apiFetch, fetchActor } from "@/server/api";
import { STUDENT_CATEGORIES, prospectOutcome, type ProspectOutcome } from "@/lib/students-live";

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
