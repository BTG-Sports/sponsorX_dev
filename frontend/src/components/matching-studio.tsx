"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card } from "@/components/ui";
import {
  CloseIcon,
  Dropdown,
  FilterChip,
  SearchInput,
} from "@/components/filter-kit";
import { ScoreRing } from "@/components/score-ring";
import {
  cx,
  MarginValue,
  ProvenanceMark,
  ScoreCell,
  StatusPill,
  TierMark,
  TweenNumber,
} from "@/components/matching-bits";
import { ConflictDrawer } from "@/components/matching-conflict";
import { MatchingCompare } from "@/components/matching-compare";
import { MatchingReview } from "@/components/matching-review";
import {
  activeFilterCount,
  athleteById,
  blendedMargin,
  breachedLines,
  byIds,
  canShortlist,
  CONFLICT_DETAILS,
  DEFAULT_FILTERS,
  DEFAULT_SHORTLIST,
  filterRoster,
  fmtRatio,
  fmtReach,
  jobFor,
  JOBS,
  marginBand,
  MARGIN_FLOOR,
  MATCH_BRIEF,
  MATCH_ROSTER,
  MIN_SCORE_CEIL,
  MIN_SCORE_FLOOR,
  relaxSuggestions,
  slotFill,
  SORT_OPTIONS,
  statusFor,
  type MatchAthlete,
  type MatchFilters,
  type MatchSort,
} from "@/lib/matching";
import { money } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Matching Studio — P4-ART-01 in-app (2026-09-21). The densest screen in the
   product: a sponsor brief's constraints, the eligible-athlete list with
   score/reach/cost/sell/margin per row, and the shortlist being assembled —
   plus the comparison, conflict-detail, review-&-send and nothing-matches
   states from the accepted design.

   One island, three views (workspace → compare → review) with directional
   transitions, URL-synced so a filtered view is shareable. Fixtures only —
   the real eligible query is P4-BE-03 (Blocked); demo actions are local to
   the visit and undoable, roster-ops discipline.

   Responsive contract (the brief was 1440-only; the build is not). The
   portal sidebar eats 224px, so the mock's three-zone 1440 doesn't transfer
   verbatim — zones earn their place one breakpoint later than the comp:
   2xl+  filter rail · table · sticky shortlist dock
   xl+   table · dock (filters move to the toolbar + sheet)
   lg+   full-width table, fixed bottom dock expandable to a sheet
   <lg   athlete cards, filters in a sheet, same bottom dock
   Athlete cost never gets its own column — it rides as a subline under Sell
   at every width (and in the dock, compare and review), so the BTG-internal
   figure stays readable without forcing a horizontal scroll.
   -------------------------------------------------------------------------- */

type View = "workspace" | "compare" | "review";
const VIEW_ORDER: View[] = ["workspace", "compare", "review"];

type Sheet = "filters" | "shortlist" | null;

const TIERS = ["Premium", "Creator", "Emerging"] as const;

