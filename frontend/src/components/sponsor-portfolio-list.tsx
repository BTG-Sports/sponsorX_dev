"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import { compact } from "@/components/charts";
import { Monogram } from "@/components/hero";
import { Pagination } from "@/components/pagination";
import { money } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   SponsorPortfolioList — the dashboard's "Campaign portfolio" section as a
   small client island (2026-09-15). The compact row list the server used to
   render inline, now paginated: a portfolio can hold far more than the handful
   of fixtures, and the dashboard shouldn't grow an unbounded scroll.

   Deliberately lighter than SponsorCampaignsList (the full /sponsor/campaigns
   view): no search/filter/sort/URL sync and a fixed page size — this is a
   summary section, not the working list. Just a numbered pager below the rows,
   using the shared Pagination component tinted sponsor.
   -------------------------------------------------------------------------- */

export type PortfolioRow = {
  id: string;
  name: string;
  pkg: string;
  athletes: number;
  endsIn: string;
  monogram: string;
  views: number;
  spend: number;
  done: number;
  total: number;
  behind: boolean;
  state: "ACTIVE" | "REPORTING" | "STAFFING" | "COMPLETED";
};

const CAMPAIGN_TONE = {
  ACTIVE: "accent",
  REPORTING: "primary",
  STAFFING: "warn",
  COMPLETED: "neutral",
} as const;

const PAGE_SIZE = 5;

export function SponsorPortfolioList({ rows }: { rows: PortfolioRow[] }) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  /* `page` is raw intent; clamp to the range so a stale value (e.g. after the
     list shrinks) can never slice past the end. */
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);

  return (
    <>
      <ul className="divide-y divide-line-soft">
        {paged.map((c) => (
          <li key={c.id} className="px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Monogram
                text={c.monogram}
                tone={c.behind ? "accent" : "primary"}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-tight">
                    {c.name}
                  </span>
                  {c.behind ? (
                    <Badge tone="warn">Pacing behind</Badge>
                  ) : (
                    <Badge tone={CAMPAIGN_TONE[c.state]}>
                      {c.state.toLowerCase()}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-faint">
                  {c.pkg} · {c.athletes} athletes · {c.endsIn}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">
                  {compact(c.views)}{" "}
                  <span className="font-normal text-faint">views</span>
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                  {money(c.spend)}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-3 pl-11">
              <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={
                    c.behind
                      ? "h-full rounded-full bg-warn"
                      : "h-full rounded-full bg-gradient-to-r from-primary to-primary-soft"
                  }
                  style={{ width: `${(c.done / c.total) * 100}%` }}
                />
              </div>
              <span className="shrink-0 text-[10px] tabular-nums text-faint">
                {c.done}/{c.total} deliverables
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line-soft px-4 py-2.5">
        <p className="mr-auto text-[11px] text-muted" aria-live="polite">
          Showing {rangeStart}–{rangeEnd} of {rows.length}
        </p>
        <Pagination
          page={safePage}
          count={totalPages}
          onChange={setPage}
          tone="sponsor"
          alwaysShow
        />
      </div>
    </>
  );
}
