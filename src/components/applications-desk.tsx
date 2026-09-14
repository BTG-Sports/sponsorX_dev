"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Card, Meter } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import {
  CloseIcon,
  Dropdown,
  FilterChip,
  SearchInput,
} from "@/components/filter-kit";
import {
  APPLICATION_COPY,
  applications,
  type ApplicationState,
} from "@/lib/fixtures";
import {
  AGING_HOURS,
  FACTOR_HINTS,
  STATE_DETAIL,
  STATE_TONE,
  scoreBand,
  waitHours,
  type ScoreTone,
} from "@/lib/applications-ui";

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
   -------------------------------------------------------------------------- */

type App = (typeof applications)[number];
type Decision = "APPROVED" | "REJECTED" | "INFO";

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

const inReview = (s: ApplicationState) =>
  s === "SUBMITTED" || s === "UNDER_REVIEW";

/* -------------------------------------------------------------- ScoreRing */

const RING_TEXT: Record<ScoreTone, string> = {
  accent: "text-accent",
  primary: "text-primary",
  warn: "text-warn",
  danger: "text-danger",
};

/** The Content Value Score as a drawn ring — banded color, animated sweep. */
function ScoreRing({
  value,
  size = 38,
  strokeWidth = 3.5,
  textCls = "text-[11px]",
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  textCls?: string;
}) {
  /* Sweep from empty on mount — one frame at zero, then transition in. */
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const band = scoreBand(value);
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span
      role="img"
      aria-label={`Score ${value} of 100 — ${band.label}`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          stroke="currentColor"
          className="text-line"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={drawn ? c * (1 - value / 100) : c}
          className={`${RING_TEXT[band.tone]} transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none`}
        />
      </svg>
      <span
        className={`absolute font-semibold tabular-nums tracking-tight ${textCls}`}
        aria-hidden="true"
      >
        {value}
      </span>
    </span>
  );
}

/* ------------------------------------------------------- checklist pieces */

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

