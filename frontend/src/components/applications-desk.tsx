"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import {
  CloseIcon,
  Dropdown,
  FilterChip,
  SearchInput,
} from "@/components/filter-kit";
import {
  ListFilter,
  ListSearch,
  PagerRow,
  PendingList,
  ServerList,
  useListNav,
} from "@/components/server-pager";
import {
  LIVE_FLAGS,
  LIVE_SORTS,
  activationBlock,
  type ApplicationsSummary,
  type DeskApp,
  type DeskQuery,
  type ReviewActionKind,
  type ReviewActionResult,
} from "@/lib/applications-live";
import type { PageInfo } from "@/lib/list-query";
import {
  AGING_HOURS,
  waitMeter,
  FACTOR_HINTS,
  STATE_COPY,
  STATE_DETAIL,
  STATE_TONE,
  stateBucket,
  scoreBand,
  waitHours,
  type LiveApplicationState,
} from "@/lib/applications-ui";
import { NoScoreRing, RING_TEXT, ScoreRing } from "@/components/score-ring";

/* --------------------------------------------------------------------------
   ApplicationsDesk — the admin applications review queue (2026-09-14
   redesign). The page's one client island, spending the same budget as the
   athlete portal's ActivityExplorer and following its idioms:

   - Tabs (Needs review / Approved / Rejected / All) with live counts, plus
     instant search and sport / attention / sort dropdowns; active filters
     render as dismissible chips. State syncs to the URL via replaceState
     (?tab=&q=&sport=&flag=&sort=), seeded back by the server page, so a
     filtered queue is shareable.
   - Every row carries an animated score ring — the §14 Content Value Score,
     banded so a reviewer reads fit at a glance without decoding a number.
   - Clicking a row opens the review drawer (portaled to <body> — an
     sx-animate ancestor would trap position:fixed): score factors with
     plain-English hints, a safeguards checklist (guardian, conflicts,
     self-reported reach), and the decision bar.
   - Approve / Request info / Reject work locally ("kept for this visit
     only" — the Follow-button precedent) with Undo, so the queue behaves
     like the real B1 transitions will. A minor with an unverified guardian
     blocks Approve with the reason spelled out (§4), not a dead button.

   LIVE MODE IS SERVER-PAGED (2026-09-29). With `live`, the island holds one
   page: tabs, search, filters, sort and the pager write the URL through
   <ServerList> (any change but the page itself resets to page 1), the
   server page asks the API for exactly that page, and the tab counts are the
   API's summary. Nothing filters or sorts in the browser. The demo keeps the
   client-side desk, unchanged.
   -------------------------------------------------------------------------- */

type App = DeskApp;
type Decision = "APPROVED" | "REJECTED" | "INFO";

/** Live mode's wiring — the P3-FE-02 server action and the server page's
 *  answer (this page, its totals, the URL state it was asked for). Its
 *  absence IS demo mode, so the fixture behaviour cannot half-apply. */
export type LiveReview = {
  act: (
    id: string,
    kind: ReviewActionKind,
    notes?: string,
  ) => Promise<ReviewActionResult>;
  page: PageInfo;
  summary: ApplicationsSummary;
  query: DeskQuery;
};

type Nav = ReturnType<typeof useListNav>;

