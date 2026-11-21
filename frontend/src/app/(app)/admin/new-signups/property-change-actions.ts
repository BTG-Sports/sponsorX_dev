"use server";

import { revalidatePath } from "next/cache";

import { deskRefusal } from "@/lib/property-profile-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   POL-FE-104 — BTG answers an organisation's held change (POL-BE-104). A
   team, school or other organisation asked for a new name, city, state or
   type details, and a safety check held it for a person:

     POST /property-profile-changes/:id/approve            the change takes effect
                                                           (a new name goes to Zoho once)
     POST /property-profile-changes/:id/reject  { reason }  nothing changes; the
                                                           organisation reads the reason

   BTG staff read the list; only a BTG Admin decides (the API's 403 says so
   here in plain words). Two answers at once settle once: the second gets the
   API's "BTG has already answered this change." Every export of a
   "use server" file is a callable endpoint, so the arguments are checked,
   not trusted — and only async functions are exported.
   -------------------------------------------------------------------------- */

export type PropertyChangeWrite = { ok: true } | { ok: false; message: string };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const PATH = "/admin/new-signups";

async function post(path: string, body: unknown, fallback: string): Promise<PropertyChangeWrite> {
  let res: Response;
  try {
    res = await apiFetch(path, { method: "POST", body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: "The API is unreachable, so nothing changed. Try again in a minute." };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  /* Answered either way (by this click or by someone else's a moment ago): the list is re-read. */
  revalidatePath(PATH);
  return res.ok ? { ok: true } : { ok: false, message: deskRefusal(res.status, parsed, fallback) };
}

export async function approvePropertyChangeAction(changeId: string): Promise<PropertyChangeWrite> {
  if (typeof changeId !== "string" || !ID.test(changeId)) return { ok: false, message: "Unknown change." };
  return post(`/property-profile-changes/${encodeURIComponent(changeId)}/approve`, {}, "The change wasn’t approved");
}

export async function rejectPropertyChangeAction(changeId: string, reason: string): Promise<PropertyChangeWrite> {
  if (typeof changeId !== "string" || !ID.test(changeId)) return { ok: false, message: "Unknown change." };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) return { ok: false, message: "Say why, so the organisation knows what to do next." };
  if (why.length > 1000) return { ok: false, message: "Keep the reason under 1,000 characters." };
  return post(`/property-profile-changes/${encodeURIComponent(changeId)}/reject`, { reason: why }, "The change wasn’t rejected");
}
