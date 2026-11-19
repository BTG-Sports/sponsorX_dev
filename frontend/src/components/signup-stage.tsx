/* --------------------------------------------------------------------------
   New sign-ups — the page's header and status cards (POL-FE-109, 2026-11-17),
   on the admin shell's Mission Control stage. Server components; the list
   under them is the SignupsDesk client island (signups-desk.tsx).

   This replaces the "Intake Stream" header (P1-ART-15, intake-stage.tsx):
   four KPI tiles over kind chips that repeated the same counts, which the
   owner found confusing. Same rule as before: every figure is the API's
   summary (GET /signups/stream/summary), never counted from the page of rows.

   - SignupsHeader  a dashboard header, not a hero: the title, the live /
                    provenance pill, "How it works" and "Sign-up rules", then
                    one line on what the page is for.
   - SignupStats    numbers only, not a filter (the POL-FE-106 rule): Needs
                    review (orange when something is held), Approved
                    automatically (with its share of all), All sign-ups, and
                    "Who signed up" — each kind as a bar against the largest.
   - StreamNote     one quiet panel line (a read the role can't make).
   - EditsSkeleton  the sensitive-edits list's skeleton, for its loader.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { OpsCount } from "@/components/ops-fx";
import { SignupsHowItWorks } from "@/components/signups-desk";
import { kindBars, streamStats, type ApiStreamSummary, type StreamStat } from "@/lib/new-signups-live";

const at = (seconds: number, extra?: CSSProperties) => ({ "--d": `${seconds}s`, ...extra }) as CSSProperties;

/* ----------------------------------------------------------------- header */

/** `readAt` null: nothing was read (a demo state), so no live pill. */
export function SignupsHeader({ readAt }: { readAt: string | null }) {
  return (
    <header>
      <div className="sx-ap-rise flex flex-wrap items-center justify-between gap-3" style={at(0.02)}>
        <h1 className="sx-page-title">New sign-ups</h1>
        <div className="flex flex-wrap items-center gap-2">
          {readAt && (
            <span className="sx-ap-live">
              <span className="sx-ap-live-dot" aria-hidden="true" />
              Live · Postgres · read {readAt}
            </span>
          )}
          <SignupsHowItWorks />
          <Link href="/admin/new-signups/rules" className="sx-su-rules">
            Sign-up rules
            <Glyph ui="arrow" className="size-3.5" />
          </Link>
        </div>
      </div>
      <p className="sx-ap-rise mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]" style={at(0.06)}>
        Everyone who joins is checked and approved automatically. You only step in for the few held
        under <strong className="font-semibold text-[#fdba74]">Needs review</strong>.
      </p>
    </header>
  );
}

/* ------------------------------------------------------------ status cards */

const STAT_LOOK: Record<StreamStat["key"], { icon: UiGlyph; tone: string }> = {
  /* nothing held reads as a green tick; something held swaps to the orange alert below */
  review: { icon: "check", tone: "#4ade80" },
  auto: { icon: "bolt", tone: "#4ade80" },
  all: { icon: "stack", tone: "#63b4f8" },
};

export function SignupStats({ summary }: { summary: ApiStreamSummary }) {
  const stats = streamStats(summary);
  const kinds = kindBars(summary);
  return (
    <dl aria-label="Sign-ups in numbers" className="sx-ap-stats sx-su-stats mt-6">
      {stats.map((s, i) => {
        const look = STAT_LOOK[s.key];
        return (
          <div key={s.key} data-spot="" className="sx-ap-stat sx-ap-rise" style={at(0.08 + i * 0.06, { "--c": s.alert ? "#fb923c" : look.tone } as CSSProperties)}>
            <span aria-hidden="true" className="sx-ap-stat-beam" />
            <dt className="sx-ap-stat-top">
              <span className="sx-ap-stat-icon" aria-hidden="true">
                <Glyph ui={s.alert ? "alert" : look.icon} className="size-[18px]" />
              </span>
              <span className="sx-ap-stat-name">{s.label}</span>
            </dt>
            <dd className="sx-ap-stat-num">
              <OpsCount value={s.value} delay={0.2 + i * 0.08} />
            </dd>
            {s.share !== null && (
              <dd aria-hidden="true" className="sx-su-meter">
                <span style={at(0.5, { width: `${Math.max(2, Math.round(s.share * 100))}%` })} />
              </dd>
            )}
            <dd className="sx-ap-stat-sub" data-late={s.alert ? "" : undefined}>
              {s.sub}
            </dd>
          </div>
        );
      })}

      {/* Who signed up: one bar per kind against the largest. One hue — the
          label names the kind, so colour has nothing left to say. */}
      <div data-spot="" className="sx-ap-stat sx-su-stat-kinds sx-ap-rise" style={at(0.08 + stats.length * 0.06)}>
        <span aria-hidden="true" className="sx-ap-stat-beam" />
        <dt className="sx-ap-stat-top">
          <span className="sx-ap-stat-icon" aria-hidden="true">
            <Glyph ui="users" className="size-[18px]" />
          </span>
          <span className="sx-ap-stat-name">Who signed up</span>
        </dt>
        <dd>
          {kinds.length === 0 ? (
            <p className="sx-ap-stat-sub">Nobody yet.</p>
          ) : (
            <ul className="sx-su-kinds">
              {kinds.map((k, i) => (
                <li key={k.kind}>
                  <span className="sx-su-kinds-name">{k.label}</span>
                  <span aria-hidden="true" className="sx-su-kinds-bar">
                    <span style={at(0.45 + i * 0.08, { width: k.total ? `${Math.max(3, Math.round(k.share * 100))}%` : "0%" })} />
                  </span>
                  <span className="sx-su-kinds-n">
                    {k.total.toLocaleString("en-US")}
                    {k.held > 0 && <span className="sx-su-kinds-held"> · {k.held.toLocaleString("en-US")} to review</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------- notes */

/** A quiet panel line: a read the role can't make. */
export function StreamNote({ children, delay = 0.4 }: { children: ReactNode; delay?: number }) {
  return (
    <div className="sx-ops-panel sx-ap-rise relative mt-6 px-6 py-6 text-sm text-[#9aa4b2]" style={at(delay)}>
      {children}
    </div>
  );
}

/** The sensitive-edits list while its next page loads. */
export function EditsSkeleton({ n = 3 }: { n?: number }) {
  return (
    <ul aria-hidden="true" className="sx-su-edits">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="sx-su-edit">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sx-ops-ghost block h-4 w-40 max-w-full rounded" />
            <span className="sx-ops-ghost block h-5 w-24 rounded-full" />
          </div>
          <span className="sx-ops-ghost mt-3 block h-3 w-72 max-w-full rounded" />
          <span className="sx-ops-ghost mt-2 block h-3 w-56 max-w-full rounded" />
        </li>
      ))}
    </ul>
  );
}
