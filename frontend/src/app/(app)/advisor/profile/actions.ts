"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { advisorRefusal, validateAdvisorMe, type AdvisorMeDraft, type ApiAdvisorProfile } from "@/lib/advisor-profile-live";

/* --------------------------------------------------------------------------
   POL-FE-103 — the advisor Profile page's one write of its own (POL-BE-103):

     PATCH /advisor/profile   the advisor's own name, job title and phone
                              (null clears one) — saved at once, audited

   The school's email domain and roster are changed through the actions the
   advisor home already has (../actions.ts: setEmailDomainAction,
   addRosterAction); the page mounts the same two controls.

   The API decides: an ADVISOR's own login, for the school it is linked to,
   403 otherwise. This adds no authority: it checks the shape, passes the
   call on and puts a refusal in plain words. The answer is the whole page
   again, so the screen never guesses what was saved.

   Only async functions are exported: anything else fails every action in a
   "use server" file at run time.
   -------------------------------------------------------------------------- */

export type AdvisorWrite = { ok: true; profile: ApiAdvisorProfile } | { ok: false; message: string; errors?: Record<string, string> };

export async function saveAdvisorMeAction(draft: AdvisorMeDraft): Promise<AdvisorWrite> {
  const d = draft as Partial<AdvisorMeDraft> | null;
  if (!d || typeof d.name !== "string" || typeof d.jobTitle !== "string" || typeof d.phone !== "string") {
    return { ok: false, message: "That wasn’t accepted. Reload the page and try again." };
  }
  const v = validateAdvisorMe({ name: d.name, jobTitle: d.jobTitle, phone: d.phone });
  if (!v.ok) return { ok: false, message: "Check the highlighted fields.", errors: v.errors };
  const fallback = "Your details weren’t saved";
  let res: Response;
  try {
    res = await apiFetch("/advisor/profile", { method: "PATCH", body: JSON.stringify(v.input) });
  } catch {
    return { ok: false, message: advisorRefusal(0, null, fallback) };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) return { ok: false, message: advisorRefusal(res.status, parsed, fallback) };
  revalidatePath("/advisor/profile");
  return { ok: true, profile: parsed as ApiAdvisorProfile };
}
