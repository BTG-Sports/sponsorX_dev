/* --------------------------------------------------------------------------
   New sign-ups — the "Intake Stream" (P1-ART-15, 2026-10-05). The desk
   (2S1-FE-07) redrawn on the admin board's Mission Control stage
   (ops-stage.tsx, P1-ART-14) at the programme owner's request: one
   server-paged stream of every kind of sign-up, newest first, instead of
   four separate sections. Server components; the filter controls are
   intake-fx.tsx, the pager and search the house server-pager.tsx.

   Same rule as the board: fixed-dark in both themes, bled to the content
   column's edges; every figure from GET /signups/stream/summary (never
   counted from the page of rows on screen).

   - IntakeHeader a dashboard header: title row (live dot, Postgres pill,
                  rules button) and four tiles — Needs review, Approved
                  automatically, On the desk, and the per-kind breakdown.
   - StreamRows   the page of rows on glass: kind mark, name + sub, day,
                  status light, reason, Open / Review. Held rows carry an
                  orange edge and wash.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { KpiTile } from "./ops-stage";
import { STREAM_CHIPS, type ApiStreamSummary, type StreamKind, type StreamRowView } from "@/lib/new-signups-live";

const at = (seconds: number, extra?: CSSProperties) => ({ "--sx-reveal-delay": `${seconds}s`, ...extra }) as CSSProperties;

/** Each kind's hue — its mark and its figure. Blue/cyan for people, violet for organisations, orange for sponsors. */
const KIND_TONE: Record<StreamKind, { mark: string; text: string }> = {
  ORGANIZATION: { mark: "border-[#a479ff]/40 bg-[#a479ff]/15 text-[#c3a6ff]", text: "text-[#c3a6ff]" },
  ATHLETE: { mark: "border-[#2e9bf5]/40 bg-[#2e9bf5]/15 text-[#93c5fd]", text: "text-[#93c5fd]" },
  GUARDIAN: { mark: "border-[#9be0ff]/35 bg-[#9be0ff]/10 text-[#cfe9ff]", text: "text-[#cfe9ff]" },
  SPONSOR: { mark: "border-[#f97a1f]/40 bg-[#f97a1f]/15 text-[#fdba74]", text: "text-[#fdba74]" },
};

const CHAMFER = "[clip-path:polygon(0_0,calc(100%-7px)_0,100%_7px,100%_100%,7px_100%,0_calc(100%-7px))]";

/* ----------------------------------------------------------------- header */

/** A dashboard header, not a hero (owner, 2026-10-05: "this is a dashboard
 *  not a landing page, so clear the hero style"): the title row, then four
 *  tiles — three figures and the per-kind breakdown — and the stream. */
