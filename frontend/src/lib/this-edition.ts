/* --------------------------------------------------------------------------
   POL-FE-77 — "This edition", read-only, for a student and their advisor:
   the school's current edition, when ads close, and which positions are
   still open at what price. From GET /editions (edition read, own school)
   and GET /editions/:id/ledger (ad slot read, own school). Pure.
   -------------------------------------------------------------------------- */

import type { ApiEdition } from "@/lib/editions-live";

export type LedgerSlot = { id: string; slotCode: string; kind: string; page: number | null; priceCents: number; sold: boolean };

const OPEN = ["PLANNING", "SELLING", "CLOSED"];
const LIVE = ["IN_PRODUCTION", "PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED"];

/** The edition a student is working on: the one still taking content that
 *  closes soonest; else the latest one in production or out. */
export function currentEdition<T extends { id: string; state: string; closeDate: string }>(editions: readonly T[]): T | null {
  const open = editions.filter((e) => OPEN.includes(e.state)).sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  if (open[0]) return open[0];
  const live = editions.filter((e) => LIVE.includes(e.state)).sort((a, b) => b.closeDate.localeCompare(a.closeDate));
  return live[0] ?? null;
}

const STATE_WORDS: Record<string, string> = {
  PLANNING: "Being planned",
  SELLING: "Selling ads",
  CLOSED: "Ads closed — content being finished",
  IN_PRODUCTION: "In production",
  PUBLISHED_DIGITAL: "Published online",
  PRINTED: "Printed",
  DISTRIBUTED: "Out in school",
};
export const editionStateWords = (state: string) => STATE_WORDS[state] ?? state.toLowerCase();

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A position in words: "Page 3 · half page — $250". */
export function slotLine(s: LedgerSlot): string {
  const kind = s.kind.split("_").join(" ").toLowerCase();
  return `${s.page ? `Page ${s.page} · ` : ""}${kind} — ${usd(s.priceCents)}`;
}

export type ThisEditionView = {
  label: string;
  state: string;
  closeLine: string;
  sold: number;
  total: number;
  open: string[];
};

/** The card's lines. Open positions are listed only while ads are on sale. */
export function thisEditionView(e: Pick<ApiEdition, "label" | "closeDate" | "inventory"> & { state: string }, slots: readonly LedgerSlot[]): ThisEditionView {
  const selling = e.state === "PLANNING" || e.state === "SELLING";
  return {
    label: e.label,
    state: editionStateWords(e.state),
    closeLine: selling ? `Ads close ${day(e.closeDate)}` : `Ads closed ${day(e.closeDate)}`,
    sold: e.inventory.sold,
    total: e.inventory.total,
    open: selling ? slots.filter((s) => !s.sold).map(slotLine) : [],
  };
}
