"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { CalendarIcon, ChevronDown, PANEL_CLS, triggerCls, useOutsideClose, type FilterTone } from "@/components/filter-kit";
import {
  MONTH_LONG,
  addDays,
  addMonths,
  clampDay,
  compareMonths,
  dayOf,
  dayRangeLabel,
  fmtDay,
  inBounds,
  monthGrid,
  monthOf,
  partsOf,
  pickDay,
  shiftMonths,
  todayDay,
  type MonthView,
} from "@/lib/day-range";

/* --------------------------------------------------------------------------
   DateRangePicker — the house calendar popover (extracted from
   activity-explorer.tsx for the P1-ART-23 review, 2026-10-12). The owner
   rejects the browser's native <input type="date"> in portal UIs; this is
   the designed replacement, shared by the athlete earnings explorer and
   the sponsor Shop.

   - Value is two ISO calendar days, "YYYY-MM-DD" or null. One click starts
     a range and, alone, means that single day; a second click completes it
     (either order). The footer's clear action resets both.
   - Month AND year navigation (‹ › and « »), bounded by optional min / max;
     days outside the bounds are disabled.
   - Optional `markers` — days that carry a dot (e.g. days with activity).
   - `tone` tints the trigger and the selected days in the portal colour.
   - A non-modal dialog: the trigger says it opens one, focus moves to the
     selected (or today's) day, arrows / Home / End / PageUp / PageDown
     (Shift = a year) move it, Escape closes and hands focus back to the
     trigger. An outside click closes it and is swallowed, so dismissing
     never also activates whatever sat underneath (useOutsideClose).
   - sx-pop entrance, like every other filter-kit popover.

   Days are UTC calendar days throughout (lib/day-range.ts) — a day never
   shifts with the viewer's timezone.
   -------------------------------------------------------------------------- */

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const DOW_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/* Static class maps so Tailwind sees every utility. */
const DAY_TONE: Record<FilterTone, { edge: string; range: string; dot: string; ring: string; link: string }> = {
  athlete: { edge: "bg-athlete text-cta-ink", range: "bg-athlete/15 text-text", dot: "bg-athlete", ring: "focus-visible:ring-athlete/50", link: "text-athlete" },
  admin: { edge: "bg-admin text-cta-ink", range: "bg-admin/15 text-text", dot: "bg-admin", ring: "focus-visible:ring-admin/50", link: "text-admin" },
  sponsor: { edge: "bg-sponsor text-cta-ink", range: "bg-sponsor/15 text-text", dot: "bg-sponsor", ring: "focus-visible:ring-sponsor/50", link: "text-sponsor" },
  property: { edge: "bg-property text-cta-ink", range: "bg-property/15 text-text", dot: "bg-property", ring: "focus-visible:ring-property/50", link: "text-property" },
  next: { edge: "bg-next text-cta-ink", range: "bg-next/15 text-text", dot: "bg-next", ring: "focus-visible:ring-next/50", link: "text-next" },
  vault: { edge: "bg-[#d4b062] text-[#06100c]", range: "bg-[#d4b062]/15 text-text", dot: "bg-[#d4b062]", ring: "focus-visible:ring-[#d4b062]/60", link: "text-[#d4b062]" },
};