export function MatchingStudio({
  initial,
}: {
  initial?: Partial<Record<"view" | "q" | "sport" | "tier" | "min", string>>;
}) {
  /* ------------------------------------------------------------- state */
  const [filters, setFilters] = useState<MatchFilters>(() => ({
    ...DEFAULT_FILTERS,
    q: initial?.q ?? "",
    sport: initial?.sport ?? "",
    tier: TIERS.includes(initial?.tier as (typeof TIERS)[number])
      ? (initial?.tier as string)
      : "",
    minScore: clampScore(Number(initial?.min) || MIN_SCORE_FLOOR),
  }));
  const [sort, setSort] = useState<MatchSort>("score");
  const [picked, setPicked] = useState<string[]>(DEFAULT_SHORTLIST);
  const [view, setViewRaw] = useState<View>(() =>
    initial?.view === "compare" || initial?.view === "review"
      ? initial.view
      : "workspace",
  );
  const [dir, setDir] = useState(1);
  const [ack, setAck] = useState(false);
  const [sent, setSent] = useState(false);

  /* Conflict drawer — mounted while closing so the slide-out plays. */
  const [conflictId, setConflictId] = useState<string | null>(null);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  /* Bottom sheets (filters / shortlist) below xl. */
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetClosing, setSheetClosing] = useState(false);

  const viewRef = useRef<HTMLDivElement>(null);
  const prevView = useRef(view);

  /* ----------------------------------------------------------- derived */
  const { matched, blocked } = useMemo(
    () => filterRoster(MATCH_ROSTER, filters, sort),
    [filters, sort],
  );
  const pickedAthletes = useMemo(() => byIds(picked), [picked]);
  const blended = useMemo(() => blendedMargin(pickedAthletes), [pickedAthletes]);
  const breaches = useMemo(() => breachedLines(pickedAthletes), [pickedAthletes]);
  const { slots, overflow } = useMemo(
    () => slotFill(pickedAthletes),
    [pickedAthletes],
  );
  const filled = slots.filter((s) => s.athlete).length;

  const sportOptions = useMemo(
    () => [...new Set(MATCH_ROSTER.map((a) => a.sport))].sort(),
    [],
  );
  const tierCounts = useMemo(() => {
    const base = MATCH_ROSTER.filter((a) => !a.conflict && a.active);
    return {
      all: base.length,
      Premium: base.filter((a) => a.tier === "Premium").length,
      Creator: base.filter((a) => a.tier === "Creator").length,
      Emerging: base.filter((a) => a.tier === "Emerging").length,
    };
  }, []);

  const filterCount = activeFilterCount(filters);

  /* --------------------------------------------------------- url sync */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const setOrDel = (k: string, v: string) => (v ? p.set(k, v) : p.delete(k));
    setOrDel("view", view === "workspace" ? "" : view);
    setOrDel("q", filters.q.trim());
    setOrDel("sport", filters.sport);
    setOrDel("tier", filters.tier);
    setOrDel("min", filters.minScore > MIN_SCORE_FLOOR ? String(filters.minScore) : "");
    const qs = p.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    if (
      next !==
      window.location.pathname + window.location.search + window.location.hash
    ) {
      window.history.replaceState(null, "", next);
    }
  }, [view, filters]);

  /* View changes move focus to the new view's container (join-wizard
     discipline). Guarded by the previous value, not a mount flag — a mount
     flag re-fires under StrictMode's double effect run and yanks the page
     down to the container on first load. */
  useEffect(() => {
    if (prevView.current === view) return;
    prevView.current = view;
    viewRef.current?.focus();
  }, [view]);

  /* Overlays: Escape closes, body scroll locks, focus is restored. */
  const overlayOpen = Boolean(conflictId) || Boolean(sheet);
  useEffect(() => {
    if (!overlayOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrawerClosing(true);
        setSheetClosing(true);
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  /* ----------------------------------------------------------- actions */
  const setView = (next: View) => {
    setDir(VIEW_ORDER.indexOf(next) >= VIEW_ORDER.indexOf(view) ? 1 : -1);
    setViewRaw(next);
  };

  const togglePick = (a: MatchAthlete) => {
    if (!canShortlist(a)) return;
    setSent(false);
    setPicked((prev) =>
      prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id],
    );
  };
  const removePick = (id: string) => {
    setSent(false);
    setPicked((prev) => prev.filter((x) => x !== id));
  };

  const openConflict = (id: string) => {
    lastFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDrawerClosing(false);
    setConflictId(id);
  };
  const finishDrawerClose = () => {
    setDrawerClosing(false);
    setConflictId(null);
    lastFocus.current?.focus();
  };

  const openSheet = (s: Exclude<Sheet, null>) => {
    lastFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheetClosing(false);
    setSheet(s);
  };
  const finishSheetClose = () => {
    setSheetClosing(false);
    setSheet(null);
    lastFocus.current?.focus();
  };

  const conflictAthlete = conflictId ? athleteById(conflictId) : null;
  const conflictDetail = conflictId ? CONFLICT_DETAILS[conflictId] : null;

  /* ------------------------------------------------------------ render */
  const dockProps = {
    picked: pickedAthletes,
    filled,
    overflow,
    slots,
    blended,
    breaches,
    onRemove: removePick,
    onCompare: () => {
      setSheetClosing(true);
      setView("compare");
    },
    onReview: () => {
      setSheetClosing(true);
      setView("review");
    },
  };

  return (
    <div className={cx("space-y-5", view === "workspace" && "pb-20 xl:pb-0")}>
      <BriefBand filled={filled} />

      <div
        key={view}
        ref={viewRef}
        tabIndex={-1}
        className="sx-join-step outline-none"
        style={{ ["--sx-from" as string]: dir > 0 ? "28px" : "-28px" }}
      >
        {view === "compare" ? (
          <MatchingCompare
            athletes={pickedAthletes}
            onRemove={(id) => {
              removePick(id);
              if (pickedAthletes.length <= 1) setView("workspace");
            }}
            onBack={() => setView("workspace")}
            onContinue={() => setView("review")}
          />
        ) : view === "review" ? (
          <MatchingReview
            athletes={pickedAthletes}
            ack={ack}
            onAck={setAck}
            sent={sent}
            onSend={() => setSent(true)}
            onUndo={() => setSent(false)}
            onBack={() => setView("workspace")}
          />
        ) : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start 2xl:grid-cols-[14rem_minmax(0,1fr)_19rem]">
            {/* ------------------------------------------------ filter rail */}
            <aside className="hidden 2xl:sticky 2xl:top-6 2xl:block">
              <Card className="p-4">
                <FilterControls
                  idPrefix="rail"
                  filters={filters}
                  onChange={setFilters}
                  sportOptions={sportOptions}
                  tierCounts={tierCounts}
                />
              </Card>
            </aside>

            {/* ------------------------------------------------------ main */}
            <div className="min-w-0 space-y-3">
              {/* toolbar — search + filters trigger below 2xl (the rail
                  covers them there), meta + sort everywhere */}
              <div className="flex flex-wrap items-center gap-2 2xl:hidden">
                <SearchInput
                  value={filters.q}
                  onChange={(q) => setFilters((f) => ({ ...f, q }))}
                  placeholder="Name, sport or market…"
                  label="Search athletes"
                  tone="admin"
                />
                <button
                  type="button"
                  onClick={() => openSheet("filters")}
                  className={cx(
                    "flex items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-xs transition-colors",
                    filterCount > 0
                      ? "border-admin/40 text-text"
                      : "border-line text-muted hover:text-text",
                  )}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-3.5"
                    aria-hidden="true"
                  >
                    <path d="M4 6h16M7 12h10M10 18h4" />
                  </svg>
                  Filters
                  {filterCount > 0 && (
                    <span className="grid size-4 place-items-center rounded-full bg-admin/15 text-[10px] font-semibold text-text">
                      {filterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* active filter chips (below 2xl — the rail shows state above) */}
              {filterCount > 0 && (
                <div
                  className="flex flex-wrap items-center gap-2 2xl:hidden"
                  aria-live="polite"
                >
                  {filters.q.trim() && (
                    <FilterChip
                      tone="admin"
                      label="Remove search"
                      onClear={() => setFilters((f) => ({ ...f, q: "" }))}
                    >
                      &ldquo;{filters.q.trim()}&rdquo;
                    </FilterChip>
                  )}
                  {filters.sport && (
                    <FilterChip
                      tone="admin"
                      label="Remove sport filter"
                      onClear={() => setFilters((f) => ({ ...f, sport: "" }))}
                    >
                      {filters.sport}
                    </FilterChip>
                  )}
                  {filters.tier && (
                    <FilterChip
                      tone="admin"
                      label="Remove tier filter"
                      onClear={() => setFilters((f) => ({ ...f, tier: "" }))}
                    >
                      {filters.tier}
                    </FilterChip>
                  )}
                  {filters.minScore > MIN_SCORE_FLOOR && (
                    <FilterChip
                      tone="admin"
                      label="Remove minimum score"
                      onClear={() =>
                        setFilters((f) => ({ ...f, minScore: MIN_SCORE_FLOOR }))
                      }
                    >
                      Score ≥ {filters.minScore}
                    </FilterChip>
                  )}
                  {filters.guardianOnly && (
                    <FilterChip
                      tone="admin"
                      label="Remove guardian filter"
                      onClear={() => setFilters((f) => ({ ...f, guardianOnly: false }))}
                    >
                      Guardian-verified
                    </FilterChip>
                  )}
                  {!filters.activeOnly && (
                    <FilterChip
                      tone="admin"
                      label="Restore approved-and-active filter"
                      onClear={() => setFilters((f) => ({ ...f, activeOnly: true }))}
                    >
                      Incl. not-yet-active
                    </FilterChip>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilters(DEFAULT_FILTERS)}
                    className="text-[11px] font-medium text-muted transition-colors hover:text-danger"
                  >
                    Clear all
                  </button>
                </div>
              )}

              {/* result meta + legend + sort */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 text-[11px] text-muted">
                  <span className="font-semibold text-text">
                    {matched.length} athlete{matched.length === 1 ? "" : "s"} match
                  </span>{" "}
                  <span className="text-faint">
                    · of {MATCH_ROSTER.length} eligible returned · {blocked.length}{" "}
                    blocked by conflict, kept visible
                  </span>
                </p>
                <div className="ml-auto flex items-center gap-3">
                  <Legend />
                  <Dropdown
                    label="Sort athletes"
                    allLabel=""
                    includeAll={false}
                    value={sort}
                    onChange={(v) => setSort(v as MatchSort)}
                    options={SORT_OPTIONS}
                    tone="admin"
                  />
                </div>
              </div>

              {/* ------------------------------------------------ the list */}
              {matched.length === 0 ? (
                <EmptyState
                  filters={filters}
                  onPatch={(patch) => setFilters((f) => ({ ...f, ...patch }))}
                  onClear={() => setFilters(DEFAULT_FILTERS)}
                />
              ) : (
                <Card className="p-0 max-lg:border-0 max-lg:bg-transparent">
                  <TableHeader />
                  <ul className={LIST_CLS}>
                    {matched.map((a, i) => (
                      <AthleteRow
                        key={a.id}
                        athlete={a}
                        index={i}
                        picked={picked.includes(a.id)}
                        onToggle={() => togglePick(a)}
                        onWhy={() => openConflict(a.id)}
                      />
                    ))}
                  </ul>
                </Card>
              )}

              {/* blocked — never hidden, whatever the filters say */}
              {blocked.length > 0 && (
                <div>
                  <p className="mb-2 mt-4 flex items-center gap-2 text-[11px] font-medium text-muted">
                    <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
                    Blocked, not hidden
                    <span className="font-normal text-faint">
                      — {blocked.length === 1 ? "this athlete" : "these athletes"}{" "}
                      carry a declared conflict. Shown so nobody wonders where they
                      went.
                    </span>
                  </p>
                  <Card className="p-0 max-lg:border-0 max-lg:bg-transparent">
                    <ul className={LIST_CLS}>
                      {blocked.map((a, i) => (
                        <AthleteRow
                          key={a.id}
                          athlete={a}
                          index={matched.length + i}
                          picked={false}
                          onToggle={() => {}}
                          onWhy={() => openConflict(a.id)}
                        />
                      ))}
                    </ul>
                  </Card>
                </div>
              )}

              <p className="text-[10px] leading-relaxed text-faint">
                Score is the §14 Content Value Score — a stored snapshot
                ({MATCH_BRIEF.scoreMethod}, {MATCH_BRIEF.scoreSnapshot}), not a live
                calculation. Reach is platform-verified where connected, otherwise
                self-reported. Cost comes from the athlete&apos;s rate card; sell
                price from the package band.
              </p>
            </div>

            {/* -------------------------------------------------- dock (xl) */}
            <aside className="hidden xl:sticky xl:top-6 xl:block">
              <ShortlistDock {...dockProps} />
            </aside>
          </div>
        )}
      </div>

      {/* ------------------------------------------- bottom dock (< xl) */}
      {view === "workspace" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/85 px-4 py-2.5 backdrop-blur-xl xl:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <button
              type="button"
              onClick={() => openSheet("shortlist")}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              aria-label={`Open shortlist — ${filled} of ${MATCH_BRIEF.needed} filled`}
            >
              <span className="flex w-16 shrink-0 gap-0.5" aria-hidden="true">
                {slots.map((s, i) => (
                  <span
                    key={i}
                    className={cx(
                      "h-1.5 flex-1 rounded-full",
                      s.athlete ? "bg-primary" : "bg-surface-2",
                    )}
                  />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold tabular-nums">
                  {filled} of {MATCH_BRIEF.needed}
                  <span className="ml-2 font-medium text-muted">
                    {money(blended.sell)}
                  </span>
                  {pickedAthletes.length > 0 && (
                    <span
                      className={cx(
                        "ml-2 font-medium",
                        marginBand(blended.ratio) === "below"
                          ? "text-accent"
                          : marginBand(blended.ratio) === "thin"
                            ? "text-warn"
                            : "text-success",
                      )}
                    >
                      {blended.pct}%
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-faint">
                  Shortlist · tap for detail
                  {breaches.length > 0 && (
                    <span className="ml-1.5 font-medium text-accent">
                      · {breaches.length} below floor
                    </span>
                  )}
                </span>
              </span>
            </button>
            <button
              type="button"
              disabled={pickedAthletes.length === 0}
              onClick={() => setView("review")}
              className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Review {pickedAthletes.length || ""}
            </button>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- conflict drawer */}
      {conflictAthlete &&
        conflictDetail &&
        createPortal(
          <ConflictDrawer
            athlete={conflictAthlete}
            detail={conflictDetail}
            closing={drawerClosing}
            onRequestClose={() => setDrawerClosing(true)}
            onClosed={finishDrawerClose}
            closeBtnRef={closeBtnRef}
          />,
          document.body,
        )}

      {/* ------------------------------------------------------ bottom sheet */}
      {sheet &&
        createPortal(
          <BottomSheet
            title={sheet === "filters" ? "Filters" : "Shortlist"}
            closing={sheetClosing}
            onRequestClose={() => setSheetClosing(true)}
            onClosed={finishSheetClose}
            closeBtnRef={closeBtnRef}
          >
            {sheet === "filters" ? (
              <FilterControls
                idPrefix="sheet"
                filters={filters}
                onChange={setFilters}
                sportOptions={sportOptions}
                tierCounts={tierCounts}
              />
            ) : (
              <ShortlistDock {...dockProps} bare />
            )}
          </BottomSheet>,
          document.body,
        )}
    </div>
  );
}

function clampScore(n: number) {
  return Math.max(MIN_SCORE_FLOOR, Math.min(MIN_SCORE_CEIL, Math.round(n)));
}

/* ============================== brief band ================================ */

function BriefBand({ filled }: { filled: number }) {
  const toGo = MATCH_BRIEF.needed - filled;
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
          Managed campaign
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          <span className="truncate normal-case tracking-normal text-muted">
            {MATCH_BRIEF.campaign} — {MATCH_BRIEF.sponsor}
          </span>
        </p>
        <p className="flex items-center gap-2 text-[10px] text-faint">
          <span className="tabular-nums">{MATCH_BRIEF.code}</span>
          <span className="h-3 w-px bg-line" aria-hidden="true" />
          Step 3 of 12 · Matching &amp; roster
          <span className="hidden gap-0.5 sm:flex" aria-hidden="true">
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "h-1 w-2 rounded-full",
                  i < 2 ? "bg-admin/60" : i === 2 ? "bg-primary" : "bg-surface-2",
                )}
              />
            ))}
          </span>
        </p>
      </div>

      <dl className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <BriefBlock
          k="Budget"
          v={money(MATCH_BRIEF.budget)}
          sub="sponsor-approved, sell side"
          delay={0}
        />
        <BriefBlock
          k="Campaign window"
          v={MATCH_BRIEF.window}
          sub={MATCH_BRIEF.windowNote}
          delay={45}
        />
        <BriefBlock
          k="Market"
          v={MATCH_BRIEF.market}
          sub={MATCH_BRIEF.marketNote}
          delay={90}
        />
        <div className="sx-join-rise min-w-0" style={{ ["--sx-d" as string]: "135ms" }}>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">
            Job codes to fill
          </dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {JOBS.map((j) => (
              <span
                key={j.id}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2/60 px-2 py-0.5 text-[10px] font-medium text-muted"
                title={j.deliverable}
              >
                <span className="tabular-nums text-text">{j.id}</span>
                {j.label}
                <span className="tabular-nums text-faint">×{j.slots}</span>
              </span>
            ))}
          </dd>
        </div>
        <div className="sx-join-rise min-w-0" style={{ ["--sx-d" as string]: "180ms" }}>
          <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">
            Athletes needed
          </dt>
          <dd className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight">
            {filled} / {MATCH_BRIEF.needed}
            <span className="ml-2 text-[10px] font-normal text-faint">
              {toGo <= 0 ? "roster complete" : `${toGo} to go`}
            </span>
          </dd>
          <dd className="mt-1.5 flex gap-1" aria-hidden="true">
            {Array.from({ length: MATCH_BRIEF.needed }, (_, i) => (
              <span
                key={i}
                className={cx(
                  "h-1.5 flex-1 overflow-hidden rounded-full text-primary",
                  i < filled ? "sx-join-seg sx-join-seg--fill bg-surface-2" : "bg-surface-2",
                )}
              />
            ))}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function BriefBlock({
  k,
  v,
  sub,
  delay,
}: {
  k: string;
  v: string;
  sub: string;
  delay: number;
}) {
  return (
    <div className="sx-join-rise min-w-0" style={{ ["--sx-d" as string]: `${delay}ms` }}>
      <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">{k}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tracking-tight">{v}</dd>
      <dd className="truncate text-[10px] text-faint">{sub}</dd>
    </div>
  );
}

/* ============================== filter kit ================================ */

function FilterControls({
  idPrefix,
  filters,
  onChange,
  sportOptions,
  tierCounts,
}: {
  idPrefix: string;
  filters: MatchFilters;
  onChange: React.Dispatch<React.SetStateAction<MatchFilters>>;
  sportOptions: string[];
  tierCounts: Record<"all" | "Premium" | "Creator" | "Emerging", number>;
}) {
  const set = (patch: Partial<MatchFilters>) => onChange((f) => ({ ...f, ...patch }));
  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold tracking-tight">Filters</p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          Reset
        </button>
      </div>

      <SearchInput
        value={filters.q}
        onChange={(q) => set({ q })}
        placeholder="Name or sport"
        label="Search athletes"
        tone="admin"
        className="w-full"
      />

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">Sport</p>
        <Dropdown
          label="Filter by sport"
          allLabel="All sports"
          value={filters.sport}
          onChange={(sport) => set({ sport })}
          options={sportOptions.map((s) => ({ value: s, label: s }))}
          tone="admin"
          block
        />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">Tier</p>
        <div className="space-y-1" role="radiogroup" aria-label="Filter by tier">
          {(["", ...TIERS] as const).map((t) => {
            const active = filters.tier === t;
            const count = t === "" ? tierCounts.all : tierCounts[t];
            return (
              <button
                key={t || "all"}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ tier: t })}
                className={cx(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "border-admin/40 bg-admin/10 text-text"
                    : "border-line text-muted hover:text-text",
                )}
              >
                {t || "All tiers"}
                <span className="tabular-nums text-faint">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label
            htmlFor={`${idPrefix}-min-score`}
            className="text-[11px] font-medium text-muted"
          >
            Minimum score
          </label>
          <span className="text-xs font-semibold tabular-nums">
            {filters.minScore}
          </span>
        </div>
        <input
          id={`${idPrefix}-min-score`}
          type="range"
          min={MIN_SCORE_FLOOR}
          max={MIN_SCORE_CEIL}
          step={1}
          value={filters.minScore}
          onChange={(e) => set({ minScore: Number(e.target.value) })}
          className="w-full accent-[var(--sx-primary)]"
        />
        <div className="mt-0.5 flex justify-between text-[10px] text-faint">
          <span>{MIN_SCORE_FLOOR}</span>
          <span>{MIN_SCORE_CEIL}</span>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted">Eligibility</p>
        <div className="space-y-2.5">
          <CheckRow
            id={`${idPrefix}-active-only`}
            checked={filters.activeOnly}
            onChange={(activeOnly) => set({ activeOnly })}
            label="Approved & active only"
            sub="contract signed, profile live"
          />
          <CheckRow
            id={`${idPrefix}-guardian-only`}
            checked={filters.guardianOnly}
            onChange={(guardianOnly) => set({ guardianOnly })}
            label="Guardian-verified only"
            sub="excludes pending minors"
          />
        </div>
      </div>

      <div className="border-t border-line-soft pt-4">
        <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
          Where numbers come from
        </p>
        <dl className="mt-2 space-y-1.5 text-[10px] leading-relaxed text-faint">
          <p>
            <span className="font-medium text-muted">Score</span> — stored
            snapshot, {MATCH_BRIEF.scoreMethod}, {MATCH_BRIEF.scoreSnapshot}.
          </p>
          <p>
            <span className="font-medium text-muted">Reach</span> —
            platform-verified where connected, otherwise self-reported.
          </p>
          <p>
            <span className="font-medium text-muted">Cost</span> — the
            athlete&apos;s own rate card. BTG-internal.
          </p>
          <p>
            <span className="font-medium text-muted">Sell price</span> — the
            package price band.
          </p>
        </dl>
      </div>
    </div>
  );
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  sub,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  sub: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-3.5 shrink-0 accent-[var(--sx-primary)]"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-text">{label}</span>
        <span className="block text-[10px] text-faint">{sub}</span>
      </span>
    </label>
  );
}

/* ================================ legend ================================== */

function Legend() {
  const items: { label: string; cls: string }[] = [
    { label: "Eligible", cls: "bg-success" },
    { label: "Guardian pending", cls: "bg-warn" },
    { label: "Conflict", cls: "bg-danger" },
    { label: "Below margin floor", cls: "bg-accent" },
  ];
  return (
    <ul className="hidden items-center gap-3 lg:flex" aria-label="Row color legend">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-[10px] text-faint">
          <span aria-hidden="true" className={cx("size-1.5 rounded-sm", it.cls)} />
          {it.label}
        </li>
      ))}
    </ul>
  );
}

/* ================================ the row =================================

   lg+ is a table-shaped grid — eight columns fit the space the portal
   sidebar leaves; below lg the same data reads as a card. Cost never
   disappears: it is the subline under Sell at every table width and part of
   the card's economics line.                                                */

const ROW_GRID =
  "lg:grid lg:grid-cols-[1.4rem_minmax(0,1.6fr)_4.5rem_5.5rem_5.5rem_5.5rem_minmax(5rem,0.9fr)_3.9rem] lg:items-center lg:gap-3";

/* Below lg the list is a card grid (two-up from sm); at lg it flattens back
   into divided table rows. */
const LIST_CLS =
  "grid gap-3 sm:grid-cols-2 lg:block lg:divide-y lg:divide-line-soft";

function TableHeader() {
  return (
    <div
      className={cx(
        ROW_GRID,
        "hidden border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint",
      )}
    >
      {/* empty spans still occupy their grid columns (sr-only would not) */}
      <span aria-hidden="true" />
      <span>Athlete</span>
      <span>Score /100</span>
      <span>Reach</span>
      <span className="text-right">Sell</span>
      <span className="text-right">Margin</span>
      <span>Status</span>
      <span aria-hidden="true" />
    </div>
  );
}

function AthleteRow({
  athlete: a,
  index,
  picked,
  onToggle,
  onWhy,
}: {
  athlete: MatchAthlete;
  index: number;
  picked: boolean;
  onToggle: () => void;
  onWhy: () => void;
}) {
  const st = statusFor(a);
  const addable = canShortlist(a);
  const blocked = st.kind === "conflict";
  const delay = Math.min(index, 10) * 40;

  return (
    <li
      className={cx(
        "sx-join-rise px-4 py-3 transition-colors",
        /* card chrome below lg; the lg table strips it back off */
        "max-lg:rounded-xl max-lg:border",
        blocked
          ? "max-lg:border-danger/25"
          : picked
            ? "max-lg:border-primary/40"
            : "max-lg:border-line",
        ROW_GRID,
        blocked
          ? "opacity-75"
          : picked
            ? "bg-primary/5"
            : "max-lg:bg-surface lg:hover:bg-surface-2/40",
      )}
      style={{ ["--sx-d" as string]: `${delay}ms` }}
    >
      {/* select (lg+; the card's Add button covers < lg) */}
      <span className="hidden lg:block">
        {addable ? (
          <input
            type="checkbox"
            checked={picked}
            onChange={onToggle}
            aria-label={`${picked ? "Remove" : "Add"} ${a.name} ${picked ? "from" : "to"} the shortlist`}
            className="size-3.5 accent-[var(--sx-primary)]"
          />
        ) : (
          <span aria-hidden="true" className="block text-center text-faint">
            –
          </span>
        )}
      </span>

      {/* athlete */}
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="lg:hidden">
          <ScoreRing value={a.score} size={44} strokeWidth={4} textCls="text-[11px]" />
        </span>
        <TierMark tier={a.tier} className="hidden h-7 lg:block" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold tracking-tight">
            {a.name}
          </span>
          <span className="block truncate text-[10px] text-muted">
            {a.sport} · {a.market} · {a.tier}
          </span>
          {/* card-only status line */}
          <span className="mt-1 block lg:hidden">
            <StatusPill status={st} withSub />
          </span>
        </span>
      </span>

      {/* score (lg+ — the card carries it as the ring) */}
      <span className="hidden lg:block">
        <ScoreCell score={a.score} delay={delay + 120} />
      </span>

      {/* reach — a column at lg+, an economics line on the card */}
      <span className="mt-2 flex items-center gap-2 lg:mt-0 lg:block">
        <span className="text-[11px] font-semibold tabular-nums lg:text-xs">
          {fmtReach(a.reach)}
        </span>
        <span className="lg:mt-0.5 lg:block">
          <ProvenanceMark source={a.reachSource} />
        </span>
      </span>

      {/* sell, with cost as its permanent subline — BTG-internal */}
      <span className="mt-1.5 flex items-baseline gap-1.5 text-[11px] lg:mt-0 lg:block lg:text-right">
        <span className="text-[10px] text-faint lg:hidden">
          cost {money(a.cost)} · sell
        </span>
        <span className="text-xs font-semibold tabular-nums">{money(a.sell)}</span>
        <span
          className="hidden text-[10px] text-faint lg:block"
          title="Athlete cost — BTG-internal, never sponsor-facing"
        >
          cost {money(a.cost)}
        </span>
      </span>

      {/* margin */}
      <span className="lg:text-right">
        <MarginValue cost={a.cost} sell={a.sell} />
      </span>

      {/* status (lg+; the card shows it under the name) */}
      <span className="hidden min-w-0 lg:block">
        <StatusPill status={st} withSub />
      </span>

      {/* action */}
      <span className="mt-2.5 lg:mt-0">
        {blocked ? (
          <button
            type="button"
            onClick={onWhy}
            className="w-full rounded-lg border border-danger/35 px-2.5 py-1.5 text-[11px] font-medium text-danger transition-colors hover:bg-danger/10 lg:w-auto"
          >
            Why
          </button>
        ) : addable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={picked}
            className={cx(
              "w-full rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors lg:w-auto",
              picked
                ? "bg-primary text-cta-ink hover:bg-primary-soft"
                : "border border-line text-muted hover:bg-surface-2 hover:text-text",
            )}
          >
            {picked ? "Added" : "Add"}
          </button>
        ) : (
          <span
            className="block w-full rounded-lg border border-dashed border-line px-2.5 py-1.5 text-center text-[11px] text-faint lg:w-auto"
            title={st.sub ?? undefined}
          >
            Hold
          </span>
        )}
      </span>
    </li>
  );
}

