"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import {
  byDay,
  dayKey,
  dueLabel,
  isOverdue,
  monthGrid,
  monthKey,
  monthTitle,
  nextStep,
  shiftMonth,
  tabOf,
  TABS,
  type ApiDeliverable,
  type TabKey,
} from "@/lib/deliverables-live";

/* --------------------------------------------------------------------------
   DeliverableCalendar — the athlete's "what is due when" (P5-FE-02, §24).

   A month grid on the left (a dot per deliverable, coloured by whose move it
   is; pick a day to narrow the agenda to it) and the agenda on the right,
   grouped by due day, with tabs for To do / In review / Done. Everything is
   URL-synced (?month=, ?day=, ?tab=) so a view is shareable, like the other
   desks. Each row opens the deliverable, where uploading and publishing
   happen (P5-FE-03). Appearances (SX-05) are marked, since they're a place
   and a time rather than a post.
   -------------------------------------------------------------------------- */

const DOT: Record<string, string> = {
  you: "bg-athlete",
  btg: "bg-line",
  sponsor: "bg-line",
  done: "bg-success",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function DeliverableCalendar({
  rows,
  todayIso,
  initial,
  demoParam,
  linked,
}: {
  rows: ApiDeliverable[];
  todayIso: string;
  initial?: Partial<Record<"month" | "day" | "tab", string>>;
  demoParam?: string;
  /** Live rows open their own page; demo rows have nowhere to go. */
  linked: boolean;
}) {
  const today = useMemo(() => new Date(todayIso), [todayIso]);
  const todayKey = dayKey(today);

  const [month, setMonth] = useState(() =>
    /^\d{4}-\d{2}$/.test(initial?.month ?? "") ? initial!.month! : monthKey(today),
  );
  const [day, setDay] = useState<string | null>(() =>
    /^\d{4}-\d{2}-\d{2}$/.test(initial?.day ?? "") ? initial!.day! : null,
  );
  const [tab, setTab] = useState<TabKey>(() =>
    TABS.some((t) => t.key === initial?.tab) ? (initial!.tab as TabKey) : "todo",
  );

  const days = useMemo(() => byDay(rows), [rows]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { todo: 0, review: 0, done: 0, all: rows.length };
    for (const r of rows) c[tabOf(r)] += 1;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const list = rows.filter((r) => {
      if (day && dayKey(r.dueDate) !== day) return false;
      return tab === "all" || tabOf(r) === tab;
    });
    return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [rows, day, tab]);

  const grouped = useMemo(() => {
    const out: { day: string; items: ApiDeliverable[] }[] = [];
    for (const r of shown) {
      const k = dayKey(r.dueDate);
      const last = out[out.length - 1];
      if (last?.day === k) last.items.push(r);
      else out.push({ day: k, items: [r] });
    }
    return out;
  }, [shown]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (month !== monthKey(today)) p.set("month", month);
    if (day) p.set("day", day);
    if (tab !== "todo") p.set("tab", tab);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${next}${window.location.hash}`);
    }
  }, [month, day, tab, demoParam, today]);

  const pickDay = (k: string) => {
    setDay((cur) => (cur === k ? null : k));
    if (monthKey(k) !== month) setMonth(monthKey(k));
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        mark="inbox"
        title="Nothing due yet"
        hint="Deliverables appear here the moment you accept a Campaign Order — each with its due date."
        action={{ label: "See invitations", href: "/athlete/invitations" }}
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------------ month grid */}
      <Card className="p-4 lg:sticky lg:top-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Previous month"
            className="grid size-7 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-text"
          >
            ‹
          </button>
          <p className="text-xs font-semibold tracking-tight" aria-live="polite">
            {monthTitle(month)}
          </p>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Next month"
            className="grid size-7 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-text"
          >
            ›
          </button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] text-faint">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1" role="group" aria-label={`Deliverables in ${monthTitle(month)}`}>
          {weeks.flat().map((c) => {
            const items = days.get(c.day) ?? [];
            const picked = day === c.day;
            const isToday = c.day === todayKey;
            return (
              <button
                key={c.day}
                type="button"
                onClick={() => pickDay(c.day)}
                aria-pressed={picked}
                aria-label={`${c.day}${items.length ? `, ${items.length} due` : ""}`}
                className={[
                  "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] tabular-nums transition-colors",
                  c.inMonth ? "text-text" : "text-faint/60",
                  picked ? "bg-athlete/20 font-semibold" : "hover:bg-surface-2",
                  isToday && !picked ? "ring-1 ring-athlete/50" : "",
                ].join(" ")}
              >
                {Number(c.day.slice(8))}
                <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                  {items.slice(0, 3).map((d) => (
                    <span
                      key={d.id}
                      className={`size-1.5 rounded-full ${isOverdue(d, today) ? "bg-danger" : DOT[nextStep(d).on]}`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-faint">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-athlete" />your move</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-line" />with BTG / sponsor</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-danger" />overdue</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-success" />done</span>
        </div>
      </Card>

      {/* ---------------------------------------------------------- agenda */}
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={t.key === tab}
                className={[
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  t.key === tab ? "bg-athlete/15 text-athlete" : "text-muted hover:text-text",
                ].join(" ")}
              >
                {t.label}
                <span className="text-[10px] tabular-nums text-faint">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          {day && (
            <button
              type="button"
              onClick={() => setDay(null)}
              className="rounded-full border border-athlete/40 bg-athlete/10 px-3 py-1 text-[11px] font-medium text-text"
              aria-label="Clear the day filter"
            >
              {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} ✕
            </button>
          )}
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
            <p className="text-sm font-semibold">Nothing here</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
              {day ? "Nothing is due that day in this tab." : "Nothing in this tab right now."}
            </p>
          </div>
        ) : (
          grouped.map((g) => (
            <section key={g.day} aria-label={g.day}>
              <p className="mb-1.5 text-[11px] font-medium text-muted">
                {new Date(`${g.day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
                {g.day === todayKey && <span className="ml-1.5 text-athlete">· today</span>}
              </p>
              <ul className="space-y-2">
                {g.items.map((d) => {
                  const step = nextStep(d);
                  const overdue = isOverdue(d, today);
                  const href = linked ? `/athlete/deliverables/${encodeURIComponent(d.id)}` : null;
                  const inner = (
                    <Card className="flex items-center gap-3 p-3.5 transition-colors hover:bg-surface-2/40">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-semibold tracking-tight">{d.title}</p>
                          {d.appearance && <MiniChip kind="warn">APPEARANCE</MiniChip>}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {d.campaign.name} · {d.campaign.sponsorName} · {d.jobId}
                        </p>
                        {d.revision && (
                          <p className="mt-1.5 line-clamp-2 rounded-md bg-danger/10 px-2 py-1 text-[11px] text-danger">
                            {d.revision.reason}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <Badge tone={step.tone}>{step.label}</Badge>
                        <p className={`mt-1 text-[10px] tabular-nums ${overdue ? "font-medium text-danger" : "text-faint"}`}>
                          {step.on === "done" ? "complete" : dueLabel(d.dueDate, today)}
                        </p>
                      </div>
                    </Card>
                  );
                  return (
                    <li key={d.id}>
                      {href ? (
                        <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-athlete">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
