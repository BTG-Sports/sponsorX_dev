"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { REJECTION_REASONS } from "@/lib/prospects-live";

/* --------------------------------------------------------------------------
   P9-FE-11 — deciding a prospect the system held (POST /prospects/:id/decision,
   unchanged by P9-BE-21). The API's matrix (studentProspect.approve — BTG
   admins and Sales) and its rules decide; a refusal needs a reason, which
   the student is told, and never costs them sales credit.
   -------------------------------------------------------------------------- */

const CODES = REJECTION_REASONS.map(([code]) => code);

export async function decideProspectAction(
  prospectId: string,
  decision: "ACCEPT" | "REJECT",
  reasonCode?: string,
): Promise<{ ok: boolean; message: string }> {
  if (typeof prospectId !== "string" || !prospectId || (decision !== "ACCEPT" && decision !== "REJECT")) {
    return { ok: false, message: "That decision isn't offered here." };
  }
  if (decision === "REJECT" && (!reasonCode || !CODES.includes(reasonCode))) {
    return { ok: false, message: "Pick a reason — the student is told why." };
  }
  try {
    const res = await apiFetch(`/prospects/${encodeURIComponent(prospectId)}/decision`, {
      method: "POST",
      body: JSON.stringify(decision === "REJECT" ? { decision, reasonCode } : { decision }),
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
    revalidatePath("/admin/next/prospects");
    return { ok: true, message: decision === "ACCEPT" ? "Accepted — the student sees it in their prospects." : "Refused — the student is emailed the reason." };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
