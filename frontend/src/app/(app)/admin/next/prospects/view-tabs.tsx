"use client";

import { useListNav } from "@/components/server-pager";
import { PROSPECT_DESK_VIEWS, type ProspectDeskView } from "@/lib/prospects-live";

/* P9-FE-11 — the desk's three views as tabs, written to the URL (?view);
   the counts are the API's. Held is the default and drops the param.
   Wraps at 390px; nothing scrolls sideways. */
export function ViewTabs({ view, counts }: { view: ProspectDeskView; counts: Record<ProspectDeskView, number> }) {
  const { set } = useListNav();
  return (
    <div role="tablist" aria-label="Prospect views" className="flex flex-wrap gap-2">
      {PROSPECT_DESK_VIEWS.map((v) => (
        <button
          key={v.value}
          type="button"
          role="tab"
          aria-selected={view === v.value}
          onClick={() => set({ view: v.value === "held" ? null : v.value })}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            view === v.value ? "border-next/50 bg-next/12 text-next" : "border-line bg-surface text-muted hover:border-next/30 hover:text-text"
          }`}
        >
          {v.label}
          <span className="tabular-nums text-[11px] opacity-80">{counts[v.value]}</span>
        </button>
      ))}
    </div>
  );
}
