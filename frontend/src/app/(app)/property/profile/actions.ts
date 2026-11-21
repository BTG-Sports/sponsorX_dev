"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import {
  propertyRefusal, validateContact, validateDescription, validateIdentity, validateManager,
  type ApiPropertyProfile, type ContactDraft, type IdentityDraft, type ManagerDraft,
} from "@/lib/property-profile-live";

/* --------------------------------------------------------------------------
   POL-FE-104 — the property Profile page's writes (POL-BE-104), as server
   actions:

     PATCH /property/profile          the public description; the main contact's
                                      name and phone                       saved at once
     PATCH /property/profile/me       the manager's own name, job title, phone   saved at once
     POST  /property/profile/change   a new name, city, state and/or type details:
                                      in effect at once when every safety check
                                      passes, else it waits for BTG with the reasons

   The API decides: the PROPERTY_MGR of the caller's own property, 403
   otherwise. These add no authority: they check the shape, pass the call on
   and put a refusal in the manager's words. Every answer is the whole page
   again, so the screen never guesses what was saved.

   Only async functions are exported: anything else fails every action in a
   "use server" file at run time.
   -------------------------------------------------------------------------- */

export type ProfileWrite = { ok: true; profile: ApiPropertyProfile } | { ok: false; message: string; errors?: Record<string, string> };

const PAGE = "/property/profile";
const CHECK = "Check the highlighted fields.";
const BAD = "That wasn’t accepted. Reload the page and try again.";
const str = (v: unknown): v is string => typeof v === "string";

async function write(path: string, method: "PATCH" | "POST", body: unknown, fallback: string): Promise<ProfileWrite> {
  let res: Response;
  try {
    res = await apiFetch(path, { method, body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: propertyRefusal(0, null, fallback) };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) return { ok: false, message: propertyRefusal(res.status, parsed, fallback) };
  revalidatePath(PAGE);
  return { ok: true, profile: parsed as ApiPropertyProfile };
}

export async function saveDescriptionAction(description: string): Promise<ProfileWrite> {
  if (!str(description)) return { ok: false, message: BAD };
  const v = validateDescription(description);
  if (!v.ok) return { ok: false, message: CHECK, errors: v.errors };
  return write("/property/profile", "PATCH", v.input, "Your description wasn’t saved");
}

export async function saveContactAction(draft: ContactDraft): Promise<ProfileWrite> {
  const d = draft as Partial<ContactDraft> | null;
  if (!d || !str(d.name) || !str(d.phone)) return { ok: false, message: BAD };
  const v = validateContact({ name: d.name, phone: d.phone });
  if (!v.ok) return { ok: false, message: CHECK, errors: v.errors };
  return write("/property/profile", "PATCH", v.input, "The contact wasn’t saved");
}

export async function saveManagerAction(draft: ManagerDraft): Promise<ProfileWrite> {
  const d = draft as Partial<ManagerDraft> | null;
  if (!d || !str(d.name) || !str(d.jobTitle) || !str(d.phone)) return { ok: false, message: BAD };
  const v = validateManager({ name: d.name, jobTitle: d.jobTitle, phone: d.phone });
  if (!v.ok) return { ok: false, message: CHECK, errors: v.errors };
  return write("/property/profile/me", "PATCH", v.input, "Your details weren’t saved");
}

/**
 * A new name, place or type details. What is on file is read again here, so
 * only what really differs is sent, whatever the page showed; the API
 * compares with the record once more and runs every safety check.
 */
export async function requestIdentityChangeAction(draft: IdentityDraft): Promise<ProfileWrite> {
  const d = draft as Partial<IdentityDraft> | null;
  if (!d || !str(d.name) || !str(d.city) || !str(d.stateCode) || !d.details || typeof d.details !== "object" || Array.isArray(d.details)
    || !Object.values(d.details).every(str)) {
    return { ok: false, message: BAD };
  }
  const fallback = "Your change wasn’t sent";
  let current: ApiPropertyProfile["property"];
  try {
    const res = await apiFetch("/property/profile");
    if (!res.ok) return { ok: false, message: propertyRefusal(res.status, await res.json().catch(() => null), fallback) };
    current = ((await res.json()) as ApiPropertyProfile).property;
  } catch {
    return { ok: false, message: propertyRefusal(0, null, fallback) };
  }
  const v = validateIdentity(current, { name: d.name, city: d.city, stateCode: d.stateCode, details: d.details });
  if (!v.ok) return { ok: false, message: v.same ? (v.errors.name ?? CHECK) : CHECK, errors: v.same ? undefined : (v.errors as Record<string, string>) };
  return write("/property/profile/change", "POST", v.input, fallback);
}
