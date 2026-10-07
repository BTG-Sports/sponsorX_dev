"use client";

/* --------------------------------------------------------------------------
   New sign-ups — the Intake Stream's filter controls (P1-ART-15). Client
   islands on the house server-paged list (server-pager.tsx): each one writes
   the URL inside <ServerList>'s transition, which resets the stream to page
   1, and the server page re-reads it. No Apply button; the list dims while
   the next page loads (PendingList).

   - KindChips     All · Organizations · Athletes · Guardians · Sponsors, each
                   with its total from the summary. A radio group: one kind.
   - ReviewToggle  "Needs review" — combines with the kind (aria-pressed).

   Both also drop a legacy `?tab=` (the old tabs' links), so it can never
   fight the explicit filter.
   -------------------------------------------------------------------------- */

import { useListNav } from "./server-pager";

export type Chip = { kind: string; label: string; count: number };

export function KindChips({ chips, value }: { chips: Chip[]; value: string }) {
  const { set } = useListNav();
  return (
    <div role="radiogroup" aria-label="Kind of sign-up" className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => {
        const on = c.kind === value;
        return (
          <button
            key={c.kind || "all"}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set({ kind: c.kind || null, tab: null })}
            className={`group inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 ${
              on
                ? "border-[#63b4f8] bg-[#2e9bf5]/25 text-white shadow-[0_0_18px_rgba(46,155,245,.35)]"
                : "border-[#63b4f8]/25 bg-[#0a121e]/60 text-[#cfe9ff] hover:border-[#63b4f8]/60 hover:text-white"
            }`}
          >
            {c.label}
            <span className={`font-mono text-[11px] tabular-nums ${on ? "text-[#9be0ff]" : "text-[#7e88a0] group-hover:text-[#9be0ff]"}`}>
              {c.count.toLocaleString("en-US")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ReviewToggle({ on, count }: { on: boolean; count: number }) {
  const { set } = useListNav();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => set({ review: on ? null : "1", tab: null })}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-[background-color,border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fb923c]/70 ${
        on
          ? "border-[#fb923c] bg-[#f97a1f]/25 text-[#ffd1a6] shadow-[0_0_18px_rgba(249,122,31,.4)]"
          : "border-[#f97a1f]/45 bg-[#f97a1f]/10 text-[#fdba74] hover:border-[#fb923c]"
      }`}
    >
      <span aria-hidden="true" className={`size-2 rounded-full bg-[#fb923c] shadow-[0_0_8px_#fb923c] ${count > 0 ? "sx-ops-led" : "opacity-40"}`} data-status="Degraded" />
      Needs review
      <span className="font-mono text-[11px] tabular-nums text-[#fb923c]">{count.toLocaleString("en-US")}</span>
    </button>
  );
}
