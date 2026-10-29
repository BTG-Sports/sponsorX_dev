"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendBackProblem, sendBackRefusal } from "@/lib/document-checks-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S1-FE-09 — BTG opens the ID a legal-name change was matched against.

   GET /profile-changes/:id/id-document answers a five-minute presigned link
   to the private bucket, and the API audits the grant. The action asks for
   it at the moment of the click and sends the browser straight there, so
   the link is never rendered into a page where it could sit and be copied.
   -------------------------------------------------------------------------- */

export async function viewEditIdAction(changeId: string): Promise<void> {
  if (typeof changeId !== "string" || !changeId) redirect("/admin/new-signups?id=missing#sensitive-edits");
  const res = await apiFetch(`/profile-changes/${encodeURIComponent(changeId)}/id-document`);
  if (!res.ok) redirect(`/admin/new-signups?id=${res.status}#sensitive-edits`);
  const { url } = (await res.json()) as { url: unknown };
  /* 2S8-SEC-02: a presigned storage link is always absolute https (http only
     for the local MinIO); anything else is not followed. */
  const local = process.env.NODE_ENV !== "production";
  if (typeof url !== "string" || !(/^https:\/\//i.test(url) || (local && /^http:\/\//i.test(url)))) {
    redirect("/admin/new-signups?id=bad-link#sensitive-edits");
  }
  redirect(url);
}

/* --------------------------------------------------------------------------
   P8-FE-11 / P8-BE-11 — a held legal name. The ID arrived but didn't read
   clear (or couldn't be read), so the change stays PENDING for BTG.
   POL-FE-02 / POL-BE-02 — a minor's date of birth or move that would make
   them an adult is held the same way, with no ID: APPLY applies it and
   starts coming of age; DECLINE needs the note the athlete reads.

     POST /profile-changes/:id/decision          { decision: "APPLY" } | { decision: "DECLINE", note }
     POST /profile-changes/:id/id-document/send-back  { reason }   (P8-BE-10:
       the change is declined with the reason, the file deleted, and the
       athlete emailed to submit again with a clearer ID)

   Every export of a "use server" file is a callable endpoint, so the
   arguments are checked, not trusted.
   -------------------------------------------------------------------------- */

export type LegalNameWrite = { ok: true } | { ok: false; message: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PATH = "/admin/new-signups";

async function post(path: string, body: unknown): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
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

function refusal(status: number, body: unknown, fallback: string): string {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  if (status === 403) return "Your role can't decide sensitive edits here.";
  if (status >= 500) return "Something went wrong on our side — nothing changed. Try again in a minute.";
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}

/** Apply a held change (a legal name, or an adulthood change), or decline it with a note the athlete reads. */
export async function decideSensitiveEditAction(changeId: string, decision: "APPLY" | "DECLINE", note?: string): Promise<LegalNameWrite> {
  if (typeof changeId !== "string" || !ID.test(changeId)) return { ok: false, message: "Unknown change." };
  if (decision !== "APPLY" && decision !== "DECLINE") return { ok: false, message: "Choose apply or decline." };
  const text = typeof note === "string" ? note.trim() : "";
  if (decision === "DECLINE" && !text) return { ok: false, message: "Write a note — the athlete reads it." };
  const r = await post(`/profile-changes/${encodeURIComponent(changeId)}/decision`, decision === "DECLINE" ? { decision, note: text.slice(0, 1000) } : { decision });
  if (!r) return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  revalidatePath(PATH);
  return r.res.ok ? { ok: true } : { ok: false, message: refusal(r.res.status, r.body, "The decision wasn't saved") };
}

/** Send the ID back: the change is declined with the reason and the athlete submits again with a clearer ID. */
export async function sendBackLegalNameIdAction(changeId: string, reason: string): Promise<LegalNameWrite> {
  if (typeof changeId !== "string" || !ID.test(changeId)) return { ok: false, message: "Unknown change." };
  const problem = sendBackProblem(typeof reason === "string" ? reason : "");
  if (problem) return { ok: false, message: problem };
  const r = await post(`/profile-changes/${encodeURIComponent(changeId)}/id-document/send-back`, { reason: reason.trim() });
  if (!r) return { ok: false, message: "The API is unreachable — nothing changed. Try again in a minute." };
  revalidatePath(PATH);
  return r.res.ok ? { ok: true } : { ok: false, message: sendBackRefusal(r.res.status, r.body) };
}
