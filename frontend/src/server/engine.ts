/* --------------------------------------------------------------------------
   Reading a Phase 3 engine — the one place a screen learns whether its
   engine exists yet (lib/intelligence.ts explains why).

   live    → the engine answered: render it.
   pending → the route isn't mounted (the API's catch-all 404) or the engine
             answers 501: render <EnginePending>, never a number.
   throw   → anything else is a real failure — the page's error boundary
             shows it, exactly like every other desk.
   -------------------------------------------------------------------------- */

import "server-only";

import { ENGINES, routeMissing, type EngineKey, type EngineRead } from "@/lib/intelligence";
import { apiFetch } from "@/server/api";

export async function readEngine<T>(key: EngineKey, path: string): Promise<EngineRead<T>> {
  const res = await apiFetch(path);
  if (res.ok) return { state: "live", data: (await res.json()) as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no JSON body: not the catch-all, so not "pending" */
  }
  if (routeMissing(res.status, body)) return { state: "pending", engine: ENGINES[key] };
  throw new Error(`${ENGINES[key].name} unavailable (${res.status}).`);
}

/**
 * One record from an engine — a detail page's read. As readEngine, plus:
 * a MOUNTED route's own 404 (it says why — routeMissing is false) is
 * "no such record", for the page's not-found state rather than its error
 * boundary. An unmounted route is still "pending".
 */
export async function readEngineItem<T>(
  key: EngineKey,
  path: string,
): Promise<EngineRead<T> | { state: "absent"; message: string }> {
  const res = await apiFetch(path);
  if (res.ok) return { state: "live", data: (await res.json()) as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* no JSON body */
  }
  if (routeMissing(res.status, body)) return { state: "pending", engine: ENGINES[key] };
  if (res.status === 404) {
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
    return { state: "absent", message: typeof message === "string" ? message : "Not found." };
  }
  throw new Error(`${ENGINES[key].name} unavailable (${res.status}).`);
}

/** A write to an engine — the server actions' shared call. */
export async function writeEngine(
  key: EngineKey,
  path: string,
  body: unknown,
  method: "POST" | "PATCH" | "PUT" = "POST",
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const res = await apiFetch(path, { method, body: JSON.stringify(body) });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (res.ok) return { ok: true, data };
  if (routeMissing(res.status, data)) return { ok: false, error: `${ENGINES[key].name} isn't live yet.` };
  const message = (data as { error?: { message?: string } } | null)?.error?.message;
  return { ok: false, error: message ?? `${ENGINES[key].name} refused that (${res.status}).` };
}

/**
 * `?demo=sample` — a development-only preview of a screen's LIVE layout,
 * fed by the sample object its lib exports (the same one its tests use).
 * Never in production: there, a screen whose engine isn't live shows
 * <EnginePending> and nothing else. The page must render <SampleBanner>
 * above sampled content.
 */
export async function wantsSample(searchParams: Promise<Record<string, string | string[] | undefined>>): Promise<boolean> {
  if (process.env.NODE_ENV === "production") return false;
  const d = (await searchParams).demo;
  return (Array.isArray(d) ? d[0] : d) === "sample";
}
