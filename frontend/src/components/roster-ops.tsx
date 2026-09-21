"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Card } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import { CloseIcon, SearchInput } from "@/components/filter-kit";
import {
  FLAG_HINTS,
  ORDER_COPY,
  ORDER_TONE,
  type RosterRow,
} from "@/lib/campaign-ui";

/* --------------------------------------------------------------------------
   RosterOps — the §9.9 substance of the campaign dashboard as a client
   island (2026-09-14 redesign; the old page was a static table that
   navigated away to public profiles). Follows the ApplicationsDesk idioms
   with the same budget:

   - Segmented "Everyone / Needs attention" pills with live counts plus
     instant search; state syncs to the URL via replaceState (?q=&show=),
     merged into the existing query so `from` and `demo` survive.
   - Every row carries a delivery ring — delivered/planned drawn as a banded
     sweep, so under-delivery reads at a glance without decoding a fraction.
   - Clicking a row opens the order drawer (portaled to <body> — an
     sx-animate ancestor would trap position:fixed): the Campaign Order
     journey spelled out step by step, verified numbers, the flag explained
     in plain English, and one contextual action.
   - Send reminder / Nudge invitation / Request replacement work locally
     ("kept for this visit only" — the Follow-button precedent) with Undo.
     A healthy row gets no dead button, just "nothing needed".
   -------------------------------------------------------------------------- */

type ActionSpec = {
  id: string;
  label: string;
  /** Short badge shown on the row once taken. */
  done: string;
  banner: string;
};

/** The one action each roster state calls for — null means healthy. */
function actionFor(r: RosterRow): ActionSpec | null {
  if (r.order === "DECLINED")
    return {
      id: "rematch",
      label: "Request replacement",
      done: "replacement requested",
      banner: `Replacement requested — matching will suggest athletes for ${r.name}'s slot.`,
    };
  if (r.order === "SENT")
    return {
      id: "nudge",
      label: "Nudge invitation",
      done: "nudged",
      banner: `${r.name} will get a reminder that this Campaign Order is waiting.`,
    };
  if (r.flag === "Under-delivering")
    return {
      id: "remind",
      label: "Send reminder",
      done: "reminded",
      banner: `Reminder sent — ${r.name} will be nudged about the remaining deliverables.`,
    };
  return null;
}

/* ------------------------------------------------------------ DeliveryRing */

type RingTone = "accent" | "primary" | "warn" | "neutral";

const RING_TEXT: Record<RingTone, string> = {
  accent: "text-accent",
  primary: "text-primary",
  warn: "text-warn",
  neutral: "text-faint",
};

function ringTone(r: RosterRow): RingTone {
  if (r.flag === "Under-delivering") return "warn";
  if (r.delivered >= r.planned && r.planned > 0) return "accent";
  if (r.delivered > 0) return "primary";
  return "neutral";
}

/** Delivered-of-planned as a drawn ring — banded color, animated sweep. */
function DeliveryRing({
  delivered,
  planned,
  tone,
  size = 38,
  strokeWidth = 3.5,
  textCls = "text-[10px]",
}: {
  delivered: number;
  planned: number;
  tone: RingTone;
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

  const pct = planned > 0 ? Math.min(delivered / planned, 1) : 0;
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <span
      role="img"
      aria-label={`${delivered} of ${planned} deliverables published`}
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
          strokeDashoffset={drawn ? c * (1 - pct) : c}
          className={`${RING_TEXT[tone]} transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none`}
        />
      </svg>
      <span
        className={`absolute font-semibold tabular-nums tracking-tight ${textCls}`}
        aria-hidden="true"
      >
        {delivered}/{planned}
      </span>
    </span>
  );
}

/* ---------------------------------------------------------------- Journey */

type StepState = "done" | "current" | "todo" | "danger";

const STEP_DOT: Record<StepState, string> = {
  done: "bg-accent/15 text-accent",
  current: "bg-primary/15 text-primary",
  todo: "bg-surface-2 text-faint",
  danger: "bg-danger/15 text-danger",
};

/** The Campaign Order lifecycle, spelled out — this is where a new admin
    learns what the states mean without leaving the drawer. */
