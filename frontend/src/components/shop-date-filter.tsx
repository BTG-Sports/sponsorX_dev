"use client";

import { useListNav } from "@/components/server-pager";

/* --------------------------------------------------------------------------
   Shop — the "Dates" filter (P1-ART-23 Task 13, spec §7.8): two instant date
   pickers bound to `?availableFrom` / `?availableUntil`, inside the page's
   <ServerList>. No Apply button — a pick writes the URL immediately, same as
   every other instant filter on the Stadium Board.
   -------------------------------------------------------------------------- */

const field =
  "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-text focus:border-sponsor/50 focus:outline-none";

export function ShopDateFilter({ availableFrom, availableUntil }: { availableFrom: string; availableUntil: string }) {
  const { set } = useListNav();
  return (
    <div className="flex items-center gap-1.5">
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="sr-only">Available from</span>
        <input
          type="date"
          aria-label="Available from"
          value={availableFrom}
          onChange={(e) => set({ availableFrom: e.target.value || null })}
          className={field}
        />
      </label>
      <span aria-hidden="true" className="text-[11px] text-faint">
        to
      </span>
      <label className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="sr-only">Available until</span>
        <input
          type="date"
          aria-label="Available until"
          value={availableUntil}
          onChange={(e) => set({ availableUntil: e.target.value || null })}
          className={field}
        />
      </label>
    </div>
  );
}
