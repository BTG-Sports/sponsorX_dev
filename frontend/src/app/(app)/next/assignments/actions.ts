"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { assignmentRefusal } from "@/lib/student-assignments-live";

/* --------------------------------------------------------------------------
   P9-FE-12 — the student's two writes on an assignment: presign the draft's
   file, then submit the draft (POST /student-assignments/:id/uploads,
   /submit). The API decides whose move it is — only the student themself,
   only before the advisor's review — nothing here adds authority.
   -------------------------------------------------------------------------- */

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const unreachable = { ok: false as const, message: "The API is unreachable — try again in a minute." };

async function refusal(res: Response): Promise<{ ok: false; message: string }> {
  let body: unknown = null;
  try { body = await res.json(); } catch { /* keep the status line */ }
  return { ok: false, message: assignmentRefusal(res.status, body) };
}

export async function presignDraftAction(id: string, contentType: string, bytes: number): Promise<Result<{ url: string; key: string }>> {
  if (typeof id !== "string" || !id) return { ok: false, message: "That assignment isn't offered here." };
  try {
    const res = await apiFetch(`/student-assignments/${encodeURIComponent(id)}/uploads`, { method: "POST", body: JSON.stringify({ contentType, bytes }) });
    if (!res.ok) return refusal(res);
    const g = (await res.json()) as { url: string; key: string };
    return { ok: true, url: g.url, key: g.key };
  } catch {
    return unreachable;
  }
}

export async function submitDraftAction(id: string, text: string, r2Key: string | null, keepFile = true): Promise<Result> {
  if (typeof id !== "string" || !id) return { ok: false, message: "That assignment isn't offered here." };
  try {
    const res = await apiFetch(`/student-assignments/${encodeURIComponent(id)}/submit`, {
      method: "POST",
      body: JSON.stringify({ text: typeof text === "string" ? text.slice(0, 40_000) : null, r2Key: r2Key || null, keepFile: keepFile !== false }),
    });
    if (!res.ok) return refusal(res);
    revalidatePath("/next/assignments");
    revalidatePath("/next");
    return { ok: true };
  } catch {
    return unreachable;
  }
}

/** A signed read of the draft's file — the student's own, or the advisor's school's. */
export async function draftFileAction(id: string): Promise<Result<{ url: string }>> {
  if (typeof id !== "string" || !id) return { ok: false, message: "That assignment isn't offered here." };
  try {
    const res = await apiFetch(`/student-assignments/${encodeURIComponent(id)}/file`);
    if (!res.ok) return refusal(res);
    return { ok: true, url: ((await res.json()) as { url: string }).url };
  } catch {
    return unreachable;
  }
}
