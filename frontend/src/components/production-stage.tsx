/* --------------------------------------------------------------------------
   The production board — its header and number cards (P9-FE-16), on the
   admin shell's Mission Control stage. Server components; the list under
   them is the ProductionDesk client island (production-desk.tsx).

   - ProductionHeader  a dashboard header, not a hero: the title, the live /
                       provenance pill, "How it works" and a link to the
                       edition, then one line naming the edition and its dates.
   - ProductionStats   numbers only, not a filter: Needs you (orange when
                       BTG has a move), Waiting on others, Ready (with its
                       share of all pieces), and "The gates" — the four
                       conditions production asks for, as the API answers them.
   - BoardNote         one quiet panel line (no edition yet, or a read the
                       role can't make).
   Every figure is counted from the pieces GET /editions/:id/production
   returned whole (lib/production-live.ts) — never from a filtered list.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { OpsCount } from "@/components/ops-fx";
import { ProductionHowItWorks } from "@/components/production-desk";
import { boardStats, gateRows, type ApiProductionBoard, type BoardStat } from "@/lib/production-live";

const at = (seconds: number, extra?: CSSProperties) => ({ "--d": `${seconds}s`, ...extra }) as CSSProperties;

/* ----------------------------------------------------------------- header */

export function ProductionHeader({
  readAt, line, editionHref,
}: {
  /** null: nothing was read (a demo state, or no edition), so no live pill. */
  readAt: string | null;
  /** "Fall 2026 · The Northside Current · publishes Nov 1 · digital only" */
  line: string | null;
  /** The edition's own page, when there is one. */
  editionHref: string | null;
}) {
  return (
    <header>
      <div className="sx-ap-rise flex flex-wrap items-center justify-between gap-3" style={at(0.02)}>
        <h1 className="sx-page-title">Production board</h1>
        <div className="flex flex-wrap items-center gap-2">
          {readAt && (
            <span className="sx-ap-live">
              <span className="sx-ap-live-dot" aria-hidden="true" />
              Live · Postgres · read {readAt}
            </span>
          )}
          <ProductionHowItWorks />
          {editionHref && (
            <Link href={editionHref} className="sx-su-rules">
              The edition
              <Glyph ui="arrow" className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
      <p className="sx-ap-rise mt-2 max-w-2xl text-sm leading-relaxed text-[#9aa4b2]" style={at(0.06)}>
        Every piece of one edition and what each still needs before it can publish. Start with what{" "}
        <strong className="font-semibold text-[#fdba74]">needs you</strong>.
      </p>
      {line && (
        <p className="sx-ap-rise mt-1.5 text-xs text-[#cbd5e1] [overflow-wrap:anywhere]" style={at(0.08)}>
          {line}
        </p>
      )}
    </header>
  );
}

/* ------------------------------------------------------------ number cards */

const STAT_LOOK: Record<BoardStat["key"], { icon: UiGlyph; tone: string }> = {
  /* nothing waiting on BTG reads as a green tick; a move swaps to the orange alert below */
  mine: { icon: "check", tone: "#4ade80" },
  others: { icon: "hourglass", tone: "#63b4f8" },
  ready: { icon: "bolt", tone: "#4ade80" },
};

export function ProductionStats({ board }: { board: Pick<ApiProductionBoard, "pieces" | "counts" | "gates"> }) {
  const stats = boardStats(board);
  const gates = gateRows(board.gates);
  const open = gates.filter((g) => !g.pass).length;
  return (
    <dl aria-label="The edition's pieces in numbers" className="sx-ap-stats sx-su-stats mt-6">
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

      {/* The four conditions production asks for. A tick or a ring beside each
          word — the mark, never the colour alone, says which it is. */}
      <div data-spot="" className="sx-ap-stat sx-su-stat-kinds sx-ap-rise" style={at(0.08 + stats.length * 0.06, { "--c": open ? "#63b4f8" : "#4ade80" } as CSSProperties)}>
        <span aria-hidden="true" className="sx-ap-stat-beam" />
        <dt className="sx-ap-stat-top">
          <span className="sx-ap-stat-icon" aria-hidden="true">
            <Glyph ui="shield" className="size-[18px]" />
          </span>
          <span className="sx-ap-stat-name">The gates</span>
        </dt>
        <dd>
          <ul className="sx-pb-gates">
            {gates.map((g) => (
              <li key={g.key} data-pass={g.pass ? "" : undefined}>
                <span className="sx-pb-gate-mark" aria-hidden="true">
                  {g.pass ? <Glyph ui="check" className="size-3" /> : null}
                </span>
                <span>{g.label}</span>
                <span className="sr-only">{g.pass ? ": met" : ": not yet"}</span>
              </li>
            ))}
          </ul>
        </dd>
      </div>
    </dl>
  );
}

/* ------------------------------------------------------------------- notes */

/** A quiet panel line: no edition yet, or a read the role can't make. */
export function BoardNote({ title, children, delay = 0.3 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <div className="sx-ops-panel sx-ap-rise relative mt-6 px-6 py-6" style={at(delay)}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-[#9aa4b2]">{children}</p>
    </div>
  );
}
