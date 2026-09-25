"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card } from "./ui";
import { ICONS, type NavIcon } from "./portal-nav";
import { useDrawerFocus } from "./use-drawer-focus";
import type { DeliverableState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Student assignments island (P1-FE-19). Instant filter chips — no Apply
   button — and a slide-over drawer for the brief, deep-linkable via ?open=
   so the dashboard's "View brief" lands on the right assignment. URL state
   rides history.replaceState (the reveal.tsx precedent: DOM/URL state React
   never owns between renders).

   Drawer motion and unmount follow activity-explorer: sx-drawer in/out
   classes, unmount on the exit's animationend with a fallback timer for the
   reduced-motion 1ms case.
   -------------------------------------------------------------------------- */

export type AssignmentRow = {
  id: string;
  kind: "ARTICLE" | "INTERVIEW" | "PHOTO" | "DESIGN";
  title: string;
  section: string;
  due: string;
  state: DeliverableState;
  points: number;
  brief: string;
};

const KIND_ICON: Record<AssignmentRow["kind"], NavIcon> = {
  ARTICLE: "pen",
  INTERVIEW: "user",
  PHOTO: "camera",
  DESIGN: "book",
};

const KIND_LABEL: Record<AssignmentRow["kind"], string> = {
  ARTICLE: "Article",
  INTERVIEW: "Interview",
  PHOTO: "Photo",
  DESIGN: "Design",
};

const STATE_COPY: Record<DeliverableState, string> = {
  NOT_STARTED: "Not started",
  DRAFT_SUBMITTED: "Draft submitted",
  BTG_REVIEW: "Advisor review",
  SPONSOR_REVIEW: "Sponsor preview",
  APPROVED: "Approved",
  PUBLISHED: "Published",
  VERIFIED: "Confirmed",
};

const STATE_TONE: Record<
  DeliverableState,
  "neutral" | "primary" | "accent" | "warn"
> = {
  NOT_STARTED: "neutral",
  DRAFT_SUBMITTED: "primary",
  BTG_REVIEW: "warn",
  SPONSOR_REVIEW: "warn",
  APPROVED: "accent",
  PUBLISHED: "accent",
  VERIFIED: "accent",
};

/* Progress through the editorial machine, for the drawer timeline. */
const ORDER: DeliverableState[] = [
  "NOT_STARTED",
  "DRAFT_SUBMITTED",
  "BTG_REVIEW",
  "SPONSOR_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "VERIFIED",
];
const MILESTONES: Array<{ label: string; at: DeliverableState }> = [
  { label: "Draft submitted", at: "DRAFT_SUBMITTED" },
  { label: "Advisor review", at: "BTG_REVIEW" },
  { label: "Approved", at: "APPROVED" },
  { label: "Published", at: "PUBLISHED" },
];

type Filter = "all" | "todo" | "review" | "done";

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "todo", label: "To do" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
];

const bucket = (s: DeliverableState): Exclude<Filter, "all"> =>
  s === "NOT_STARTED"
    ? "todo"
    : s === "APPROVED" || s === "PUBLISHED" || s === "VERIFIED"
      ? "done"
      : "review";

function Glyph({ icon, className }: { icon: NavIcon; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "size-4"}
      aria-hidden="true"
    >
      <path d={ICONS[icon]} />
    </svg>
  );
}

/** Write ?f= / ?open= without a navigation — shareable, back-safe enough. */
function syncUrl(filter: Filter, openId: string | null) {
  const url = new URL(window.location.href);
  if (filter === "all") url.searchParams.delete("f");
  else url.searchParams.set("f", filter);
  if (openId) url.searchParams.set("open", openId);
  else url.searchParams.delete("open");
  window.history.replaceState(null, "", url.toString());
}

