"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Meter } from "@/components/ui";
import { compact } from "@/components/charts";
import { Monogram } from "@/components/hero";
import { Dropdown, FilterChip, SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import { money } from "@/lib/fixtures";

const DEFAULT_PAGE_SIZE = 12;
const SIZE_OPTIONS = [
  { value: "12", label: "12 / page" },
  { value: "24", label: "24 / page" },
  { value: "60", label: "60 / page" },
];

/* --------------------------------------------------------------------------
   SponsorCampaignsList — the sponsor portal's campaigns list as one client
   island (2026-09-15), following the applications-desk idiom: instant search,
   status/pacing dropdowns and a sort menu, active filters as dismissible
   chips, all synced to the URL (?q=&status=&pace=&sort=) via replaceState so a
   filtered view is shareable and survives reload. The server page seeds
   `initial` back from those params and shapes the rows.

   Tinted with the sponsor portal color (filter-kit tone="sponsor"). Cards are
   presentational — the same owner-framed card the server rendered before,
   moved here so filtering can be instant with no navigation.
   -------------------------------------------------------------------------- */

export type CampaignRow = {
  id: string;
  name: string;
  pkg: string;
  athletes: number;
  done: number;
  total: number;
  pct: number;
  spend: number;
  views: number;
  monogram: string;
  endsIn: string;
  state: "ACTIVE" | "REPORTING" | "STAFFING" | "COMPLETED";
  behind: boolean;
};

const STATE_TONE = {
  ACTIVE: "accent",
  REPORTING: "primary",
  STAFFING: "warn",
  COMPLETED: "neutral",
} as const;

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "REPORTING", label: "Reporting" },
  { value: "STAFFING", label: "Staffing" },
  { value: "COMPLETED", label: "Completed" },
];

const PACE_OPTIONS = [
  { value: "on", label: "On track" },
  { value: "behind", label: "Behind" },
];

const SORT_OPTIONS = [
  { value: "name", label: "Name · A–Z" },
  { value: "views", label: "Views · high to low" },
  { value: "spend", label: "Spend · high to low" },
  { value: "progress", label: "Progress · high to low" },
];

const STATUS_LABEL = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

