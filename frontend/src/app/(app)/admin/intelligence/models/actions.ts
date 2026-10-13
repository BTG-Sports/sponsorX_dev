"use server";

import { revalidatePath } from "next/cache";

import { reasonError } from "@/lib/intel-admin";
import { writeEngine } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-02 — the model registry's writes. Every one carries a reason
   (3S0-PMO-02 governance): checked here before the call, recorded by the
   API's audit row. The API's policy (BTG admin only) and the registry's
   own rules (validated-only activation, rollback to a retired version,
   thresholds inside min/max) stay the enforcement.

   POST  /intelligence/models/:key/versions/:version/activate { reason }
   POST  /intelligence/models/:key/rollback                   { toVersion, reason }
   PATCH /intelligence/models/:key/thresholds                 { values, reason }
   PATCH /intelligence/flags                                  { feature, tenantId, enabled, reason }
   -------------------------------------------------------------------------- */

const PATH = "/admin/intelligence/models";
type Result = { ok: true } | { ok: false; error: string };
const unreachable = "The API is unreachable — try again in a minute.";
const seg = (s: string) => encodeURIComponent(s);

async function run(path: string, body: unknown, method: "POST" | "PATCH" = "POST"): Promise<Result> {
  try {
    const res = await writeEngine("models", path, body, method);
    if (!res.ok) return res;
    revalidatePath(PATH);
    return { ok: true };
  } catch {
    return { ok: false, error: unreachable };
  }
}

export async function activateVersionAction(key: string, version: string, reason: string): Promise<Result> {
  if (!key || !version) return { ok: false, error: "No version." };
  const bad = reasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/versions/${seg(version)}/activate`, { reason: reason.trim() });
}

export async function rollbackAction(key: string, toVersion: string, reason: string): Promise<Result> {
  if (!key || !toVersion) return { ok: false, error: "Choose the version to roll back to." };
  const bad = reasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/rollback`, { toVersion, reason: reason.trim() });
}

export async function saveThresholdsAction(key: string, values: Record<string, number>, reason: string): Promise<Result> {
  if (!key) return { ok: false, error: "No model." };
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) return { ok: false, error: "Nothing changed." };
  if (entries.some(([, v]) => typeof v !== "number" || !Number.isFinite(v))) return { ok: false, error: "Every threshold must be a number." };
  const bad = reasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/models/${seg(key)}/thresholds`, { values, reason: reason.trim() }, "PATCH");
}

export async function setFlagAction(feature: string, tenantId: string, enabled: boolean, reason: string): Promise<Result> {
  if (!feature || !tenantId || typeof enabled !== "boolean") return { ok: false, error: "No flag." };
  const bad = reasonError(String(reason ?? ""));
  if (bad) return { ok: false, error: bad };
  return run(`/intelligence/flags`, { feature, tenantId, enabled, reason: reason.trim() }, "PATCH");
}
