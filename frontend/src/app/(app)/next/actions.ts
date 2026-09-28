"use server";

import { revalidatePath } from "next/cache";

import { apiFetch, fetchActor } from "@/server/api";
import { STUDENT_CATEGORIES } from "@/lib/students-live";

/* --------------------------------------------------------------------------
   P9-FE-01 — the student's one write: log a prospect for SponsorX's
   acceptance check (POST /students/:id/prospects, §5.6). It is always the
   signed-in student's own record — the id comes from /me, never the form —
   and the API refuses an inactive student or a category the programme
   doesn't sell.
   -------------------------------------------------------------------------- */

export async function submitProspectAction(input: { businessName: string; category: string }): Promise<{ ok: boolean; message: string }> {
  const businessName = typeof input?.businessName === "string" ? input.businessName.trim().slice(0, 200) : "";
  if (!businessName) return { ok: false, message: "Name the business." };
  if (!STUDENT_CATEGORIES.some(([c]) => c === input.category)) return { ok: false, message: "Pick what kind of business it is." };
  try {
    const who = await fetchActor();
    if (who.status !== "linked" || !who.actor.studentId) return { ok: false, message: "Sign in as a student to log a prospect." };
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
    revalidatePath("/next/sales");
    revalidatePath("/next");
    return { ok: true, message: `${businessName} is with SponsorX for the acceptance check.` };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