export function SponsorCampaignsList({
  rows,
  demoParam,
  initial,
}: {
  rows: CampaignRow[];
  demoParam?: string;
  initial?: Partial<
    Record<"q" | "status" | "pace" | "sort" | "page" | "size", string>
  >;
}) {
  const clamp = (v: string | undefined, ok: readonly string[]) =>
    v && ok.includes(v) ? v : "";

  const [q, setQ] = useState(initial?.q ?? "");
  const [status, setStatus] = useState(() =>
    clamp(initial?.status, STATUS_OPTIONS.map((o) => o.value)),
  );
  const [pace, setPace] = useState(() =>
    clamp(initial?.pace, PACE_OPTIONS.map((o) => o.value)),
  );
  const [sort, setSort] = useState(() =>
    clamp(initial?.sort, SORT_OPTIONS.map((o) => o.value)),
  );
  const [page, setPage] = useState(() => {
    const n = Number(initial?.page);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const [pageSize, setPageSize] = useState(() =>
    SIZE_OPTIONS.some((o) => o.value === initial?.size)
      ? Number(initial!.size)
      : DEFAULT_PAGE_SIZE,
  );

  /* Any filter/sort change resets to the first page — page 4 of "Active" is
     meaningless after you clear the filter and there are only two pages. */
  const onFilter =
    (set: (v: string) => void) =>
    (v: string) => {
      set(v);
      setPage(1);
    };

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = rows.filter((c) => {
      const qOk =
        !needle ||
        c.name.toLowerCase().includes(needle) ||
        c.pkg.toLowerCase().includes(needle);
      const statusOk = !status || c.state === status;
      const paceOk = !pace || (pace === "behind" ? c.behind : !c.behind);
      return qOk && statusOk && paceOk;
    });
    const sorted = [...list];
    switch (sort) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "views":
        sorted.sort((a, b) => b.views - a.views);
        break;
      case "spend":
        sorted.sort((a, b) => b.spend - a.spend);
        break;
      case "progress":
        sorted.sort((a, b) => b.pct - a.pct);
        break;
    }
    return sorted;
  }, [rows, needle, status, pace, sort]);

  const filtered = Boolean(needle || status || pace);
  const clearAll = () => {
    setQ("");
    setStatus("");
    setPace("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  /* `page` is raw intent; `safePage` is the effective, in-range value used for
     slicing, the pager and the URL. A seeded ?page= past the end (e.g. after a
     filter narrows the set, or a larger page size) simply clamps here — no
     write-back needed. */
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  /* A larger/smaller page size changes what "this page" means — back to one. */
  const changeSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  /* Filters, page and size live in the URL (no navigation) so a view is
     shareable and survives reload — the server page seeds `initial` from it. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (pace) p.set("pace", pace);
    if (sort) p.set("sort", sort);
    if (safePage > 1) p.set("page", String(safePage));
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(pageSize));
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, status, pace, sort, safePage, pageSize, demoParam]);

  const rangeStart = shown.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, shown.length);

  return (
    <div className="space-y-4">
      {/* --------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={onFilter(setQ)}
          placeholder="Search campaigns…"
          label="Search campaigns by name or package"
          tone="sponsor"
        />
        <Dropdown
          label="Filter by status"
          allLabel="All statuses"
          value={status}
          options={STATUS_OPTIONS}
          onChange={onFilter(setStatus)}
          tone="sponsor"
        />
        <Dropdown
          label="Filter by pacing"
          allLabel="Any pacing"
          value={pace}
          options={PACE_OPTIONS}
          onChange={onFilter(setPace)}
          tone="sponsor"
        />
        <div className="ml-auto">
          <Dropdown
            label="Sort campaigns"
            allLabel="Sort: default"
            value={sort}
            options={SORT_OPTIONS}
            onChange={onFilter(setSort)}
            tone="sponsor"
          />
        </div>
      </div>

      {/* ---------------------------------------------------- active chips */}
      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {needle && (
            <FilterChip label="Clear search" onClear={() => setQ("")} tone="sponsor">
              “{q}”
            </FilterChip>
          )}
          {status && (
            <FilterChip label="Clear status filter" onClear={() => setStatus("")} tone="sponsor">
              {STATUS_LABEL[status]}
            </FilterChip>
          )}
          {pace && (
            <FilterChip label="Clear pacing filter" onClear={() => setPace("")} tone="sponsor">
              {pace === "behind" ? "Behind" : "On track"}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------- grid */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-sm font-semibold">No campaigns match</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Nothing fits those filters. Try a broader search or clear them.
          </p>
          <button
            type="button"
            onClick={clearAll}
            className="mt-3 text-xs font-medium text-sponsor transition-colors hover:opacity-80"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[11px] text-muted" aria-live="polite">
              Showing {rangeStart}–{rangeEnd} of {shown.length}
              {filtered ? " matching" : ""}
            </p>
            <Dropdown
              label="Campaigns per page"
              allLabel={`${pageSize} / page`}
              value={String(pageSize)}
              options={SIZE_OPTIONS}
              onChange={changeSize}
              tone="sponsor"
              includeAll={false}
            />
            <Pagination
              page={safePage}
              count={totalPages}
              onChange={setPage}
              tone="sponsor"
              alwaysShow
            />
          </div>
          <ul className="grid gap-4 lg:grid-cols-2">
            {paged.map((c) => (
            /* min-w-0: a grid item otherwise grows to its content and the card ran
               22px past a 390px phone (frontend audit) */
            <li key={c.id} className="min-w-0">
              <Link
                href={`/sponsor/campaigns/${c.id}`}
                className="group block rounded-xl border border-line bg-surface p-5 transition-all hover:border-sponsor/30 hover:bg-surface-2/40"
              >
                <div className="flex items-start gap-3">
                  <Monogram
                    text={c.monogram}
                    tone={c.behind ? "accent" : "primary"}
                    className="size-10 text-[11px]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-sm font-semibold tracking-tight">
                        {c.name}
                      </h2>
                      {c.behind ? (
                        <Badge tone="warn">Pacing behind</Badge>
                      ) : (
                        <Badge tone={STATE_TONE[c.state]}>
                          {c.state.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {c.pkg} · {c.athletes} athletes · {c.endsIn}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </div>

                <div className="mt-4">
                  <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                    <span className="text-muted">Deliverables</span>
                    <span className="font-medium tabular-nums text-text">
                      {c.done}
                      <span className="text-faint"> / {c.total}</span>
                    </span>
                  </div>
                  <Meter value={c.pct} tone={c.behind ? "primary" : "accent"} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
                  <Stat label="Views" value={compact(c.views)} />
                  <Stat label="Spend" value={money(c.spend)} />
                  <Stat label="Athletes" value={String(c.athletes)} />
                </dl>
              </Link>
            </li>
          ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <p className="mr-auto text-[11px] text-muted" aria-live="polite">
              Showing {rangeStart}–{rangeEnd} of {shown.length}
              {filtered ? " matching" : ""}
            </p>
            <Dropdown
              label="Campaigns per page"
              allLabel={`${pageSize} / page`}
              value={String(pageSize)}
              options={SIZE_OPTIONS}
              onChange={changeSize}
              tone="sponsor"
              includeAll={false}
              placement="up"
            />
            <Pagination
              page={safePage}
              count={totalPages}
              onChange={setPage}
              tone="sponsor"
              alwaysShow
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight">
        {value}
      </dd>
    </div>
  );
}
