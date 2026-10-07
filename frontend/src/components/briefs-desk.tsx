"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge } from "@/components/ui";
import { Monogram } from "@/components/hero";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import { moveBriefAction } from "@/app/(app)/admin/briefs/actions";
import type { PageInfo } from "@/lib/list-query";
import {
  TABS,
  approvalBadge,
  nextMoves,
  type BriefRow,
  type BriefState,
  type TabKey,
} from "@/lib/briefs-live";

/* --------------------------------------------------------------------------
   P4-FE-07 — the Briefs queue's one client island: tabs, search and sport
   filter, the page of rows the server read, and the detail panel with
   Qualify / Approve / Close (with a reason) / Open in Matching Studio. On a
   wide screen the panel sits beside the list; on a phone it covers the
   screen.

   P1-FE-31 — SERVER-PAGED (memory: pagination-pattern). The tab, search and
   sport filter write the URL (`?tab`, `?q`, `?sport`) through the house
   pager's navigation, the server page re-reads it and the API answers one
   page plus every tab's count: nothing is filtered or counted in the
   browser. Picking a tab or a filter resets to page 1; the rows dim while
   the next page loads.

   P4-FE-09 — briefs that pass every safety check are approved automatically
   (P4-BE-11). The default tab is "Held for BTG", each card carrying its
   reasons; an auto-approved brief carries "Approved automatically".
   -------------------------------------------------------------------------- */

const QUICK_REASONS = ["Budget below the package minimum", "Sponsor went quiet", "Category conflict with an existing sponsor"];

export function BriefsDesk(props: {
  rows: BriefRow[];
  page: PageInfo;
  counts: Record<TabKey, number>;
  sports: string[];
  tab: TabKey;
  q: string;
  sport: string;
  canApprove: boolean;
  canClose: boolean;
}) {
  return (
    <ServerList>
      <Desk {...props} />
    </ServerList>
  );
}

function Desk({
  rows,
  page,
  counts,
  sports,
  tab,
  q,
  sport,
  canApprove,
  canClose,
}: {
  rows: BriefRow[];
  page: PageInfo;
  counts: Record<TabKey, number>;
  sports: string[];
  tab: TabKey;
  q: string;
  sport: string;
  canApprove: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const { set } = useListNav();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sel = rows.find((r) => r.id === selectedId) ?? null;
  const filtered = Boolean(q || sport);

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
            onClick={() => set({ tab: t.key === "held" ? null : t.key })}
            className={[
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key ? "bg-surface-2 text-text" : "text-muted hover:text-text",
            ].join(" ")}
          >
            {t.label}
            <span className="tabular-nums text-faint">{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <ListSearch initial={q} label="Search briefs" placeholder="Search sponsor or objective…" tone="admin" />
        </div>
        <ListFilter
          param="sport"
          value={sport}
          label="Sport"
          allLabel="All sports"
          options={sports.map((s) => ({ value: s, label: s }))}
          tone="admin"
        />
      </div>

      {rows.length > 0 && <PagerRow page={page} noun="Briefs" tone="admin" position="top" filtered={filtered} />}

      <div className={sel ? "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-4" : ""}>
        <PendingList>
          <ul className="space-y-2">
            {rows.length === 0 && (
              <li className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
                {tab === "held" && !filtered ? (
                  <>
                    <p className="text-sm font-semibold">Nothing is held for you</p>
                    <p className="mt-1 text-xs text-muted">
                      A request lands here when a safety check fails — no package, a budget below the price, too few athletes, a sensitive category or a sponsor on hold. The rest are approved automatically; the All tab shows them.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold">Nothing matches these filters</p>
                    <p className="mt-1 text-xs text-muted">Try another sport, a sponsor name, or the All tab.</p>
                  </>
                )}
              </li>
            )}
            {rows.map((b) => (
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
                      {/* P4-FE-09 — held for BTG, or approved by the system */}
                      {b.held && <Badge tone="warn">Held for BTG</Badge>}
                      {approvalBadge(b) && <Badge tone={approvalBadge(b)!.tone}>{approvalBadge(b)!.label}</Badge>}
                      <span className="ml-auto text-xs font-semibold tabular-nums">{b.budget}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">
                      {b.packageName}
                      {b.packagePrice ? ` · ${b.packagePrice}` : ""} · starts {b.start} · {b.duration}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-faint">
                      {b.sports} · {b.geography} · {b.category} · submitted {b.submitted}
                    </span>
                    {b.held && b.heldReasons.length > 0 && (
                      <span className="mt-1.5 block space-y-0.5">
                        <span className="sr-only">Held because: </span>
                        {b.heldReasons.map((r) => (
                          <span key={r} className="flex items-start gap-1.5 text-[11px] leading-snug text-warn [overflow-wrap:anywhere]">
                            <span aria-hidden="true">!</span>
                            <span className="min-w-0">{r}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </PendingList>

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
                  {approvalBadge(sel) && <Badge tone={approvalBadge(sel)!.tone}>{approvalBadge(sel)!.label}</Badge>}
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

            {/* P4-FE-09 (P4-BE-11) — why it wasn't approved automatically. Kept
                once BTG takes it on, as the record of why it waited. */}
            {sel.heldReasons.length > 0 && (
              <div className="mt-4 rounded-lg border border-warn/30 bg-warn/8 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-warn">
                  {sel.held ? "Held for BTG" : "Was held for BTG"}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {sel.heldReasons.map((r) => (
                    <li key={r} className="text-xs leading-relaxed [overflow-wrap:anywhere]">
                      {r}
                    </li>
                  ))}
                </ul>
                {sel.held && (
                  <p className="mt-1.5 text-[11px] text-faint">The sponsor sees only that BTG is reviewing their request.</p>
                )}
              </div>
            )}

            {/* P4-FE-08 (P4-BE-07) — what the system looked up; BTG decides. */}
            {sel.readiness && sel.state === "DRAFT" && (
              <div className="mt-4">
                <p className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                  Readiness
                  {sel.ready && <Badge tone="accent">Checklist passes</Badge>}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {sel.readiness.checks.map((c) => {
                    const info = c.key === "conflicts";
                    return (
                      <li key={c.key} className="flex items-start gap-2 text-xs leading-relaxed">
                        <span
                          aria-hidden="true"
                          className={[
                            "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                            info ? "bg-surface-2 text-muted" : c.ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
                          ].join(" ")}
                        >
                          {info ? "i" : c.ok ? "✓" : "!"}
                        </span>
                        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                          <span className="sr-only">{info ? "For information: " : c.ok ? "Passed: " : "Not yet: "}</span>
                          {c.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-faint">
                  Looked up automatically. This request is waiting for you — qualifying it is your call.
                </p>
              </div>
            )}

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

      {rows.length > 0 && <PagerRow page={page} noun="Briefs" tone="admin" position="bottom" />}
    </div>
  );
}
