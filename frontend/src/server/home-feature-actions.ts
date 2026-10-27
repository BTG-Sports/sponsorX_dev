"use server";

import { revalidatePath } from "next/cache";

import type { HomeAction, HomeFeatureStatus } from "@/lib/home-feature";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   BTG's home-page controls — P8-FE-10: GET /athletes/{id}/home-page for the
   status, and POST with pin / unpin / remove / restore / approve / unapprove
   (P8-BE-08). The API allows BTG admin and the Network Manager only, and
   audits every change; it answers with the athlete's new status. The GET is
   an action too, for the applications desk's drawer (a client island), which
   is where the Network Manager meets an athlete.

   Errors come back as values, never as a throw (a thrown action lands on the
   portal error boundary). Only async functions are exported.
   -------------------------------------------------------------------------- */

export type HomeActionResult = { ok: true; status: HomeFeatureStatus } | { ok: false; message: string };

const ACTIONS: readonly HomeAction[] = ["pin", "unpin", "remove", "restore", "approve", "unapprove"];

/** GET /athletes/{id}/home-page — the status, or null when this role may not see it (or no read). */
export async function getHomeFeatureAction(athleteId: string): Promise<HomeFeatureStatus | null> {
  if (typeof athleteId !== "string" || !athleteId) return null;
  try {
    const res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/home-page`);
    return res.ok ? ((await res.json()) as HomeFeatureStatus) : null;
  } catch {
    return null;
  }
}

export async function setHomeFeatureAction(athleteId: string, action: HomeAction): Promise<HomeActionResult> {
  if (typeof athleteId !== "string" || !ACTIONS.includes(action)) return { ok: false, message: "That isn't a home-page action." };
  let res: Response;
  try {
    res = await apiFetch(`/athletes/${encodeURIComponent(athleteId)}/home-page`, { method: "POST", body: JSON.stringify({ action }) });
  } catch (e) {
    return {
      ok: false,
      message:
        (e as Error)?.message === "Not signed in."
          ? "Your session ended — sign in again, then try. Nothing changed."
          : "Couldn't reach SponsorX just now — nothing changed. Try again in a minute.",
    };
  }
  if (res.ok) {
    revalidatePath(`/admin/new-signups/athletes/${athleteId}`);
    revalidatePath("/admin/applications");
    revalidatePath("/");
    return { ok: true, status: (await res.json()) as HomeFeatureStatus };
  }
  if (res.status === 401) return { ok: false, message: "Your session ended — sign in again, then try. Nothing changed." };
  if (res.status === 403 || res.status === 404) return { ok: false, message: "Only BTG admin and the Network Manager can change the home page." };
  /* 409/422: the API says why (e.g. pinning a removed athlete). */
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const said = body?.error?.message;
  return { ok: false, message: typeof said === "string" && said ? said : `Couldn't change it (HTTP ${res.status}). Nothing changed.` };
}
