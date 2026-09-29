"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui";
import { Monogram } from "@/components/hero";
import { moveBriefAction } from "@/app/(app)/admin/briefs/actions";
import {
  TABS,
  filterBriefs,
  nextMoves,
  sportOptions,
  tabCounts,
  type BriefRow,
  type BriefState,
  type TabKey,
} from "@/lib/briefs-live";

/* --------------------------------------------------------------------------
   P4-FE-07 — the Briefs queue's one client island: tabs, search and sport
   filter over the rows the server read, and the detail panel with Qualify /
   Approve / Close (with a reason) / Open in Matching Studio. On a wide screen
   the panel sits beside the list; on a phone it covers the screen.
   -------------------------------------------------------------------------- */

const QUICK_REASONS = ["Budget below the package minimum", "Sponsor went quiet", "Category conflict with an existing sponsor"];

export function BriefsDesk({
  rows,
  initialTab,
  canApprove,
  canClose,
}: {
  rows: BriefRow[];
  initialTab: TabKey;
  canApprove: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [q, setQ] = useState("");
  const [sport, setSport] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const counts = useMemo(() => tabCounts(rows), [rows]);
  const sports = useMemo(() => sportOptions(rows), [rows]);
  const shown = filterBriefs(rows, { tab, sport, q });
  const sel = rows.find((r) => r.id === selectedId) ?? null;

  const pick = (id: string | null) => {
    setSelectedId(id);
    setClosing(false);
    setReason("");
    setMessage(null);
  };

  const move = (to: BriefState, why?: string) => {
    if (!sel) return;
    setMessage(null);
    start(async () => {
      const r = await moveBriefAction(sel.id, to, why);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setClosing(false);
      setReason("");
      router.refresh();
    });
  };

  const moves = sel ? nextMoves(sel.state) : null;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Brief state" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={[
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
            <span className="tabular-nums text-faint">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Search briefs</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sponsor or package…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text placeholder:text-faint focus:border-primary/50 focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          Sport
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-xs text-text"
          >
            <option value="">All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-faint">
        Showing {shown.length} of {counts[tab]} {tab === "all" ? "briefs" : TABS.find((t) => t.key === tab)?.label.toLowerCase()}
      </p>

      <div className={sel ? "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4" : ""}>
        <ul className="space-y-2">
          {shown.length === 0 && (
            <li className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
              <p className="text-sm font-semibold">Nothing matches these filters</p>
              <p className="mt-1 text-xs text-muted">Try another sport, a sponsor name, or the All tab.</p>
            </li>
          )}
          {shown.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => pick(b.id)}
                aria-pressed={b.id === selectedId}
                className={[
                  "flex w-full items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-left transition-colors",
                  b.id === selectedId ? "border-primary/50" : "border-line hover:border-line-soft hover:bg-surface-2",
                ].join(" ")}
              >
                <Monogram text={b.mono} tone="accent" className="size-9 text-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{b.sponsor}</span>
                    <Badge tone={b.tone}>{b.stateLabel}</Badge>
                    <span className="ml-auto text-xs font-semibold tabular-nums">{b.budget}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">
                    {b.packageName}
                    {b.packagePrice ? ` · ${b.packagePrice}` : ""} · starts {b.start} · {b.duration}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-faint">
                    {b.sports} · {b.geography} · {b.category} · submitted {b.submitted}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {sel && moves && (
          <aside
            aria-label="Brief detail"
            className="fixed inset-0 z-50 overflow-y-auto bg-surface p-5 lg:static lg:z-auto lg:mt-0 lg:self-start lg:rounded-xl lg:border lg:border-line"
          >
            <div className="flex items-start gap-3">
              <Monogram text={sel.mono} tone="accent" className="size-10 text-xs" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-faint">Brief</p>
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{sel.sponsor}</span>
                  <Badge tone={sel.tone}>{sel.stateLabel}</Badge>
                </p>
              </div>
              <button
                type="button"
                onClick={() => pick(null)}
                aria-label="Close panel"
                className="grid size-8 place-items-center rounded-full border border-line text-muted hover:bg-surface-2 hover:text-text"
              >
                ×
              </button>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
              <dt className="text-muted">Package</dt>
              <dd>
                {sel.packageName}
                {sel.packagePrice ? ` · ${sel.packagePrice}` : ""}
              </dd>
              <dt className="text-muted">Budget</dt>
              <dd className="tabular-nums">{sel.budget}</dd>
              <dt className="text-muted">Dates</dt>
              <dd>
                {sel.start} – {sel.end} · {sel.duration}
              </dd>
              <dt className="text-muted">Sports</dt>
              <dd>{sel.sports}</dd>
              <dt className="text-muted">Geography</dt>
              <dd>{sel.geography}</dd>
              <dt className="text-muted">Business category</dt>
              <dd>{sel.category}</dd>
              <dt className="text-muted">Submitted</dt>
              <dd>{sel.submitted}</dd>
            </dl>

            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Objective</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed">{sel.objective}</p>
            </div>

            <div className="mt-5 space-y-3 border-t border-line-soft pt-4">
              {message && (
                <p role="alert" className="rounded-lg bg-danger/12 px-3 py-2 text-xs text-danger">
                  {message}
                </p>
              )}

              {closing ? (
                <div className="space-y-2">
                  <label htmlFor="close-reason" className="text-xs font-medium">
                    Why close this brief?
                  </label>
                  <textarea
                    id="close-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Budget below the package minimum"
                    className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-text placeholder:text-faint focus:border-primary/50 focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REASONS.map((r) => (
                      <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted hover:text-text">
                        {r}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-faint">The reason is kept with the brief and in the audit log. The sponsor isn’t emailed.</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => move("CLOSED", reason)}
                      disabled={!reason.trim() || pending}
                      className="rounded-lg bg-danger px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Close brief
                    </button>
                    <button type="button" onClick={() => setClosing(false)} className="rounded-lg border border-line px-3 py-2 text-xs">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {moves.qualify && canApprove && (
                    <button type="button" onClick={() => move("QUALIFIED")} disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-cta-ink disabled:opacity-40">
                      Qualify
                    </button>
                  )}
                  {moves.approve && canApprove && (
                    <button type="button" onClick={() => move("APPROVED")} disabled={pending} className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-cta-ink disabled:opacity-40">
                      Approve
                    </button>
                  )}
                  {moves.match && (
                    <Link href={`/admin/campaigns/match?brief=${encodeURIComponent(sel.id)}`} className="rounded-lg border border-primary/40 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10">
                      Open in Matching Studio →
                    </Link>
                  )}
                  {moves.close && canClose && (
                    <button type="button" onClick={() => setClosing(true)} disabled={pending} className="rounded-lg border border-line px-3 py-2 text-xs text-muted hover:text-text">
                      Close…
                    </button>
                  )}
                </div>
              )}
              {moves.qualify && canApprove && !closing && (
                <p className="text-[11px] text-faint">Qualifying opens the Zoho Deal for this brief.</p>
              )}
              {sel.state === "CAMPAIGN_CREATED" && sel.campaign && (
                <p className="text-xs">
                  A campaign was created from this brief.{" "}
                  <Link href={`/admin/campaigns/${encodeURIComponent(sel.campaign.id)}`} className="text-primary hover:underline">
                    View campaign →
                  </Link>
                </p>
              )}
              {sel.state === "CLOSED" && (
                <p className="text-xs text-muted">Closed{sel.closeReason ? ` · ${sel.closeReason}` : ""}</p>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
