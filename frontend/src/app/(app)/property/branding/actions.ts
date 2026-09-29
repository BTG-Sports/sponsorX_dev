"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/server/api";
import { apiErrorMessage, validateBranding, validateLogoFile, type ApiBranding, type BrandingDraft } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S7-FE-03 — the branding page's writes, as server actions.

     PUT  /branding        BrandingInput (displayName, logoKey, #RRGGBB
                           colours, reportFooter, customDomain)
     POST /branding/logo   { contentType, bytes } → { logoKey, uploadUrl,
                           logoUrl } — the browser PUTs the file straight to
                           uploadUrl (never through this server), then the
                           key is saved with PUT /branding { logoKey }.

   A PROPERTY_MGR may write only when its tenant is an operated one; a 403
   comes back as `forbidden`, which the page turns into the read-only view.
   -------------------------------------------------------------------------- */

export type BrandingResult =
  | { ok: true; branding: ApiBranding }
  | { ok: false; forbidden: boolean; message: string; errors?: Partial<Record<keyof BrandingDraft, string>> };

export type LogoGrant =
  | { ok: true; logoKey: string; uploadUrl: string; logoUrl: string }
  | { ok: false; forbidden: boolean; message: string };

const unreachable = "The API is unreachable — nothing was saved. Try again in a minute.";
const FORBIDDEN = "BTG manages branding for your organisation.";

async function refusal(res: Response, fallback: string): Promise<string> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no body */
  }
  return apiErrorMessage(body, res.status, fallback).message;
}

async function put(body: unknown): Promise<BrandingResult> {
  let res: Response;
  try {
    res = await apiFetch("/branding", { method: "PUT", body: JSON.stringify(body) });
  } catch {
    return { ok: false, forbidden: false, message: unreachable };
  }
  if (res.status === 403) return { ok: false, forbidden: true, message: FORBIDDEN };
  if (!res.ok) return { ok: false, forbidden: false, message: await refusal(res, "Branding was not saved") };
  /* The portal frame reads /branding in the layout. */
  revalidatePath("/property", "layout");
  return { ok: true, branding: (await res.json()) as ApiBranding };
}

export async function saveBrandingAction(draft: BrandingDraft): Promise<BrandingResult> {
  const v = validateBranding(draft);
  if (!v.ok) return { ok: false, forbidden: false, message: "Check the highlighted fields.", errors: v.errors };
  return put(v.input);
}

export async function requestLogoUploadAction(file: { type: string; size: number }): Promise<LogoGrant> {
  const v = validateLogoFile(file);
  if (!v.ok) return { ok: false, forbidden: false, message: v.message };
  let res: Response;
  try {
    res = await apiFetch("/branding/logo", { method: "POST", body: JSON.stringify({ contentType: v.contentType, bytes: v.bytes }) });
  } catch {
    return { ok: false, forbidden: false, message: unreachable };
  }
  if (res.status === 403) return { ok: false, forbidden: true, message: FORBIDDEN };
  if (!res.ok) return { ok: false, forbidden: false, message: await refusal(res, "The upload could not start") };
  const g = (await res.json()) as { logoKey: string; uploadUrl: string; logoUrl: string };
  return { ok: true, ...g };
}

/** After the browser's PUT to the bucket: point the branding at the new key. */
export async function saveLogoAction(logoKey: string): Promise<BrandingResult> {
  if (typeof logoKey !== "string" || !logoKey || logoKey.length > 300) return { ok: false, forbidden: false, message: "Unknown upload." };
  return put({ logoKey });
}

export async function removeLogoAction(): Promise<BrandingResult> {
  return put({ logoKey: null });
}
