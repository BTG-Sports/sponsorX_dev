"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Card } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import {
  CalendarIcon,
  ChevronDown,
  Dropdown,
  FilterChip,
  PANEL_CLS,
  SearchInput,
  triggerCls,
  useOutsideClose,
} from "@/components/filter-kit";
import { ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import { EARNING_COPY, earningItems, heldNote, money } from "@/lib/fixtures";
import {
  EARNING_TONE,
  JOURNEY,
  MONTHS,
  STAGE_INDEX,
  STATE_ORDER,
  STATUS_DETAIL,
  when,
} from "@/lib/earnings-ui";

/* --------------------------------------------------------------------------
   Recent-activity explorer for the athlete earnings page (2026-09-14, third
   pass). The page's one client island: search and the date / status / type
   filters apply instantly, and clicking a row opens a slide-over drawer with
   the full item. Native <select>s and the browser date UI looked off-brand
   next to the rest of the screen, so the controls are custom popovers — the
   generic ones (SearchInput, Dropdown, FilterChip, outside-click plumbing)
   now live in filter-kit.tsx, shared with the admin workspaces:

   - Dropdown — designed listbox (sx-pop entrance, check on the selected
     option, outside-click / Escape close).
   - DateRangePicker — a calendar popover, not a month <select>: days that
     have activity carry an accent dot, first click starts a range, second
     completes it (one click = that single day), "All dates" clears. The
     fixture world is 2026, so the calendar is pinned to 2026.
   - Reset is an icon button (broom ✕), not a text link.

   Filter state lives in the URL (history.replaceState, no navigation) as
   ?q=&from=May-10&to=May-18&status=&type=, seeded back by the server page,
   so filtered views stay shareable. The drawer portals to <body> — an
   sx-animate ancestor's transform would otherwise trap position:fixed.
   -------------------------------------------------------------------------- */

type Item = (typeof earningItems)[number];

/** Jan..Dec in calendar order (MONTHS preserves string-key insertion order). */
const MONTH_NAMES = Object.keys(MONTHS);

/** Day code = month*100 + day, matching `when()`. */
const fmtCode = (code: number) =>
  `${MONTH_NAMES[Math.floor(code / 100) - 1]} ${code % 100}`;

const serializeCode = (code: number) =>
  `${MONTH_NAMES[Math.floor(code / 100) - 1]}-${code % 100}`;

const parseCode = (s: string | undefined) => {
  if (!s) return null;
  const m = /^([A-Za-z]{3})-(\d{1,2})$/.exec(s);
  if (!m) return null;
  const mon = MONTHS[m[1]];
  const day = Number(m[2]);
  return mon && day >= 1 && day <= 31 ? mon * 100 + day : null;
};

/** "All dates" / "May 16" / "May 14 – May 16" — trigger and chip share it. */
const rangeLabel = (from: number | null, to: number | null) =>
  from === null
    ? "All dates"
    : to === null || to === from
      ? fmtCode(from)
      : `${fmtCode(from)} – ${fmtCode(to)}`;

/* -------------------------------------------------------- DateRangePicker */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const YEAR = 2026; // the fixture world's year — updatedAt strings carry no year

function DateRangePicker({
  from,
  to,
  onChange,
  markers,
  year = YEAR,
}: {
  from: number | null;
  to: number | null;
  onChange: (from: number | null, to: number | null) => void;
  markers: Set<number>;
  /** The calendar's year — the fixture world's 2026 unless the live page
   *  says otherwise. */
  year?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, () => setOpen(false), open);

  /* Open on the month being filtered, else the first month with activity. */
  const firstMarker = markers.size
    ? Math.min(...markers, 1231)
    : (new Date().getUTCMonth() + 1) * 100 + 1;
  const [view, setView] = useState(
    Math.floor((from ?? firstMarker) / 100) - 1,
  );

  const label = rangeLabel(from, to);

  const pick = (code: number) => {
    if (from !== null && to === null && code !== from) {
      const [a, b] = code < from ? [code, from] : [from, code];
      onChange(a, b);
    } else {
      onChange(code, null); // start a new range; alone it filters that day
    }
  };

  const startDow = new Date(year, view, 1).getDay();
  const daysInMonth = new Date(year, view + 1, 0).getDate();
  const end = to ?? from;

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label="Filter by date"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerCls(from !== null, open)}
      >
        <CalendarIcon />
        {label}
        <ChevronDown open={open} />
      </button>

      {open && (
        <div className={`${PANEL_CLS} w-64 p-3`} role="dialog" aria-label="Choose a date range">
          {/* month header */}
          <div className="flex items-center justify-between">
            <NavBtn dir={-1} disabled={view === 0} onClick={() => setView((v) => v - 1)} />
            <p className="text-xs font-semibold tracking-tight">
              {MONTH_NAMES[view]} {year}
            </p>
            <NavBtn dir={1} disabled={view === 11} onClick={() => setView((v) => v + 1)} />
          </div>

          {/* day-of-week row */}
          <div className="mt-2 grid grid-cols-7 text-center">
            {DOW.map((d, i) => (
              <span key={i} className="py-1 text-[9px] font-medium uppercase text-faint">
                {d}
              </span>
            ))}
          </div>

          {/* days */}
          <div className="grid grid-cols-7">
            {Array.from({ length: startDow }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const code = (view + 1) * 100 + day;
              const isEdge = code === from || code === end;
              const inRange =
                from !== null && end !== null && code > from && code < end;
              const hasActivity = markers.has(code);
              return (
                <button
                  key={day}
                  type="button"
                  aria-label={`${MONTH_NAMES[view]} ${day}`}
                  aria-pressed={isEdge || inRange}
                  onClick={() => pick(code)}
                  className={[
                    "relative mx-auto grid size-8 place-items-center rounded-full text-[11px] tabular-nums transition-colors",
                    isEdge
                      ? "bg-primary font-semibold text-cta-ink"
                      : inRange
                        ? "bg-primary/15 text-text"
                        : "text-muted hover:bg-surface-2 hover:text-text",
                  ].join(" ")}
                >
                  {day}
                  {hasActivity && (
                    <span
                      aria-hidden="true"
                      className={[
                        "absolute bottom-1 size-1 rounded-full",
                        isEdge ? "bg-cta-ink" : "bg-accent",
                      ].join(" ")}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* footer */}
          <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
            <p className="text-[10px] text-faint">
              {from !== null && to === null
                ? "Pick another day to make it a range"
                : markers.size
                  ? "Dots mark days with activity"
                  : "Pick a day, or two for a range"}
            </p>
            <button
              type="button"
              onClick={() => onChange(null, null)}
              disabled={from === null}
              className="text-[11px] font-medium text-accent transition-colors hover:text-accent-soft disabled:pointer-events-none disabled:opacity-40"
            >
              All dates
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({
  dir,
  disabled,
  onClick,
}: {
  dir: -1 | 1;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={dir === 1 ? "Next month" : "Previous month"}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
        <path d={dir === 1 ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
      </svg>
    </button>
  );
}

/* ------------------------------------------------------- ActivityExplorer */

export function ActivityExplorer({
  items,
  demoParam,
  initial,
}: {
  items: Item[];
  demoParam?: string;
  initial?: Partial<Record<"q" | "from" | "to" | "status" | "type", string>>;
}) {
  /* Options come from the athlete's own rows, so a filter can never be empty
     by construction; initial URL params are clamped against them (a stale
     link degrades to "all", never to a broken filter). */
  const statusOptions = useMemo(
    () => STATE_ORDER.filter((s) => items.some((e) => e.state === s)),
    [items],
  );
  const typeOptions = useMemo(
    () => [...new Set(items.map((e) => e.jobName))].sort(),
    [items],
  );
  /** Day codes that have at least one order — the calendar's dots. */
  const markers = useMemo(
    () => new Set(items.map((e) => when(e.updatedAt))),
    [items],
  );

  const clamp = (v: string | undefined, ok: readonly string[]) =>
    v && ok.includes(v) ? v : "";

  const [q, setQ] = useState(initial?.q ?? "");
  const [status, setStatus] = useState(() => clamp(initial?.status, statusOptions));
  const [type, setType] = useState(() => clamp(initial?.type, typeOptions));
  const [from, setFrom] = useState<number | null>(() => parseCode(initial?.from));
  const [to, setTo] = useState<number | null>(() => {
    const f = parseCode(initial?.from);
    const t = parseCode(initial?.to);
    return f !== null && t !== null && t >= f ? t : null;
  });
  const [openId, setOpenId] = useState<string | null>(null);
  /* Closing keeps the drawer mounted while the -out animation plays;
     unmount happens on its animationend (fallback timer in Drawer). */
  const [closing, setClosing] = useState(false);

  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const openItem = (id: string) => {
    lastFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setClosing(false);
    setOpenId(id);
  };
  const requestClose = () => setClosing(true);
  const finishClose = () => {
    setClosing(false);
    setOpenId(null);
    lastFocus.current?.focus();
  };

  /* Filters live in the URL (no navigation) so a filtered view is shareable
     and survives reload — the server page seeds `initial` back from it. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (q) p.set("q", q);
    if (from !== null) p.set("from", serializeCode(from));
    if (to !== null) p.set("to", serializeCode(to));
    if (status) p.set("status", status);
    if (type) p.set("type", type);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, from, to, status, type, demoParam]);

  /* Drawer: Escape closes, page scroll locks behind it, focus lands on the
     close button and returns to the row on close. */
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId]);

  const needle = q.trim().toLowerCase();
  const rangeEnd = to ?? from;
  const shown = useMemo(
    () =>
      items.filter((e) => {
        const day = when(e.updatedAt);
        return (
          (!status || e.state === status) &&
          (!type || e.jobName === type) &&
          (from === null || (day >= from && day <= (rangeEnd as number))) &&
          (!needle ||
            [e.campaign, e.jobName, e.jobId, e.reference ?? "", EARNING_COPY[e.state]]
              .join(" ")
              .toLowerCase()
              .includes(needle))
        );
      }),
    [items, needle, status, type, from, rangeEnd],
  );
  const isFiltered = Boolean(needle || status || type || from !== null);
  const reset = () => {
    setQ("");
    setStatus("");
    setType("");
    setFrom(null);
    setTo(null);
  };

  const sel = openId ? items.find((e) => e.id === openId) : undefined;

  return (
    <div>
      {/* --------------------------------------------------------- toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search campaign, job or reference…"
          label="Search activity"
        />

        <DateRangePicker
          from={from}
          to={to}
          markers={markers}
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
        <Dropdown
          label="Filter by status"
          allLabel="All statuses"
          value={status}
          onChange={setStatus}
          options={statusOptions.map((s) => ({ value: s, label: EARNING_COPY[s] }))}
        />
        <Dropdown
          label="Filter by job type"
          allLabel="All types"
          value={type}
          onChange={setType}
          options={typeOptions.map((t) => ({ value: t, label: t }))}
        />

      </div>

      {/* Active filters as dismissible chips — the row reads as what's
          applied; each ✕ removes one clause, "Clear all" removes them all. */}
      {isFiltered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {needle && (
            <FilterChip label="Remove search" onClear={() => setQ("")}>
              &ldquo;{q.trim()}&rdquo;
            </FilterChip>
          )}
          {from !== null && (
            <FilterChip
              label="Remove date filter"
              icon={
                <span className="text-athlete [&>svg]:size-3">
                  <CalendarIcon />
                </span>
              }
              onClear={() => {
                setFrom(null);
                setTo(null);
              }}
            >
              {rangeLabel(from, to)}
            </FilterChip>
          )}
          {status && (
            <FilterChip label="Remove status filter" onClear={() => setStatus("")}>
              {EARNING_COPY[status as keyof typeof EARNING_COPY]}
            </FilterChip>
          )}
          {type && (
            <FilterChip label="Remove type filter" onClear={() => setType("")}>
              {type}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium text-muted transition-colors hover:text-danger"
          >
            Clear all
          </button>
          <p className="ml-auto text-xs text-muted">
            {shown.length} of {items.length}{" "}
            {shown.length === 1 ? "order" : "orders"}
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------ list */}
      <ActivityRows shown={shown} onOpen={openItem} onReset={reset} />

      {/* Detail drawer — portaled to <body>: the section's sx-animate
          entrance leaves a transform on an ancestor (fill-mode: both), which
          would otherwise become the containing block for position:fixed and
          trap the "full-screen" overlay inside the section. */}
      {sel &&
        createPortal(
          <Drawer
            item={sel}
            closing={closing}
            onRequestClose={requestClose}
            onClosed={finishClose}
            closeBtnRef={closeBtnRef}
          />,
          document.body,
        )}
    </div>
  );
}

/* ---------------------------------------------------------- ActivityRows */

function ActivityRows({
  shown,
  onOpen,
  onReset,
}: {
  shown: Item[];
  onOpen: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <Card className="p-0">
      {shown.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-medium">Nothing matches these filters</p>
          <p className="mt-1 text-xs text-muted">
            Try a campaign name, a job like &ldquo;Sponsored Post&rdquo;, or a
            wider date range.
          </p>
          <button
            type="button"
            onClick={onReset}
            className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {shown.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
              >
                <Monogram
                  text={initials(e.campaign)}
                  tone={
                    e.state === "PAID"
                      ? "accent"
                      : e.state === "HELD" || e.state === "DISPUTED"
                        ? "neutral"
                        : "primary"
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold tracking-tight">
                    {e.campaign}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-faint">
                    {e.jobName} · updated {e.updatedAt}
                  </span>
                </span>
                <Badge tone={EARNING_TONE[e.state]}>
                  {EARNING_COPY[e.state]}
                </Badge>
                <span className="w-16 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {money(e.amount)}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 shrink-0 text-faint"
                  aria-hidden="true"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ------------------------------------------------- ServerActivityExplorer

   The same explorer over a SERVER-PAGED list (2026-09-29, live athlete
   earnings). `items` is one page the API already filtered and sorted; every
   control writes the URL (?q ?from ?to ?status ?type, ?page ?size) through
   <ServerList>, and the server page asks GET /earnings?page= for exactly
   that page. Options come from GET /earnings/summary (states the athlete
   has, their job names), so they still can't be empty by construction.
   The calendar carries no activity dots here — marking every active day
   would mean fetching every row, which is the thing this replaces. */

export function ServerActivityExplorer(props: {
  items: Item[];
  page: PageInfo;
  statusOptions: string[];
  typeOptions: string[];
  year: number;
  initial: Record<"q" | "from" | "to" | "status" | "type", string>;
}) {
  return (
    <ServerList>
      <ServerExplorerInner {...props} />
    </ServerList>
  );
}

const NO_MARKERS = new Set<number>();

function ServerExplorerInner({
  items,
  page,
  statusOptions,
  typeOptions,
  year,
  initial,
}: {
  items: Item[];
  page: PageInfo;
  statusOptions: string[];
  typeOptions: string[];
  year: number;
  initial: Record<"q" | "from" | "to" | "status" | "type", string>;
}) {
  const { set } = useListNav();
  const status = statusOptions.includes(initial.status) ? initial.status : "";
  const type = typeOptions.includes(initial.type) ? initial.type : "";
  const from = parseCode(initial.from);
  const toRaw = parseCode(initial.to);
  const to = from !== null && toRaw !== null && toRaw >= from ? toRaw : null;
  const q = initial.q.trim();
  const isFiltered = Boolean(q || status || type || from !== null);
  const reset = () => set({ q: null, from: null, to: null, status: null, type: null });

  const [openId, setOpenId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const openItem = (id: string) => {
    lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setClosing(false);
    setOpenId(id);
  };
  const finishClose = () => {
    setClosing(false);
    setOpenId(null);
    lastFocus.current?.focus();
  };
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openId]);
  const sel = openId ? items.find((e) => e.id === openId) : undefined;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ListSearch
          initial={initial.q}
          label="Search activity"
          placeholder="Search campaign, job or reference…"
          tone="athlete"
        />
        <DateRangePicker
          from={from}
          to={to}
          markers={NO_MARKERS}
          year={year}
          onChange={(f, t) =>
            set({ from: f === null ? null : serializeCode(f), to: t === null ? null : serializeCode(t) })
          }
        />
        <Dropdown
          label="Filter by status"
          allLabel="All statuses"
          value={status}
          onChange={(v) => set({ status: v || null })}
          options={statusOptions.map((s) => ({ value: s, label: EARNING_COPY[s as keyof typeof EARNING_COPY] ?? s }))}
        />
        <Dropdown
          label="Filter by job type"
          allLabel="All types"
          value={type}
          onChange={(v) => set({ type: v || null })}
          options={typeOptions.map((t) => ({ value: t, label: t }))}
        />
      </div>

      {isFiltered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {q && (
            <FilterChip label="Remove search" onClear={() => set({ q: null })}>
              &ldquo;{q}&rdquo;
            </FilterChip>
          )}
          {from !== null && (
            <FilterChip
              label="Remove date filter"
              icon={
                <span className="text-athlete [&>svg]:size-3">
                  <CalendarIcon />
                </span>
              }
              onClear={() => set({ from: null, to: null })}
            >
              {rangeLabel(from, to)}
            </FilterChip>
          )}
          {status && (
            <FilterChip label="Remove status filter" onClear={() => set({ status: null })}>
              {EARNING_COPY[status as keyof typeof EARNING_COPY]}
            </FilterChip>
          )}
          {type && (
            <FilterChip label="Remove type filter" onClear={() => set({ type: null })}>
              {type}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium text-muted transition-colors hover:text-danger"
          >
            Clear all
          </button>
        </div>
      )}

      <div className="mb-3">
        <PagerRow page={page} noun="Orders" tone="athlete" position="top" filtered={isFiltered} />
      </div>
      <PendingList>
        <ActivityRows shown={items} onOpen={openItem} onReset={reset} />
      </PendingList>
      <PagerRow page={page} noun="Orders" tone="athlete" position="bottom" filtered={isFiltered} />

      {sel &&
        createPortal(
          <Drawer
            item={sel}
            closing={closing}
            onRequestClose={() => setClosing(true)}
            onClosed={finishClose}
            closeBtnRef={closeBtnRef}
          />,
          document.body,
        )}
    </div>
  );
}

/* ----------------------------------------------------------------- Drawer */

function Drawer({
  item: e,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  item: Item;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const stage = STAGE_INDEX[e.state];
  const offRamp = stage === undefined; // HELD / DISPUTED

  /* Unmount normally rides the slide-out's animationend, but that event is
     lost if the animation never runs (stale-CSS HMR, display:none ancestor).
     A fallback timer slightly past the 0.22s exit guarantees close anyway. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  return (
    <div
      className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={`${e.campaign} — earning details`}
    >
      {/* click-away backdrop */}
      <button
        type="button"
        aria-label="Close details"
        onClick={onRequestClose}
        className={[
          closing ? "sx-backdrop-out" : "sx-backdrop",
          /* no backdrop-blur: blurring the full viewport is a compositing
             cost that visibly delays click handling on weak GPUs, for an
             effect that's imperceptible at 2px */
          "absolute inset-0 cursor-default bg-black/55",
        ].join(" ")}
      />

      <div
        className={[
          closing ? "sx-drawer-out" : "sx-drawer",
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          /* Children's sx-animate ends bubble here too — only the panel's
             own slide-out means "now unmount". */
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        {/* header */}
        <div className="sx-animate sx-delay-1 flex items-center gap-3 border-b border-line-soft p-5">
          <Monogram
            text={initials(e.campaign)}
            tone={e.state === "PAID" ? "accent" : offRamp ? "neutral" : "primary"}
            className="size-10 text-xs"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">
              {e.campaign}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
              {e.jobName} <Badge tone="neutral">{e.jobId}</Badge>
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onRequestClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-3.5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {/* amount + status */}
        <div className="sx-animate sx-delay-2 border-b border-line-soft p-5">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            Amount
          </p>
          <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent">
            {money(e.amount)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
            <Badge tone={EARNING_TONE[e.state]}>{EARNING_COPY[e.state]}</Badge>
            updated {e.updatedAt}, 2026
          </p>
        </div>

        {/* the journey for this order */}
        <div className="sx-animate sx-delay-3 flex-1 p-5">
          {offRamp ? (
            <div className="flex flex-wrap items-start gap-2 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2.5">
              <Badge tone="danger">{EARNING_COPY[e.state]}</Badge>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
                {e.state === "HELD"
                  ? heldNote.replace(" (§21)", "")
                  : STATUS_DETAIL[e.state]}
              </p>
            </div>
          ) : (
            <ol>
              {JOURNEY.map((s, i) => {
                const done = i < stage;
                const current = i === stage;
                const reached = done || current;
                const last = i === JOURNEY.length - 1;
                return (
                  <li key={s.state} className="relative flex gap-3">
                    {!last && (
                      <span
                        aria-hidden="true"
                        className={[
                          "absolute left-[9px] top-6 bottom-1 w-px",
                          done ? "bg-primary" : "bg-line",
                        ].join(" ")}
                      />
                    )}
                    <span
                      className={[
                        "z-10 mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full text-[9px] font-bold",
                        reached
                          ? last
                            ? "bg-accent text-cta-ink"
                            : "bg-primary text-cta-ink"
                          : "border border-line bg-surface text-faint",
                      ].join(" ")}
                    >
                      {done || (current && last) ? "✓" : i + 1}
                    </span>
                    <div className={last ? "" : "pb-5"}>
                      <p
                        className={[
                          "text-xs",
                          current
                            ? "font-semibold text-text"
                            : done
                              ? "font-medium text-muted"
                              : "text-faint",
                        ].join(" ")}
                      >
                        {s.title}
                      </p>
                      {current && (
                        <p className="mt-1 text-[11px] leading-relaxed text-muted">
                          {STATUS_DETAIL[e.state]}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft pt-4 text-[11px]">
            <div>
              <dt className="text-faint">Payout reference</dt>
              <dd className="mt-0.5 text-muted">
                {e.reference ? (
                  <code className="font-mono">{e.reference}</code>
                ) : (
                  "— assigned at approval"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Last update</dt>
              <dd className="mt-0.5 text-muted">{e.updatedAt}, 2026</dd>
            </div>
          </dl>
        </div>

        {/* footer */}
        <p className="sx-animate sx-delay-4 border-t border-line-soft p-5 text-[10px] leading-relaxed text-faint">
          Payouts are sent by BTG Finance outside SponsorX — your bank details
          never touch the platform.
        </p>
      </div>
    </div>
  );
}
