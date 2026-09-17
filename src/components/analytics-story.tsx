"use client";

import { useEffect, useState } from "react";
import { Card, SourceLabel } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import {
  AreaChart,
  ChartLegend,
  FunnelSteps,
  HBarList,
  Sparkline,
} from "@/components/charts";
import { CountUp } from "@/components/count-up";
import { ScoreRing } from "@/components/score-ring";
import { InsightBanner } from "@/components/insight-banner";
import {
  analyticsRanges,
  athleteLeaderboard,
  topLocations,
  type RangeKey,
} from "@/lib/fixtures";
import {
  athleteInsight,
  funnelInsight,
  headlineInsight,
  locationInsight,
  offerInsight,
} from "@/lib/analytics-insights";

/* --------------------------------------------------------------------------
   AnalyticsStory — the guided-story island (spec 2026-09-17).

   Five chapters read top to bottom; a scrollspy rail tracks position (left
   column on xl, pill bar below that). Range pills swap the whole per-range
   dataset; the chapters wrapper is keyed by range because CountUp animates
   once per mount and the entrance choreography should replay on a data
   change. URL sync follows sponsor-campaigns-list: replaceState, demo param
   preserved, default range omitted.
   -------------------------------------------------------------------------- */

const CHAPTERS = [
  { id: "what-happened", title: "What happened" },
  { id: "funnel", title: "The funnel" },
  { id: "where", title: "Where" },
  { id: "what-fans-took", title: "What fans took" },
  { id: "who-drove-it", title: "Who drove it" },
] as const;

type ChapterId = (typeof CHAPTERS)[number]["id"];

const RANGES: RangeKey[] = ["7d", "30d", "90d"];

function Chapter({
  id,
  no,
  title,
  hint,
  fill = false,
  children,
}: {
  id: ChapterId;
  no: number;
  title: string;
  hint?: string;
  /** Grid-row chapters: stretch the content column so sibling cards can
      equalize to the row height (their Card takes flex-1). */
  fill?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-label={title}
      className={fill ? "flex flex-col scroll-mt-28" : "scroll-mt-28"}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
        Chapter {no} · {title}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
      <div className={fill ? "mt-2 flex flex-1 flex-col" : "mt-2"}>
        {children}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  delta,
  prefix,
  spark,
  chip,
}: {
  label: string;
  value: number;
  delta: string;
  prefix?: string;
  spark?: number[];
  chip: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">
          <CountUp value={value} prefix={prefix} />
        </span>
        <span className="text-[11px] font-medium tabular-nums text-success">
          +{delta}
        </span>
      </div>
      {spark ? (
        <div className="mt-2">
          <Sparkline points={spark} stroke="var(--sx-primary)" />
        </div>
      ) : (
        <div className="mt-2 h-6" aria-hidden="true" />
      )}
      <div className="mt-2">{chip}</div>
    </Card>
  );
}

