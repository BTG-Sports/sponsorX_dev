"use server";

import { apiFetch } from "@/server/api";
import type { AuditPage } from "@/components/audit-explorer";

/* P8-FE-02 — the next page of the audit history, by keyset cursor. The API's
   matrix (auditLog: BTG admin) decides; this only forwards the filters. */
export async function loadMoreAudit(
  filters: { entity: string; actorId: string; entityId: string; action: string },
  cursor: string,
): Promise<{ ok: true; page: AuditPage } | { ok: false; message: string }> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters ?? {})) if (typeof v === "string" && v) p.set(k, v);
  if (typeof cursor === "string" && cursor) p.set("cursor", cursor);
  try {
    const res = await apiFetch(`/audit-log?${p}`);
    if (!res.ok) return { ok: false, message: `Couldn't load more (HTTP ${res.status}).` };
    return { ok: true, page: (await res.json()) as AuditPage };
  } catch {
    return { ok: false, message: "The API is unreachable — try again in a minute." };
  }
}
