"use server";

import { revalidatePath } from "next/cache";

import { teamRefusal } from "@/lib/team-invite-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   2S2-FE-05 (athlete side) — answering a team's invitation and leaving a
   team, as server actions:

     POST /team-invitations/:id/respond  { decision: ACCEPT | DECLINE }
     POST /me/team/leave

   The API decides (teamInvitation: the athlete's own invitations only);
   these add no authority.
   -------------------------------------------------------------------------- */

export type TeamResult = { ok: true } | { ok: false; message: string };

const unreachable = "The API is unreachable — nothing changed. Try again in a minute.";

async function post(path: string, body?: unknown): Promise<TeamResult> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  } catch {
    return { ok: false, message: unreachable };
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* no body */
  }
  revalidatePath("/athlete/team");
  revalidatePath("/athlete");
  return res.ok ? { ok: true } : { ok: false, message: teamRefusal(res.status, json, "Nothing changed") };
}

export async function respondToTeamAction(invitationId: string, decision: "ACCEPT" | "DECLINE"): Promise<TeamResult> {
  if (typeof invitationId !== "string" || !invitationId) return { ok: false, message: "Unknown invitation." };
  if (decision !== "ACCEPT" && decision !== "DECLINE") return { ok: false, message: "Accept or decline." };
  return post(`/team-invitations/${encodeURIComponent(invitationId)}/respond`, { decision });
}

export async function leaveTeamAction(): Promise<TeamResult> {
  return post("/me/team/leave");
}
