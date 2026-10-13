"use server";

import { revalidatePath } from "next/cache";

import {
  SCENARIOS_PATH,
  cleanInputs,
  validateInputs,
  type ApiSavedScenario,
  type ScenarioInputs,
  type ScenarioResult,
} from "@/lib/scenarios-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner's two calls to the scenario engine.

   calculate → POST /intelligence/scenarios/calculate { inputs } — a pure
               what-if, called by the planner on every settled change
               (debounced in the island). Nothing stored, no revalidate.
   save      → POST /intelligence/scenarios { name, inputs } — the engine
               calculates and stores it; the saved list re-reads.

   Inputs are checked and cleaned here too (mix normalised to 100%), so the
   engine never receives a half-dragged slider. The engine checks role and
   tenant; this adds no authority.
   -------------------------------------------------------------------------- */

export type CalculateResult = { ok: true; result: ScenarioResult } | { ok: false; error: string };
export type SaveScenarioResult = { ok: true; scenario: ApiSavedScenario } | { ok: false; error: string };

const unreachable = "The API is unreachable — try again in a minute.";

export async function calculateScenarioAction(inputs: ScenarioInputs): Promise<CalculateResult> {
  if (!inputs || typeof inputs !== "object") return { ok: false, error: "Nothing to calculate." };
  const clean = cleanInputs(inputs);
  const issues = validateInputs(clean);
  if (issues.length) return { ok: false, error: issues[0] };
  try {
    const out = await writeEngine("scenarios", "/intelligence/scenarios/calculate", { inputs: clean });
    return out.ok ? { ok: true, result: out.data as ScenarioResult } : out;
  } catch {
    return { ok: false, error: unreachable };
  }
}

export async function saveScenarioAction(name: string, inputs: ScenarioInputs): Promise<SaveScenarioResult> {
  const title = typeof name === "string" ? name.trim().slice(0, 80) : "";
  if (!title) return { ok: false, error: "Name the scenario first." };
  if (!inputs || typeof inputs !== "object") return { ok: false, error: "Nothing to save." };
  const clean = cleanInputs(inputs);
  const issues = validateInputs(clean);
  if (issues.length) return { ok: false, error: issues[0] };
  try {
    const out = await writeEngine("scenarios", "/intelligence/scenarios", { name: title, inputs: clean });
    if (!out.ok) return out;
    revalidatePath(SCENARIOS_PATH);
    return { ok: true, scenario: out.data as ApiSavedScenario };
  } catch {
    return { ok: false, error: unreachable };
  }
}
