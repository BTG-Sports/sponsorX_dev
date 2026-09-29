"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   The live editor's one write — P2-FE-01 (scope decision, 2026-09-29).

   PUT /athletes/:id/socials replaces the athlete's accounts (max 4). The API
   scopes it to the athlete's own row and labels an athlete's own numbers
   SELF_REPORTED whatever the body says, so nothing here can claim a verified
   count. Every other §11 section changes through BTG for now — there is no
   post-approval edit endpoint, and the page says so rather than pretending
   to save.
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
   P3-BE-16 — every other section: a change REQUEST, held for BTG.

   POST /athletes/:id/profile-changes records what differs from the profile
   and answers 201 PENDING; the profile itself moves only when BTG approves.
   The body is passed through as the section the editor built — the API's
   contract (ProfileChangeInput) validates it, and a 400 comes back as copy.
   -------------------------------------------------------------------------- */

export type ChangeBody = Record<string, unknown>;
export type ChangeResult = { ok: true; id: string } | { ok: false; message: string };

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
      ? { ok: false, message: "Your session ended — sign in again, then send. Nothing changed." }
      : { ok: false, message: "Couldn't reach SponsorX just now — nothing changed. Try again in a minute." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile/edit");
    revalidatePath("/athlete/profile");
    const d = (await res.json()) as { id: string };
    return { ok: true, id: d.id };
  }
  const err = await apiError(res);
  if (res.status === 400) return { ok: false, message: "Something here wasn't accepted — check the values and try again." };
  if (res.status === 401) return { ok: false, message: "Your session ended — sign in again, then send. Nothing changed." };
  if (res.status === 403) return { ok: false, message: "You can only change your own profile." };
  if (res.status === 409 || res.status === 422) return { ok: false, message: err.message ?? "This change can't be sent right now." };
  return { ok: false, message: `Couldn't send (HTTP ${res.status}). Nothing changed — try again.` };
}

export async function withdrawProfileChange(id: string): Promise<ChangeResult> {
  if (typeof id !== "string" || !id) return { ok: false, message: "Unknown change." };
  let res: Response;
  try {
    res = await apiFetch(`/profile-changes/${encodeURIComponent(id)}/withdraw`, { method: "POST" });
  } catch {
    return { ok: false, message: "Couldn't reach SponsorX just now — the change is still waiting." };
  }
  if (res.ok) {
    revalidatePath("/athlete/profile/edit");
    return { ok: true, id };
  }
  const err = await apiError(res);
  if (res.status === 409) return { ok: false, message: err.message ?? "BTG has already decided this one — reload to see it." };
  if (res.status === 403) return { ok: false, message: "That change isn't yours to withdraw." };
  return { ok: false, message: `Couldn't withdraw (HTTP ${res.status}). Try again.` };
}
