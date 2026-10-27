"use server";

import { revalidatePath } from "next/cache";

import { PHOTO_UPLOAD, type PhotoContentType } from "@/lib/athlete-photo";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   The athlete's profile photo — P8-FE-10 (the API is P8-BE-08).

   Two steps, as every upload here: the API grants a public-bucket PUT pinned
   to the declared type and size, the browser sends the file straight to it
   (never through this server), then the API is told to use it and checks
   the file arrived. The athlete, a minor's guardian and BTG may all do this
   (athlete write); the API scopes the id, so these pass it through.

   Errors come back as values, never as a throw: a thrown action lands the
   user on the portal error boundary (QA pass 8, F-10). Only async
   functions are exported: a "use server" file exporting anything else
   fails every action in it at runtime.
   -------------------------------------------------------------------------- */

export type PhotoGrant = { ok: true; photoKey: string; uploadUrl: string } | { ok: false; message: string };
export type PhotoSaved = { ok: true; photoUrl: string | null } | { ok: false; message: string };

const SIGNED_OUT = "Your session ended — sign in again, then try. Nothing changed.";
const UNREACHABLE = "Couldn't reach SponsorX just now — nothing changed. Try again in a minute.";

async function call(path: string, init: RequestInit): Promise<Response | string> {
  try {
    return await apiFetch(path, init);
  } catch (e) {
    return (e as Error)?.message === "Not signed in." ? SIGNED_OUT : UNREACHABLE;
  }
}

/** The API's own words for a refusal (`{ error: { message } }`), else a plain line by status. */
async function refusal(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return SIGNED_OUT;
  if (res.status === 403 || res.status === 404) return "You can't change this athlete's photo.";
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const said = body?.error?.message;
  return typeof said === "string" && said ? said : fallback;
}

/** POST /athletes/{id}/photo — an upload grant for a JPEG, PNG or WebP of at most 5 MB. */
export async function requestPhotoUploadAction(athleteId: string, file: { contentType: PhotoContentType; bytes: number }): Promise<PhotoGrant> {
  if (
    typeof athleteId !== "string" ||
    !(PHOTO_UPLOAD.types as readonly string[]).includes(file?.contentType) ||
    !Number.isInteger(file?.bytes) ||
    file.bytes < 1 ||
    file.bytes > PHOTO_UPLOAD.maxBytes
  ) {
    return { ok: false, message: "Use a JPEG, PNG or WebP photo of at most 5 MB." };
  }
  const res = await call(`/athletes/${encodeURIComponent(athleteId)}/photo`, {
    method: "POST",
    body: JSON.stringify({ contentType: file.contentType, bytes: file.bytes }),
  });
  if (typeof res === "string") return { ok: false, message: res };
  if (!res.ok) return { ok: false, message: await refusal(res, `That photo can't be uploaded (HTTP ${res.status}). Nothing changed.`) };
  const d = (await res.json()) as { photoKey: string; uploadUrl: string };
  return { ok: true, photoKey: d.photoKey, uploadUrl: d.uploadUrl };
}

/** PUT /athletes/{id}/photo — use the uploaded photo, or clear it with null. */
export async function savePhotoAction(athleteId: string, photoKey: string | null): Promise<PhotoSaved> {
  if (typeof athleteId !== "string" || (photoKey !== null && typeof photoKey !== "string")) {
    return { ok: false, message: "That photo wasn't accepted. Choose it again." };
  }
  const res = await call(`/athletes/${encodeURIComponent(athleteId)}/photo`, { method: "PUT", body: JSON.stringify({ photoKey }) });
  if (typeof res === "string") return { ok: false, message: res };
  if (!res.ok) {
    const what = photoKey ? "The photo didn't save" : "The photo wasn't removed";
    return { ok: false, message: await refusal(res, `${what} (HTTP ${res.status}). Try again.`) };
  }
  const d = (await res.json()) as { photoUrl: string | null };
  /* The athlete's own pages, BTG's athlete page and the home page's panel. */
  revalidatePath("/athlete/profile");
  revalidatePath("/athlete/profile/edit");
  revalidatePath(`/admin/new-signups/athletes/${athleteId}`);
  revalidatePath("/");
  return { ok: true, photoUrl: d.photoUrl };
}
