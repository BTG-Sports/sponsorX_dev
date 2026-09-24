"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import {
  CloseIcon,
  Dropdown,
  FilterChip,
  SearchInput,
} from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import type { ReviewContentItem } from "@/lib/fixtures";
import {
  ADVANCE,
  AGING_HOURS,
  PIPELINE_STEPS,
  STATE_DETAIL,
  STATE_TONE,
  deskIndex,
  dueValue,
  inQueue,
  stateLabel,
  waitLabel,
  type EffectiveState,
} from "@/lib/approvals-ui";

/* --------------------------------------------------------------------------
   ApprovalsDesk — the content approval queue (2026-09-16 redesign). The
   page's one client island, following the ApplicationsDesk idioms exactly:

   - Tabs (Needs review / Cleared / All) with live counts, instant search and
     campaign / format / sort dropdowns; active filters render as dismissible
     chips. The queue renders as a card grid with the shared numbered pager
     (12/24/60 per page, controls above and below the grid). State syncs to
     the URL via replaceState (?tab=&q=&camp=&kind=&sort=&page=&size=), seeded
     back by the server page, so a filtered queue is shareable.
   - Clicking a row opens the review drawer (portaled to <body> — an
     sx-animate ancestor would trap position:fixed): signed-asset preview
     placeholder, a stage tracker that teaches the §21 pipeline in four desks,
     plain-English "what happens next", and the decision bar.
   - Advance / Request revision work locally ("kept for this visit only" —
     the ApplicationsDesk precedent) with Undo. Advancing walks the real state
     machine one step at a time, so approving from SPONSOR_REVIEW visibly
     moves the row to the Cleared tab.
   -------------------------------------------------------------------------- */

type Item = ReviewContentItem;