export function StudentAssignments({
  rows,
  initialFilter,
  initialOpen,
}: {
  rows: AssignmentRow[];
  initialFilter?: string;
  initialOpen?: string;
}) {
  const [filter, setFilter] = useState<Filter>(
    FILTERS.some((f) => f.key === initialFilter) ? (initialFilter as Filter) : "all",
  );
  const [openId, setOpenId] = useState<string | null>(
    rows.some((r) => r.id === initialOpen) ? (initialOpen ?? null) : null,
  );
  const [closing, setClosing] = useState(false);

  /* The 400ms fallback timer below captures `closed` from the render where
     `closing` flipped — a chip clicked during the exit animation would have
     its filter overwritten in the URL by the stale closure. The ref always
     reads the current filter. */
  const filterRef = useRef(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const open = rows.find((r) => r.id === openId) ?? null;
  const { panelRef, onKeyDown } = useDrawerFocus<HTMLElement>(Boolean(open));

  const shown = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => bucket(r.state) === filter)),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const c = { all: rows.length, todo: 0, review: 0, done: 0 };
    for (const r of rows) c[bucket(r.state)] += 1;
    return c;
  }, [rows]);

  const pick = (f: Filter) => {
    setFilter(f);
    syncUrl(f, openId);
  };
  const show = (id: string) => {
    setClosing(false);
    setOpenId(id);
    syncUrl(filter, id);
  };
  const dismiss = () => setClosing(true);
  const closed = () => {
    setOpenId(null);
    setClosing(false);
    syncUrl(filterRef.current, null);
  };

  /* Escape closes the drawer; the exit animation still runs. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /* Unmount rides animationend; the timer covers reduced-motion's 1ms run. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(closed, 400);
    return () => clearTimeout(t);
  }, [closing]);

  return (
    <div>
      {/* ------------------------------------------------- filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => pick(f.key)}
              aria-pressed={active}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-next/40 bg-next/15 text-next"
                  : "border-line bg-surface text-muted hover:text-text",
              ].join(" ")}
            >
              {f.label}
              <span className="ml-1.5 tabular-nums text-faint">
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* --------------------------------------------------------- rows */}
      <div className="mt-4 space-y-3">
        {shown.length === 0 && (
          <Card>
            <p className="text-xs text-muted">
              Nothing here — try another filter.
            </p>
          </Card>
        )}
        {shown.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => show(a.id)}
            className="sx-animate block w-full text-left"
            style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}
          >
            <Card className="flex items-center gap-3.5 transition-colors hover:bg-surface-2/70">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-next/12 text-next">
                <Glyph icon={KIND_ICON[a.kind]} />
              </span>
              <span className="min-w-0 flex-1">
                {/* two lines, not a truncate — at 390px the badge column left
                    titles ~15 characters, which reads as gibberish */}
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {a.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {KIND_LABEL[a.kind]} · {a.section} · due {a.due}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge tone={STATE_TONE[a.state]}>{STATE_COPY[a.state]}</Badge>
                <span className="text-[11px] font-medium tabular-nums text-next">
                  +{a.points} pts
                </span>
              </span>
            </Card>
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------- drawer */}
      {open && (
        <div
          className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onKeyDown={onKeyDown}
        >
          <div
            onClick={dismiss}
            className={[
              "absolute inset-0 bg-black/50",
              closing ? "sx-backdrop-out" : "sx-backdrop",
            ].join(" ")}
          />
          <aside
            ref={panelRef}
            tabIndex={-1}
            onAnimationEnd={(e) => {
              if (closing && e.animationName === "sx-drawer-out") closed();
            }}
            className={[
              "absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl shadow-black/40",
              closing ? "sx-drawer-out" : "sx-drawer",
            ].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-next/12 text-next">
                <Glyph icon={KIND_ICON[open.kind]} className="size-5" />
              </span>
              <button
                type="button"
                onClick={dismiss}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-full border border-line/70 text-muted transition-colors hover:text-text"
              >
                ✕
              </button>
            </div>

            <h2 className="mt-3 text-base font-semibold tracking-tight">
              {open.title}
            </h2>
            <p className="mt-1 text-xs text-muted">
              {KIND_LABEL[open.kind]} · {open.section} · due {open.due} · +
              {open.points} pts on approval
            </p>
            <div className="mt-2">
              <Badge tone={STATE_TONE[open.state]}>
                {STATE_COPY[open.state]}
              </Badge>
            </div>

            <p className="mt-4 rounded-lg border border-line-soft bg-surface-2/60 p-3.5 text-xs leading-relaxed text-muted">
              {open.brief}
            </p>

            {/* editorial timeline — where this piece is in the machine */}
            <ol className="mt-5 space-y-0">
              {MILESTONES.map((m, i) => {
                const reached =
                  ORDER.indexOf(open.state) >= ORDER.indexOf(m.at);
                return (
                  <li key={m.at} className="flex gap-3">
                    <span className="flex flex-col items-center">
                      <span
                        className={[
                          "grid size-5 shrink-0 place-items-center rounded-full border text-[10px]",
                          reached
                            ? "border-next/50 bg-next/15 text-next"
                            : "border-line text-faint",
                        ].join(" ")}
                      >
                        {reached ? "✓" : i + 1}
                      </span>
                      {i < MILESTONES.length - 1 && (
                        <span
                          className={[
                            "w-px flex-1",
                            reached ? "bg-next/40" : "bg-line",
                          ].join(" ")}
                        />
                      )}
                    </span>
                    <span
                      className={[
                        "pb-4 text-xs",
                        reached ? "text-text" : "text-faint",
                      ].join(" ")}
                    >
                      {m.label}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-auto space-y-2 pt-5">
              <Button
                full
                disabled
                title="Uploads arrive when Stage 9 wires the portal (P9-FE-01)"
              >
                Submit draft
              </Button>
              <Button
                variant="secondary"
                full
                disabled
                title="Messaging is not in Phase 1 — talk to your advisor in the newsroom"
              >
                Ask your advisor
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