export function ApplicationsDesk({
  items,
  demoParam,
  initial,
}: {
  items: App[];
  demoParam?: string;
  initial?: Partial<Record<"tab" | "q" | "sport" | "flag" | "sort", string>>;
}) {
  const sportOptions = useMemo(
    () => [...new Set(items.map((a) => a.sport))].sort(),
    [items],
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
  const eff = useCallback(
    (a: App): ApplicationState => {
      const d = decisions[a.id];
      return d === "APPROVED" || d === "REJECTED" ? d : a.state;
    },
    [decisions],
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
  }, [tab, q, sport, flag, sort, demoParam]);

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
    const c = { review: 0, approved: 0, rejected: 0, all: items.length };
    for (const a of items) {
      const s = eff(a);
      if (inReview(s)) c.review += 1;
      else if (s === "APPROVED") c.approved += 1;
      else c.rejected += 1;
    }
    return c;
  }, [items, eff]);

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = items.filter((a) => {
      const s = eff(a);
      const tabOk =
        tab === "all"
          ? true
          : tab === "review"
            ? inReview(s)
            : tab === "approved"
              ? s === "APPROVED"
              : s === "REJECTED";
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
          ? b.score.total - a.score.total
          : (wait.get(b.id) ?? 0) - (wait.get(a.id) ?? 0);
    return [...list].sort(by);
  }, [items, tab, needle, sport, flag, sort, wait, eff]);

  const isFiltered = Boolean(needle || sport || flag);
  const reset = () => {
    setQ("");
    setSport("");
    setFlag("");
  };

  const sel = openId ? items.find((a) => a.id === openId) : undefined;

  return (
    <div>
      {/* ------------------------------------------------------------ tabs */}
      <div
        role="tablist"
        aria-label="Application queue"
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
              onClick={() => setTab(t.key)}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-admin/15 text-text"
                  : "text-muted hover:text-text",
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

      {/* Active filters as dismissible chips — the row reads as what's
          applied; each ✕ removes one clause, "Clear all" removes them all. */}
      {isFiltered && (
        <div className="mb-3 flex flex-wrap items-center gap-2" aria-live="polite">
          {needle && (
            <FilterChip tone="admin" label="Remove search" onClear={() => setQ("")}>
              &ldquo;{q.trim()}&rdquo;
            </FilterChip>
          )}
          {sport && (
            <FilterChip tone="admin" label="Remove sport filter" onClear={() => setSport("")}>
              {sport}
            </FilterChip>
          )}
          {flag && (
            <FilterChip tone="admin" label="Remove attention filter" onClear={() => setFlag("")}>
              {ATTENTION_OPTIONS.find((o) => o.value === flag)?.label}
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
            {shown.length === 1 ? "application" : "applications"}
          </p>
        </div>
      )}

      {/* ------------------------------------------------------------ list */}
      <Card className="p-0">
        {shown.length === 0 ? (
          <div className="px-4 py-10 text-center">
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
          <ul className="divide-y divide-line-soft">
            {shown.map((a) => {
              const s = eff(a);
              const w = wait.get(a.id) ?? 0;
              const aging = inReview(s) && w > AGING_HOURS;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openItem(a.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
                  >
                    <Monogram
                      text={initials(a.name)}
                      shape="circle"
                      tone={
                        s === "APPROVED"
                          ? "accent"
                          : s === "REJECTED"
                            ? "neutral"
                            : "primary"
                      }
                      className="size-9 text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold tracking-tight">
                          {a.name}
                        </span>
                        {a.isMinor && <Badge tone="warn">Minor</Badge>}
                        {decisions[a.id] === "INFO" && (
                          <Badge tone="neutral">Info requested</Badge>
                        )}
                        {a.flags.length > 0 && inReview(s) && (
                          <span className="text-[10px] font-medium text-danger">
                            ▲ {a.flags.length}{" "}
                            {a.flags.length === 1 ? "flag" : "flags"}
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-faint">
                        {a.sport} · {a.region} ·{" "}
                        {a.followers.toLocaleString()} followers · submitted{" "}
                        {a.submittedAt}
                      </span>
                    </span>
                    {aging && <Badge tone="warn">waiting {Math.round(w / 24)}d</Badge>}
                    <ScoreRing value={a.score.total} />
                    <span className="hidden sm:block">
                      <Badge tone={STATE_TONE[s]}>{APPLICATION_COPY[s]}</Badge>
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
              );
            })}
          </ul>
        )}
      </Card>

      {/* Review drawer — portaled to <body>: the section's sx-animate
          entrance leaves a transform on an ancestor (fill-mode: both), which
          would otherwise trap this position:fixed overlay inside it. */}
      {sel &&
        createPortal(
          <ReviewDrawer
            app={sel}
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
  app: a,
  state: s,
  decision,
  onDecide,
  onUndo,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  app: App;
  state: ApplicationState;
  decision: Decision | undefined;
  onDecide: (d: Decision) => void;
  onUndo: () => void;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const band = scoreBand(a.score.total);
  const blocked = a.isMinor && !a.guardianVerified;
  /* Conflicts panel lists non-guardian flags — the guardian has its own row.
     Spec refs like "(§26)" are stripped from user-facing copy. */
  const conflicts = a.flags
    .filter((f) => !/guardian/i.test(f))
    .map((f) => f.replace(/\s*\(§\d+\)/g, ""));

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
      className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
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
          "absolute inset-0 cursor-default bg-black/55",
        ].join(" ")}
      />

      <div
        className={[
          closing ? "sx-drawer-out" : "sx-drawer",
          /* No overflow on the panel itself — the middle scrolls while the
             header and the decision bar stay pinned, so Approve / Reject is
             always in reach without scrolling past the factor list. */
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
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
              <Badge tone={STATE_TONE[s]}>{APPLICATION_COPY[s]}</Badge>
              {a.isMinor && <Badge tone="warn">Minor</Badge>}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              {a.sport} · {a.region} · submitted {a.submittedAt}
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
        {/* score */}
        <div className="sx-animate sx-delay-2 border-b border-line-soft p-5">
          <div className="flex items-center gap-4">
            <ScoreRing value={a.score.total} size={72} strokeWidth={6} textCls="text-lg" />
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
            {a.score.factors.map((f) => (
              <li key={f.label}>
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="font-medium text-muted">{f.label}</span>
                  <span className="tabular-nums text-faint">{f.value}</span>
                </div>
                {FACTOR_HINTS[f.label] && (
                  <p className="text-[10px] text-faint">{FACTOR_HINTS[f.label]}</p>
                )}
                <div className="mt-1">
                  <Meter value={f.value} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] leading-relaxed text-faint">
            Scored by fixed rules — every factor is stored with the score, so a
            decision can be explained later.
            <MiniChip kind="neutral">rules-v1 · POSTGRES</MiniChip>
          </p>
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
                  Guardian verified — a minor can be approved.
                </CheckRow>
              ) : (
                <CheckRow status="warn">
                  Guardian verification pending — a minor cannot be approved
                  until their guardian is verified.
                </CheckRow>
              )
            ) : (
              <CheckRow status="ok">Adult athlete — no guardian needed.</CheckRow>
            )}
            {conflicts.length > 0 ? (
              conflicts.map((f) => (
                <CheckRow key={f} status="danger">
                  {f}
                </CheckRow>
              ))
            ) : (
              <CheckRow status="ok">No conflicts declared.</CheckRow>
            )}
            <CheckRow status="neutral">
              {a.followers.toLocaleString()} followers — self-reported by the
              athlete; platform verification comes in a later phase.
            </CheckRow>
          </ul>
          <a
            href={`/athletes/${a.slug}?from=applications`}
            target="_blank"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            View public profile
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        {/* what this state means */}
        <div className="sx-animate sx-delay-4 p-5">
          <p className="text-xs leading-relaxed text-muted">{STATE_DETAIL[s]}</p>
        </div>
        </div>

        {/* decision bar — pinned */}
        <div className="sx-animate sx-delay-4 shrink-0 border-t border-line-soft p-5">
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
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onDecide("INFO")}
                  className="inline-flex items-center justify-center rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-2"
                >
                  Request info
                </button>
                <button
                  type="button"
                  onClick={() => onDecide("REJECTED")}
                  className="inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                >
                  Reject
                </button>
              </div>
            </>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Demo decisions last for this visit only — nothing is saved.
          </p>
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
