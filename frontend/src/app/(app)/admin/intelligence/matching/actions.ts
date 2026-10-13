"use server";

import { revalidatePath } from "next/cache";

import { EXPLORER_PATH, type ApiShortlist } from "@/lib/match-explorer-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S3-FE-01 — the match explorer's one write: save the brief's shortlist.

   POST /intelligence/briefs/:briefId/shortlist { entryIds } replaces the
   brief's shortlist with exactly these match ids (empty clears it) and
   answers the saved shortlist. The engine checks role and tenant; this adds
   no authority. Until the engine is mounted, writeEngine says so in words.
   -------------------------------------------------------------------------- */

export type SaveShortlistResult = { ok: true; shortlist: ApiShortlist } | { ok: false; error: string };

export async function saveShortlistAction(briefId: string, entryIds: string[]): Promise<SaveShortlistResult> {
  if (!briefId) return { ok: false, error: "Pick a brief first." };
  const ids = Array.isArray(entryIds) ? [...new Set(entryIds.filter((i) => typeof i === "string" && i))] : [];
  try {
    const out = await writeEngine("matching", `/intelligence/briefs/${encodeURIComponent(briefId)}/shortlist`, { entryIds: ids });
    if (!out.ok) return out;
    revalidatePath(EXPLORER_PATH);
    return { ok: true, shortlist: out.data as ApiShortlist };
  } catch {
    return { ok: false, error: "The API is unreachable — try again in a minute." };
  }
}
