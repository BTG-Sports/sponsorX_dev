"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import {
  byDay,
  dayKey,
  dueLabel,
  groupByDay,
  isOverdue,
  monthGrid,
  monthKey,
  monthTitle,
  nextStep,
  shiftMonth,
  TABS,
  type ApiDeliverable,
  type TabKey,
} from "@/lib/deliverables-live";

/* --------------------------------------------------------------------------
   DeliverableCalendar — the athlete's "what is due when" (P5-FE-02, §24).

   A month grid on the left (a dot per deliverable, coloured by whose move it
   is; pick a day to narrow the agenda to it) and the agenda on the right,
   grouped by due day, with tabs for To do / In review / Done. Each row opens
   the deliverable, where uploading and publishing happen (P5-FE-03).
   Appearances (SX-05) are marked, since they're a place and a time rather
   than a post.

   SERVER-DRIVEN (2026-09-29). Nothing here holds more than what is on
   screen: the grid gets ONE month's rows (the page fetches the grid's date
   range), the agenda ONE server page (?page&size&tab, and the picked day's
   range), the tab counts come from the summary. Every control writes the
   URL (?month ?day ?tab ?page ?size) and the server page re-reads it; the
   agenda pages with the house pager (12/24/60, above and below).
   -------------------------------------------------------------------------- */

const DOT: Record<string, string> = {
  you: "bg-athlete",
  btg: "bg-line",
  sponsor: "bg-line",
  done: "bg-success",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Props = {
  /** Everything due inside the month grid's range (padding days included). */
  gridRows: ApiDeliverable[];
  /** One page of the agenda, as the API (or the fixture pager) answered it. */
  agenda: { rows: ApiDeliverable[]; page: PageInfo };
  /** Per tab, across every page. */
  counts: Record<TabKey, number>;
  month: string;
  day: string;
  tab: TabKey;
  todayIso: string;
  /** Live rows open their own page; demo rows have nowhere to go. */
  linked: boolean;
};

export function DeliverableCalendar(props: Props) {
  return (
    <ServerList>
      <Calendar {...props} />
    </ServerList>
  );
}

function Calendar({ gridRows, agenda, counts, month, day, tab, todayIso, linked }: Props) {
  const { set } = useListNav();
  const today = useMemo(() => new Date(todayIso), [todayIso]);
  const todayKey = dayKey(today);
  const thisMonth = monthKey(today);

  const days = useMemo(() => byDay(gridRows), [gridRows]);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const grouped = useMemo(() => groupByDay(agenda.rows), [agenda.rows]);

  /* The current month is the default, so it drops out of the URL. */
  const monthValue = (m: string) => (m === thisMonth ? null : m);
  const goMonth = (by: number) => set({ month: monthValue(shiftMonth(month, by)) });
  const pickDay = (k: string) => {
    const patch: Record<string, string | null> = { day: day === k ? null : k };
    if (monthKey(k) !== month) patch.month = monthValue(monthKey(k));
    set(patch);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      {/* ------------------------------------------------------ month grid */}
      <Card className="p-4 lg:sticky lg:top-6">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => goMonth(-1)}
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
            onClick={() => goMonth(1)}
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
        <PendingList>
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
                    c.inMonth ? "text-text" : "text-faint", /* was text-faint/60: 2.6:1 (frontend audit) */
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
        </PendingList>
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
                onClick={() => set({ tab: t.key === "todo" ? null : t.key })}
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
              onClick={() => set({ day: null })}
              className="rounded-full border border-athlete/40 bg-athlete/10 px-3 py-1 text-[11px] font-medium text-text"
              aria-label="Clear the day filter"
            >
              {new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })} ✕
            </button>
          )}
        </div>

        {agenda.page.total === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
            <p className="text-sm font-semibold">Nothing here</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
              {day ? "Nothing is due that day in this tab." : "Nothing in this tab right now."}
            </p>
          </div>
        ) : (
          <>
            <PagerRow page={agenda.page} noun="Deliverables" tone="athlete" position="top" filtered={Boolean(day)} />
            <PendingList className="space-y-4">
              {grouped.map((g) => (
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
              ))}
            </PendingList>
            <PagerRow page={agenda.page} noun="Deliverables" tone="athlete" position="bottom" filtered={Boolean(day)} />
          </>
        )}
      </div>
    </div>
  );
}
