"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { assignmentRefusal } from "@/lib/student-assignments-live";

/* --------------------------------------------------------------------------
   P9-FE-12 — the advisor's writes on student content: assign a piece,
   approve a draft, send it back with a note (POST /editions/:id/assignments,
   /student-assignments/:id/approve, /revision). The API scopes every one to
   the advisor's own school and decides whose move it is; nothing here adds
   authority.
   -------------------------------------------------------------------------- */

type Result = { ok: boolean; message: string };

const unreachable: Result = { ok: false, message: "The API is unreachable — try again in a minute." };

async function send(path: string, body?: unknown): Promise<Result & { status?: number }> {
  try {
    const res = await apiFetch(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!res.ok) {
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { /* keep the status line */ }
      return { ok: false, message: assignmentRefusal(res.status, parsed), status: res.status };
    }
    revalidatePath("/advisor/review");
    return { ok: true, message: "Saved." };
  } catch {
    return unreachable;
  }
}

const valid = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length < 100;

export async function approveAssignmentAction(id: string): Promise<Result> {
  if (!valid(id)) return { ok: false, message: "That piece isn't offered here." };
  const r = await send(`/student-assignments/${encodeURIComponent(id)}/approve`);
  return r.ok ? { ok: true, message: "Approved — it's in the edition." } : r;
}

export async function reviseAssignmentAction(id: string, note: string): Promise<Result> {
  if (!valid(id)) return { ok: false, message: "That piece isn't offered here." };
  const text = typeof note === "string" ? note.trim().slice(0, 2000) : "";
  if (!text) return { ok: false, message: "Tell the student what to change — they read this word for word." };
  const r = await send(`/student-assignments/${encodeURIComponent(id)}/revision`, { note: text });
  return r.ok ? { ok: true, message: "Sent back to the student." } : r;
}

export async function createAssignmentAction(input: {
  editionId: string; studentId: string; kind: string; title: string; section?: string; brief: string; dueAt?: string;
}): Promise<Result> {
  if (!valid(input?.editionId) || !valid(input?.studentId)) return { ok: false, message: "Pick the edition and the student." };
  const body = {
    studentId: input.studentId,
    kind: input.kind,
    title: String(input.title ?? "").slice(0, 200),
    section: input.section ? String(input.section).slice(0, 80) : null,
    brief: String(input.brief ?? "").slice(0, 4000),
    dueAt: input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? input.dueAt : null,
  };
  const r = await send(`/editions/${encodeURIComponent(input.editionId)}/assignments`, body);
  return r.ok ? { ok: true, message: "Assigned — it's on the student's Assignments now." } : r;
}
