"use server";

import { revalidatePath } from "next/cache";

import { checkGuarantee, type GuaranteeMetric } from "@/lib/forecast-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S4-FE-01 — the forecast screens' one write: what a campaign is promised
   (3S4-BE-01, lib/forecast-live.ts).

     PUT /intelligence/forecasts/:campaignId/guarantee { metric, value }
     PUT …/guarantee { metric: null }   — back to the default (every
                                           deliverable booked)

   The API decides who may set it (BTG admins and campaign managers) and
   audits it as campaign.guaranteeSet; this re-checks the form's rules (a
   server action is a public endpoint) so a refusal reads as a sentence.
   The forecast itself is made nightly, so the new guarantee shows from the
   next one — the island says so.
   -------------------------------------------------------------------------- */

export type GuaranteeResult = { ok: true; guarantee: { metric: GuaranteeMetric; value: number } | null } | { ok: false; message: string };

const PATH = "/admin/intelligence/forecasts";

export async function setGuaranteeAction(campaignId: string, metricInput: string, valueInput: string): Promise<GuaranteeResult> {
  if (typeof campaignId !== "string" || !campaignId) return { ok: false, message: "Unknown campaign." };
  const checked = checkGuarantee(String(metricInput ?? ""), String(valueInput ?? ""));
  if (!checked.ok) return checked;
  try {
    const r = await writeEngine("forecast", `/intelligence/forecasts/${encodeURIComponent(campaignId)}/guarantee`, checked.input, "PUT");
    if (!r.ok) return { ok: false, message: r.error };
    const out = r.data as { guarantee?: { metric: GuaranteeMetric; value: number } | null } | null;
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${campaignId}`);
    return { ok: true, guarantee: out?.guarantee ?? null };
  } catch {
    return { ok: false, message: "The API is unreachable — nothing was saved. Try again in a minute." };
  }
}
