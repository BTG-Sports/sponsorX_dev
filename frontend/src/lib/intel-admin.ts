/* --------------------------------------------------------------------------
   Small helpers the three Phase 3 admin desks share — attribution
   (3S6-FE-01), anomalies (3S8-FE-01) and the model registry (3S8-FE-02).
   Pure; lib/intelligence.ts holds the vocabulary every Phase 3 screen uses,
   this only what these three need on top.
   -------------------------------------------------------------------------- */

/** One value of a URL param. */
export function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** "Oct 12, 19:04 UTC" — fixed to UTC so the server render is stable. */
export function momentLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

/** "Oct 12, 2026" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** A query string from the non-empty entries, "" when none. */
export function qs(params: Record<string, string | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Governance (3S0-PMO-02): every registry or disposition change carries a reason. */
export const MIN_REASON = 8;

export function reasonError(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "Give a reason — every change is recorded with one.";
  if (r.length < MIN_REASON) return `Say a little more (at least ${MIN_REASON} characters) so the audit trail explains it.`;
  return null;
}
