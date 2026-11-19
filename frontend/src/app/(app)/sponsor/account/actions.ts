"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import {
  accountRefusal, validateChange, validateCompany, validateLogoFile, validateMe,
  type ApiSponsorAccount, type ChangeDraft, type CompanyDraft, type MeDraft,
} from "@/lib/sponsor-account-live";

/* --------------------------------------------------------------------------
   POL-FE-102 — the sponsor Account page's writes (POL-BE-102), as server
   actions:

     PATCH /sponsor/account/company   website, address, billing contact, logoKey   saved at once
     PATCH /sponsor/account/me        the person's own name and job title          saved at once
     POST  /sponsor/account/logo      { contentType, bytes } → { logoKey, uploadUrl, logoUrl };
                                      the browser PUTs the picture straight to uploadUrl,
                                      then the key is saved with PATCH …/company
     POST  /sponsor/account/change    a new name and/or categories: in effect at once when
                                      every safety check passes, else it waits for BTG

   The API decides: SPONSOR_ADMIN of the caller's own sponsor, 403 otherwise
   (a Sponsor Viewer included). These add no authority: they check the shape,
   pass the call on and put a refusal in a sponsor's words. Every answer is
   the whole page again, so the screen never guesses what was saved.

   Only async functions are exported: anything else fails every action in a
   "use server" file at run time.
   -------------------------------------------------------------------------- */

export type AccountWrite = { ok: true; account: ApiSponsorAccount } | { ok: false; message: string; errors?: Record<string, string> };
export type LogoGrant = { ok: true; logoKey: string; uploadUrl: string } | { ok: false; message: string };

const PAGE = "/sponsor/account";

async function write(path: string, method: "PATCH" | "POST", body: unknown, fallback: string): Promise<AccountWrite> {
  let res: Response;
  try {
    res = await apiFetch(path, { method, body: JSON.stringify(body) });
  } catch {
    return { ok: false, message: accountRefusal(0, null, fallback) };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) return { ok: false, message: accountRefusal(res.status, parsed, fallback) };
  revalidatePath(PAGE);
  return { ok: true, account: parsed as ApiSponsorAccount };
}

const check = "Check the highlighted fields.";

export async function saveCompanyAction(draft: CompanyDraft): Promise<AccountWrite> {
  const v = validateCompany(draft);
  if (!v.ok) return { ok: false, message: check, errors: v.errors };
  return write("/sponsor/account/company", "PATCH", v.input, "Your company details weren’t saved");
}

export async function saveMeAction(draft: MeDraft): Promise<AccountWrite> {
  const v = validateMe(draft);
  if (!v.ok) return { ok: false, message: check, errors: v.errors };
  return write("/sponsor/account/me", "PATCH", v.input, "Your details weren’t saved");
}

/** `current` is what the page showed: only what differs from it is sent. The API compares with what is on file again. */
export async function requestChangeAction(current: { name: string; categories: string[] }, draft: ChangeDraft): Promise<AccountWrite> {
  const v = validateChange(current, draft);
  if (!v.ok) return { ok: false, message: v.same ? (v.errors.name ?? check) : check, errors: v.same ? undefined : v.errors };
  return write("/sponsor/account/change", "POST", v.input, "Your change wasn’t sent");
}

export async function requestLogoUploadAction(file: { type: string; size: number }): Promise<LogoGrant> {
  const v = validateLogoFile(file);
  if (!v.ok) return { ok: false, message: v.message };
  let res: Response;
  try {
    res = await apiFetch("/sponsor/account/logo", { method: "POST", body: JSON.stringify({ contentType: v.contentType, bytes: v.bytes }) });
  } catch {
    return { ok: false, message: accountRefusal(0, null, "The upload could not start") };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) return { ok: false, message: accountRefusal(res.status, parsed, "The upload could not start") };
  const g = parsed as { logoKey: string; uploadUrl: string };
  return { ok: true, logoKey: g.logoKey, uploadUrl: g.uploadUrl };
}

export async function saveLogoAction(logoKey: string): Promise<AccountWrite> {
  if (typeof logoKey !== "string" || !logoKey || logoKey.length > 300) return { ok: false, message: "That upload isn’t known. Pick the picture again." };
  return write("/sponsor/account/company", "PATCH", { logoKey }, "Your logo wasn’t saved");
}

export async function removeLogoAction(): Promise<AccountWrite> {
  return write("/sponsor/account/company", "PATCH", { logoKey: null }, "Your logo wasn’t removed");
}
