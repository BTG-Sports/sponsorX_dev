"use server";

import { revalidatePath } from "next/cache";

import { editRefusal, pickPatch, withdrawNote, withdrawRefusal, WITHDRAW_BODY, type BriefPatch, type Refusal } from "@/lib/brief-actions";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-17 — the sponsor's writes on their own request (POL-BE-17):

     PATCH /briefs/:id                      only the fields that changed; a
                                            DRAFT is evaluated again (P4-BE-11)
     POST  /briefs/:id/transition           { to: "CLOSED", reason?: note }

   The API applies the matrix and the state table: 409 once BTG has moved
   the brief on, 403 for a read-only sponsor, 400/422 for a body it won't
   take. These add no authority; they turn the status into the sponsor's
   words (lib/brief-actions) and refresh the pages that showed the request.
   -------------------------------------------------------------------------- */

export type RequestWrite = { ok: true } | ({ ok: false } & Refusal);

const LIST = "/sponsor/requests";
const unreachable: Refusal = { message: "The API is unreachable — nothing was saved. Try again in a minute.", moved: false };

async function send(path: string, method: "PATCH" | "POST", body: unknown): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, { method, body: JSON.stringify(body) });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* no body */
    }
    return { res, body: parsed };
  } catch {
    return null;
  }
}

function refresh(id: string) {
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  /* The dashboard's open-request count, and the campaigns list that counts them. */
  revalidatePath("/sponsor");
  revalidatePath("/sponsor/campaigns");
}

export async function editRequestAction(id: string, input: BriefPatch): Promise<RequestWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown request.", moved: false };
  const patch = pickPatch(input);
  if (Object.keys(patch).length === 0) return { ok: true };
  const out = await send(`/briefs/${encodeURIComponent(id)}`, "PATCH", patch);
  if (!out) return { ok: false, ...unreachable };
  refresh(id);
  return out.res.ok ? { ok: true } : { ok: false, ...editRefusal(out.res.status) };
}

export async function withdrawRequestAction(id: string, input: { note?: string }): Promise<RequestWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown request.", moved: false };
  const reason = withdrawNote(input?.note);
  const out = await send(`/briefs/${encodeURIComponent(id)}/transition`, "POST", { ...WITHDRAW_BODY, ...(reason ? { reason } : {}) });
  if (!out) return { ok: false, ...unreachable };
  refresh(id);
  return out.res.ok ? { ok: true } : { ok: false, ...withdrawRefusal(out.res.status, out.body) };
}
