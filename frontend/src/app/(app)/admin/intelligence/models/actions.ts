"use server";

import { revalidatePath } from "next/cache";

import { modelReasonError, parseSettingsOutcome, type SettingsOutcome } from "@/lib/models-live";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-02 — the model registry's writes. Every one carries a reason
   (3S0-PMO-02 governance, 10–500 characters): checked here before the
   call, recorded by the API's audit row. The API's policy (BTG admin only)
   and the registry's own rules (a second person validates a held draft,
   validated-only activation, rollback to a retired version, values that
   can never be right refused) stay the enforcement; its message is what
   the dialog shows when it refuses.

   PATCH /intelligence/models/:key/thresholds                 { values, reason }
         → { version, status: active|draft, heldBecause[], model } — passed back
           as `outcome`, so the editor can say whether it went live or was held
   POST  /intelligence/models/:key/versions/:version/validate { reason }
   POST  /intelligence/models/:key/versions/:version/activate { reason }
   POST  /intelligence/models/:key/rollback                   { toVersion, reason }
   PATCH /intelligence/flags                                  { feature, tenantId, enabled, reason }
   -------------------------------------------------------------------------- */

const PATH = "/admin/intelligence/models";
/* Only async functions leave a "use server" file; the component declares the same shape. */
type Result = { ok: true; outcome?: SettingsOutcome | null } | { ok: false; error: string };
const unreachable = "The API is unreachable — try again in a minute.";
const seg = (s: string) => encodeURIComponent(s);

async function run(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<Result> {
  try {
    const res = await writeEngine("models", path, body, method);
    if (!res.ok) return res;
    revalidatePath(PATH);
    return { ok: true, outcome: parseSettingsOutcome(res.data) };
  } catch {
    return { ok: false, error: unreachable };
  }
}

export async function validateVersionAction(key: string, version: string, reason: string): Promise<Result> {
  if (!key || !version) return { ok: false, error: "No version." };
  const bad = modelReasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/versions/${seg(version)}/validate`, { reason: reason.trim() });
}

export async function activateVersionAction(key: string, version: string, reason: string): Promise<Result> {
  if (!key || !version) return { ok: false, error: "No version." };
  const bad = modelReasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/versions/${seg(version)}/activate`, { reason: reason.trim() });
}

export async function rollbackAction(key: string, toVersion: string, reason: string): Promise<Result> {
  if (!key || !toVersion) return { ok: false, error: "Choose the version to roll back to." };
  const bad = modelReasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/rollback`, { toVersion, reason: reason.trim() });
}

export async function saveThresholdsAction(key: string, values: Record<string, number>, reason: string): Promise<Result> {
  if (!key) return { ok: false, error: "No model." };
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return { ok: false, error: "Nothing changed." };
  if (entries.some(([, v]) => typeof v !== "number" || !Number.isFinite(v))) return { ok: false, error: "Every setting must be a number." };
  const bad = modelReasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/thresholds`, { values, reason: reason.trim() }, "PATCH");
}

export async function setFlagAction(feature: string, tenantId: string, enabled: boolean, reason: string): Promise<Result> {
  if (!feature || !tenantId || typeof enabled !== "boolean") return { ok: false, error: "No flag." };
  const bad = modelReasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/flags`, { feature, tenantId, enabled, reason: reason.trim() }, "PATCH");
}