/* ============================== empty state =============================== */

function EmptyState({
  filters,
  onPatch,
  onClear,
}: {
  filters: MatchFilters;
  onPatch: (patch: Partial<MatchFilters>) => void;
  onClear: () => void;
}) {
  const suggestions = relaxSuggestions(MATCH_ROSTER, filters);
  const n = activeFilterCount(filters);
  return (
    <Card className="py-10 text-center">
      <span
        aria-hidden="true"
        className="mx-auto grid size-12 place-items-center rounded-xl border border-line bg-surface-2/60 text-faint"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-5"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </span>
      <p className="mt-3 text-sm font-semibold tracking-tight">
        Nothing matches {n === 1 ? "this filter" : `these ${n} filters at once`}
      </p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted">
        No eligible athlete clears every constraint. Relax one to see candidates
        again — each option below shows how many that would bring back.
      </p>
      {suggestions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => onPatch(s.patch)}
              className="rounded-lg border border-admin/40 bg-admin/5 px-3 py-1.5 text-[11px] font-medium text-text transition-colors hover:bg-admin/15"
            >
              {s.label}
              <span className="ml-1.5 tabular-nums text-muted">
                {s.count} match{s.count === 1 ? "" : "es"}
              </span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={onClear}
        className="mt-3 text-xs font-medium text-muted transition-colors hover:text-danger"
      >
        Clear all filters
      </button>
    </Card>
  );
}

