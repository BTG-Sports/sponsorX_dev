"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   The live editor's one write — P2-FE-01 (scope decision, 2026-09-29).

   PUT /athletes/:id/socials replaces the athlete's accounts (max 4). The API
   scopes it to the athlete's own row and labels an athlete's own numbers
   SELF_REPORTED whatever the body says, so nothing here can claim a verified
   count.
   -------------------------------------------------------------------------- */

export type SocialInput = { platform: "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "X"; handle: string; followers?: number };

export type SaveResult = { ok: true } | { ok: false; message: string };

export async function saveSocials(athleteId: string, socials: SocialInput[]): Promise<SaveResult> {
  if (typeof athleteId !== "string" || !Array.isArray(socials)) {
    return { ok: false, message: "One of the accounts wasn't accepted — check each handle and follower count." };
  }
  const body = {
    socials: socials.map((s) => ({
      platform: s?.platform,
      handle: String(s?.handle ?? "").trim().replace(/^@/, ""),
      ...(typeof s?.followers === "number" && Number.isFinite(s.followers) ? { followers: Math.max(0, Math.round(s.followers)) } : {}),
    })),
  };
  /* Errors come back as values, never as a throw: a thrown action lands the
     athlete on the portal error boundary (QA pass 8, F-10). apiFetch throws
     "Not signed in." for an expired session, and fetch throws when the API
     can't be reached. */
  let res: Response;
  try {
    res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/socials`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  } catch (e) {
    return (e as Error)?.message === "Not signed in."
      ? { ok: false, message: "Your session ended — sign in again, then save. Nothing changed." }
      : { ok: false, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile");
    revalidatePath("/athlete");
    return { ok: true };
  }
  if (res.status === 400) return { ok: false, message: "One of the accounts wasn't accepted — check each handle and follower count." };
  if (res.status === 401) return { ok: false, message: "Your session ended — sign in again, then save. Nothing changed." };
  if (res.status === 403) return { ok: false, message: "You can only change your own accounts." };
  return { ok: false, message: `Couldn't save (HTTP ${res.status}). Nothing changed — try again.` };
}

/* --------------------------------------------------------------------------
   2S1-BE-14 / 2S1-FE-09 — every other section saves AT ONCE.

   POST /athletes/:id/profile-changes applies what differs and answers 201
   with the change records: APPROVED (live now) and, for a new legal name,
   one PENDING with `idUpload` — a presigned PUT for the matching ID, which
   the browser sends straight to the private bucket before
   confirmLegalNameIdAction tells the API it arrived. A sensitive edit (legal
   name, date of birth, guardian) re-runs the checks; their words come back
   in `checkNotes`. The body is passed through as the section the editor
   built — the API's contract (ProfileChangeInput) validates it, and a 400
   comes back as copy.
   -------------------------------------------------------------------------- */

export type ChangeBody = Record<string, unknown>;
export type ChangeResult =
  | { ok: true; id: string; checkNotes: string[]; idUpload: { changeId: string; uploadUrl: string; contentType: string } | null }
  | { ok: false; message: string };
export type SimpleResult = { ok: true } | { ok: false; message: string };

async function apiError(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    return ((await res.json()) as { error?: { code?: string; message?: string } }).error ?? {};
  } catch {
    return {};
  }
}

export async function submitProfileChange(athleteId: string, body: ChangeBody): Promise<ChangeResult> {
  if (typeof athleteId !== "string" || !athleteId || !body || typeof body !== "object") {
    return { ok: false, message: "Nothing to send — fill in the section first." };
  }
  let res: Response;
  try {
    res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/profile-changes`, { method: "POST", body: JSON.stringify(body) });
  } catch (e) {
    return (e as Error)?.message === "Not signed in."
      ? { ok: false, message: "Your session ended — sign in again, then save. Nothing changed." }
      : { ok: false, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile/edit");
    revalidatePath("/athlete/profile");
    const d = (await res.json()) as { id: string; checkNotes?: string[]; idUpload?: { changeId: string; uploadUrl: string; contentType: string } | null };
    return { ok: true, id: d.id, checkNotes: d.checkNotes ?? [], idUpload: d.idUpload ?? null };
  }
  const err = await apiError(res);
  if (res.status === 400) return { ok: false, message: "Something here wasn't accepted — check the values and try again." };
  if (res.status === 401) return { ok: false, message: "Your session ended — sign in again, then save. Nothing changed." };
  if (res.status === 403) return { ok: false, message: "You can only change your own profile." };
  if (res.status === 409 || res.status === 422) return { ok: false, message: err.message ?? "This change can't be saved right now." };
  return { ok: false, message: `Couldn't save (HTTP ${res.status}). Nothing changed — try again.` };
}

/** The matching ID for a new legal name has been uploaded: the API checks it is there, then the name goes live. */
export async function confirmLegalNameIdAction(changeId: string): Promise<SimpleResult> {
  if (typeof changeId !== "string" || !changeId) return { ok: false, message: "Unknown change." };
  let res: Response;
  try {
    res = await apiFetch(`/profile-changes/${encodeURIComponent(changeId)}/id-document/confirm`, { method: "POST" });
  } catch {
    return { ok: false, message: "Couldn't reach SponsorX just now. Use Check again in a moment." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile/edit");
    revalidatePath("/athlete/profile");
    return { ok: true };
  }
  const err = await apiError(res);
  return { ok: false, message: err.message ?? `Couldn't confirm the upload (HTTP ${res.status}).` };
}

export async function withdrawProfileChange(id: string): Promise<ChangeResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown change." };
  let res: Response;
  try {
    res = await apiFetch(`/profile-changes/${encodeURIComponent(id)}/withdraw`, { method: "POST" });
  } catch {
    return { ok: false, message: "Couldn't reach SponsorX just now — the new name is still waiting for its ID." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile/edit");
    return { ok: true, id, checkNotes: [], idUpload: null };
  }
  const err = await apiError(res);
  if (res.status === 409) return { ok: false, message: err.message ?? "This one is already live — reload to see it." };
  if (res.status === 403) return { ok: false, message: "That change isn't yours to withdraw." };
  return { ok: false, message: `Couldn't withdraw (HTTP ${res.status}). Try again.` };
}