function Journey({ r }: { r: RosterRow }) {
  const complete = r.order === "ACCEPTED" && r.delivered >= r.planned;
  const steps: { label: string; note: string; state: StepState }[] =
    r.order === "DECLINED"
      ? [
          {
            label: "Order sent",
            note: "The Campaign Order went out to the athlete.",
            state: "done",
          },
          {
            label: "Declined",
            note: "The athlete turned this order down — the slot needs a new match.",
            state: "danger",
          },
        ]
      : [
          {
            label: "Order sent",
            note: "The Campaign Order went out to the athlete.",
            state: "done",
          },
          {
            label: "Accepted",
            note:
              r.order === "ACCEPTED"
                ? "The athlete committed to the deliverables."
                : "Waiting on the athlete to accept.",
            state: r.order === "ACCEPTED" ? "done" : "current",
          },
          {
            label: "Delivering",
            note: `${r.delivered} of ${r.planned} deliverables published.`,
            state:
              r.order !== "ACCEPTED" ? "todo" : complete ? "done" : "current",
          },
          {
            label: "Complete",
            note: "Every deliverable published and verified.",
            state: complete ? "done" : "todo",
          },
        ];

  return (
    <ol className="space-y-0">
      {steps.map((s, i) => (
        <li key={s.label} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span
              aria-hidden="true"
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${STEP_DOT[s.state]}`}
            >
              {s.state === "done"
                ? "✓"
                : s.state === "danger"
                  ? "✕"
                  : s.state === "current"
                    ? "●"
                    : "·"}
            </span>
            {i < steps.length - 1 && (
              <span className="w-px flex-1 bg-line-soft" aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 pb-3">
            <span
              className={[
                "block text-xs font-medium",
                s.state === "todo" ? "text-faint" : "text-text",
              ].join(" ")}
            >
              {s.label}
              {s.state === "current" && (
                <span className="ml-1.5 text-[10px] font-normal text-primary">
                  now
                </span>
              )}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
              {s.note}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- RosterOps */

export function RosterOps({
  roster,
  initial,
}: {
  roster: RosterRow[];
  initial?: Partial<Record<"q" | "show", string>>;
}) {
  const [show, setShow] = useState<"all" | "attention">(
    initial?.show === "attention" ? "attention" : "all",
  );
  const [q, setQ] = useState(initial?.q ?? "");

  /* Demo actions — local to this visit, undoable, never persisted. */
  const [acted, setActed] = useState<Record<string, ActionSpec>>({});

  const [openSlug, setOpenSlug] = useState<string | null>(null);
  /* Closing keeps the drawer mounted while the -out animation plays;
     unmount happens on its animationend (fallback timer in the drawer). */
  const [closing, setClosing] = useState(false);
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const openItem = (slug: string) => {
    lastFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setClosing(false);
    setOpenSlug(slug);
  };
  const requestClose = () => setClosing(true);
  const finishClose = () => {
    setClosing(false);
    setOpenSlug(null);
    lastFocus.current?.focus();
  };

  /* Filters live in the URL (no navigation) so a filtered roster is
     shareable. Merged into the existing query — `from` (back-link) and
     `demo` params must survive. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (q) p.set("q", q);
    else p.delete("q");
    if (show === "attention") p.set("show", "attention");
    else p.delete("show");
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, show]);

  /* Drawer: Escape closes, page scroll locks behind it, focus lands on the
     close button and returns to the row on close. */
  useEffect(() => {
    if (!openSlug) return;
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
  }, [openSlug]);

  const flagged = useMemo(() => roster.filter((r) => r.flag), [roster]);

  const needle = q.trim().toLowerCase();
  const shown = roster.filter((r) => {
    const showOk = show === "all" || Boolean(r.flag);
    const qOk =
      !needle ||
      [r.name, r.flag ?? "", ORDER_COPY[r.order] ?? r.order]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    return showOk && qOk;
  });

  const sel = openSlug ? roster.find((r) => r.slug === openSlug) : undefined;

  return (
    <div>
      {/* --------------------------------------------------------- toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Roster filter"
          className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1"
        >
          {(
            [
              { key: "all", label: "Everyone", count: roster.length },
              { key: "attention", label: "Needs attention", count: flagged.length },
            ] as const
          ).map((t) => {
            const active = t.key === show;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setShow(t.key)}
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
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search athletes…"
          label="Search roster"
          tone="admin"
        />
      </div>

      {/* ------------------------------------------------------------ list */}
      <Card className="p-0">
        {shown.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">
              {needle ? "No athlete matches that search" : "Nothing needs attention"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {needle
                ? "Try a name, or clear the search."
                : "Every Campaign Order is accepted and delivering on schedule."}
            </p>
            {needle && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-line-soft">
            {shown.map((r) => {
              const tone = ringTone(r);
              return (
                <li key={r.slug}>
                  <button
                    type="button"
                    onClick={() => openItem(r.slug)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
                  >
                    <Monogram
                      text={initials(r.name)}
                      shape="circle"
                      tone={
                        r.order === "ACCEPTED"
                          ? "accent"
                          : r.order === "DECLINED"
                            ? "neutral"
                            : "primary"
                      }
                      className="size-9 text-[10px]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-semibold tracking-tight">
                          {r.name}
                        </span>
                        {r.flag && <Badge tone="danger">{r.flag}</Badge>}
                        {acted[r.slug] && (
                          <Badge tone="neutral">{acted[r.slug].done}</Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-faint">
                        {r.delivered} of {r.planned} deliverables ·{" "}
                        {r.views ? `${r.views.toLocaleString()} views` : "no views yet"}
                      </span>
                    </span>
                    <DeliveryRing
                      delivered={r.delivered}
                      planned={r.planned}
                      tone={tone}
                    />
                    <span className="hidden sm:block">
                      <Badge tone={ORDER_TONE[r.order] ?? "neutral"}>
                        {ORDER_COPY[r.order] ?? r.order.toLowerCase()}
                      </Badge>
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

      {/* Order drawer — portaled to <body>: the section's sx-animate
          entrance leaves a transform on an ancestor (fill-mode: both), which
          would otherwise trap this position:fixed overlay inside it. */}
      {sel &&
        createPortal(
          <OrderDrawer
            row={sel}
            acted={acted[sel.slug]}
            onAct={(a) => setActed((prev) => ({ ...prev, [sel.slug]: a }))}
            onUndo={() =>
              setActed((prev) => {
                const next = { ...prev };
                delete next[sel.slug];
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

/* -------------------------------------------------------------- OrderDrawer */

function OrderDrawer({
  row: r,
  acted,
  onAct,
  onUndo,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  row: RosterRow;
  acted: ActionSpec | undefined;
  onAct: (a: ActionSpec) => void;
  onUndo: () => void;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const action = actionFor(r);
  const tone = ringTone(r);

  /* Unmount normally rides the slide-out's animationend, but that event is
     lost if the animation never runs (stale-CSS HMR). A fallback timer
     slightly past the 0.22s exit guarantees close anyway. */
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
      aria-label={`${r.name} — Campaign Order`}
    >
      {/* click-away backdrop — no backdrop-blur: full-viewport blur visibly
          delays click handling on weak GPUs */}
      <button
        type="button"
        aria-label="Close order detail"
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
             header and the action bar stay pinned, so the action is always
             in reach without scrolling past the journey. */
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl",
        ].join(" ")}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        {/* header */}
        <div className="sx-animate sx-delay-1 flex shrink-0 items-center gap-3 border-b border-line-soft p-5">
          <Monogram
            text={initials(r.name)}
            shape="circle"
            tone={
              r.order === "ACCEPTED"
                ? "accent"
                : r.order === "DECLINED"
                  ? "neutral"
                  : "primary"
            }
            className="size-10 text-xs"
          />
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold tracking-tight">
                {r.name}
              </span>
              <Badge tone={ORDER_TONE[r.order] ?? "neutral"}>
                {ORDER_COPY[r.order] ?? r.order.toLowerCase()}
              </Badge>
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              Campaign Order · {r.planned} deliverables planned
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
          {/* delivery numbers */}
          <div className="sx-animate sx-delay-2 border-b border-line-soft p-5">
            <div className="flex items-center gap-4">
              <DeliveryRing
                delivered={r.delivered}
                planned={r.planned}
                tone={tone}
                size={72}
                strokeWidth={6}
                textCls="text-sm"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  {r.delivered} of {r.planned} deliverables published
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {r.views
                    ? `${r.views.toLocaleString()} verified views so far`
                    : "No views yet — nothing has published"}
                  <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
                </p>
              </div>
            </div>
            {r.flag && (
              <p className="mt-4 rounded-lg border border-danger/25 bg-danger/8 px-3 py-2 text-[11px] leading-relaxed text-danger">
                <strong className="font-semibold">{r.flag}.</strong>{" "}
                {FLAG_HINTS[r.flag] ?? ""}
              </p>
            )}
          </div>

          {/* order journey */}
          <div className="sx-animate sx-delay-3 border-b border-line-soft p-5">
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted">
              Where this order is
            </p>
            <Journey r={r} />
          </div>

          {/* profile link */}
          <div className="sx-animate sx-delay-4 p-5">
            <a
              href={`/athletes/${r.slug}?from=campaign`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              View public profile
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>

        {/* action bar — pinned */}
        <div className="sx-animate sx-delay-4 shrink-0 border-t border-line-soft p-5">
          <div aria-live="polite">
            {acted && (
              <div className="sx-pop mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-accent/25 bg-accent/8 px-3 py-2.5">
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-text">
                  {acted.banner}
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

          {action && !acted ? (
            <button
              type="button"
              onClick={() => onAct(action)}
              className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
            >
              {action.label}
            </button>
          ) : !action ? (
            <p className="text-xs leading-relaxed text-muted">
              Nothing needed — this order is delivering on schedule.
            </p>
          ) : null}

          <p className="mt-3 text-[10px] leading-relaxed text-faint">
            Demo actions last for this visit only — nothing is saved.
          </p>
        </div>
      </div>
    </div>
  );
}