export function DateRangePicker({
  from,
  to,
  onChange,
  markers,
  min,
  max,
  tone = "athlete",
  label = "Filter by date",
  allLabel = "Any dates",
  triggerText,
  markerHint = "Dots mark days with activity",
}: {
  /** Start day "YYYY-MM-DD", or null for no date filter. */
  from: string | null;
  /** End day, or null — alone, `from` means that single day. */
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  /** Days that carry a dot. */
  markers?: ReadonlySet<string>;
  /** First / last pickable day ("YYYY-MM-DD"), both optional. */
  min?: string;
  max?: string;
  tone?: FilterTone;
  /** What the control filters by, e.g. "Filter by date". */
  label?: string;
  /** The no-filter words on the trigger and the clear action. */
  allLabel?: string;
  /** Override the trigger's words (default: "Oct 14 – Nov 2, 2026"). */
  triggerText?: string;
  /** Footer hint shown when markers are present. */
  markerHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MonthView>(() => monthOf(clampDay(todayDay(), min, max)));
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const titleId = useId();
  useOutsideClose(ref, () => setOpen(false), open);

  const c = DAY_TONE[tone];
  const end = to ?? from;
  const text = triggerText ?? dayRangeLabel(from, to, allLabel);
  const today = todayDay();

  const firstMarker = markers && markers.size ? [...markers].sort()[0] : null;

  const openPanel = () => {
    const anchor = clampDay(from ?? firstMarker ?? today, min, max);
    setView(monthOf(anchor));
    setFocusDay(anchor);
    setOpen(true);
  };
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  /* Move focus to the roving day — on open and on every keyboard move. */
  useEffect(() => {
    if (!open || !focusDay) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [open, focusDay]);

  const minMonth = min ? monthOf(min) : null;
  const maxMonth = max ? monthOf(max) : null;
  const canBack = !minMonth || compareMonths(view, minMonth) > 0;
  const canFwd = !maxMonth || compareMonths(view, maxMonth) < 0;
  const go = (n: number) => {
    let v = addMonths(view, n);
    if (minMonth && compareMonths(v, minMonth) < 0) v = minMonth;
    if (maxMonth && compareMonths(v, maxMonth) > 0) v = maxMonth;
    setView(v);
  };

  const { startDow, daysInMonth } = monthGrid(view);
  const days = Array.from({ length: daysInMonth }, (_, i) => dayOf(view.year, view.month, i + 1));
  /* The one day in tab order: the focused day if it's on screen, else the
     selection, today, or the first pickable day of this month. */
  const tabbable =
    [focusDay, from, today].find((d) => d && days.includes(d) && inBounds(d, min, max)) ??
    days.find((d) => inBounds(d, min, max)) ??
    null;

  const pick = (day: string) => {
    setFocusDay(day);
    const r = pickDay(from, to, day);
    onChange(r.from, r.to);
  };

  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = (e.target as HTMLElement).dataset?.day;
    if (!cur) return;
    const dow = new Date(`${cur}T00:00:00.000Z`).getUTCDay();
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cur, -1),
      ArrowRight: () => addDays(cur, 1),
      ArrowUp: () => addDays(cur, -7),
      ArrowDown: () => addDays(cur, 7),
      Home: () => addDays(cur, -dow),
      End: () => addDays(cur, 6 - dow),
      PageUp: () => shiftMonths(cur, e.shiftKey ? -12 : -1),
      PageDown: () => shiftMonths(cur, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const next = clampDay(move(), min, max);
    setView(monthOf(next));
    setFocusDay(next);
  };

  const hint =
    from !== null && (to === null || to === from)
      ? "Pick another day to make it a range"
      : markers && markers.size
        ? markerHint
        : "Pick a day, or two for a range";

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          /* Don't let a surrounding drawer close too. */
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${text}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? close(false) : openPanel())}
        className={triggerCls(from !== null, open, tone)}
      >
        <CalendarIcon />
        {text}
        <ChevronDown open={open} />
      </button>

      {open && (
        <div id={dialogId} className={`${PANEL_CLS} w-72 p-3`} role="dialog" aria-modal="false" aria-labelledby={titleId}>
          {/* month + year header */}
          <div className="flex items-center gap-1">
            <NavBtn kind="year" dir={-1} disabled={!canBack} onClick={() => go(-12)} />
            <NavBtn kind="month" dir={-1} disabled={!canBack} onClick={() => go(-1)} />
            <p id={titleId} aria-live="polite" className="flex-1 text-center text-xs font-semibold tracking-tight">
              {MONTH_LONG[view.month]} {view.year}
            </p>
            <NavBtn kind="month" dir={1} disabled={!canFwd} onClick={() => go(1)} />
            <NavBtn kind="year" dir={1} disabled={!canFwd} onClick={() => go(12)} />
          </div>

          {/* day-of-week row */}
          <div className="mt-2 grid grid-cols-7 text-center" aria-hidden="true">
            {DOW.map((d, i) => (
              <span key={i} className="py-1 text-[9px] font-medium uppercase text-faint">
                {d}
              </span>
            ))}
          </div>

          {/* days */}
          <div ref={gridRef} role="group" aria-labelledby={titleId} className="grid grid-cols-7" onKeyDown={onGridKey}>
            {Array.from({ length: startDow }, (_, i) => (
              <span key={`b${i}`} />
            ))}
            {days.map((day) => {
              const n = partsOf(day).day;
              const isEdge = day === from || day === end;
              const inRange = from !== null && end !== null && day > from && day < end;
              const enabled = inBounds(day, min, max);
              const marked = markers?.has(day) ?? false;
              const isToday = day === today;
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  tabIndex={day === tabbable ? 0 : -1}
                  disabled={!enabled}
                  aria-label={`${DOW_LONG[new Date(`${day}T00:00:00.000Z`).getUTCDay()]}, ${fmtDay(day)}${isToday ? " (today)" : ""}${marked ? ", has activity" : ""}`}
                  aria-pressed={isEdge || inRange}
                  aria-current={isToday ? "date" : undefined}
                  onClick={() => pick(day)}
                  className={[
                    "relative mx-auto grid size-8 place-items-center rounded-full text-[11px] tabular-nums transition-colors outline-none focus-visible:ring-2",
                    c.ring,
                    isEdge
                      ? `${c.edge} font-semibold`
                      : inRange
                        ? c.range
                        : enabled
                          ? `${isToday ? "font-semibold text-text" : "text-muted"} hover:bg-surface-2 hover:text-text`
                          : "cursor-not-allowed text-faint opacity-40",
                  ].join(" ")}
                >
                  {n}
                  {marked && (
                    <span
                      aria-hidden="true"
                      className={["absolute bottom-1 size-1 rounded-full", isEdge ? "bg-cta-ink" : "bg-accent"].join(" ")}
                    />
                  )}
                  {isToday && !isEdge && !marked && (
                    <span aria-hidden="true" className={`absolute bottom-1 h-px w-2.5 rounded-full ${c.dot}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* footer */}
          <div className="mt-2 flex items-center justify-between gap-3 border-t border-line-soft pt-2">
            <p className="text-[10px] text-faint" aria-live="polite">
              {hint}
            </p>
            <button
              type="button"
              onClick={() => {
                onChange(null, null);
                setFocusDay(null);
              }}
              disabled={from === null}
              className={`shrink-0 text-[11px] font-medium transition-colors hover:opacity-80 disabled:pointer-events-none disabled:opacity-40 ${c.link}`}
            >
              {allLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ kind, dir, disabled, onClick }: { kind: "month" | "year"; dir: -1 | 1; disabled: boolean; onClick: () => void }) {
  const path =
    kind === "month"
      ? dir === 1
        ? "m9 5 7 7-7 7"
        : "m15 5-7 7 7 7"
      : dir === 1
        ? "m6 5 7 7-7 7M13 5l7 7-7 7"
        : "m18 5-7 7 7 7M11 5l-7 7 7 7";
  return (
    <button
      type="button"
      aria-label={`${dir === 1 ? "Next" : "Previous"} ${kind}`}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-30"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3" aria-hidden="true">
        <path d={path} />
      </svg>
    </button>
  );
}