export function AnalyticsStory({ initialRange }: { initialRange: RangeKey }) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [active, setActive] = useState<ChapterId[]>(["what-happened"]);

  /* Range lives in the URL (no navigation) so a view is shareable and
     survives reload; the server page seeds initialRange from it. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (range === "30d") p.delete("range");
    else p.set("range", range);
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [range]);

  /* Scrollspy: the last chapter whose top has passed the reading line is
     current. The line sits at mid-viewport, not near the top — the page's
     tail (the 3+4 row and chapter 5) shares the final ~200px of scroll
     range, and a near-top line gives those chapters windows narrower than
     one wheel notch, so a normal scroll skips them entirely. Five sections —
     a passive scroll listener is plenty. The initial position is read in a
     rAF so no state is set synchronously in the effect body (repo's
     react-hooks/set-state-in-effect rule). */
  useEffect(() => {
    const onScroll = () => {
      /* The last chapter is shorter than a viewport, so its top can never
         cross the reading line before the document runs out of scroll range —
         at the (scrollable) bottom of the page the final chapter wins. The
         scrollY > 0 guard keeps a page that fits the viewport on chapter 1;
         the 4px slack absorbs fractional scroll positions on scaled displays. */
      const atBottom =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 4;
      let lit: ChapterId[];
      if (atBottom) {
        lit = [CHAPTERS[CHAPTERS.length - 1].id];
      } else {
        const line = window.innerHeight * 0.5;
        let current: ChapterId = CHAPTERS[0].id;
        const tops: Partial<Record<ChapterId, number>> = {};
        for (const c of CHAPTERS) {
          const el = document.getElementById(c.id);
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          tops[c.id] = top;
          if (top <= line) current = c.id;
        }
        /* Side-by-side chapters (3+4 share a grid row on lg+) are read
           together — light every chapter whose top aligns with the current
           one, so neither half of the row reads as skipped. */
        lit = CHAPTERS.filter(
          (c) =>
            c.id === current ||
            Math.abs(
              (tops[c.id] ?? Number.POSITIVE_INFINITY) -
                (tops[current] ?? 0),
            ) < 1,
        ).map((c) => c.id);
      }
      /* New array every event — only commit when membership actually changed. */
      setActive((prev) =>
        prev.length === lit.length && prev.every((id, i) => id === lit[i])
          ? prev
          : lit,
      );
    };
    const frame = requestAnimationFrame(onScroll);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  const jump = (id: ChapterId) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });

  const d = analyticsRanges[range];
  const scans = d.funnel[0].value;
  const claims = d.funnel[2].value;
  const redeemed = d.funnel[3].value;

  const athletes = athleteLeaderboard.map((a) => ({
    ...a,
    views: Math.round(a.views * d.athleteFactor),
    claims: Math.round(a.claims * d.athleteFactor),
    redeemed: Math.round(a.redeemed * d.athleteFactor),
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[10.5rem_minmax(0,1fr)]">
      {/* ------------------------------------------------- rail (xl and up) */}
      <nav
        aria-label="Chapters"
        className="sticky top-24 hidden self-start xl:block"
      >
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          Chapters
        </p>
        {CHAPTERS.map((c, i) => (
          <button
            key={c.id}
            type="button"
            onClick={() => jump(c.id)}
            aria-current={active.includes(c.id) ? "true" : undefined}
            className={[
              "block w-full border-l-2 py-1 pl-3 text-left text-xs transition-colors",
              active.includes(c.id)
                ? "border-primary font-medium text-text"
                : "border-line text-muted hover:text-text",
            ].join(" ")}
          >
            <span className="mr-1.5 tabular-nums text-faint">{i + 1}</span>
            {c.title}
          </button>
        ))}
        <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
          Read top to bottom — each chapter opens with the takeaway, the chart
          below it is the evidence.
        </p>
      </nav>

      <div className="min-w-0">
        {/* --------------------------------------- pills + mobile chapter bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex gap-1.5 overflow-x-auto xl:hidden"
            aria-label="Chapters"
          >
            {CHAPTERS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => jump(c.id)}
                aria-current={active.includes(c.id) ? "true" : undefined}
                className={[
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  active.includes(c.id)
                    ? "border-primary/40 bg-primary/10 text-text"
                    : "border-line text-muted hover:text-text",
                ].join(" ")}
              >
                {i + 1} · {c.title}
              </button>
            ))}
          </div>
          <div
            className="ml-auto flex gap-1.5"
            role="group"
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={r === range}
                title={analyticsRanges[r].label}
                className={[
                  "rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors",
                  r === range
                    ? "border-primary/40 bg-primary/10 text-text"
                    : "border-line bg-surface text-muted hover:text-text",
                ].join(" ")}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Keyed by range: CountUp animates once per mount, and the entrance
            choreography should replay when the data changes under you. */}
        <div key={range} className="space-y-10">
          {/* ------------------------------------------ ch 1: what happened */}
          <Chapter id="what-happened" no={1} title="What happened">
            <InsightBanner
              hero
              insight={headlineInsight(d)}
              footer={
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
                  Computed from the numbers below — it always matches the data.
                  <MiniChip kind="ver">POSTGRES</MiniChip>
                </p>
              }
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                label="QR Scans"
                value={scans}
                delta={d.deltas.scans}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Offers Claimed"
                value={claims}
                delta={d.deltas.claims}
                spark={d.series.map((p) => p.b)}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Rewards Redeemed"
                value={redeemed}
                delta={d.deltas.redeemed}
                spark={d.series.map((p) => p.a)}
                chip={<MiniChip kind="ver">POSTGRES</MiniChip>}
              />
              <Kpi
                label="Revenue Attributed"
                value={d.revenue}
                prefix="$"
                delta={d.deltas.revenue}
                chip={<SourceLabel source="ATTRIBUTED" />}
              />
            </div>
            <div className="mt-3">
              <Card>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-[11px] font-medium text-muted">
                    Evidence — claims vs redemptions, {d.label.toLowerCase()}
                  </p>
                  <ChartLegend aName="Redemptions" bName="Claims" />
                </div>
                <AreaChart
                  points={d.series}
                  aName="Redemptions"
                  bName="Claims"
                />
                <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ How to read this: the vertical gap between the lines is
                  reward that was claimed but never used — the number the
                  headline above is tracking.
                </p>
              </Card>
            </div>
          </Chapter>

          {/* ------------------------------------------------ ch 2: funnel */}
          <Chapter
            id="funnel"
            no={2}
            title="The funnel"
            hint="Every fan takes the same four steps; each one is a separate §16 event row."
          >
            <InsightBanner insight={funnelInsight(d)} />
            <Card>
              <FunnelSteps
                stages={d.funnel.map((s) => ({
                  label: s.stage,
                  value: s.value,
                }))}
              />
              <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                ⓘ{" "}
                {d.funnel
                  .map((s) => `${s.stage.toLowerCase()} = ${s.blurb}`)
                  .join(" · ")}
                <MiniChip kind="ver">POSTGRES</MiniChip>
              </p>
            </Card>
          </Chapter>

          {/* --------------------------------------- ch 3 + 4, side by side */}
          <div className="grid gap-6 gap-y-10 lg:grid-cols-2">
            <Chapter id="where" no={3} title="Where" fill>
              <InsightBanner insight={locationInsight(topLocations)} />
              <Card className="flex flex-1 flex-col">
                <div className="flex-1">
                  <HBarList
                    rows={topLocations.map((l) => ({
                      label: l.place,
                      value: l.pct,
                      display: `${l.pct}%`,
                    }))}
                  />
                </div>
                <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ Share of scans. Resolved in the worker — the fan IP is
                  never stored.
                </p>
              </Card>
            </Chapter>

            <Chapter id="what-fans-took" no={4} title="What fans took" fill>
              <InsightBanner insight={offerInsight(d)} />
              <Card className="flex flex-1 flex-col">
                <div className="flex-1">
                  <HBarList
                    rows={d.offers.map((o) => ({
                      label: o.offer,
                      value: o.count,
                      display: o.count.toLocaleString("en-US"),
                      tone: "warn" as const,
                    }))}
                  />
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                  ⓘ Ranked by redemptions, not claims — what fans actually
                  used. <MiniChip kind="ver">POSTGRES</MiniChip>
                </p>
              </Card>
            </Chapter>
          </div>

          {/* -------------------------------------------- ch 5: athletes */}
          <Chapter
            id="who-drove-it"
            no={5}
            title="Who drove it"
            hint="§9 screen 11 — athlete performance behind the fan numbers."
          >
            <InsightBanner insight={athleteInsight(athletes)} />
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-line-soft text-[10px] uppercase tracking-wide text-faint">
                      <th className="px-4 py-2.5 font-medium">Athlete</th>
                      <th className="px-3 py-2.5 font-medium">Views</th>
                      <th className="px-3 py-2.5 font-medium">Engagement</th>
                      <th className="px-3 py-2.5 font-medium">Claims</th>
                      <th className="px-3 py-2.5 font-medium">Redemptions</th>
                      <th className="px-4 py-2.5 text-right font-medium">
                        Score
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {athletes.map((a) => (
                      <tr key={a.name}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{a.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-faint">
                            {a.sport} <SourceLabel source={a.source} />
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          <CountUp value={a.views} />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          {a.engagement}%
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-muted">
                          <CountUp value={a.claims} />
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          <CountUp value={a.redeemed} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="flex justify-end">
                            <ScoreRing value={a.score} size={34} />
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="border-t border-line px-4 py-3 text-[10px] leading-relaxed text-faint">
                ⓘ §22&rsquo;s layers side by side: views &amp; engagement come
                from platform APIs and carry their own data-quality label per
                row; claims &amp; redemptions are our §16 event rows
                (Postgres); Score is the §14 Content Value Score. No unlabeled
                numbers.
              </p>
            </Card>
          </Chapter>
        </div>
      </div>
    </div>
  );
}