const TABS = [
  { key: "review", label: "Needs review" },
  { key: "cleared", label: "Cleared" },
  { key: "all", label: "All" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as readonly string[];

const KIND_OPTIONS = [
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
];

const SORT_OPTIONS = [
  { value: "due", label: "Due soonest" },
  { value: "newest", label: "Newest first" },
];

const DEFAULT_PAGE_SIZE = 12;
const SIZE_OPTIONS = [
  { value: "12", label: "12 / page" },
  { value: "24", label: "24 / page" },
  { value: "60", label: "60 / page" },
];

/** The drawer's confirmation line once a local decision has been made. */
function decidedLine(s: EffectiveState, it: Item): string | null {
  switch (s) {
    case "BTG_REVIEW":
      return "Review started — it's on the BTG desk now.";
    case "SPONSOR_REVIEW":
      return `Sent to ${it.sponsor} for their sign-off.`;
    case "APPROVED":
      return "Approved — cleared to publish. It now sits under the Cleared tab.";
    case "REVISION":
      return `Sent back to ${it.athlete} with a revision request.`;
    default:
      return null;
  }
}

/* -------------------------------------------------------------- AssetThumb */

function KindIcon({
  kind,
  className = "size-4",
}: {
  kind: Item["assetKind"];
  className?: string;
}) {
  return kind === "video" ? (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m21 15-4.5-4.5L9 18" />
    </svg>
  );
}

function AssetThumb({
  kind,
  className = "h-12 w-16",
  iconCls = "size-4",
}: {
  kind: Item["assetKind"];
  className?: string;
  iconCls?: string;
}) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-faint ${className}`}
      aria-hidden="true"
    >
      <KindIcon kind={kind} className={iconCls} />
    </span>
  );
}

/* ------------------------------------------------------------ StageTracker */

/** The four desks of §21, with this deliverable's desk highlighted — the
    drawer's teaching element, same visual language as the hero strip. */
function StageTracker({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1">
      {PIPELINE_STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "next";
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
            <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
              <span
                className={[
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  state === "done"
                    ? "border-accent/50 text-accent"
                    : state === "now"
                      ? "border-admin/60 bg-admin/15 text-admin"
                      : "border-line text-faint",
                ].join(" ")}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span
                className={[
                  "block text-[10px] leading-tight",
                  state === "now"
                    ? "font-semibold text-text"
                    : state === "done"
                      ? "text-muted"
                      : "text-faint",
                ].join(" ")}
              >
                {label}
              </span>
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-3 shrink-0 text-faint"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------ ApprovalsDesk */

export function ApprovalsDesk({
  items,
  demoParam,
  initial,
}: {
  items: Item[];
  demoParam?: string;
  initial?: Partial<
    Record<"tab" | "q" | "camp" | "kind" | "sort" | "page" | "size", string>
  >;
}) {
  const campaignOptions = useMemo(
    () => [...new Set(items.map((d) => d.campaign))].sort(),
    [items],
  );

  const clamp = (v: string | undefined, ok: readonly string[]) =>
    v && ok.includes(v) ? v : "";

  const [tab, setTab] = useState<TabKey>(() =>
    initial?.tab && TAB_KEYS.includes(initial.tab)
      ? (initial.tab as TabKey)
      : "review",
  );
  const [q, setQ] = useState(initial?.q ?? "");
  const [camp, setCamp] = useState(() => clamp(initial?.camp, campaignOptions));
  const [kind, setKind] = useState(() =>
    clamp(initial?.kind, KIND_OPTIONS.map((o) => o.value)),
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

  /* Any tab/filter/sort change resets to the first page — page 2 of "Cleared"
     is meaningless after switching back to the review tab. */
  const onFilter =
    (set: (v: string) => void) =>
    (v: string) => {
      set(v);
      setPage(1);
    };
  const changeTab = (t: TabKey) => {
    setTab(t);
    setPage(1);
  };
  /* A larger/smaller page size changes what "this page" means — back to one. */
  const changeSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  /* Demo decisions — local to this visit, undoable, never persisted. The
     value is where the deliverable moved to; Undo restores how it arrived. */
  const [moves, setMoves] = useState<Record<string, EffectiveState>>({});
  const eff = (it: Item): EffectiveState => moves[it.id] ?? it.state;

  const [openId, setOpenId] = useState<string | null>(null);
  /* Closing keeps the drawer mounted while the -out animation plays;
     unmount happens on its animationend (fallback timer in the drawer). */
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

  /* Filters live in the URL (no navigation) so a filtered queue is shareable
     and survives reload — the server page seeds `initial` back from it. */
  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = items.filter((it) => {
      const s = moves[it.id] ?? it.state;
      const tabOk =
        tab === "all" ? true : tab === "review" ? inQueue(s) : !inQueue(s);
      return (
        tabOk &&
        (!camp || it.campaign === camp) &&
        (!kind || it.assetKind === kind) &&
        (!needle ||
          [it.title, it.athlete, it.campaign, it.sponsor]
            .join(" ")
            .toLowerCase()
            .includes(needle))
      );
    });
    const by = (a: Item, b: Item) =>
      sort === "due"
        ? dueValue(a.dueDate) - dueValue(b.dueDate)
        : sort === "newest"
          ? a.waitingHours - b.waitingHours
          : b.waitingHours - a.waitingHours;
    return [...list].sort(by);
  }, [items, tab, needle, camp, kind, sort, moves]);

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  /* `page` is raw intent; `safePage` is the effective, in-range value used for
     slicing, the pager and the URL. A seeded ?page= past the end (e.g. after a
     filter narrows the set) simply clamps here — no write-back needed. */
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = shown.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, shown.length);

  /* Filters, page and size live in the URL (no navigation) so a filtered
     queue is shareable and survives reload — the server page seeds `initial`
     back from it. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (tab !== "review") p.set("tab", tab);
    if (q) p.set("q", q);
    if (camp) p.set("camp", camp);
    if (kind) p.set("kind", kind);
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
  }, [tab, q, camp, kind, sort, safePage, pageSize, demoParam]);

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

  const counts = useMemo(() => {
    const c = { review: 0, cleared: 0, all: items.length };
    for (const it of items) {
      if (inQueue(moves[it.id] ?? it.state)) c.review += 1;
      else c.cleared += 1;
    }
    return c;
  }, [items, moves]);

  const isFiltered = Boolean(needle || camp || kind);
  const reset = () => {
    setQ("");
    setCamp("");
    setKind("");
    setPage(1);
  };

  const sel = openId ? items.find((it) => it.id === openId) : undefined;

  return (
    <div>
      {/* ------------------------------------------------------------ tabs */}
      <div
        role="tablist"
        aria-label="Approval queue"
        className="mb-3 flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => changeTab(t.key)}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-admin/15 text-text" : "text-muted hover:text-text",
              ].join(" ")}
            >
              {t.label}
              <span
                className={[
                  "tabular-nums text-[10px]",
                  active ? "text-text" : "text-faint",
                ].join(" ")}
              >
                {counts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------- toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={onFilter(setQ)}
          placeholder="Search title, athlete, campaign or sponsor…"
          label="Search deliverables"
          tone="admin"
        />
        <Dropdown
          label="Filter by campaign"
          allLabel="All campaigns"
          value={camp}
          onChange={onFilter(setCamp)}
          options={campaignOptions.map((c) => ({ value: c, label: c }))}
          tone="admin"
        />
        <Dropdown
          label="Filter by format"
          allLabel="All formats"
          value={kind}
          onChange={onFilter(setKind)}
          options={KIND_OPTIONS}
          tone="admin"
        />
        <Dropdown
          label="Sort queue"
          allLabel="Waiting longest"
          value={sort}
          onChange={onFilter(setSort)}
          options={SORT_OPTIONS}
          tone="admin"
        />
      </div>

      {/* Active filters as dismissible chips — the row reads as what's
          applied; each ✕ removes one clause, "Clear all" removes them all. */}
      {isFiltered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {needle && (
            <FilterChip tone="admin" label="Remove search" onClear={() => onFilter(setQ)("")}>
              &ldquo;{q.trim()}&rdquo;
            </FilterChip>
          )}
          {camp && (
            <FilterChip tone="admin" label="Remove campaign filter" onClear={() => onFilter(setCamp)("")}>
              {camp}
            </FilterChip>
          )}
          {kind && (
            <FilterChip tone="admin" label="Remove format filter" onClear={() => onFilter(setKind)("")}>
              {KIND_OPTIONS.find((o) => o.value === kind)?.label}
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
            {shown.length === 1 ? "deliverable" : "deliverables"}
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------ cards */}
      {shown.length === 0 ? (
        <Card className="px-4 py-10 text-center">
          <p className="text-sm font-medium">
            {isFiltered ? "Nothing matches these filters" : "This queue is clear"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {isFiltered
              ? "Try a title, an athlete's name, or another tab."
              : tab === "cleared"
                ? "Approved and published content shows up here."
                : "Deliverables arrive here when athletes submit content."}
          </p>
          {isFiltered && (
            <button
              type="button"
              onClick={reset}
              className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
            >
              Clear all filters
            </button>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[11px] text-muted" aria-live="polite">
              Showing {rangeStart}–{rangeEnd} of {shown.length}
              {isFiltered ? " matching" : ""}
            </p>
            <Dropdown
              label="Deliverables per page"
              allLabel={`${pageSize} / page`}
              value={String(pageSize)}
              options={SIZE_OPTIONS}
              onChange={changeSize}
              tone="admin"
              includeAll={false}
            />
            <Pagination
              page={safePage}
              count={totalPages}
              onChange={setPage}
              tone="admin"
              alwaysShow
            />
          </div>

          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paged.map((it) => {
              const s = eff(it);
              const aging =
                inQueue(s) && s !== "REVISION" && it.waitingHours > AGING_HOURS;
              return (
                /* min-w-0: a grid item's min-width:auto lets a long title's
                   min-content push the implicit track past the viewport at
                   320px (the rail-card bug pattern, P1-QA sweep 3) */
                <li key={it.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => openItem(it.id)}
                    className="group flex h-full w-full flex-col rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-admin/40 hover:bg-surface-2/40 focus-visible:border-admin/40 focus-visible:outline-none"
                  >
                    {/* asset banner — stands in for the signed R2 thumbnail */}
                    <span className="relative grid h-24 w-full place-items-center rounded-lg border border-line bg-surface-2 text-faint">
                      <span className="text-center">
                        <KindIcon kind={it.assetKind} className="mx-auto size-6" />
                        <span className="mt-1 block text-[10px] font-medium">
                          {it.assetKind === "video" ? "Video" : "Image"} · v
                          {it.version}
                        </span>
                      </span>
                      <span className="absolute left-2 top-2">
                        <Badge tone={STATE_TONE[s]}>{stateLabel(s)}</Badge>
                      </span>
                      {aging && (
                        <span className="absolute right-2 top-2">
                          <Badge tone="warn">
                            waiting {waitLabel(it.waitingHours)}
                          </Badge>
                        </span>
                      )}
                    </span>

                    <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight">
                        {it.title}
                      </span>
                      {moves[it.id] && (
                        <span className="text-[10px] font-medium text-muted">
                          moved this visit
                        </span>
                      )}
                    </span>
                    <span className="mt-1 block truncate text-[11px] text-faint">
                      {it.athlete} · {it.campaign}
                    </span>

                    <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-[11px]">
                      <span className="truncate text-muted">{it.sponsor}</span>
                      <span className="shrink-0 text-faint">
                        due {it.dueDate}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <p className="mr-auto text-[11px] text-muted" aria-live="polite">
              Showing {rangeStart}–{rangeEnd} of {shown.length}
              {isFiltered ? " matching" : ""}
            </p>
            <Dropdown
              label="Deliverables per page"
              allLabel={`${pageSize} / page`}
              value={String(pageSize)}
              options={SIZE_OPTIONS}
              onChange={changeSize}
              tone="admin"
              includeAll={false}
              placement="up"
            />
            <Pagination
              page={safePage}
              count={totalPages}
              onChange={setPage}
              tone="admin"
              alwaysShow
            />
          </div>
        </div>
      )}

      {/* Review drawer — portaled to <body>: the section's sx-animate
          entrance leaves a transform on an ancestor (fill-mode: both), which
          would otherwise trap this position:fixed overlay inside it. */}
      {sel &&
        createPortal(
          <ReviewDrawer
            item={sel}
            state={eff(sel)}
            moved={Boolean(moves[sel.id])}
            onMove={(to) => setMoves((prev) => ({ ...prev, [sel.id]: to }))}
            onUndo={() =>
              setMoves((prev) => {
                const next = { ...prev };
                delete next[sel.id];
                return next;
              })
            }
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

/* ------------------------------------------------------------ ReviewDrawer */

function ReviewDrawer({
  item: it,
  state: s,
  moved,
  onMove,
  onUndo,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  item: Item;
  state: EffectiveState;
  moved: boolean;
  onMove: (to: EffectiveState) => void;
  onUndo: () => void;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  /* Unmount normally rides the slide-out's animationend, but that event is
     lost if the animation never runs (stale-CSS HMR). A fallback timer
     slightly past the 0.22s exit guarantees close anyway. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  const advance = s !== "REVISION" ? ADVANCE[s] : undefined;
  const line = moved ? decidedLine(s, it) : null;

  const details: Array<[string, string]> = [
    ["Athlete", it.athlete],
    ["Campaign", it.campaign],
    ["Sponsor", it.sponsor],
    ["Due", it.dueDate],
    ["Submitted", it.submittedAt],
  ];
  if (it.clearedAt) details.push(["Cleared", it.clearedAt]);

  return (
    <div
      className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={`${it.title} — content review`}
    >
      {/* click-away backdrop — no backdrop-blur: full-viewport blur visibly
          delays click handling on weak GPUs */}
      <button
        type="button"
        aria-label="Close review"
        onClick={onRequestClose}
        className={[
          closing ? "sx-backdrop-out" : "sx-backdrop",
          "absolute inset-0 cursor-default bg-black/55",
        ].join(" ")}
      />

      <div
        className={[
          closing ? "sx-drawer-out" : "sx-drawer",
          /* No overflow on the panel itself — the middle scrolls while the
             header and the decision bar stay pinned, so the primary action is
             always in reach. */
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        {/* header */}
        <div className="sx-animate sx-delay-1 flex shrink-0 items-center gap-3 border-b border-line-soft p-5">
          <AssetThumb kind={it.assetKind} className="h-10 w-14" />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight">
                {it.title}
              </span>
              <Badge tone="neutral">v{it.version}</Badge>
              <Badge tone={STATE_TONE[s]}>{stateLabel(s)}</Badge>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {it.athlete} · {it.campaign} · {it.sponsor}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onRequestClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* asset preview — stands in for the signed R2 fetch */}
          <div className="sx-animate sx-delay-2 border-b border-line-soft p-5">
            <div className="grid aspect-video w-full place-items-center rounded-xl border border-line bg-surface-2">
              <div className="text-center">
                <AssetThumb
                  kind={it.assetKind}
                  className="mx-auto size-12 rounded-full"
                  iconCls="size-5"
                />
                <p className="mt-2 text-[11px] font-medium text-muted">
                  {it.assetKind === "video" ? "Video draft" : "Image draft"} ·
                  v{it.version}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                title="Open the signed asset URL — not wired"
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
              >
                Open full asset
                <span aria-hidden="true">↗</span>
              </button>
              <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-faint">
                Creative lives in the private bucket — opened only through
                short-lived signed links, never public.
              </p>
            </div>
          </div>

          {/* where it is in the pipeline */}
          <div className="sx-animate sx-delay-3 border-b border-line-soft p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Where it is
            </p>
            <div className="mt-3">
              <StageTracker current={deskIndex(s)} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {STATE_DETAIL[s]}
            </p>
            {s === "PUBLISHED" && (
              <p className="mt-2 text-[10px] leading-relaxed text-faint">
                Usage-rights expiry is tracked from publication — if the window
                closes, this post is flagged for takedown.
              </p>
            )}
          </div>

          {/* details */}
          <div className="sx-animate sx-delay-4 p-5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Details
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              {details.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[10px] uppercase tracking-wide text-faint">
                    {k}
                  </dt>
                  <dd className="mt-0.5 truncate font-medium text-text">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed text-faint">
              Every review step is stamped with who and when, so a decision can
              be explained later.
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
          </div>
        </div>

        {/* decision bar — pinned */}
        <div className="sx-animate sx-delay-4 shrink-0 border-t border-line-soft p-5">
          <div aria-live="polite">
            {line && (
              <div
                className={[
                  "sx-pop mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5",
                  s === "APPROVED"
                    ? "border-accent/25 bg-accent/8"
                    : s === "REVISION"
                      ? "border-warn/25 bg-warn/8"
                      : "border-line bg-surface-2/60",
                ].join(" ")}
              >
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-text">
                  {line}
                </p>
                <button
                  type="button"
                  onClick={onUndo}
                  className="text-[11px] font-medium text-muted transition-colors hover:text-text"
                >
                  Undo
                </button>
              </div>
            )}
          </div>

          {advance && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onMove(advance.next)}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
              >
                {advance.label}
              </button>
              <button
                type="button"
                onClick={() => onMove("REVISION")}
                className="inline-flex items-center justify-center rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
              >
                Request revision
              </button>
            </div>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Demo decisions last for this visit only — nothing is saved.
          </p>
        </div>
      </div>
    </div>
  );
}