const TABS = [
  { key: "review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TAB_KEYS = TABS.map((t) => t.key) as readonly string[];

const ATTENTION_OPTIONS = [
  { value: "minor", label: "Minor athletes" },
  { value: "flagged", label: "Flagged for review" },
  { value: "aging", label: "Waiting 48h+" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "score", label: "Score · high to low" },
];

const LIVE_ATTENTION_OPTIONS = ATTENTION_OPTIONS.filter((o) =>
  (LIVE_FLAGS as readonly string[]).includes(o.value),
);
const LIVE_SORT_OPTIONS = SORT_OPTIONS.filter((o) =>
  (LIVE_SORTS as readonly string[]).includes(o.value),
);

const inReview = (s: LiveApplicationState) =>
  s === "SUBMITTED" || s === "UNDER_REVIEW";

/* -------------------------------------------------------- checklist pieces */

function CheckRow({
  status,
  children,
}: {
  status: "ok" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const glyph = { ok: "✓", warn: "!", danger: "▲", neutral: "·" }[status];
  const cls = {
    ok: "bg-accent/12 text-accent",
    warn: "bg-warn/12 text-warn",
    danger: "bg-danger/12 text-danger",
    neutral: "bg-surface-2 text-muted",
  }[status];
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${cls}`}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
        {children}
      </span>
    </li>
  );
}

/* -------------------------------------------------------- ApplicationsDesk */

type DeskProps = {
  items: App[];
  demoParam?: string;
  initial?: Partial<Record<"tab" | "q" | "sport" | "flag" | "sort", string>>;
  live?: LiveReview;
};

export function ApplicationsDesk(props: DeskProps) {
  if (props.live) {
    return (
      <ServerList>
        <LiveDesk {...props} live={props.live} />
      </ServerList>
    );
  }
  return <Desk {...props} nav={null} />;
}

/** Live: the desk bound to <ServerList>'s URL navigation. */
function LiveDesk(props: DeskProps & { live: LiveReview }) {
  const nav = useListNav();
  return <Desk {...props} nav={nav} />;
}

function Desk({
  items,
  demoParam,
  initial,
  live,
  nav,
}: DeskProps & { nav: Nav | null }) {
  /* Live + nav = the server-paged desk; everything URL-bound goes through it. */
  const paged = live && nav ? { ...live, nav } : null;
  const liveSports = live?.summary.sports;
  const sportOptions = useMemo(
    () => liveSports ?? [...new Set(items.map((a) => a.sport))].sort(),
    [items, liveSports],
  );
  const wait = useMemo(
    () => new Map(items.map((a) => [a.id, waitHours(a.submittedAt)])),
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
  const [sport, setSport] = useState(() => clamp(initial?.sport, sportOptions));
  const [flag, setFlag] = useState(() =>
    clamp(initial?.flag, ATTENTION_OPTIONS.map((o) => o.value)),
  );
  const [sort, setSort] = useState(() =>
    clamp(initial?.sort, SORT_OPTIONS.map((o) => o.value)),
  );

  /* Demo decisions — local to this visit, undoable, never persisted. */
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  /* Live states — what the API answered after a real decision. Separate from
     `decisions` on purpose: a live transition is not undoable, and mixing the
     two is how a demo Undo would appear to reverse a recorded rejection. */
  const [liveStates, setLiveStates] = useState<
    Record<string, LiveApplicationState>
  >({});
  /* Missing fields the API reported on a refused Activate (P6-FE-07): the
     row loaded complete, the profile changed since. Adopted like a state. */
  const [liveMissing, setLiveMissing] = useState<Record<string, string[]>>({});
  const eff = useCallback(
    (a: App): LiveApplicationState => {
      if (live) return liveStates[a.id] ?? a.state;
      const d = decisions[a.id];
      return d === "APPROVED" || d === "REJECTED" ? d : a.state;
    },
    [decisions, live, liveStates],
  );

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
  useEffect(() => {
    /* Live: <ServerList> owns the URL — replaceState here would fight it. */
    if (live) return;
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (tab !== "review") p.set("tab", tab);
    if (q) p.set("q", q);
    if (sport) p.set("sport", sport);
    if (flag) p.set("flag", flag);
    if (sort) p.set("sort", sort);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [tab, q, sport, flag, sort, demoParam, live]);

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
    /* DRAFT and SUSPENDED bucket to "other": not review work, All-tab only. */
    const c = { review: 0, approved: 0, rejected: 0, all: items.length };
    for (const a of items) {
      const b = stateBucket(eff(a));
      if (b !== "other") c[b] += 1;
    }
    return c;
  }, [items, eff]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    /* Live: the API already filtered, sorted and paged — show it as sent. */
    if (live) return items;
    const list = items.filter((a) => {
      const s = eff(a);
      const tabOk = tab === "all" ? true : stateBucket(s) === tab;
      const flagOk =
        !flag ||
        (flag === "minor"
          ? a.isMinor
          : flag === "flagged"
            ? a.flags.length > 0
            : inReview(s) && (wait.get(a.id) ?? 0) > AGING_HOURS);
      return (
        tabOk &&
        flagOk &&
        (!sport || a.sport === sport) &&
        (!needle ||
          [a.name, a.sport, a.region]
            .join(" ")
            .toLowerCase()
            .includes(needle))
      );
    });
    const by = (a: App, b: App) =>
      sort === "newest"
        ? (wait.get(a.id) ?? 0) - (wait.get(b.id) ?? 0)
        : sort === "score"
          ? /* Unscored sorts below every scored row — absence is not zero. */
            (b.score?.total ?? -1) - (a.score?.total ?? -1)
          : (wait.get(b.id) ?? 0) - (wait.get(a.id) ?? 0);
    return [...list].sort(by);
  }, [items, tab, needle, sport, flag, sort, wait, eff, live]);

  /* What the controls show and clear — the URL's state when paged, local
     state in the demo. */
  const view = paged ? paged.query : { tab, q, sport, flag, sort };
  const tabCounts = paged ? paged.summary.tabs : counts;
  const vNeedle = view.q.trim();
  const isFiltered = Boolean(vNeedle || view.sport || view.flag);
  const reset = () => {
    if (paged) {
      paged.nav.set({ q: null, sport: null, flag: null });
      return;
    }
    setQ("");
    setSport("");
    setFlag("");
  };
  const clearOne = (key: "q" | "sport" | "flag") => {
    if (paged) paged.nav.set({ [key]: null });
    else ({ q: setQ, sport: setSport, flag: setFlag })[key]("");
  };
  const chooseTab = (key: TabKey) => {
    if (paged) paged.nav.set({ tab: key === "review" ? null : key });
    else setTab(key);
  };

  const sel = openId ? items.find((a) => a.id === openId) : undefined;

  return (
    <div>
      {/* ------------------------------------------------------------ tabs */}
      <div
        role="tablist"
        aria-label="Application queue"
        /* P1-ART-16 — the Scouting Board's pills (the stage is fixed-dark). */
        className="mb-4 flex max-w-full flex-wrap gap-1.5"
      >
        {TABS.map((t) => {
          const active = t.key === view.tab;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => chooseTab(t.key)}
              className={[
                "group inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70",
                active
                  ? "border-[#63b4f8] bg-[#2e9bf5]/25 text-white shadow-[0_0_18px_rgba(46,155,245,.35)]"
                  : "border-[#63b4f8]/25 bg-[#0a121e]/60 text-[#cfe9ff] hover:border-[#63b4f8]/60 hover:text-white",
              ].join(" ")}
            >
              {t.label}
              <span
                className={[
                  "font-mono tabular-nums text-[11px]",
                  active ? "text-[#9be0ff]" : "text-[#7e88a0] group-hover:text-[#9be0ff]",
                ].join(" ")}
              >
                {tabCounts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------- toolbar */}
      {paged ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ListSearch
            initial={paged.query.q}
            placeholder="Search name, sport or region…"
            label="Search applications"
            tone="admin"
          />
          <ListFilter
            param="sport"
            label="Filter by sport"
            allLabel="All sports"
            value={paged.query.sport}
            options={sportOptions.map((s) => ({ value: s, label: s }))}
            tone="admin"
          />
          <ListFilter
            param="flag"
            label="Filter by attention"
            allLabel="Anything"
            value={paged.query.flag}
            options={LIVE_ATTENTION_OPTIONS}
            tone="admin"
          />
          <ListFilter
            param="sort"
            label="Sort queue"
            allLabel="Waiting longest"
            value={paged.query.sort}
            options={LIVE_SORT_OPTIONS}
            tone="admin"
          />
        </div>
      ) : (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search name, sport or region…"
          label="Search applications"
          tone="admin"
        />
        <Dropdown
          label="Filter by sport"
          allLabel="All sports"
          value={sport}
          onChange={setSport}
          options={sportOptions.map((s) => ({ value: s, label: s }))}
          tone="admin"
        />
        <Dropdown
          label="Filter by attention"
          allLabel="Anything"
          value={flag}
          onChange={setFlag}
          options={ATTENTION_OPTIONS}
          tone="admin"
        />
        <Dropdown
          label="Sort queue"
          allLabel="Waiting longest"
          value={sort}
          onChange={setSort}
          options={SORT_OPTIONS}
          tone="admin"
        />
      </div>
      )}

      {/* Active filters as dismissible chips — the row reads as what's
          applied; each ✕ removes one clause, "Clear all" removes them all. */}
      {isFiltered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {vNeedle && (
            <FilterChip tone="admin" label="Remove search" onClear={() => clearOne("q")}>
              &ldquo;{vNeedle}&rdquo;
            </FilterChip>
          )}
          {view.sport && (
            <FilterChip tone="admin" label="Remove sport filter" onClear={() => clearOne("sport")}>
              {view.sport}
            </FilterChip>
          )}
          {view.flag && (
            <FilterChip tone="admin" label="Remove attention filter" onClear={() => clearOne("flag")}>
              {ATTENTION_OPTIONS.find((o) => o.value === view.flag)?.label}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={reset}
            className="text-[11px] font-medium text-muted transition-colors hover:text-danger"
          >
            Clear all
          </button>
          {/* Paged: the top pager row says "Showing x–y of N matching". */}
          {!paged && (
            <p className="ml-auto text-xs text-muted">
              {shown.length} of {items.length}{" "}
              {shown.length === 1 ? "application" : "applications"}
            </p>
          )}
        </div>
      )}

      {paged && (
        <div className="mb-3">
          <PagerRow
            page={paged.page}
            noun="Applications"
            tone="admin"
            position="top"
            filtered={isFiltered}
          />
        </div>
      )}

      {/* ------------------------------------------------------------ list */}
      <MaybePending paged={paged !== null}>
        {shown.length === 0 ? (
          <div className="sx-ops-panel relative px-4 py-12 text-center">
            <p className="text-sm font-medium">
              {isFiltered ? "Nothing matches these filters" : "This queue is clear"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {isFiltered
                ? "Try a name, a sport like “Soccer”, or another tab."
                : "New applications land here from the public join page."}
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
          </div>
        ) : (
          /* P1-ART-16 — the Scouting Board: one glass "player card" per
             application (1 → 2 → 3 → 4 columns, so 12 / 24 / 60 fill evenly).
             Each card is still the row's one button, its name led by the
             athlete's (the e2e loop finds it so), and `Minor` stays exact. */
          <ul className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((a, i) => {
              const s = eff(a);
              const w = wait.get(a.id) ?? 0;
              const reviewing = inReview(s);
              const meter = waitMeter(w);
              const late = reviewing && meter.overdue;
              return (
                <li key={a.id} className="sx-ops-in" style={{ "--sx-reveal-delay": `${0.55 + Math.min(i, 11) * 0.05}s` } as React.CSSProperties}>
                  <button
                    type="button"
                    onClick={() => openItem(a.id)}
                    data-spot=""
                    data-tilt=""
                    style={{ "--tone": late ? "#fb923c" : "#63b4f8" } as React.CSSProperties}
                    className={`sx-ops-card group relative flex h-full min-h-[12.5rem] w-full flex-col gap-3 px-5 pb-5 pt-[18px] text-left ${late ? "shadow-[inset_0_3px_0_#f97a1f]" : ""}`}
                  >
                    <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
                    <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-[10px] font-medium uppercase tracking-[0.24em] text-[#9be0ff]">
                          {a.sport}
                        </span>
                        <span className="mt-1.5 block truncate text-base font-semibold tracking-tight text-white">
                          {a.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#8a96a3]">
                          {a.region}
                          {a.followers !== null && (
                            <> · {a.followers.toLocaleString("en-US")} followers</>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 drop-shadow-[0_0_12px_rgba(46,155,245,.45)]">
                        {a.score ? (
                          <ScoreRing value={a.score.total} size={64} strokeWidth={5} textCls="text-base" />
                        ) : (
                          <NoScoreRing size={64} />
                        )}
                      </span>
                    </span>

                    <span className="flex flex-wrap items-center gap-1.5">
                      {a.isMinor && <Badge tone="warn">Minor</Badge>}
                      {a.isMinor && (
                        <span className="text-[10px] font-medium text-[#9aa4b2]">
                          {a.guardianVerified ? "guardian verified" : "guardian pending"}
                        </span>
                      )}
                      {decisions[a.id] === "INFO" && (
                        <Badge tone="neutral">Info requested</Badge>
                      )}
                      {a.flags.length > 0 && reviewing && (
                        <span className="text-[10px] font-semibold text-[#fca5a5]">
                          ▲ {a.flags.length}{" "}
                          {a.flags.length === 1 ? "flag" : "flags"}
                        </span>
                      )}
                    </span>

                    <span className="mt-auto block">
                      {reviewing ? (
                        <>
                          <span className="flex items-center justify-between gap-2 text-[11px]">
                            <span className={late ? "font-semibold text-[#fdba74]" : "text-[#9aa4b2]"}>
                              {meter.label}
                            </span>
                            <span className="text-[#7e88a0]">submitted {a.submittedAt}</span>
                          </span>
                          <span aria-hidden="true" className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                            <span
                              className={`sx-ops-wait absolute inset-y-0 left-0 block rounded-full ${late ? "bg-gradient-to-r from-[#fb923c] to-[#f97a1f] shadow-[0_0_12px_rgba(249,122,31,.8)]" : "bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff] shadow-[0_0_10px_rgba(46,155,245,.7)]"}`}
                              style={{ width: `${meter.pct}%`, "--sx-reveal-delay": `${0.8 + Math.min(i, 11) * 0.05}s` } as React.CSSProperties}
                            />
                          </span>
                        </>
                      ) : (
                        <span className="flex items-center justify-between gap-2">
                          <Badge tone={STATE_TONE[s]}>{STATE_COPY[s]}</Badge>
                          <span className="text-[11px] text-[#7e88a0]">submitted {a.submittedAt}</span>
                        </span>
                      )}
                    </span>
                    {reviewing && (
                      <span className="sr-only">{STATE_COPY[s]}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </MaybePending>

      {paged && (
        <div className="mt-3">
          <PagerRow
            page={paged.page}
            noun="Applications"
            tone="admin"
            position="bottom"
            filtered={isFiltered}
          />
        </div>
      )}

      {/* Review drawer — portaled to <body>: the section's sx-animate
          entrance leaves a transform on an ancestor (fill-mode: both), which
          would otherwise trap this position:fixed overlay inside it. */}
      {sel &&
        createPortal(
          <ReviewDrawer
            /* Keyed per application: notes, errors and the reject-confirm arm
               belong to one review and must not leak into the next row's. */
            key={sel.id}
            app={liveMissing[sel.id] ? { ...sel, missingFields: liveMissing[sel.id] } : sel}
            state={eff(sel)}
            decision={decisions[sel.id]}
            onDecide={(d) =>
              setDecisions((prev) => ({ ...prev, [sel.id]: d }))
            }
            onUndo={() =>
              setDecisions((prev) => {
                const next = { ...prev };
                delete next[sel.id];
                return next;
              })
            }
            live={live}
            onLiveState={(state) =>
              setLiveStates((prev) => ({ ...prev, [sel.id]: state }))
            }
            onMissing={(missing) =>
              setLiveMissing((prev) => ({ ...prev, [sel.id]: missing }))
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

/** Dims the list while the next page loads — paged only (<PendingList>
 *  needs <ServerList>, which the demo doesn't have). */
function MaybePending({
  paged,
  children,
}: {
  paged: boolean;
  children: React.ReactNode;
}) {
  return paged ? <PendingList>{children}</PendingList> : <>{children}</>;
}

/* ------------------------------------------------------------ ReviewDrawer */

function ReviewDrawer({
  app: a,
  state: s,
  decision,
  onDecide,
  onUndo,
  live,
  onLiveState,
  onMissing,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  app: App;
  state: LiveApplicationState;
  decision: Decision | undefined;
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  live?: LiveReview;
  onLiveState: (state: LiveApplicationState) => void;
  onMissing?: (missing: string[]) => void;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const band = a.score ? scoreBand(a.score.total) : null;
  const blocked = a.isMinor && !a.guardianVerified;
  /* Conflicts panel lists non-guardian flags — the guardian has its own row.
     Spec refs like "(§26)" are stripped from user-facing copy. */
  const conflicts = a.flags
    .filter((f) => !/guardian/i.test(f))
    .map((f) => f.replace(/\s*\(§\d+\)/g, ""));

  /* ---- live decisions: the real §21 transitions, one at a time ---- */
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<ReviewActionKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewActionKind | null>(null);
  const [armReject, setArmReject] = useState(false);

  const decide = async (kind: ReviewActionKind) => {
    if (!live || busy) return;
    setBusy(kind);
    setErr(null);
    const result = await live.act(a.id, kind, notes);
    setBusy(null);
    if (result.ok) {
      onLiveState(result.state);
      setArmReject(false);
      if (kind !== "begin") setDone(kind);
    } else if (result.missing && result.missing.length > 0 && onMissing) {
      /* A stale Activate on a profile that is now incomplete: adopt the
         missing fields — the button disables and the line above it names
         them (announced there), rather than a duplicate error. */
      onMissing(result.missing);
    } else {
      setErr(result.message);
      /* A stale click (F-10): the API said where the row really is, so adopt
         it — the buttons for the old state disappear with it. */
      if (result.state) {
        onLiveState(result.state);
        setArmReject(false);
      }
    }
  };

  /* Notes reach the athlete verbatim on these two — the API refuses them
     empty (§23), so the buttons say why before it has to. */
  const needsNotes = notes.trim().length === 0;

  /* Unmount normally rides the slide-out's animationend, but that event is
     lost if the animation never runs (stale-CSS HMR). A fallback timer
     slightly past the 0.22s exit guarantees close anyway. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  const decided = decision === "APPROVED" || decision === "REJECTED";

  return (
    <div
      /* `sx-ops` (P1-ART-16): the drawer is portaled to <body>, outside the
         stage, so it pins the stage's dark tokens itself — a Frost user gets
         the same night scouting report. */
      className={["sx-ops fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-label={`${a.name} — application review`}
    >
      {/* click-away backdrop — no backdrop-blur: full-viewport blur visibly
          delays click handling on weak GPUs */}
      <button
        type="button"
        aria-label="Close review"
        onClick={onRequestClose}
        className={[
          closing ? "sx-backdrop-out" : "sx-backdrop",
          "absolute inset-0 cursor-default bg-[#02050b]/70",
        ].join(" ")}
      />

      <div
        className={[
          closing ? "sx-drawer-out" : "sx-drawer",
          /* No overflow on the panel itself — the middle scrolls while the
             header and the decision bar stay pinned, so Approve / Reject is
             always in reach without scrolling past the factor list. */
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-hidden bg-[radial-gradient(80%_40%_at_100%_0%,rgba(46,155,245,.18),transparent_70%),linear-gradient(180deg,#0a1322,#050912)] shadow-[-30px_0_60px_rgba(0,0,0,.55)]",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        {/* the report's lit left edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-[#9be0ff] via-[#2e9bf5]/60 to-[#f97a1f]/50 shadow-[0_0_18px_2px_rgba(46,155,245,.5)]"
        />
        {/* header */}
        <div className="sx-animate sx-delay-1 flex shrink-0 items-center gap-3 border-b border-line-soft p-5">
          <Monogram
            text={initials(a.name)}
            shape="circle"
            tone={
              s === "APPROVED" ? "accent" : s === "REJECTED" ? "neutral" : "primary"
            }
            className="size-10 text-xs"
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight">
                {a.name}
              </span>
              <Badge tone={STATE_TONE[s]}>{STATE_COPY[s]}</Badge>
              {a.isMinor && <Badge tone="warn">Minor</Badge>}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {a.sport} · {a.region} · submitted {a.submittedAt}
            </p>
            {a.legalName && a.legalName !== a.name && (
              <p className="mt-0.5 truncate text-[11px] text-faint">
                Legal name: {a.legalName}
              </p>
            )}
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
        {/* score */}
        <div className="sx-animate sx-delay-2 border-b border-line-soft p-5">
          {a.score && band ? (
            <>
              <div className="flex items-center gap-4">
                <span className="shrink-0 drop-shadow-[0_0_16px_rgba(46,155,245,.55)]">
                  <ScoreRing value={a.score.total} size={96} strokeWidth={7} textCls="text-2xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold tracking-tight ${RING_TEXT[band.tone]}`}>
                    {band.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                    {band.blurb}
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5">
                {a.score.factors.map((f, i) => (
                  <li key={f.label}>
                    <div className="flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="font-medium text-[#cfe9ff]">{f.label}</span>
                      <span className="font-mono tabular-nums text-[#9aa4b2]">
                        {f.value === null ? "not assessed" : f.value}
                      </span>
                    </div>
                    {FACTOR_HINTS[f.label] && (
                      <p className="text-[10px] text-faint">{FACTOR_HINTS[f.label]}</p>
                    )}
                    {f.value !== null && (
                      /* P1-ART-16 — a glowing bar that grows in, one after another. */
                      <div
                        role="meter"
                        aria-label={f.label}
                        aria-valuenow={f.value}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                      >
                        <span
                          className="sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff] shadow-[0_0_10px_rgba(46,155,245,.75)]"
                          style={{ width: `${Math.max(0, Math.min(100, f.value))}%`, "--sx-reveal-delay": `${0.2 + i * 0.07}s` } as React.CSSProperties}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {(a.score.gapPercent ?? 0) > 0 && (
                <p className="mt-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[10px] leading-relaxed text-warn">
                  {a.score.gapPercent}% of the score&rsquo;s weight hasn&rsquo;t
                  been assessed yet — the number is computed from the factors
                  that have.
                </p>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed text-faint">
                Scored by fixed rules — every factor is stored with the score, so a
                decision can be explained later.
                <MiniChip kind="neutral">{a.score.method} · POSTGRES</MiniChip>
              </p>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <NoScoreRing size={72} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  Not scored yet
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  The network manager records the factor assessment during
                  review — a missing score is an unassessed athlete, never a
                  zero.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* safeguards */}
        <div className="sx-animate sx-delay-3 border-b border-line-soft p-5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Safeguards
          </p>
          <ul className="mt-3 space-y-2.5">
            {a.isMinor ? (
              a.guardianVerified ? (
                <CheckRow status="ok">
                  Guardian verified — this minor can go live once approved.
                </CheckRow>
              ) : a.guardianStatus === "missing" ? (
                <CheckRow status="danger">
                  Minor with no guardian linked — someone must collect a
                  guardian&rsquo;s details before this athlete can go live.
                </CheckRow>
              ) : (
                <CheckRow status="warn">
                  Guardian linked but not verified — a minor cannot go live
                  until the guardian is verified.
                </CheckRow>
              )
            ) : (
              <CheckRow status="ok">Adult athlete — no guardian needed.</CheckRow>
            )}
            {live ? (
              /* The queue API answers no conflict data yet — an honest gap,
                 not a clean bill (§22). */
              <CheckRow status="neutral">
                Conflict checks run at matching — nothing is checked at this
                stage yet.
              </CheckRow>
            ) : conflicts.length > 0 ? (
              conflicts.map((f) => (
                <CheckRow key={f} status="danger">
                  {f}
                </CheckRow>
              ))
            ) : (
              <CheckRow status="ok">No conflicts declared.</CheckRow>
            )}
            {a.followers !== null && (
              <CheckRow status="neutral">
                {a.followers.toLocaleString("en-US")} followers — self-reported by the
                athlete; platform verification comes in a later phase.
              </CheckRow>
            )}
            {a.reviewerNotes && (
              <CheckRow status="neutral">
                Last reviewer note: &ldquo;{a.reviewerNotes}&rdquo;
              </CheckRow>
            )}
          </ul>
          {a.slug && (
            <a
              href={`/athletes/${a.slug}?from=applications`}
              target="_blank"
              rel="noopener"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              View public profile
              <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>

        {/* what this state means */}
        <div className="sx-animate sx-delay-4 p-5">
          <p className="text-xs leading-relaxed text-muted">{STATE_DETAIL[s]}</p>
        </div>
        </div>

        {/* decision bar — pinned */}
        <div className="sx-animate sx-delay-4 shrink-0 border-t border-line-soft p-5">
          {live ? (
            <>
              <div aria-live="polite">
                {err && (
                  <p className="sx-pop mb-3 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2.5 text-xs leading-relaxed text-text">
                    {err}
                  </p>
                )}
                {done === "approve" && (
                  <p className="sx-pop mb-3 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2.5 text-xs leading-relaxed text-text">
                    {a.name} approved — they&rsquo;re being notified by email.
                    Going live for paid work is a separate activation step.
                  </p>
                )}
                {done === "activate" && (
                  <p className="sx-pop mb-3 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2.5 text-xs leading-relaxed text-text">
                    {a.name} is active — live in the network and able to take
                    paid work.
                  </p>
                )}
                {done === "changes" && (
                  <p className="sx-pop mb-3 rounded-lg border border-line bg-surface-2/60 px-3 py-2.5 text-xs leading-relaxed text-text">
                    Sent back — the athlete receives your notes and can update
                    and resubmit.
                  </p>
                )}
                {done === "reject" && (
                  <p className="sx-pop mb-3 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2.5 text-xs leading-relaxed text-text">
                    Rejected — the athlete receives your notes. This is final;
                    re-applying starts a new application.
                  </p>
                )}
              </div>

              {s === "SUBMITTED" && !done && (
                <>
                  <p className="mb-3 text-[11px] leading-relaxed text-muted">
                    Claim this application to review it — decisions unlock once
                    it&rsquo;s in review, so two reviewers can&rsquo;t decide it
                    twice.
                  </p>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => decide("begin")}
                    className="inline-flex w-full items-center justify-center bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-3.5 py-2.5 text-xs font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === "begin" ? "Starting review…" : "Start review"}
                  </button>
                </>
              )}

              {s === "UNDER_REVIEW" && !done && (
                <>
                  {blocked && (
                    <p className="mb-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
                      Minor without a verified guardian — approving is allowed,
                      but activation stays locked until the guardian is
                      verified.
                    </p>
                  )}
                  <label
                    htmlFor="review-notes"
                    className="mb-1 block text-[11px] font-medium text-muted"
                  >
                    Notes to the athlete{" "}
                    <span className="text-faint">
                      — required to request info or reject; sent to them
                      verbatim
                    </span>
                  </label>
                  <textarea
                    id="review-notes"
                    value={notes}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      setArmReject(false);
                    }}
                    rows={3}
                    disabled={busy !== null}
                    placeholder="What should the athlete hear about this decision?"
                    className="mb-3 w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-text placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => decide("approve")}
                      className="inline-flex flex-1 items-center justify-center bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-3.5 py-2.5 text-xs font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === "approve" ? "Approving…" : "Approve"}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || needsNotes}
                      title={needsNotes ? "Write the athlete a note first — it's what they receive." : undefined}
                      onClick={() => decide("changes")}
                      className="inline-flex items-center justify-center border border-[#63b4f8]/40 bg-[#0a121e]/60 px-3.5 py-2.5 text-xs font-semibold text-[#cfe9ff] transition-colors hover:border-[#9be0ff] hover:text-white [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === "changes" ? "Sending…" : "Request info"}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || needsNotes}
                      title={needsNotes ? "Write the athlete a note first — it's what they receive." : undefined}
                      onClick={() => (armReject ? decide("reject") : setArmReject(true))}
                      className={[
                        "inline-flex items-center justify-center px-3.5 py-2.5 text-xs font-semibold transition-[background-color,box-shadow,color] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40",
                        armReject
                          ? "bg-[#ef4444] text-white shadow-[0_0_22px_rgba(239,68,68,.55)] hover:bg-[#dc2626]"
                          : "border border-[#ef4444]/50 text-[#fca5a5] hover:bg-[#ef4444]/15",
                      ].join(" ")}
                    >
                      {busy === "reject"
                        ? "Rejecting…"
                        : armReject
                          ? "Confirm reject — final"
                          : "Reject"}
                    </button>
                  </div>
                </>
              )}

              {s === "APPROVED" && done !== "activate" && (() => {
                /* B1's last step (§21 APPROVED → ACTIVE). The API refuses a
                   minor without a verified guardian for every caller; the
                   desk says so first rather than offering a button that 409s. */
                const why = activationBlock(a, s);
                return (
                  <>
                    <p className="mb-3 text-[11px] leading-relaxed text-muted" aria-live="polite">
                      {why ??
                        "Approved. Activating puts this athlete live — sponsors can then invite them to paid work."}
                    </p>
                    <button
                      type="button"
                      disabled={busy !== null || why !== null}
                      title={why ?? undefined}
                      onClick={() => decide("activate")}
                      className="inline-flex w-full items-center justify-center bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-3.5 py-2.5 text-xs font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {busy === "activate" ? "Activating…" : "Activate athlete"}
                    </button>
                  </>
                );
              })()}

              <p className="mt-3 text-[10px] leading-relaxed text-faint">
                Decisions are recorded and audited, and the athlete is emailed
                the outcome.
              </p>
            </>
          ) : (
            <>
              <div aria-live="polite">
                {decision === "APPROVED" && (
                  <DecisionBanner tone="accent" onUndo={onUndo}>
                    {a.name} approved into the network.
                  </DecisionBanner>
                )}
                {decision === "REJECTED" && (
                  <DecisionBanner tone="danger" onUndo={onUndo}>
                    Application rejected — the athlete will be notified.
                  </DecisionBanner>
                )}
                {decision === "INFO" && (
                  <DecisionBanner tone="neutral" onUndo={onUndo}>
                    Information requested — the athlete will be asked to update
                    their application.
                  </DecisionBanner>
                )}
              </div>

              {inReview(s) && !decided && (
                <>
                  {blocked && (
                    <p className="mb-3 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] leading-relaxed text-warn">
                      Approve is locked until this athlete&rsquo;s guardian is
                      verified — required for minors.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={blocked}
                      onClick={() => onDecide("APPROVED")}
                      className="inline-flex flex-1 items-center justify-center bg-gradient-to-r from-[#63b4f8] to-[#2e9bf5] px-3.5 py-2.5 text-xs font-semibold text-[#04070e] shadow-[0_0_22px_rgba(46,155,245,.45)] transition-shadow hover:shadow-[0_0_32px_rgba(46,155,245,.7)] [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecide("INFO")}
                      className="inline-flex items-center justify-center border border-[#63b4f8]/40 bg-[#0a121e]/60 px-3.5 py-2.5 text-xs font-semibold text-[#cfe9ff] transition-colors hover:border-[#9be0ff] hover:text-white [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]"
                    >
                      Request info
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecide("REJECTED")}
                      className="inline-flex items-center justify-center border border-[#ef4444]/50 px-3.5 py-2.5 text-xs font-semibold text-[#fca5a5] transition-colors hover:bg-[#ef4444]/15 [clip-path:polygon(0_0,calc(100%-8px)_0,100%_8px,100%_100%,8px_100%,0_calc(100%-8px))]"
                    >
                      Reject
                    </button>
                  </div>
                </>
              )}

              <p className="mt-3 text-[10px] leading-relaxed text-faint">
                Demo decisions last for this visit only — nothing is saved.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DecisionBanner({
  tone,
  onUndo,
  children,
}: {
  tone: "accent" | "danger" | "neutral";
  onUndo: () => void;
  children: React.ReactNode;
}) {
  const cls = {
    accent: "border-accent/25 bg-accent/8",
    danger: "border-danger/25 bg-danger/8",
    neutral: "border-line bg-surface-2/60",
  }[tone];
  return (
    <div
      className={`sx-pop mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2.5 ${cls}`}
    >
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-text">
        {children}
      </p>
      <button
        type="button"
        onClick={onUndo}
        className="text-[11px] font-medium text-muted transition-colors hover:text-text"
      >
        Undo
      </button>
    </div>
  );
}
