import "server-only";

import type { ApiDealDispute, ApiDealDisputeList, DealDisputeState } from "@/lib/deal-disputes-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   P8-FE-05 / P8-FE-06 — the one soft read of GET /deal-disputes that every
   "why is this paused" join uses. The route takes only ?state= and answers
   the newest 200 of that state, so a join over the unfiltered list would
   lose an open dispute older than the 200 newest. The pause joins read the
   two paused states, one call each; the athlete's order page reads its own
   (small) list unfiltered so the outcome stays on the page.

   A failing read costs only the note — it never fails the page.
   -------------------------------------------------------------------------- */

const PAUSED_STATES: readonly DealDisputeState[] = ["OPEN", "DOCUMENTS_IN"];

async function readState(state?: DealDisputeState): Promise<ApiDealDispute[]> {
  try {
    const res = await apiFetch(state ? `/deal-disputes?state=${state}` : "/deal-disputes");
    if (!res.ok) return [];
    const body = (await res.json()) as Partial<ApiDealDisputeList> | null;
    return Array.isArray(body?.disputes) ? body.disputes : [];
  } catch {
    return [];
  }
}

/** Every dispute that is pausing an order right now (OPEN and DOCUMENTS_IN), newest first. */
export async function readPausingDisputes(): Promise<ApiDealDispute[]> {
  const lists = await Promise.all(PAUSED_STATES.map((s) => readState(s)));
  return lists.flat().sort((a, b) => b.openedAt.localeCompare(a.openedAt));
}

/** The caller's whole list, open or decided (an athlete's own; the outcome stays on the order). */
export async function readAllDisputes(): Promise<ApiDealDispute[]> {
  return readState();
}
