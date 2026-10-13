"use server";

import { revalidatePath } from "next/cache";

import { checkOverride } from "@/lib/pricing-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S2-FE-01 — the pricing panel's one write: a person's override of a
   recommended CPM (3S2-BE-03, proposed contract in lib/pricing-live.ts).

     POST /intelligence/pricing/recommendations/:recommendationId/overrides
          { cpmCents, reason }

   The override is a SEPARATE record — the recommendation is never edited
   (Phase 3 acceptance #2). The API decides who may override and refuses a
   price under the sell floor; this re-checks the form's rules (a server
   action is a public endpoint) so the refusal reads as a sentence. Until
   the engine is mounted, writeEngine answers "isn't live yet".
   -------------------------------------------------------------------------- */

export type OverrideResult = { ok: true } | { ok: false; message: string };

const PATH = "/admin/intelligence/pricing";

export async function overridePriceAction(
  inventoryId: string,
  recommendationId: string,
  rec: { recommendedCpmCents: number; floorCpmCents: number | null },
  cpmInput: string,
  reason: string,
): Promise<OverrideResult> {
  if (typeof inventoryId !== "string" || !inventoryId || typeof recommendationId !== "string" || !recommendationId) {
    return { ok: false, message: "Unknown recommendation." };
  }
  const recommended = Number(rec?.recommendedCpmCents);
  const floor = rec?.floorCpmCents == null ? null : Number(rec.floorCpmCents);
  const checked = checkOverride(String(cpmInput ?? ""), String(reason ?? ""), {
    recommendedCpmCents: Number.isFinite(recommended) ? recommended : -1,
    floorCpmCents: floor !== null && Number.isFinite(floor) ? floor : null,
  });
  if (!checked.ok) return checked;
  try {
    const r = await writeEngine("pricing", `/intelligence/pricing/recommendations/${encodeURIComponent(recommendationId)}/overrides`, {
      cpmCents: checked.cpmCents,
      reason: checked.reason,
    });
    if (!r.ok) return { ok: false, message: r.error };
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was saved. Try again in a minute." };
  }
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${inventoryId}`);
  return { ok: true };
}
