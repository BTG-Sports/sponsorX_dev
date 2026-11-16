import "server-only";

import type { ApiEdition } from "@/lib/editions-live";
import { currentEdition, thisEditionView, type LedgerSlot, type ThisEditionView } from "@/lib/this-edition";
import { apiFetch } from "@/server/api";

/** POL-FE-77 — the student's or advisor's current edition, or null (none yet, or not theirs to read). Never throws: the card is extra. */
export async function loadThisEdition(): Promise<ThisEditionView | null> {
  try {
    const res = await apiFetch("/editions");
    if (!res.ok) return null;
    const { editions } = (await res.json()) as { editions: ApiEdition[] };
    const e = currentEdition(editions);
    if (!e) return null;
    const l = await apiFetch(`/editions/${encodeURIComponent(e.id)}/ledger`);
    const slots = l.ok ? ((await l.json()) as { slots: LedgerSlot[] }).slots : [];
    return thisEditionView(e, slots);
  } catch {
    return null;
  }
}
