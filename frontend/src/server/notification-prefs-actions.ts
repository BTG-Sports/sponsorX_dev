"use server";

import type { ApiPreference } from "@/lib/notification-prefs-live";
import { apiFetch } from "@/server/api";

/** POL-FE-75 — turn one kind of email on or off for the signed-in person (PUT /me/notification-preferences). */
export async function saveNotificationPrefAction(
  event: string,
  muted: boolean,
): Promise<{ ok: true; preferences: ApiPreference[] } | { ok: false; message: string }> {
  if (typeof event !== "string" || !event || typeof muted !== "boolean") return { ok: false, message: "That setting couldn't be read." };
  let res: Response;
  try {
    res = await apiFetch("/me/notification-preferences", { method: "PUT", body: JSON.stringify({ event, channel: "EMAIL", muted }) });
  } catch {
    return { ok: false, message: "SponsorX couldn't be reached. Nothing changed — try again in a minute." };
  }
  const body = (await res.json().catch(() => null)) as { preferences?: ApiPreference[]; error?: { message?: string } } | null;
  if (!res.ok || !body?.preferences) {
    return { ok: false, message: body?.error?.message ?? `SponsorX couldn't save that (HTTP ${res.status}). Nothing changed.` };
  }
  return { ok: true, preferences: body.preferences };
}
