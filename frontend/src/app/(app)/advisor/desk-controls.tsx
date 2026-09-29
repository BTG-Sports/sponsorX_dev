"use client";

import { useListNav } from "@/components/server-pager";
import { CLAIM_KEYS, STUDENT_GROUPS, type StudentGroup } from "@/lib/students-live";

/* --------------------------------------------------------------------------
   The advisor desk's tabs (2026-09-29, server paging). Each writes the URL
   (through <ServerList>), the server page re-asks the API for that group or
   claim state, and the counts are the API's groupBy / count — so a tab says
   what it holds before it is opened. Wraps at 390px; nothing scrolls
   sideways.
   -------------------------------------------------------------------------- */

function Tab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "border-next/50 bg-next/12 text-next" : "border-line bg-surface text-muted hover:border-next/30 hover:text-text"
      }`}
    >
      {label}
      <span className="tabular-nums text-[11px] opacity-80">{count}</span>
    </button>
  );
}

export function GroupTabs({ group, counts, all }: { group: StudentGroup | ""; counts: Record<StudentGroup, number>; all: number }) {
  const { set } = useListNav();
  return (
    <div role="tablist" aria-label="Student groups" className="flex flex-wrap gap-2">
      <Tab active={group === ""} label="All" count={all} onClick={() => set({ group: null })} />
      {STUDENT_GROUPS.map((g) => (
        <Tab key={g.key} active={group === g.key} label={g.tab} count={counts[g.key]} onClick={() => set({ group: g.key })} />
      ))}
    </div>
  );
}

export function ClaimTabs({ cstate, open, all }: { cstate: "" | "open"; open: number; all: number }) {
  const { set } = useListNav();
  return (
    <div role="tablist" aria-label="Claim states" className="flex flex-wrap gap-2">
      <Tab active={cstate === ""} label="All" count={all} onClick={() => set({ cstate: null }, CLAIM_KEYS)} />
      <Tab active={cstate === "open"} label="Waiting on you" count={open} onClick={() => set({ cstate: "open" }, CLAIM_KEYS)} />
    </div>
  );
}
