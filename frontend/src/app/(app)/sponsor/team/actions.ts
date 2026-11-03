"use server";

import { revalidatePath } from "next/cache";

import { TEAM_ROLES, cleanEmail, emailProblem, teamRefusal, type ApiTeamMember, type TeamRole } from "@/lib/sponsor-team-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-19 — the Team page's writes (POL-BE-19), as server actions:

     POST  /sponsor/team              { email, role }  201  invite + email
     PATCH /sponsor/team/:id          { role }              admin ↔ viewer
     POST  /sponsor/team/:id/resend   202                   an unused invite again (3/hour)
     POST  /sponsor/team/:id/remove                         cancel an invite / switch a login off

   The API decides (SPONSOR_ADMIN of one sponsor; 403 otherwise; 422 for
   yourself; 409 an address with a login already, or a row in the wrong
   state; 429 past the hourly caps). These add no authority: they check
   the shape, pass the call through and put the refusal in a sponsor's
   words (lib/sponsor-team-live.ts teamRefusal). Every export is an async
   function — a const export 500s every action in the file.
   -------------------------------------------------------------------------- */

export type TeamWrite = { ok: true; member?: ApiTeamMember } | { ok: false; message: string };

const PAGE = "/sponsor/team";
const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";

async function call(path: string, method: "POST" | "PATCH", body?: unknown): Promise<{ res: Response; body: unknown } | null> {
  try {
    const res = await apiFetch(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* no body (a 202 may carry none) */
    }
    return { res, body: parsed };
  } catch {
    return null;
  }
}

function said(body: unknown): string | null {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string" && issue) return issue;
  return typeof e?.message === "string" ? e.message : null;
}

function memberOf(body: unknown): ApiTeamMember | undefined {
  const m = body as Partial<ApiTeamMember> | null;
  return m && typeof m.id === "string" && typeof m.email === "string" ? (m as ApiTeamMember) : undefined;
}

function isRole(r: unknown): r is TeamRole {
  return typeof r === "string" && (TEAM_ROLES as readonly string[]).includes(r);
}

function finish(out: { res: Response; body: unknown } | null): TeamWrite {
  if (!out) return { ok: false, message: unreachable };
  revalidatePath(PAGE);
  return out.res.ok ? { ok: true, member: memberOf(out.body) } : { ok: false, message: teamRefusal(out.res.status, said(out.body)) };
}

export async function inviteTeammateAction(input: { email: string; role: TeamRole }): Promise<TeamWrite> {
  const raw = typeof input?.email === "string" ? input.email : "";
  const problem = emailProblem(raw);
  if (problem) return { ok: false, message: problem };
  if (!isRole(input?.role)) return { ok: false, message: "Pick Admin or Viewer." };
  return finish(await call("/sponsor/team", "POST", { email: cleanEmail(raw), role: input.role }));
}

export async function setTeammateRoleAction(id: string, role: TeamRole): Promise<TeamWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown person." };
  if (!isRole(role)) return { ok: false, message: "Pick Admin or Viewer." };
  return finish(await call(`/sponsor/team/${encodeURIComponent(id)}`, "PATCH", { role }));
}

export async function resendInviteAction(id: string): Promise<TeamWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown person." };
  return finish(await call(`/sponsor/team/${encodeURIComponent(id)}/resend`, "POST"));
}

export async function removeTeammateAction(id: string): Promise<TeamWrite> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown person." };
  return finish(await call(`/sponsor/team/${encodeURIComponent(id)}/remove`, "POST"));
}
