"use server";

import { revalidatePath } from "next/cache";

import { dispositionError, type DispositionOutcome } from "@/lib/anomalies-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-01 — the anomaly console's one write: a reviewer's disposition.

   POST /intelligence/anomalies/:id/disposition { outcome, note }
   The note — 8 to 2,000 characters for every outcome (lib/anomalies-live.ts,
   the engine's own rule and wording) — is checked here before the call so a
   bad note never reaches the API; the API's policy and its audit row stay
   the enforcement. Its refusals come back verbatim through writeEngine:
   409 "A person has already decided this anomaly; the record stands."
   (final), 422 the note rule, 404 not this tenant's flag. A success may be
   a first decision or the replacement of SponsorX's automatic one.
   -------------------------------------------------------------------------- */

const PATH = "/admin/intelligence/anomalies";

export async function recordDispositionAction(
  id: string,
  outcome: DispositionOutcome,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "No anomaly." };
  const bad = dispositionError(outcome, typeof note === "string" ? note : "");
  if (bad) return { ok: false, error: bad };
  try {
    const res = await writeEngine("anomalies", `/intelligence/anomalies/${encodeURIComponent(id)}/disposition`, { outcome, note: note.trim() });
    if (!res.ok) return res;
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return { ok: false, error: "The API is unreachable — try again in a minute." };
  }
}
