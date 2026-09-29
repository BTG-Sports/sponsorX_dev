"use client";

import { CampaignCard, type CampaignRow } from "@/components/sponsor-campaigns-list";
import { FilterChip } from "@/components/filter-kit";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   The sponsor's live Campaigns list, SERVER-PAGED (2026-09-29).

   The page reads ?page / ?size / ?q / ?state / ?sort, asks GET /campaigns for
   exactly that page, and hands this island one page of rows and the total.
   Search, the status filter, sort and paging all happen in the database —
   nothing here holds more than the visible page. Pacing ("behind") is
   computed per row, so it's a badge, not a filter; views are the ROI
   report's.
   -------------------------------------------------------------------------- */

export const CAMPAIGN_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "REPORTING", label: "Reporting" },
  { value: "STAFFING", label: "Staffing" },
  { value: "APPROVAL", label: "Approval" },
  { value: "DRAFT", label: "Draft" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];
export const CAMPAIGN_SORT_OPTIONS = [
  { value: "name", label: "Name · A–Z" },
  { value: "ending", label: "Ending soonest" },
];

export function SponsorCampaignsServer(props: {
  rows: CampaignRow[];
  page: PageInfo;
  q: string;
  state: string;
  sort: string;
}) {
  return (
    <ServerList>
      <Body {...props} />
    </ServerList>
  );
}

function Body({ rows, page, q, state, sort }: { rows: CampaignRow[]; page: PageInfo; q: string; state: string; sort: string }) {
  const { set } = useListNav();
  const filtered = Boolean(q || state);
  const label = (v: string, opts: { value: string; label: string }[]) => opts.find((o) => o.value === v)?.label ?? v;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <ListSearch initial={q} label="Search campaigns" placeholder="Search campaigns by name" tone="sponsor" />
        <ListFilter param="state" value={state} label="Filter by status" allLabel="All statuses" options={CAMPAIGN_STATUS_OPTIONS} tone="sponsor" />
        <ListFilter param="sort" value={sort} label="Sort campaigns" allLabel="Sort: newest" options={CAMPAIGN_SORT_OPTIONS} tone="sponsor" />
      </div>

      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {q && (
            <FilterChip label="Clear search" onClear={() => set({ q: null })} tone="sponsor">
              “{q}”
            </FilterChip>
          )}
          {state && (
            <FilterChip label="Clear status filter" onClear={() => set({ state: null })} tone="sponsor">
              {label(state, CAMPAIGN_STATUS_OPTIONS)}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={() => set({ q: null, state: null })}
            className="text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            Clear all
          </button>
        </div>
      )}

      {page.total === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-sm font-semibold">No campaigns match</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">Nothing fits those filters. Try a broader search or clear them.</p>
          <button
            type="button"
            onClick={() => set({ q: null, state: null })}
            className="mt-3 text-xs font-medium text-sponsor transition-colors hover:opacity-80"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <PagerRow page={page} noun="Campaigns" tone="sponsor" position="top" filtered={filtered} />
          <PendingList>
            <ul className="grid gap-4 lg:grid-cols-2">
              {rows.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </ul>
          </PendingList>
          <PagerRow page={page} noun="Campaigns" tone="sponsor" position="bottom" filtered={filtered} />
        </>
      )}
    </div>
  );
}