/* ============================ shortlist dock ============================== */

function ShortlistDock({
  picked,
  filled,
  slots,
  overflow,
  blended,
  breaches,
  onRemove,
  onCompare,
  onReview,
  bare = false,
}: {
  picked: MatchAthlete[];
  filled: number;
  slots: ReturnType<typeof slotFill>["slots"];
  overflow: MatchAthlete[];
  blended: ReturnType<typeof blendedMargin>;
  breaches: MatchAthlete[];
  onRemove: (id: string) => void;
  onCompare: () => void;
  onReview: () => void;
  /** Sheet variant — no Card chrome, the sheet supplies it. */
  bare?: boolean;
}) {
  const band = marginBand(blended.ratio);
  const body = (
    <>
      <div
        className={cx(
          "flex items-baseline justify-between",
          !bare && "border-b border-line-soft bg-surface-2/40 px-4 py-3",
        )}
      >
        {/* the sheet supplies its own "Shortlist" title — don't say it twice */}
        <p className={cx("text-xs font-semibold tracking-tight", bare && "sr-only")}>
          Shortlist
        </p>
        <p className="text-[11px] tabular-nums text-muted">
          <span key={filled} className="sx-pop inline-block font-semibold text-text">
            {filled}
          </span>{" "}
          of {MATCH_BRIEF.needed} filled
        </p>
      </div>

      <div className={cx("space-y-4", !bare && "p-4")}>
        {/* slot meter */}
        <div className="flex gap-1" aria-hidden="true">
          {slots.map((s, i) => (
            <span
              key={`${i}-${s.athlete?.id ?? "empty"}`}
              title={
                s.athlete
                  ? `${s.jobId} — ${s.athlete.name}`
                  : `${s.jobId} — ${s.jobLabel}, unfilled`
              }
              className={cx(
                "h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2 text-primary",
                s.athlete && "sx-join-seg sx-join-seg--fill",
              )}
              style={{ ["--sx-d" as string]: `${i * 40}ms` }}
            />
          ))}
        </div>

        {/* committed + blended */}
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">
              Committed
            </dt>
            <dd className="mt-1 text-base font-semibold tracking-tight">
              <TweenNumber value={blended.sell} format={money} />
            </dd>
            <dd className="text-[10px] text-faint">
              of {money(MATCH_BRIEF.budget)} budget
            </dd>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-faint">
              Blended margin
            </dt>
            <dd
              className={cx(
                "mt-1 text-base font-semibold tracking-tight",
                picked.length === 0
                  ? "text-faint"
                  : band === "below"
                    ? "text-accent"
                    : band === "thin"
                      ? "text-warn"
                      : "text-success",
              )}
            >
              {picked.length === 0 ? (
                "—"
              ) : (
                <>
                  <TweenNumber value={blended.pct} format={(n) => String(n)} />%
                </>
              )}
            </dd>
            <dd className="text-[10px] tabular-nums text-faint">
              {picked.length === 0 ? "no athletes yet" : `${fmtRatio(blended.ratio)} cost`}
            </dd>
          </div>
        </dl>

        {/* breach banner */}
        <div className="sx-expand" data-open={breaches.length > 0}>
          <div>
            <div className="flex items-start gap-2.5 rounded-xl border border-accent/35 bg-accent/8 p-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 size-3.5 shrink-0 text-accent"
                aria-hidden="true"
              >
                <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
                <path d="M12 10.2v4" />
                <path d="M12 17h.01" />
              </svg>
              <p className="text-[11px] leading-relaxed text-muted">
                <span className="font-semibold text-accent">
                  {breaches.length === 1
                    ? `1 line below the ${MARGIN_FLOOR}× floor.`
                    : `${breaches.length} lines below the ${MARGIN_FLOOR}× floor.`}
                </span>{" "}
                {breaches.map((a) => a.name).join(", ")} sell
                {breaches.length === 1 ? "s" : ""} for less than {MARGIN_FLOOR}×{" "}
                cost. Resolve before invitations go out.
              </p>
            </div>
          </div>
        </div>

        {/* overflow note */}
        {overflow.length > 0 && (
          <p className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[10px] leading-relaxed text-warn">
            {overflow.map((a) => a.name).join(", ")} exceed
            {overflow.length === 1 ? "s" : ""} the slots for{" "}
            {[...new Set(overflow.map((a) => a.jobId))].join(", ")} — drop a pick
            or change the brief.
          </p>
        )}

        {/* picks + empty slots */}
        <ul className="space-y-2">
          {picked.map((a) => {
            const aBand = marginBand(a.sell / a.cost);
            return (
              <li
                key={a.id}
                className="sx-join-rise rounded-xl border border-line bg-surface p-3"
              >
                <div className="flex items-start gap-2.5">
                  <TierMark tier={a.tier} className="mt-0.5 h-6" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold tracking-tight">
                      {a.name}
                    </p>
                    <p className="truncate text-[10px] text-muted">
                      {a.sport} · {a.tier} · {jobFor(a.jobId).label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    aria-label={`Remove ${a.name} from the shortlist`}
                    className="grid size-5 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger/15 hover:text-danger"
                  >
                    <CloseIcon className="size-2.5" />
                  </button>
                </div>
                <p className="mt-2 flex items-center justify-between text-[10px] tabular-nums text-faint">
                  <span title="Athlete cost — BTG-internal">cost {money(a.cost)}</span>
                  <span>sell {money(a.sell)}</span>
                  <span
                    className={cx(
                      "font-medium",
                      aBand === "below"
                        ? "text-accent"
                        : aBand === "thin"
                          ? "text-warn"
                          : "text-success",
                    )}
                  >
                    {fmtRatio(a.sell / a.cost)}
                  </span>
                </p>
                {aBand === "below" && (
                  <p className="mt-1.5 text-[10px] font-medium text-accent">
                    Margin {fmtRatio(a.sell / a.cost)} — below the {MARGIN_FLOOR}× floor
                  </p>
                )}
                {a.guardian === "pending" && (
                  <p className="mt-1.5 text-[10px] font-medium text-warn">
                    Guardian consent outstanding — cannot accept yet
                  </p>
                )}
              </li>
            );
          })}
          {slots.map(
            (s, i) =>
              !s.athlete && (
                <li
                  key={`empty-${s.jobId}-${i}`}
                  className="rounded-xl border border-dashed border-line px-3 py-2.5 text-[10px] text-faint"
                >
                  Slot {i + 1} unfilled — {s.jobId} · {s.jobLabel}
                </li>
              ),
          )}
        </ul>

        {/* actions */}
        <div className="space-y-2 border-t border-line-soft pt-4">
          <button
            type="button"
            disabled={picked.length < 2}
            onClick={onCompare}
            title={picked.length < 2 ? "Shortlist at least two athletes to compare" : undefined}
            className="w-full rounded-lg border border-line px-4 py-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Compare shortlist factor by factor
          </button>
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={onReview}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink shadow-sm transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            Review {picked.length || ""} and send invitations
          </button>
          <p className="text-center text-[10px] leading-relaxed text-faint">
            Athlete cost is BTG-internal. It is not shown on any sponsor surface.
          </p>
        </div>
      </div>
    </>
  );

  return bare ? <div className="space-y-4">{body}</div> : <Card className="p-0">{body}</Card>;
}

/* ============================== bottom sheet ============================== */

function BottomSheet({
  title,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
  children,
}: {
  title: string;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  /* animationend unmount + lost-event fallback (drawer discipline). */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 320);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  return (
    <div
      className={cx("fixed inset-0 z-50 xl:hidden", closing && "pointer-events-none")}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label={`Close ${title.toLowerCase()}`}
        onClick={onRequestClose}
        className={cx(
          closing ? "sx-backdrop-out" : "sx-backdrop",
          "absolute inset-0 cursor-default bg-black/55",
        )}
      />
      <div
        className={cx(
          closing ? "sx-match-sheet-out" : "sx-match-sheet",
          "absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl",
        )}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-match-sheet-out") onClosed();
        }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-line"
          />
          <p className="text-sm font-semibold tracking-tight">{title}</p>
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
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
