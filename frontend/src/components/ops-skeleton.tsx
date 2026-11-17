/* --------------------------------------------------------------------------
   POL-FE-105 — Mission Control's skeleton screens (owner, 2026-11-17: "when
   fetching data, always have a loader", with Facebook's and Medium's
   skeleton screens as the kind). While data is fetched, each card is drawn
   as its own outline — the icon, the title and subtitle lines, then the
   shape of what will land (rows, a ring, bars, a chart, a table) — in the
   stage's shimmering ghost blue (`.sx-ops-ghost`, globals.css), never a
   spinner over a blank page.

   Server components with no state: (board)/loading.tsx draws the whole
   dashboard from them, and the page hands the period-dependent ones to
   OpsFanSlot (ops-pending.tsx) as ReactNodes for a period change.
   -------------------------------------------------------------------------- */

import type { CSSProperties, ReactNode } from "react";

/** One grey shape. `w` / `h` are CSS lengths; `round` makes a pill or circle. */
export function Bone({ w = "100%", h = 10, round = false, className = "", style }: { w?: string | number; h?: string | number; round?: boolean; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`sx-ops-ghost block shrink-0 ${round ? "rounded-full" : "rounded-[4px]"} ${className}`} style={{ width: w, height: h, ...style }} />;
}

/** A card's header: icon tile, title line, subtitle line. */
export function SkHeader({ wide = false }: { wide?: boolean }) {
  return (
    <div className="flex items-start gap-3 px-5 pt-5">
      <Bone w={36} h={36} />
      <div className="min-w-0 flex-1 space-y-2 pt-0.5">
        <Bone w={wide ? "38%" : "52%"} h={12} round />
        <Bone w={wide ? "62%" : "82%"} h={8} round />
      </div>
    </div>
  );
}

/** A card frame: the chamfered panel with a skeleton header and `children` as body. */
export function SkCard({ className = "", wide = false, flush = false, children }: { className?: string; wide?: boolean; flush?: boolean; children: ReactNode }) {
  return (
    <div aria-hidden="true" className={`sx-ops-panel relative flex min-w-0 flex-col ${className}`}>
      <SkHeader wide={wide} />
      <div className={`flex flex-1 flex-col ${flush ? "pt-3" : "px-5 pb-5 pt-4"}`}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------- bodies */

/** The period line under the title. */
export function SkPeriodLine() {
  return <Bone w="min(100%, 30rem)" h={11} round className="my-[3px]" />;
}

/** A number card: icon + two lines, the figure, a ring, a foot line. */
export function SkKpi() {
  return (
    <div aria-hidden="true" className="sx-ops-panel relative flex min-h-[150px] min-w-0 flex-col p-4">
      <div className="flex items-center gap-2.5">
        <Bone w={32} h={32} />
        <div className="flex-1 space-y-1.5">
          <Bone w="45%" h={10} round />
          <Bone w="70%" h={8} round />
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Bone w={56} h={28} />
        <Bone w={64} h={64} round />
      </div>
      <Bone w="60%" h={8} round className="mt-auto" />
    </div>
  );
}

/** The chart: two legend entries, then the plot with its gridlines. */
export function SkChart() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col">
      <div className="flex gap-6">
        <Bone w={130} h={10} round />
        <Bone w={110} h={10} round />
      </div>
      <div className="mt-4 grid flex-1 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2">
        <div className="flex h-[240px] flex-col justify-between py-0.5">
          {[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={18} h={7} round className="ml-auto" />)}
        </div>
        <div className="relative h-[240px]">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="absolute inset-x-0 h-px bg-white/[0.05]" style={{ top: `${i * 25}%` }} />
          ))}
          <Bone w="100%" h="62%" className="absolute bottom-0 opacity-70 [clip-path:polygon(0_45%,12%_20%,24%_38%,36%_10%,50%_30%,62%_55%,74%_35%,88%_60%,100%_40%,100%_100%,0_100%)]" />
        </div>
        <span />
        <div className="mt-2 flex justify-between">
          {[0, 1, 2, 3].map((i) => <Bone key={i} w={36} h={7} round />)}
        </div>
      </div>
    </div>
  );
}

/** List rows: a mark, two lines, something on the right. */
export function SkRows({ rows = 5, mark = "bar", right = "count" }: { rows?: number; mark?: "bar" | "dot" | "tile"; right?: "count" | "pill" | "word" }) {
  return (
    <ul aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 border-t border-white/[0.06] px-5 py-3">
          {mark === "bar" ? <Bone w={4} h={30} round /> : mark === "dot" ? <Bone w={9} h={9} round /> : <Bone w={32} h={32} />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Bone w={`${58 - (i % 3) * 9}%`} h={10} round />
            <Bone w={`${40 - (i % 2) * 8}%`} h={8} round />
          </div>
          {right === "count" ? <Bone w={30} h={22} /> : right === "pill" ? <Bone w={104} h={20} round /> : <Bone w={64} h={9} round />}
        </li>
      ))}
    </ul>
  );
}

/** The delivery gauge: a ring and three stat lines. */
export function SkGauge() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-wrap items-center gap-5">
      <span className="grid size-[150px] place-items-center rounded-full border-[10px] border-[#1a2a42]">
        <Bone w={58} h={26} />
      </span>
      <div className="min-w-[9rem] flex-1 space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex justify-between gap-3">
            <Bone w="45%" h={9} round />
            <Bone w={36} h={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The fan journey: four columns, falling, with their labels, then a foot line. */
export function SkBars() {
  return (
    <div aria-hidden="true">
      <div className="flex h-[176px] items-end gap-3">
        {[92, 78, 46, 22].map((h, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <Bone w={22} h={9} round />
            <Bone w="100%" h={`${h}%`} style={{ maxWidth: 44 }} />
            <Bone w="70%" h={8} round />
          </div>
        ))}
      </div>
      <Bone w="70%" h={9} round className="mt-4" />
    </div>
  );
}

/** The athlete network: a donut and three legend rows, then the paid line. */
export function SkDonut() {
  return (
    <div aria-hidden="true" className="flex flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-5">
        <span className="grid size-[140px] place-items-center rounded-full border-[13px] border-[#1a2a42]">
          <Bone w={44} h={24} />
        </span>
        <div className="min-w-[9rem] flex-1 space-y-3.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Bone w={10} h={10} />
              <Bone w="55%" h={9} round />
              <Bone w={18} h={10} className="ml-auto" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto space-y-2 pt-5">
        <div className="flex justify-between">
          <Bone w="45%" h={9} round />
          <Bone w={80} h={9} round />
        </div>
        <Bone w="100%" h={6} round />
      </div>
    </div>
  );
}

/** The campaigns table: a header row and lines of tile · name · bar · figures. */
export function SkTable({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-4 border-y border-white/[0.06] bg-white/[0.02] px-5 py-3">
        <Bone w="16%" h={8} round />
        <Bone w="12%" h={8} round className="ml-[22%]" />
        <Bone w={48} h={8} round className="ml-auto" />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5 last:border-0">
          <Bone w={32} h={32} />
          <Bone w={`${22 - (i % 3) * 3}%`} h={11} round />
          <Bone w="30%" h={6} round className="ml-auto hidden sm:block" />
          <Bone w={52} h={10} round className="ml-auto sm:ml-0" />
          <Bone w={40} h={10} round className="hidden sm:block" />
        </div>
      ))}
    </div>
  );
}
