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
