"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui";
import { MiniChip, initials } from "@/components/hero";
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
  ServerList,
  useListNav,
} from "@/components/server-pager";
import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { OpsCount } from "@/components/ops-fx";
import { HomeFeatureLoader } from "@/components/home-feature-loader";
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
  waitShort,
  FACTOR_HINTS,
  STATE_COPY,
  STATE_DETAIL,
  STATE_NEXT,
  nextMove,
  stateBucket,
  scoreBand,
  trackSteps,
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

   POL-FE-106 (2026-11-17) — redrawn like the athlete's Inventory and
   Listings, on the same Mission Control stage, because the player-card board
   was hard to read: the four tabs are now four status cards that carry the
   counts and say what each holds; a "How it works" button in the header opens the flow in a panel
   (open → start review → decide → activate); the queue is a LIST by default
   (athlete · fit score · waiting · status and next step), with Cards as the
   other view, remembered per browser; a paged re-fetch shows a skeleton of
   the list. The drawer opens on a tracker (Applied → In review → Approved →
   Active) and one "Your next step" sentence. Reads, paging and the review
   actions are unchanged. Styles: admin/applications/(queue)/applications.css.
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
  const layout = useDeskView();
  /* What "Needs review" warns about: the API's count when paged, the demo's own. */
  const overdue = paged
    ? paged.summary.overdue
    : items.filter((a) => inReview(eff(a)) && (wait.get(a.id) ?? 0) > AGING_HOURS).length;

  return (
    <div className="sx-ap">
      {/* POL-FE-106 — the four tabs ARE the numbers: one card each, with what
          it holds in words. Replaces the KPI tiles + pill tabs that said the
          same counts twice. */}
      <StatusCards
        counts={tabCounts}
        tab={view.tab as TabKey}
        overdue={overdue}
        onPick={chooseTab}
      />

      {/* --------------------------------------------------------- toolbar */}
      <div className="sx-ap-toolbar sx-ap-rise" style={d(0.34)}>
        {paged ? (
          <div className="sx-ap-filters">
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
          <div className="sx-ap-filters">
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
        <ViewToggle view={layout} />
      </div>

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
        <div className="mb-3 sx-ap-rise" style={d(0.38)}>
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
      <Body paged={paged !== null} layout={layout}>
        {shown.length === 0 ? (
          <div className="sx-ap-none sx-ap-rise" style={d(0.4)}>
            <span className="sx-ap-none-mark" aria-hidden="true">
              <Glyph ui={isFiltered ? "eye" : "check"} className="size-7" />
            </span>
            <p className="text-sm font-semibold text-white">
              {isFiltered ? "Nothing matches these filters" : "This list is clear"}
            </p>
            <p className="mt-1 text-xs text-[#9aa4b2]">
              {isFiltered
                ? "Try a name, a sport like “Soccer”, or another card above."
                : "New applications land here from the public join page."}
            </p>
            {isFiltered && (
              <button
                type="button"
                onClick={reset}
                className="mt-3 text-xs font-medium text-[#63b4f8] transition-colors hover:text-[#9be0ff]"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : layout === "list" ? (
          <div key="list" className="sx-ap-list">
            <div className="sx-ap-head" aria-hidden="true">
              <span>Athlete</span>
              <span>Fit score</span>
              <span>Waiting</span>
              <span>Status · next step</span>
              <span />
            </div>
            <ul aria-label="Applications">
              {shown.map((a, i) => (
                <AppRow
                  key={a.id}
                  a={a}
                  s={eff(a)}
                  i={i}
                  w={wait.get(a.id) ?? 0}
                  info={decisions[a.id] === "INFO"}
                  onOpen={() => openItem(a.id)}
                />
              ))}
            </ul>
          </div>
        ) : (
          <ul key="cards" aria-label="Applications" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((a, i) => (
              <AppCard
                key={a.id}
                a={a}
                s={eff(a)}
                i={i}
                w={wait.get(a.id) ?? 0}
                info={decisions[a.id] === "INFO"}
                onOpen={() => openItem(a.id)}
              />
            ))}
          </ul>
        )}
      </Body>

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

/* ------------------------------------------------ POL-FE-106 · the pieces */

const d = (s: number, extra?: React.CSSProperties) =>
  ({ "--d": `${s}s`, ...extra }) as React.CSSProperties;

/* List (the default — "lists first", the inventory's rule) or Cards,
   remembered per browser. */
type Layout = "list" | "cards";
const VIEW_KEY = "sx-ap-view";
const viewSubs = new Set<() => void>();
function readView(): Layout {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}
function writeView(v: Layout) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* private window: the choice lasts until the page reloads */
  }
  viewSubs.forEach((f) => f());
}
function subscribeView(cb: () => void) {
  viewSubs.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    viewSubs.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
function useDeskView(): Layout {
  return useSyncExternalStore(subscribeView, readView, () => "list" as Layout);
}

function ViewToggle({ view }: { view: Layout }) {
  return (
    <div role="group" aria-label="Show as" className="sx-ap-views">
      {(["list", "cards"] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => writeView(v)}
          className="sx-ap-view"
        >
          <Glyph ui={v === "cards" ? "grid" : "rows"} className="size-4" />
          <span>{v === "cards" ? "Cards" : "List"}</span>
        </button>
      ))}
    </div>
  );
}

const STATUS_CARDS: Array<{ key: TabKey; icon: UiGlyph; tone: string; sub: string }> = [
  { key: "review", icon: "hourglass", tone: "#63b4f8", sub: "Waiting for a decision" },
  { key: "approved", icon: "check", tone: "#4ade80", sub: "Approved or already live" },
  { key: "rejected", icon: "ban", tone: "#f87171", sub: "Turned down, athlete told" },
  { key: "all", icon: "users", tone: "#cbd5e1", sub: "Every application on file" },
];

/** The tabs as four status cards: icon, name, the count, one line of what it
 *  holds. Arrow keys move between them, like any tab list. */
function StatusCards({
  counts,
  tab,
  overdue,
  onPick,
}: {
  counts: Record<TabKey, number>;
  tab: TabKey;
  overdue: number;
  onPick: (key: TabKey) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = STATUS_CARDS.findIndex((c) => c.key === tab);
    const next = STATUS_CARDS[(i + (e.key === "ArrowRight" ? 1 : STATUS_CARDS.length - 1)) % STATUS_CARDS.length];
    onPick(next.key);
    bar.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
  };
  return (
    <div
      ref={bar}
      role="tablist"
      aria-label="Application queue"
      className="sx-ap-stats"
      onKeyDown={onKey}
    >
      {STATUS_CARDS.map((c, i) => {
        const on = c.key === tab;
        const late = c.key === "review" && overdue > 0;
        const label = TABS.find((t) => t.key === c.key)?.label ?? c.key;
        return (
          <button
            key={c.key}
            type="button"
            role="tab"
            data-tab={c.key}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onPick(c.key)}
            data-spot=""
            className="sx-ap-stat sx-ap-rise"
            style={d(0.08 + i * 0.06, { "--c": late ? "#fb923c" : c.tone } as React.CSSProperties)}
          >
            <span aria-hidden="true" className="sx-ap-stat-beam" />
            <span className="sx-ap-stat-top">
              <span className="sx-ap-stat-icon" aria-hidden="true">
                <Glyph ui={late ? "alert" : c.icon} className="size-[18px]" />
              </span>
              <span className="sx-ap-stat-name">{label}</span>
            </span>
            <span className="sx-ap-stat-num">
              <OpsCount value={counts[c.key]} delay={0.2 + i * 0.08} />
            </span>
            <span className="sx-ap-stat-sub" data-late={late ? "" : undefined}>
              {late
                ? `${overdue} waited over 2 days`
                : c.sub}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The desk's flow, for the "How it works" panel. The demo has no claim or
 *  activation step, so it shows two. */
function flowSteps(live: boolean): Array<{ icon: UiGlyph; title: string; text: string }> {
  return [
    { icon: "eye", title: "Open one", text: "Click any application to see the athlete, their score and the safety checks." },
    ...(live
      ? [{ icon: "play" as UiGlyph, title: "Start review", text: "Claims it, so two people never decide the same one." }]
      : []),
    { icon: "shield", title: "Decide", text: "Approve, ask for more info, or reject. The athlete is emailed." },
    ...(live
      ? [{ icon: "bolt" as UiGlyph, title: "Activate", text: "Puts an approved athlete live, ready for paid work." }]
      : []),
  ];
}

/** "How it works": a header button that opens the flow in a panel (the
 *  owner, 2026-11-17: "make a button for how this works and put this on the
 *  panel"), plus a key to reading the list. Escape, the scrim, Close and
 *  "Got it" close it, focus stays inside while open and returns to the
 *  button after. Portaled to <body> so no entrance transform traps it. */
export function HowItWorksButton({ live }: { live: boolean }) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const titleId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const shut = () => {
    setPhase("closed");
    opener.current?.focus();
  };
  const close = () => {
    if (phase !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) shut();
    else {
      setPhase("closing");
      timer.current = window.setTimeout(shut, 260);
    }
  };

  useEffect(() => {
    if (phase !== "open") return;
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    const t = window.setTimeout(() => sheet.current?.querySelector<HTMLElement>(".sx-ap-close")?.focus(), 60);
    return () => {
      root.style.overflow = was;
      window.clearTimeout(t);
    };
  }, [phase]);

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const f = sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href]");
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const steps = flowSteps(live);
  return (
    <>
      <button
        ref={opener}
        type="button"
        onClick={() => setPhase("open")}
        aria-haspopup="dialog"
        className="sx-ap-help"
      >
        <span className="sx-ap-help-q" aria-hidden="true">?</span>
        How it works
      </button>
      {phase !== "closed" &&
        createPortal(
          <div className="sx-ops sx-ap-modal" data-closing={phase === "closing" ? "" : undefined}>
            <div className="sx-ap-scrim" onClick={close} aria-hidden="true" />
            <section
              ref={sheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="sx-ap-sheet"
              onKeyDown={onKey}
            >
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
              <span aria-hidden="true" className="sx-ap-sheet-scan" />
              <div className="sx-ap-sheet-head">
                <span className="sx-ap-sheet-badge" aria-hidden="true">
                  <Glyph ui="bolt" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="sx-ap-sheet-title">How it works</h2>
                  <p className="sx-ap-sheet-lede">
                    From a new application to an athlete who can take paid work.
                  </p>
                </div>
                <button type="button" onClick={close} className="sx-ap-close" aria-label="Close">
                  <Glyph ui="close" className="size-4" />
                </button>
              </div>

              <div className="sx-ap-sheet-body">
                <ol className="sx-ap-flow-steps">
                  <span aria-hidden="true" className="sx-ap-flow-rail" />
                  {steps.map((s, i) => (
                    <li key={s.title} className="sx-ap-flow-step" style={d(0.12 + i * 0.09)}>
                      <span className="sx-ap-flow-dot" aria-hidden="true">
                        <Glyph ui={s.icon} className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="sx-ap-flow-title">
                          <span className="sx-ap-flow-n">{i + 1}</span>
                          {s.title}
                        </span>
                        <span className="sx-ap-flow-text">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="sx-ap-key" style={d(0.12 + steps.length * 0.09)}>
                  <p className="sx-ap-key-k">Reading the list</p>
                  <ul>
                    <li>
                      <span className="sx-ap-key-mark">
                        <StatusPill tone="blue" act>Submitted</StatusPill>
                      </span>
                      <span>A pulsing dot means it&rsquo;s your move.</span>
                    </li>
                    <li>
                      <span className="sx-ap-key-mark">
                        <span className="sx-ap-key-late" aria-hidden="true" />
                      </span>
                      <span>Orange means it has waited more than 2 days. Those come first.</span>
                    </li>
                    <li>
                      <span className="sx-ap-key-mark">
                        <ScoreRing value={72} size={32} strokeWidth={3} textCls="text-[10px]" />
                      </span>
                      <span>
                        The fit score: how well they match what sponsors buy, worked out by fixed rules.
                        &ldquo;Not scored yet&rdquo; is not a zero.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="sx-ap-sheet-foot">
                <button type="button" onClick={close} className="sx-ap-got">
                  Got it
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

type ItemProps = {
  a: App;
  s: LiveApplicationState;
  i: number;
  w: number;
  /** A demo "Request info" — the state stays, the pill says so. */
  info: boolean;
  onOpen: () => void;
};

function useRowWords({ a, s, w, info }: Pick<ItemProps, "a" | "s" | "w" | "info">) {
  const reviewing = inReview(s);
  const meter = waitMeter(w);
  const late = reviewing && meter.overdue;
  const next = info ? STATE_NEXT.CHANGES_REQUESTED : STATE_NEXT[s];
  const status = info ? STATE_COPY.CHANGES_REQUESTED : STATE_COPY[s];
  const band = a.score ? scoreBand(a.score.total) : null;
  return { reviewing, meter, late, next, status, band };
}

function StatusPill({ tone, act, children }: { tone: string; act: boolean; children: React.ReactNode }) {
  return (
    <span className="sx-ap-pill" data-tone={tone} data-act={act ? "" : undefined}>
      <span className="sx-ap-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

function MinorTags({ a, reviewing }: { a: App; reviewing: boolean }) {
  if (!a.isMinor && !(a.flags.length > 0 && reviewing)) return null;
  return (
    <span className="sx-ap-tags">
      {a.isMinor && <Badge tone="warn">Minor</Badge>}
      {a.isMinor && (
        <span className="text-[10px] font-medium text-[#9aa4b2]">
          {a.guardianVerified ? "guardian verified" : "guardian pending"}
        </span>
      )}
      {a.flags.length > 0 && reviewing && (
        <span className="text-[10px] font-semibold text-[#fca5a5]">
          ▲ {a.flags.length} {a.flags.length === 1 ? "flag" : "flags"}
        </span>
      )}
    </span>
  );
}

/** One application as a row of the list. The whole row is the button that
 *  opens the review (its name leads, so "find by name" still works). */
function AppRow({ a, s, i, w, info, onOpen }: ItemProps) {
  const { reviewing, meter, late, next, status, band } = useRowWords({ a, s, w, info });
  return (
    <li className="sx-ap-rise" style={d(0.42 + Math.min(i, 14) * 0.035)}>
      <button
        type="button"
        onClick={onOpen}
        data-spot=""
        data-late={late ? "" : undefined}
        className="sx-ap-row"
      >
        <span className="sx-ap-who">
          <span className="sx-ap-avatar" data-tone={next.tone} aria-hidden="true">
            {initials(a.name)}
          </span>
          <span className="min-w-0">
            <span className="sx-ap-name">{a.name}</span>
            <span className="sx-ap-sub">
              {a.sport} · {a.region}
              {a.followers !== null && <> · {a.followers.toLocaleString("en-US")} followers</>}
            </span>
            <MinorTags a={a} reviewing={reviewing} />
          </span>
        </span>

        <span className="sx-ap-score">
          {a.score ? (
            <ScoreRing value={a.score.total} size={40} strokeWidth={3.5} textCls="text-[11px]" />
          ) : (
            <NoScoreRing size={40} />
          )}
          <span className={`sx-ap-score-word ${band ? RING_TEXT[band.tone] : "text-[#7e88a0]"}`}>
            {band ? band.label : "Not scored yet"}
          </span>
        </span>

        <span className="sx-ap-wait" data-late={late ? "" : undefined}>
          {reviewing ? (
            <>
              <span className="sx-ap-wait-num">
                {waitShort(w)}
                {late && <span className="sx-ap-wait-flag"> · over 48h</span>}
              </span>
              <span aria-hidden="true" className="sx-ap-meter">
                <span style={{ width: `${Math.max(4, meter.pct)}%`, ...d(0.6 + Math.min(i, 14) * 0.035) }} />
              </span>
            </>
          ) : (
            <>
              <span className="sx-ap-wait-num">{a.submittedAt}</span>
              <span className="sx-ap-wait-cap">applied</span>
            </>
          )}
        </span>

        <span className="sx-ap-state">
          <StatusPill tone={next.tone} act={next.act}>{status}</StatusPill>
          <span className="sx-ap-next">
            <Glyph ui="arrow" className="size-3" />
            {next.next}
          </span>
        </span>

        <span className="sx-ap-go" aria-hidden="true">
          <span className="sx-ap-go-word">Review</span>
          <Glyph ui="arrow" className="size-4" />
        </span>
      </button>
    </li>
  );
}

/** One application as a Scouting Board player card (the Cards view). */
function AppCard({ a, s, i, w, info, onOpen }: ItemProps) {
  const { reviewing, meter, late, next, status } = useRowWords({ a, s, w, info });
  return (
    <li className="sx-ap-rise" style={d(0.42 + Math.min(i, 11) * 0.05)}>
      <button
        type="button"
        onClick={onOpen}
        data-spot=""
        data-tilt=""
        style={{ "--tone": late ? "#fb923c" : "#63b4f8" } as React.CSSProperties}
        className={`sx-ops-card group relative flex h-full min-h-[13rem] w-full flex-col gap-3 px-5 pb-5 pt-[18px] text-left ${late ? "shadow-[inset_0_3px_0_#f97a1f]" : ""}`}
      >
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold tracking-tight text-white">
              {a.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[#8a96a3]">
              {a.sport} · {a.region}
            </span>
          </span>
          <span className="shrink-0 drop-shadow-[0_0_12px_rgba(46,155,245,.45)]">
            {a.score ? (
              <ScoreRing value={a.score.total} size={60} strokeWidth={5} textCls="text-base" />
            ) : (
              <NoScoreRing size={60} />
            )}
          </span>
        </span>

        <MinorTags a={a} reviewing={reviewing} />

        <span className="mt-auto block space-y-2.5">
          {reviewing && (
            <span className="block">
              <span className="flex items-center justify-between gap-2 text-[11px]">
                <span className={late ? "font-semibold text-[#fdba74]" : "text-[#9aa4b2]"}>
                  {meter.label}
                </span>
                <span className="text-[#7e88a0]">applied {a.submittedAt}</span>
              </span>
              <span aria-hidden="true" className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className={`sx-ops-wait absolute inset-y-0 left-0 block rounded-full ${late ? "bg-gradient-to-r from-[#fb923c] to-[#f97a1f] shadow-[0_0_12px_rgba(249,122,31,.8)]" : "bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff] shadow-[0_0_10px_rgba(46,155,245,.7)]"}`}
                  style={{ width: `${meter.pct}%`, "--sx-reveal-delay": `${0.8 + Math.min(i, 11) * 0.05}s` } as React.CSSProperties}
                />
              </span>
            </span>
          )}
          <span className="flex flex-wrap items-center justify-between gap-2">
            <StatusPill tone={next.tone} act={next.act}>{status}</StatusPill>
            <span className="sx-ap-next">
              <Glyph ui="arrow" className="size-3" />
              {next.next}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** The list's body. Paged: while the next page loads, a skeleton in the
 *  list's own shape stands in for it (the dashboard's loader rule) — the
 *  demo filters in the browser and never waits. */
function Body({
  paged,
  layout,
  children,
}: {
  paged: boolean;
  layout: Layout;
  children: React.ReactNode;
}) {
  return paged ? <PagedBody layout={layout}>{children}</PagedBody> : <>{children}</>;
}

function PagedBody({ layout, children }: { layout: Layout; children: React.ReactNode }) {
  const { pending } = useListNav();
  if (!pending) return <>{children}</>;
  return (
    <div role="status" aria-busy="true" aria-label="Loading applications" className="sx-ap-wait-load">
      <span className="sx-ap-loadbar" aria-hidden="true" />
      <SkeletonRows layout={layout} />
    </div>
  );
}

export function SkeletonRows({ layout = "list", n = 6 }: { layout?: Layout; n?: number }) {
  if (layout === "cards") {
    return (
      <div aria-hidden="true" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="sx-ops-panel sx-ops-ghost relative min-h-[13rem]" />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="sx-ap-list">
      <div className="sx-ap-head">
        <span>Athlete</span>
        <span>Fit score</span>
        <span>Waiting</span>
        <span>Status · next step</span>
        <span />
      </div>
      <ul>
        {Array.from({ length: n }, (_, i) => (
          <li key={i}>
            <div className="sx-ap-row sx-ap-row-ghost">
              <span className="sx-ap-who">
                <span className="sx-ap-avatar sx-ops-ghost" />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="sx-ops-ghost block h-3.5 w-40 max-w-full rounded" />
                  <span className="sx-ops-ghost block h-2.5 w-28 max-w-full rounded" />
                </span>
              </span>
              <span className="sx-ap-score">
                <span className="sx-ops-ghost block size-10 rounded-full" />
                <span className="sx-ops-ghost block h-2.5 w-16 rounded" />
              </span>
              <span className="sx-ap-wait">
                <span className="sx-ops-ghost block h-3 w-14 rounded" />
                <span className="sx-ops-ghost mt-1.5 block h-1.5 w-full rounded-full" />
              </span>
              <span className="sx-ap-state">
                <span className="sx-ops-ghost block h-5 w-24 rounded-full" />
              </span>
              <span />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ ReviewDrawer

   POL-FE-106 (owner, 2026-11-17: the panel was "too ugly ... the UX are too
   confusing"). Redrawn to answer two questions in order:

   1. Where is it?  The tracker, with the state's sentence under it.
   2. What do I do? "Your next step", with a button that jumps to the
      decision and lights it up.

   Then the facts at a glance (fit score, guardian, conflicts, audience) as
   four tiles, what the score is made of, and the decision as its own
   numbered step. Under review that step is three choice cards (Approve / Ask
   for more info / Reject), each saying what happens. The note box asks only
   for what that choice needs, and one button says exactly what it will do.
   The old bar had three buttons, two of them greyed out until a note was
   written, with no word on why. Nothing is pinned: the panel scrolls as
   one, so there is no dead gap above a bottom bar.

   The decisions are unchanged: the same server action, the same §21
   transitions, the same refusals and stale-click adoption. The e2e loop's
   strings stay ("Start review", "Approve" exactly, "Activate athlete", the
   guardian sentences, "<name> approved", "<name> is active", the ACTIVE
   state sentence). */

type Choice = "approve" | "changes" | "reject";

const CHOICES: Array<{ key: Choice; title: string; text: string; icon: UiGlyph; tone: string }> = [
  { key: "approve", title: "Approve", text: "They join the network. You activate them after.", icon: "check", tone: "green" },
  { key: "changes", title: "Ask for more info", text: "Send it back with a note. They fix it and send it again.", icon: "undo", tone: "amber" },
  { key: "reject", title: "Reject", text: "A final no. They're told by email.", icon: "ban", tone: "red" },
];

const NOTE_COPY: Record<Choice, { label: string; hint: string; placeholder: string }> = {
  approve: {
    label: "Note to the athlete",
    hint: "Optional. Sent with the approval email.",
    placeholder: "Welcome them, or say what to set up first.",
  },
  changes: {
    label: "What should they add or fix?",
    hint: "Required. Sent to them exactly as you write it.",
    placeholder: "For example: add a link to your Instagram and your team's name.",
  },
  reject: {
    label: "Why is it a no?",
    hint: "Required. Sent to them exactly as you write it.",
    placeholder: "Be kind and specific. They can apply again later.",
  },
};

/** One fact tile: icon, label, the answer, a caption. */
function Fact({
  icon,
  label,
  tone,
  children,
  caption,
  i,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "ok" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
  caption?: React.ReactNode;
  i: number;
}) {
  return (
    <li className="sx-rv-fact" data-tone={tone} style={d(0.18 + i * 0.06)}>
      <span className="sx-rv-fact-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="sx-rv-fact-k">{label}</span>
        <span className="sx-rv-fact-v">{children}</span>
        {caption && <span className="sx-rv-fact-c">{caption}</span>}
      </span>
    </li>
  );
}

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
  /* Conflicts list non-guardian flags — the guardian has its own tile.
     Spec refs like "(§26)" are stripped from user-facing copy. */
  const conflicts = a.flags
    .filter((f) => !/guardian/i.test(f))
    .map((f) => f.replace(/\s*\(§\d+\)/g, ""));
  const shownState: LiveApplicationState = decision === "INFO" ? "CHANGES_REQUESTED" : s;
  const look = STATE_NEXT[shownState];
  const hours = waitHours(a.submittedAt);
  const late = inReview(s) && hours > AGING_HOURS;

  /* ---- live decisions: the real §21 transitions, one at a time ---- */
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<ReviewActionKind | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<ReviewActionKind | null>(null);
  /* Demo: approving a minor without a verified guardian is locked, so the
     choice starts on "Ask for more info" there. */
  const [choice, setChoice] = useState<Choice>(!live && blocked ? "changes" : "approve");
  const lock = useRef(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const decideRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(0);

  const decide = async (kind: ReviewActionKind) => {
    /* memory: double-submit-needs-a-ref — a state flag lets a double click through. */
    if (!live || lock.current) return;
    lock.current = true;
    setBusy(kind);
    setErr(null);
    try {
      const result = await live.act(a.id, kind, kind === "begin" || kind === "activate" ? undefined : notes);
      if (result.ok) {
        onLiveState(result.state);
        if (kind !== "begin") setDone(kind);
        if (kind === "begin") setChoice("approve");
      } else if (result.missing && result.missing.length > 0 && onMissing) {
        /* A stale Activate on a profile that is now incomplete: adopt the
           missing fields — the button disables and the line above it names
           them (announced there), rather than a duplicate error. */
        onMissing(result.missing);
      } else {
        setErr(result.message);
        /* A stale click (F-10): the API said where the row really is, so
           adopt it — the controls for the old state disappear with it. */
        if (result.state) onLiveState(result.state);
      }
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };

  const pick = (c: Choice) => {
    setChoice(c);
    if (c !== "approve") window.setTimeout(() => noteRef.current?.focus(), 30);
  };

  /* Unmount normally rides the exit's animationend, but that event is
     lost if the animation never runs (stale-CSS HMR). A fallback timer
     slightly past the 0.22s exit guarantees close anyway. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  const decided = decision === "APPROVED" || decision === "REJECTED";

  /* What the decision step holds, if anything. */
  const step: "begin" | "decide" | "activate" | null = live
    ? s === "SUBMITTED" && !done
      ? "begin"
      : s === "UNDER_REVIEW" && !done
        ? "decide"
        : s === "APPROVED" && done !== "activate"
          ? "activate"
          : null
    : inReview(s) && !decided && decision !== "INFO"
      ? "decide"
      : null;
  const hasBanner = Boolean(err || done || decision);

  const goToDecision = () => {
    /* Scroll the panel's body only: scrollIntoView would also scroll the
       popup frame itself (overflow hidden is still scrollable by script),
       pushing the header out and leaving a blank strip. */
    const body = bodyRef.current;
    const el = decideRef.current;
    if (body && el) {
      const top = body.scrollTop + el.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      body.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    }
    setFlash((n) => n + 1);
  };

  const needsNote = choice !== "approve" && notes.trim().length === 0;
  const actionLabel =
    choice === "approve"
      ? busy === "approve" ? "Approving…" : "Approve"
      : choice === "changes"
        ? busy === "changes" ? "Sending…" : "Send back for more info"
        : busy === "reject" ? "Rejecting…" : "Reject application";
  const runChoice = () => {
    if (live) {
      void decide(choice);
      return;
    }
    onDecide(choice === "approve" ? "APPROVED" : choice === "changes" ? "INFO" : "REJECTED");
  };
  const approveLocked = !live && blocked;
  const note = NOTE_COPY[choice];

  return (
    <div
      /* `sx-ops`: the drawer is portaled to <body>, outside the stage, so it
         pins the stage's dark tokens itself. */
      className={["sx-ops sx-rv-modal", closing ? "pointer-events-none" : ""].join(" ")}
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
        className={[closing ? "sx-backdrop-out" : "sx-backdrop", "absolute inset-0 cursor-default bg-[#02050b]/70"].join(" ")}
      />

      {/* A centred popup (owner, 2026-11-17: "instead of slide, can you
          change it"), the How it works panel's sibling: it scales in, and its
          exit's animationend unmounts it. */}
      <div
        className="sx-rv"
        data-closing={closing ? "" : undefined}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-rv-out") onClosed();
        }}
      >
        <span aria-hidden="true" className="sx-rv-edge" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
        <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
        <span aria-hidden="true" className="sx-ap-sheet-scan" />

        {/* ---------------------------------------------------------- header */}
        <header className="sx-rv-head">
          <span className="sx-rv-avatar" data-tone={look.tone} aria-hidden="true">
            {initials(a.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="sx-rv-name">{a.name}</p>
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StatusPill tone={look.tone} act={look.act}>
                {STATE_COPY[shownState]}
              </StatusPill>
              {a.isMinor && <Badge tone="warn">Minor</Badge>}
            </p>
            <p className="sx-rv-meta">
              {a.sport} · {a.region} · applied {a.submittedAt}
              {late && <span className="sx-rv-late"> · waiting over 2 days</span>}
            </p>
            {a.legalName && a.legalName !== a.name && (
              <p className="sx-rv-meta">Legal name: {a.legalName}</p>
            )}
          </div>
          <button ref={closeBtnRef} type="button" onClick={onRequestClose} aria-label="Close" className="sx-rv-close">
            <CloseIcon />
          </button>
        </header>

        <div ref={bodyRef} className="sx-rv-body">
          {/* ------------------------------------------- 1 · where is it */}
          <section aria-label="Where it stands" className="sx-rv-block">
            <ol className="sx-ap-track" aria-label="Where this application stands">
              {trackSteps(shownState).map((t, i) => (
                <li
                  key={t.label}
                  className="sx-ap-step"
                  data-status={t.status}
                  data-reached={t.status === "todo" ? undefined : ""}
                  style={d(0.18 + i * 0.16)}
                >
                  <span className="sx-ap-step-dot" aria-hidden="true">
                    {t.status === "done" ? (
                      <Glyph ui="check" className="size-3.5" />
                    ) : t.status === "stop" ? (
                      <Glyph ui="close" className="size-3.5" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="sx-ap-step-label">{t.label}</span>
                  <span className="sr-only">
                    {" "}
                    — {{ done: "done", now: "now", todo: "not yet", stop: "stopped here" }[t.status]}
                  </span>
                </li>
              ))}
            </ol>
            <p className="sx-rv-detail">{STATE_DETAIL[shownState]}</p>
          </section>

          {/* ------------------------------------------- 2 · what to do */}
          <div className="sx-rv-next" data-act={step ? "" : undefined}>
            <span className="sx-rv-next-icon" aria-hidden="true">
              <Glyph ui={step ? "arrow" : "check"} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="sx-rv-next-k">{step ? "Your next step" : "Nothing for you to do"}</p>
              <p className="sx-rv-next-t">
                {step
                  ? nextMove(shownState, Boolean(live))
                  : /* the heading already says "Nothing for you to do" */
                    nextMove(shownState, Boolean(live)).replace(/^Nothing( for now| yet| here)?\.\s*/, "")}
              </p>
            </div>
            {step && (
              <button type="button" onClick={goToDecision} className="sx-rv-next-go">
                Go to it
                <Glyph ui="arrow" className="size-3.5 rotate-90" />
              </button>
            )}
          </div>

          {/* ------------------------------------------- the facts */}
          <section aria-label="At a glance" className="sx-rv-block">
            <p className="sx-rv-k">At a glance</p>
            <ul className="sx-rv-facts">
              <Fact
                i={0}
                label="Fit score"
                tone={band ? "ok" : "neutral"}
                icon={
                  a.score ? (
                    <ScoreRing value={a.score.total} size={40} strokeWidth={3.5} textCls="text-[11px]" />
                  ) : (
                    <NoScoreRing size={40} />
                  )
                }
                caption={band ? "out of 100" : "Scored during review. Blank is not a zero."}
              >
                {band ? <span className={RING_TEXT[band.tone]}>{band.label}</span> : "Not scored yet"}
              </Fact>
              <Fact
                i={1}
                label="Guardian"
                tone={!a.isMinor || a.guardianVerified ? "ok" : a.guardianStatus === "missing" ? "danger" : "warn"}
                icon={<Glyph ui="shield" className="size-5" />}
              >
                {!a.isMinor
                  ? "Adult athlete — no guardian needed."
                  : a.guardianVerified
                    ? "Guardian verified — this minor can go live once approved."
                    : a.guardianStatus === "missing"
                      ? "Minor with no guardian linked — someone must collect a guardian’s details before this athlete can go live."
                      : "Guardian linked but not verified — a minor cannot go live until the guardian is verified."}
              </Fact>
              <Fact
                i={2}
                label="Conflicts"
                tone={live ? "neutral" : conflicts.length > 0 ? "danger" : "ok"}
                icon={<Glyph ui="ban" className="size-5" />}
                caption={live ? "Nothing is checked at this stage yet." : undefined}
              >
                {live
                  ? "Checked at matching"
                  : conflicts.length > 0
                    ? conflicts.join(" · ")
                    : "No conflicts declared."}
              </Fact>
              <Fact
                i={3}
                label="Audience"
                tone="neutral"
                icon={<Glyph ui="users" className="size-5" />}
                caption={a.followers !== null ? "Self-reported by the athlete, not checked by BTG." : undefined}
              >
                {a.followers !== null ? `${a.followers.toLocaleString("en-US")} followers` : "Not given"}
              </Fact>
            </ul>
          </section>

          {/* ------------------------------------------- the score's parts */}
          {a.score && band && (
            <section aria-label="What the score is made of" className="sx-rv-block">
              <p className="sx-rv-k">What the score is made of</p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#9aa4b2]">{band.blurb}</p>
              <ul className="sx-rv-factors">
                {a.score.factors.map((f, i) => (
                  <li key={f.label} title={FACTOR_HINTS[f.label]}>
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-[12px] font-medium text-[#e6f3ff]">{f.label}</span>
                      <span className="font-mono text-[11px] tabular-nums text-[#9aa4b2]">
                        {f.value === null ? "not assessed" : f.value}
                      </span>
                    </span>
                    {FACTOR_HINTS[f.label] && <span className="block text-[10.5px] text-[#7e88a0]">{FACTOR_HINTS[f.label]}</span>}
                    {f.value !== null && (
                      <span
                        role="meter"
                        aria-label={f.label}
                        aria-valuenow={f.value}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="relative mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
                      >
                        <span
                          className="sx-ops-bar absolute inset-y-0 left-0 block rounded-full bg-gradient-to-r from-[#2e9bf5] to-[#9be0ff] shadow-[0_0_10px_rgba(46,155,245,.75)]"
                          style={{ width: `${Math.max(0, Math.min(100, f.value))}%`, "--sx-reveal-delay": `${0.3 + i * 0.06}s` } as React.CSSProperties}
                        />
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {(a.score.gapPercent ?? 0) > 0 && (
                <p className="mt-3 text-[11px] leading-relaxed text-[#fbbf24]">
                  {a.score.gapPercent}% of the score&rsquo;s weight hasn&rsquo;t been assessed yet. The number comes from the parts that have.
                </p>
              )}
              <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[10.5px] leading-relaxed text-[#7e88a0]">
                Worked out by fixed rules, and every part is kept, so a decision can be explained later.
                <MiniChip kind="neutral">{a.score.method} · POSTGRES</MiniChip>
              </p>
            </section>
          )}

          {a.reviewerNotes && (
            <section aria-label="Last note" className="sx-rv-block">
              <p className="sx-rv-k">Last note sent to them</p>
              <blockquote className="sx-rv-quote">&ldquo;{a.reviewerNotes}&rdquo;</blockquote>
            </section>
          )}

          {a.slug && (
            <div className="sx-rv-block pt-0">
              <a href={`/athletes/${a.slug}?from=applications`} target="_blank" rel="noopener" className="sx-rv-link">
                View public profile <span aria-hidden="true">↗</span>
              </a>
            </div>
          )}

          {/* P8-FE-10 — an approved athlete's place on the home page's
              Featured athletes panel. Drawn only when the API answers this role. */}
          {live && stateBucket(s) === "approved" && (
            <div className="sx-rv-block">
              <HomeFeatureLoader key={a.id} athleteId={a.id} name={a.name} />
            </div>
          )}

          {/* ------------------------------------------- the decision */}
          {(step || hasBanner) && (
            <section
              ref={decideRef}
              aria-label="Your decision"
              className="sx-rv-decide"
              data-flash={flash > 0 ? "" : undefined}
              key={`flash-${flash}`}
            >
              <div aria-live="polite">
                {err && <p className="sx-rv-banner" data-tone="danger">{err}</p>}
                {done === "approve" && (
                  <p className="sx-rv-banner" data-tone="ok">
                    {a.name} approved — they&rsquo;re being notified by email. Going live for paid work is the activation step below.
                  </p>
                )}
                {done === "activate" && (
                  <p className="sx-rv-banner" data-tone="ok">
                    {a.name} is active — live in the network and able to take paid work.
                  </p>
                )}
                {done === "changes" && (
                  <p className="sx-rv-banner" data-tone="neutral">
                    Sent back. The athlete gets your note and can update and send it again.
                  </p>
                )}
                {done === "reject" && (
                  <p className="sx-rv-banner" data-tone="danger">
                    Rejected. The athlete gets your note. This is final; applying again starts a new application.
                  </p>
                )}
                {decision === "APPROVED" && (
                  <DecisionBanner tone="accent" onUndo={onUndo}>{a.name} approved into the network.</DecisionBanner>
                )}
                {decision === "REJECTED" && (
                  <DecisionBanner tone="danger" onUndo={onUndo}>Application rejected — the athlete will be notified.</DecisionBanner>
                )}
                {decision === "INFO" && (
                  <DecisionBanner tone="neutral" onUndo={onUndo}>
                    Information requested — the athlete will be asked to update their application.
                  </DecisionBanner>
                )}
              </div>

              {step === "begin" && (
                <>
                  <p className="sx-rv-step-k">
                    <span className="sx-rv-step-n">2</span> Start the review
                  </p>
                  <p className="sx-rv-step-t">
                    This claims the application for you, so nobody else decides it at the same time. The decision buttons appear next.
                  </p>
                  <button type="button" disabled={busy !== null} onClick={() => decide("begin")} className="sx-rv-go">
                    <Glyph ui="play" className="size-4" />
                    {busy === "begin" ? "Starting review…" : "Start review"}
                  </button>
                </>
              )}

              {step === "decide" && (
                <>
                  <p className="sx-rv-step-k">
                    <span className="sx-rv-step-n">3</span> Your decision
                  </p>
                  {blocked && (
                    <p className="sx-rv-banner" data-tone="warn">
                      {live
                        ? "Minor without a verified guardian — approving is allowed, but activation stays locked until the guardian is verified."
                        : "Approve is locked until this athlete’s guardian is verified — required for minors."}
                    </p>
                  )}
                  <fieldset className="sx-rv-choices" disabled={busy !== null}>
                    <legend className="sr-only">Choose what happens</legend>
                    {CHOICES.map((c) => {
                      const off = c.key === "approve" && approveLocked;
                      return (
                        <label key={c.key} className="sx-rv-choice" data-tone={c.tone} data-on={choice === c.key ? "" : undefined} data-off={off ? "" : undefined}>
                          <input
                            type="radio"
                            name={`decision-${a.id}`}
                            value={c.key}
                            checked={choice === c.key}
                            disabled={off}
                            onChange={() => pick(c.key)}
                            className="sr-only"
                          />
                          <span className="sx-rv-choice-icon" aria-hidden="true">
                            <Glyph ui={c.icon} className="size-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span className="sx-rv-choice-t">{c.title}</span>
                            <span className="sx-rv-choice-x">{c.text}</span>
                          </span>
                          <span className="sx-rv-choice-tick" aria-hidden="true">
                            <Glyph ui="check" className="size-3" />
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>

                  {live && (
                    <div className="sx-rv-note">
                      <label htmlFor={`review-notes-${a.id}`} className="sx-rv-note-k">
                        {note.label}
                        <span className="sx-rv-note-h" data-need={choice !== "approve" ? "" : undefined}>{note.hint}</span>
                      </label>
                      <textarea
                        ref={noteRef}
                        id={`review-notes-${a.id}`}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        disabled={busy !== null}
                        placeholder={note.placeholder}
                        className="sx-rv-textarea"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={busy !== null || (live ? needsNote : false) || (choice === "approve" && approveLocked)}
                    onClick={runChoice}
                    className="sx-rv-go"
                    data-tone={choice === "reject" ? "danger" : choice === "changes" ? "amber" : undefined}
                  >
                    <Glyph ui={CHOICES.find((c) => c.key === choice)!.icon} className="size-4" />
                    {live ? actionLabel : choice === "approve" ? "Approve" : choice === "changes" ? "Send back for more info" : "Reject application"}
                  </button>
                  {live && needsNote && (
                    <p className="sx-rv-why">Write the note above first. It&rsquo;s what they&rsquo;ll read.</p>
                  )}
                  {choice === "reject" && !needsNote && (
                    <p className="sx-rv-why" data-tone="danger">This is final. They would have to apply again.</p>
                  )}
                </>
              )}

              {step === "activate" &&
                (() => {
                  /* B1's last step (§21 APPROVED → ACTIVE). The API refuses a
                     minor without a verified guardian for every caller; the
                     desk says so first rather than offering a button that 409s. */
                  const why = activationBlock(a, s);
                  return (
                    <>
                      <p className="sx-rv-step-k">
                        <span className="sx-rv-step-n">4</span> Activate
                      </p>
                      <p className="sx-rv-step-t" aria-live="polite">
                        {why ?? "Approved. Activating puts this athlete live — sponsors can then invite them to paid work."}
                      </p>
                      <button
                        type="button"
                        disabled={busy !== null || why !== null}
                        title={why ?? undefined}
                        onClick={() => decide("activate")}
                        className="sx-rv-go"
                      >
                        <Glyph ui="bolt" className="size-4" />
                        {busy === "activate" ? "Activating…" : "Activate athlete"}
                      </button>
                    </>
                  );
                })()}

              <p className="mt-3 text-[10.5px] leading-relaxed text-[#7e88a0]">
                {live
                  ? "Decisions are recorded and audited, and the athlete is emailed the outcome."
                  : "Demo decisions last for this visit only — nothing is saved."}
              </p>
            </section>
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
  return (
    <div className="sx-rv-banner flex flex-wrap items-center gap-x-3 gap-y-1.5" data-tone={tone === "accent" ? "ok" : tone}>
      <p className="min-w-0 flex-1">{children}</p>
      <button type="button" onClick={onUndo} className="text-[11px] font-semibold text-[#cfe9ff] transition-colors hover:text-white">
        Undo
      </button>
    </div>
  );
}