export function IntakeHeader({ summary, readAt }: { summary: ApiStreamSummary; readAt: string }) {
  const { all } = summary;
  const kinds = STREAM_CHIPS.filter((c): c is { kind: StreamKind; label: string } => c.kind !== "" && summary.kinds[c.kind as StreamKind] !== undefined);
  return (
    <header>
      <div className="sx-ops-in flex flex-wrap items-center justify-between gap-3" style={at(0.05)}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="sx-page-title">New sign-ups</h1>
          <span className="rounded-full border border-[#9be0ff]/30 bg-[#04080f]/40 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.2em] text-[#cfe9ff]">
            Postgres · read {readAt}
          </span>
        </div>
        <Link
          href="/admin/new-signups/rules"
          className={`group inline-flex min-h-9 items-center gap-2 border border-[#63b4f8]/40 bg-[#0a121e]/70 px-4 text-xs font-semibold text-[#cfe9ff] transition-colors hover:border-[#9be0ff] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#63b4f8]/70 ${CHAMFER}`}
        >
          Sign-up rules
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1">→</span>
        </Link>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Needs review"
          value={all.held}
          caption={all.held ? "held for BTG · open each to decide" : "nothing held for BTG"}
          tone={all.held ? "orange" : "green"}
          delay={0.1}
        />
        <KpiTile
          label="Approved automatically"
          value={all.auto}
          caption={all.total ? `of ${all.total.toLocaleString("en-US")} on the desk` : "nothing on the desk yet"}
          tone="green"
          share={all.total ? all.auto / all.total : 0}
          delay={0.16}
        />
        <KpiTile label="On the desk" value={all.total} caption="every kind, all time" tone="cyan" delay={0.22} />
        <div className="sx-ops-panel sx-ops-in relative col-span-2 px-4 pb-4 pt-3.5 lg:col-span-1" style={at(0.28)}>
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[2px] bg-[#a479ff] shadow-[0_0_10px_#a479ff]" />
          <dt className="text-[10px] font-medium uppercase tracking-[0.22em] text-[#8a96a3]">By kind</dt>
          <dd className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {kinds.map((c) => {
              const f = summary.kinds[c.kind]!;
              return (
                <span key={c.kind} className="flex items-baseline justify-between gap-2 text-[11px] text-[#9aa4b2]">
                  <span className="truncate">{c.label}</span>
                  <span className={`font-mono text-sm font-bold tabular-nums ${KIND_TONE[c.kind].text}`}>
                    {f.total.toLocaleString("en-US")}
                    {f.held > 0 && <span className="ml-1 text-[10px] font-semibold text-[#fdba74]">·{f.held}</span>}
                  </span>
                </span>
              );
            })}
          </dd>
        </div>
      </dl>
    </header>
  );
}

/* ------------------------------------------------------------------ rows */

const LIGHT: Record<StreamRowView["badge"]["tone"], string> = {
  accent: "bg-[#22c55e] shadow-[0_0_10px_#22c55e]",
  warn: "bg-[#f59e0b] shadow-[0_0_12px_#f59e0b] sx-ops-led",
  neutral: "bg-[#7e88a0]",
};
const LIGHT_TEXT: Record<StreamRowView["badge"]["tone"], string> = { accent: "text-[#86efac]", warn: "text-[#fcd34d]", neutral: "text-[#9aa4b2]" };

const COLS = "md:grid-cols-[40px_minmax(0,1.5fr)_4.5rem_11.5rem_minmax(0,1.3fr)_6.5rem]";

export function StreamRows({ rows, label }: { rows: StreamRowView[]; label: string }) {
  return (
    <div role="region" aria-label={label} className="sx-ops-panel relative">
      <div className={`hidden gap-x-4 border-b border-white/5 px-5 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[#7e88a0] md:grid ${COLS}`}>
        {/* a real grid cell (an sr-only one leaves the flow and shifts every heading left) */}
        <span><span className="sr-only">Kind</span></span>
        <span>Name</span>
        <span>Signed up</span>
        <span>Status</span>
        <span>Why · checks</span>
        <span><span className="sr-only">Open</span></span>
      </div>
      <ul>
        {rows.map((r, i) => (
          <li
            key={r.key}
            className={`sx-ops-in relative grid grid-cols-[40px_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5 border-b border-white/5 px-5 py-3.5 last:border-0 ${COLS} ${
              r.held ? "bg-[#f97a1f]/[0.06] shadow-[inset_3px_0_0_#f97a1f]" : ""
            }`}
            style={at(0.55 + Math.min(i, 14) * 0.035)}
          >
            <span
              aria-hidden="true"
              title={r.kindWord}
              className={`row-span-2 grid size-10 place-items-center border text-[12px] font-bold md:row-span-1 ${KIND_TONE[r.kind].mark} ${CHAMFER}`}
            >
              {r.mono}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{r.name}</span>
              <span className="block truncate text-xs text-[#8a96a3]">
                <span className="sr-only">{r.kindWord} · </span>
                {r.sub || r.kindWord}
              </span>
            </span>
            <span className="col-start-2 text-xs text-[#8a96a3] md:col-start-auto">
              <span className="md:hidden">Signed up </span>
              {r.when}
            </span>
            <span className={`col-start-2 flex items-center gap-2 text-xs font-medium md:col-start-auto ${LIGHT_TEXT[r.badge.tone]}`}>
              <i
                aria-hidden="true"
                data-status={r.badge.tone === "warn" ? "Degraded" : undefined}
                className={`size-2 shrink-0 rounded-full ${LIGHT[r.badge.tone]}`}
              />
              {r.badge.label}
            </span>
            <span className="col-start-2 min-w-0 break-words text-xs text-[#9aa4b2] md:col-start-auto">{r.reason}</span>
            <span className="col-start-2 md:col-start-auto md:text-right">
              <Link
                href={r.href}
                aria-label={`${r.held ? "Review" : "Open"} ${r.name}`}
                className={`group inline-flex min-h-9 items-center gap-1.5 px-3.5 text-xs font-semibold transition-[background-color,box-shadow,color] duration-300 focus-visible:outline-none focus-visible:ring-2 ${CHAMFER} ${
                  r.held
                    ? "bg-gradient-to-r from-[#fb923c] to-[#f97a1f] text-[#0a0c10] shadow-[0_0_18px_rgba(249,122,31,.35)] hover:shadow-[0_0_26px_rgba(249,122,31,.6)] focus-visible:ring-[#fb923c]/70"
                    : "border border-[#63b4f8]/30 bg-[#0a121e]/60 text-[#cfe9ff] hover:border-[#9be0ff] hover:text-white focus-visible:ring-[#63b4f8]/70"
                }`}
              >
                {r.held ? "Review" : "Open"}
                <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A quiet panel line: an empty stream, or a read the role can't make. */
export function StreamNote({ children, delay = 0.6 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="sx-ops-panel sx-ops-in relative px-6 py-6 text-sm text-[#9aa4b2]" style={at(delay)}>
      {children}
    </div>
  );
}
