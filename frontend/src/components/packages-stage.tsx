/* --------------------------------------------------------------------------
   Sponsor Package Catalog stage — the 2D UI of /packages (§9 screen 4 · §7),
   redesigned 2026-09-30 to carry the landing page's visual language (owner:
   "compare it to the landing page"). Server components; the two client
   islands are in packages-fx.tsx.

   The whole stage is a fixed-dark "media" ground in both themes, like the
   3D city behind the landing, so every ink is `on-media` or a fixed-dark
   literal (the --sx-on-media rule) — nothing here sits on a themed surface,
   and no themed token (primary, text, muted …) is used for text, because
   the light theme darkens those for white surfaces.

   Top to bottom:
   - PackagesHero   HUD eyebrow, the three-line headline wiping up out of a
                    mask, two CTAs, and the "THE RANGE" glass card — entry
                    price, ceiling, athlete range and package count, every
                    figure derived from the price list the page renders
                    (live or fallback — the card says which), plus a
                    log-scale bar per package. Behind it a receding
                    perspective grid, the brand glows and an outlined word.
   - InsideBand     the full-width frosted band: what the packages contain,
                    drifting past (job names on the live list, the fixture's
                    "includes" otherwise).
   - PriceLadder    every package placed on one log-scale price track, from
                    the first test to category ownership; each node jumps to
                    its card. Vertical list below md.
   - PackageCard    chamfered glass with a glowing outline, tier-toned; the
                    outlined tier numeral, an athlete meter, what's inside,
                    and "Request a brief". Pointer spotlight / tilt / sweep
                    from lg up — the `.sx-pkg*` rules the landing's package
                    row uses (globals.css), driven by PackageGrid.
   - BriefSteps     the managed flow in three steps (Phase 1 has no
                    self-service checkout, §17).
   - PackagesClose  the closing glass panel and the fine print.

   Entrance: the hero's pieces rise in (`sx-stage-in`, `sx-stage-line`) once
   `html[data-sx-loaded]` is set — by the boot screen on a hard load, by the
   page transition's reveal on a client move; everything below rises in as it
   scrolls into view (`[data-reveal]`, StageReveal). Reduced motion: no
   loops, no tilt; pieces simply appear.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CountUp } from "./count-up";
import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { PackageFilters, PackageGrid } from "./packages-fx";
import { INVENTORY_COPY, type InventoryState } from "@/lib/fixtures";
import { splitNumeral } from "@/lib/next-about";

/* ------------------------------------------------------------------ model */

/** One package, normalised from either the live price list or the fixture. */
export interface PackageView {
  /** Anchor id and the brief's `?package=` value. */
  key: string;
  /** §7 package code — live list only. */
  code?: string;
  name: string;
  /** One line under the name: the fixture note, or duration · exclusivity. */
  meta: string;
  price: string;
  /** Whole dollars. */
  low: number;
  high: number;
  /** "3", "5–10", "Recurring". */
  athletes: string;
  athleteMin: number | null;
  athleteMax: number | null;
  items: string[];
  featured: boolean;
  exclusive: boolean;
  /** Fixture inventory state — the live list carries none. */
  state?: InventoryState;
}

const TIERS = [
  { label: "Starter", tone: "#7fd0ff" },
  { label: "Growth", tone: "#2e9bf5" },
  { label: "Enterprise", tone: "#fb923c" },
] as const;

/** Thirds of the price-ordered list: Starter, Growth, Enterprise. */
const tierOf = (i: number, n: number) => TIERS[Math.min(2, Math.floor((i * 3) / Math.max(1, n)))];

const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** Price → 0..1 on a log scale across the list (a $750 test and a $30K
 *  season would crush every middle package together on a linear one). */
function scale(pkgs: PackageView[]) {
  const lo = Math.log(Math.max(1, Math.min(...pkgs.map((p) => p.low))));
  const hi = Math.log(Math.max(...pkgs.map((p) => p.high)));
  return (v: number) => (hi === lo ? 0.5 : (Math.log(Math.max(1, v)) - lo) / (hi - lo));
}

/** Headline figures, all derived from the list on the page. */
function rangeOf(pkgs: PackageView[]) {
  const entry = Math.min(...pkgs.map((p) => p.low));
  const top = pkgs.reduce((a, b) => (b.high > a.high ? b : a));
  const mins = pkgs.map((p) => p.athleteMin).filter((v): v is number => v != null);
  const maxs = pkgs.map((p) => p.athleteMax).filter((v): v is number => v != null);
  const aLo = mins.length ? Math.min(...mins) : null;
  const aHi = maxs.length ? Math.max(...maxs) : null;
  return {
    entry,
    ceiling: top.high,
    open: top.price.trim().endsWith("+"),
    athletes: aLo == null || aHi == null ? "—" : aLo === aHi ? `${aLo}` : `${aLo}–${aHi}`,
    count: pkgs.length,
  };
}

/* ----------------------------------------------------------------- shapes */

/** Chamfered plate (top-left and bottom-right corners cut by `cc` px) and
 *  its outline ring `w` px wide — the outer outline, then the inset inner
 *  one traced the other way, which punches it out (nonzero winding). */
export function chamfer(cc: number) {
  const plate = `polygon(${cc}px 0, 100% 0, 100% calc(100% - ${cc}px), calc(100% - ${cc}px) 100%, 0 100%, 0 ${cc}px)`;
  const ring = (w: number) => {
    const i = cc + w * 0.4;
    const outer = [`${cc}px 0`, "100% 0", `100% calc(100% - ${cc}px)`, `calc(100% - ${cc}px) 100%`, "0 100%", `0 ${cc}px`];
    const inner = [`${w}px ${i}px`, `${w}px calc(100% - ${w}px)`, `calc(100% - ${i}px) calc(100% - ${w}px)`, `calc(100% - ${w}px) calc(100% - ${i}px)`, `calc(100% - ${w}px) ${w}px`, `${i}px ${w}px`];
    return `polygon(${[...outer, outer[0], ...inner, inner[0]].join(", ")})`;
  };
  return { plate, ring };
}

const CARD = chamfer(14);
const CARD_RING = CARD.ring(1);
const CARD_SWEEP = CARD.ring(2);
const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const PANEL_SPOT = PANEL.ring(2);

/* ------------------------------------------------------------------ icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function CheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.6} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function DownIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

function TagIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h6.4a1.5 1.5 0 0 1 1.06.44l8.6 8.6a1.5 1.5 0 0 1 0 2.12l-6.4 6.4a1.5 1.5 0 0 1-2.12 0l-8.6-8.6A1.5 1.5 0 0 1 3 10.9V4.5Zm4.5 4.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
    </svg>
  );
}

function PeakIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M2 20 9 8l3.6 6.2L15 11l7 9H2Z" />
      <path d="M15 3h5v5l-1.8-1.8-3.4 3.4-1.4-1.4 3.4-3.4L15 3Z" />
    </svg>
  );
}

function RosterIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="9" cy="8" r="3.4" />
      <circle cx="16.8" cy="9" r="2.7" />
      <path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0Z" />
      <path d="M15.4 19.5c-.1-1.8-.8-3.4-1.9-4.6a4.6 4.6 0 0 1 7.7 4.6Z" />
    </svg>
  );
}

function StackIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Zm0 2.2L5.6 7.9 12 11.1l6.4-3.2L12 4.7ZM5 9.6v6.2l6 3V12.6l-6-3Zm14 0-6 3v6.2l6-3V9.6Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ parts */

/** Staggered entrance delay for a hero piece. */
const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
/** Stagger slot for a scroll-revealed piece. */
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-[#7fc4ff] ${className}`}>
      <span aria-hidden="true" className="h-px w-8 bg-[#7fc4ff]/80" />
      {children}
      <span aria-hidden="true" className="sx-hud-dashes ml-1" />
    </p>
  );
}

/** The stepped rule under a HUD title: runs right, steps up, carries on. */
export function StepRule({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={`block h-4 w-full text-[#a9d3ff] ${className}`}
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.6"
    >
      <path d="M0 19.5 H54 L64 6 H100" vectorEffect="non-scaling-stroke" strokeWidth="1" />
    </svg>
  );
}

/* ------------------------------------------------------------------- hero */

function RangeCard({ pkgs, live }: { pkgs: PackageView[]; live: boolean }) {
  const r = rangeOf(pkgs);
  const at = scale(pkgs);
  const rows = [
    { icon: TagIcon, value: <CountUp value={r.entry} prefix="$" />, label: "Entry package" },
    { icon: PeakIcon, value: <><CountUp value={r.ceiling} prefix="$" />{r.open ? "+" : ""}</>, label: "Season ceiling" },
    { icon: RosterIcon, value: r.athletes, label: "Athletes per campaign" },
    { icon: StackIcon, value: <CountUp value={r.count} />, label: "Standardized packages" },
  ];

  return (
    <aside className="relative text-on-media" aria-labelledby="range-title">
      <TiltSpot max={6}>
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          lit
          fill="bg-gradient-to-b from-[#0d1f3d]/60 via-[#07122a]/65 to-[#04091a]/80"
          outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/70 to-[#7fd0ff]/30"
        />
        <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PANEL.plate }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_rgba(127,208,255,.9))]">
          <span className="sx-impact-spot absolute inset-0" style={{ clipPath: PANEL_SPOT }} />
        </span>
        {/* bright brackets: top-right and bottom-left, the corners the chamfer leaves square */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]">
          <span className="absolute right-0 top-0 h-[30px] w-[2px] bg-[#d6ecff]" />
          <span className="absolute right-0 top-0 h-[2px] w-[30px] bg-[#d6ecff]" />
          <span className="absolute bottom-0 left-0 h-[26px] w-[1.5px] bg-[#d6ecff] opacity-70" />
          <span className="absolute bottom-0 left-0 h-[1.5px] w-[26px] bg-[#d6ecff] opacity-70" />
        </span>

        <div className="relative px-5 pb-5 pt-5 lg:px-7 lg:pb-6 lg:pt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="range-title" className="text-[12px] font-normal uppercase tracking-[0.24em] lg:text-[14px]">
              The Range
            </h2>
            <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/60">
              <span aria-hidden="true" className={`size-1.5 rounded-full ${live ? "bg-[#22c98d] shadow-[0_0_8px_#22c98d]" : "bg-[#facc15] shadow-[0_0_8px_#facc15]"}`} />
              {live ? "Live price list" : "Indicative"}
            </span>
          </div>
          <StepRule className="-mr-5 mt-1 w-[calc(100%+20px)] lg:-mr-7 lg:w-[calc(100%+28px)]" />

          <ul className="mt-2 grid grid-cols-2 gap-x-4 lg:grid-cols-1">
            {rows.map(({ icon: Icon, value, label }, i) => (
              <li
                key={label}
                className={[
                  "flex items-center gap-3 py-2.5 lg:gap-4 lg:py-3",
                  i > 1 ? "border-t border-[#a9d3ff]/15" : "",
                  i === 1 ? "lg:border-t lg:border-[#a9d3ff]/15" : "",
                ].join(" ")}
              >
                <span className="hidden size-11 shrink-0 place-items-center rounded-full border-[1.5px] border-[#4fb0ff] bg-[#08172f]/55 text-[#4fb0ff] shadow-[0_0_14px_rgba(79,176,255,.5),inset_0_0_10px_rgba(79,176,255,.15)] sm:grid">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[20px] font-bold leading-none tracking-tight lg:text-[26px]">{value}</span>
                  <span className="mt-1 block text-[9px] uppercase leading-tight tracking-[0.08em] text-on-media/75 lg:text-[11px]">{label}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* one bar per package, height on the same log scale as the ladder */}
          <div className="mt-3 border-t border-[#a9d3ff]/15 pt-4">
            <div aria-hidden="true" className="flex h-14 items-end gap-1.5">
              {pkgs.map((p, i) => {
                const t = tierOf(i, pkgs.length);
                return (
                  <span
                    key={p.key}
                    className="sx-bar relative flex-1 rounded-t-[2px]"
                    style={{
                      height: `${18 + at(p.low) * 82}%`,
                      background: `linear-gradient(to top, ${t.tone}22, ${t.tone})`,
                      boxShadow: `0 0 12px ${t.tone}66`,
                      ...slot(i),
                    }}
                  />
                );
              })}
            </div>
            <p className="mt-2 flex justify-between text-[9px] uppercase tracking-[0.18em] text-on-media/55">
              <span>Test drive</span>
              <span>Price ladder</span>
              <span>Season</span>
            </p>
          </div>
        </div>
      </TiltSpot>
    </aside>
  );
}

export function PackagesHero({ pkgs, live }: { pkgs: PackageView[]; live: boolean }) {
  return (
    <section className="relative isolate flex min-h-[min(100svh,980px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: receding grid floor, horizon glow, brand glows, outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_18%_12%,rgba(46,155,245,.22),transparent_62%),radial-gradient(55%_45%_at_88%_78%,rgba(249,122,31,.16),transparent_60%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(90px,19vw,300px)] font-black uppercase leading-none tracking-tighter">
          Packages
        </p>
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:w-[55%]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-10 px-5 py-10 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,32vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
              <span>
                <ScrambleText text="Sponsor Packages" delay={0.1} />
                <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
                <ScrambleText text="Phase 1" delay={0.35} />
              </span>
              <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
            </p>
          </div>

          <h1 className="mt-5 text-[clamp(38px,8.6vw,54px)] font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(48px,4.6vw,76px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Pick a Package.</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="We Match Athletes.">We Match Athletes.</span>
            </span>
            <span className="sx-stage-line block" style={reveal(0.36)}>You Measure Impact.</span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[520px] text-[15px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[17px]"
            style={reveal(0.3)}
          >
            Standardized ways to work with the SponsorX athlete network &mdash; priced, scoped and ready to
            brief. Pick a starting point; BTG matches the athletes, checks conflicts and handles the paperwork.
          </p>

          {/* Stacked full-width on a phone, side by side from sm: both labels are
              whitespace-nowrap, and as flex-1 items they never shrink below
              their text, so a row of the two overran a 360-390px screen. */}
          <div className="sx-stage-in mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6" style={reveal(0.42)}>
            <Magnetic className="max-sm:w-full">
              <Link
                href="#catalogue"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Explore packages
                <DownIcon className="size-[18px] transition-transform group-hover:translate-y-0.5" />
              </Link>
            </Magnetic>
            <Magnetic className="max-sm:w-full">
              <Link
                href="/brief"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Request a brief
                <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
          </div>
        </div>

        <div className="sx-stage-in w-full lg:justify-self-end" style={reveal(0.35)}>
          <RangeCard pkgs={pkgs} live={live} />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="sx-stage-in pointer-events-none relative mx-auto mb-6 hidden w-full max-w-[1320px] items-center gap-3 px-[6vw] lg:flex 2xl:px-0 [@media(max-height:820px)]:hidden"
        style={reveal(1)}
      >
        <span className="sx-scroll-cue relative block h-9 w-px overflow-hidden bg-on-media/20" />
        <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-on-media/60">Scroll the ladder</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ inside band */

/** A band item. A leading "NN " (the /next/about jobs) renders as a yellow
 *  display numeral; every other page's items carry none and are unchanged. */
function BandItems({ items }: { items: readonly string[] }) {
  return items.map((it) => {
    const { numeral, text } = splitNumeral(it);
    return (
      <li key={it} className="flex shrink-0 items-center gap-5 whitespace-nowrap pl-5 text-[12px] font-semibold uppercase tracking-[0.22em] text-on-media/85 lg:gap-8 lg:pl-8 lg:text-[13px]">
        <span aria-hidden="true" className="block size-1.5 rotate-45 bg-[#7fd0ff] shadow-[0_0_8px_#7fd0ff]" />
        {numeral ? (
          <span className="flex items-baseline gap-2">
            <span className="font-mag text-[17px] leading-none tracking-[0.06em] text-[#ffd12b] lg:text-[19px]">{numeral}</span>
            {text}
          </span>
        ) : (
          it
        )}
      </li>
    );
  });
}

export function InsideBand({ items, label = "What’s inside" }: { items: readonly string[]; label?: ReactNode }) {
  return (
    <div
      className={[
        "relative z-10 flex h-14 w-full items-center overflow-hidden text-on-media lg:h-[72px]",
        "bg-gradient-to-b from-[#0b1a33]/60 via-[#050b18]/70 to-[#03070f]/80 backdrop-blur-lg",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[#bfe0ff]/80 before:shadow-[0_0_10px_rgba(120,190,255,.9),0_0_22px_rgba(46,155,245,.55)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#9cc7ff]/50 after:shadow-[0_0_8px_rgba(99,180,248,.55)]",
      ].join(" ")}
    >
      <div className="relative z-10 flex h-full shrink-0 items-center pl-5 pr-6 sm:pl-[6vw] lg:pr-14">
        <span aria-hidden="true" className="absolute inset-y-0 -left-24 right-0 -skew-x-[28deg] bg-[#02050b]/80" />
        <span aria-hidden="true" className="absolute inset-y-0 right-0 w-px -skew-x-[28deg] bg-[#bfe0ff]/60 shadow-[0_0_8px_rgba(120,190,255,.8)]" />
        <p className="relative w-[64px] text-[8px] uppercase leading-snug tracking-[0.15em] text-on-media/75 lg:w-auto lg:whitespace-nowrap lg:text-[10px] lg:tracking-[0.2em]">
          {label}
        </p>
      </div>
      <div className="sx-marquee-view relative flex h-full min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_3%,#000_94%,transparent)]">
        <div className="sx-marquee-all flex w-max items-center">
          <ul className="flex shrink-0 items-center pl-4 pr-8">
            <BandItems items={items} />
          </ul>
          <ul aria-hidden="true" className="flex shrink-0 items-center pr-8">
            <BandItems items={items} />
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- price ladder */

export function SectionHead({
  eyebrow,
  title,
  accent,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  accent: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div data-reveal="" className={`max-w-2xl ${className}`}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(36px,3.2vw,52px)]">
        {title}{" "}
        <span className="sx-hero-gradient sx-hero-shimmer" data-text={accent}>{accent}</span>
      </h2>
      {children && <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">{children}</p>}
    </div>
  );
}

/** Axis ticks worth drawing, in dollars. */
const TICKS = [1_000, 2_500, 5_000, 10_000, 25_000];
const tickLabel = (v: number) => `$${v >= 1000 ? `${v / 1000}K` : v}`;

export function PriceLadder({ pkgs }: { pkgs: PackageView[] }) {
  const at = scale(pkgs);
  /** 0..1 → a left %, inset so the end labels stay on the stage. */
  const x = (v: number) => 5 + at(v) * 90;
  const lo = Math.min(...pkgs.map((p) => p.low));
  const hi = Math.max(...pkgs.map((p) => p.high));

  return (
    <section aria-labelledby="ladder-title" className="relative mx-auto w-full max-w-[1320px] px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div id="ladder-title">
        <SectionHead eyebrow="The ladder" title="From first test" accent="to category owner.">
          Every package on one price track. Start small, prove the result, then step up &mdash; the same athletes,
          the same reporting, a bigger footprint.
        </SectionHead>
      </div>

      {/* From 1240px: one horizontal log-scale track, labels alternating above
          and below. Narrower than that the 204px labels collide — the names
          wrap to different heights and 01/03 meet at 0px around 1137 — so the
          vertical ladder below takes over instead (owner, 2026-09-30). */}
      <div data-reveal="" className="sx-ladder relative mt-16 hidden h-[300px] min-[1240px]:block">
        {/* ticks */}
        {TICKS.filter((t) => t > lo && t < hi).map((t) => (
          <span key={t} aria-hidden="true" className="absolute inset-y-6 w-px bg-gradient-to-b from-transparent via-[#9cc7ff]/15 to-transparent" style={{ left: `${x(t)}%` }}>
            <span className="absolute left-2 top-[calc(50%+8px)] whitespace-nowrap font-mono text-[10px] tracking-wider text-on-media/40">{tickLabel(t)}</span>
          </span>
        ))}

        {/* track */}
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 overflow-hidden rounded-full bg-gradient-to-r from-[#7fd0ff]/70 via-[#2e9bf5]/80 to-[#fb923c]/80 shadow-[0_0_14px_rgba(46,155,245,.55)]">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-40" />
        </div>

        {/* price ranges, as glowing capsules on the label's side of the track */}
        {pkgs.map((p, i) => {
          if (p.high <= p.low) return null;
          const t = tierOf(i, pkgs.length);
          const up = i % 2 === 0;
          return (
            <span
              key={`r${p.key}`}
              aria-hidden="true"
              className="sx-ladder-range absolute h-[4px] rounded-full"
              style={{
                left: `${x(p.low)}%`,
                width: `${x(p.high) - x(p.low)}%`,
                top: up ? "calc(50% - 12px)" : "calc(50% + 8px)",
                background: `linear-gradient(90deg, ${t.tone}, ${t.tone}33)`,
                boxShadow: `0 0 10px ${t.tone}88`,
                ...slot(i),
              }}
            />
          );
        })}

        <ol className="contents">
          {pkgs.map((p, i) => {
            const t = tierOf(i, pkgs.length);
            const up = i % 2 === 0;
            const left = x(p.low);
            const align = left < 14 ? "left-0" : left > 86 ? "right-0" : "left-1/2 -translate-x-1/2";
            return (
              <li key={p.key} className="sx-ladder-node absolute inset-y-0" style={{ left: `${left}%`, "--tone": t.tone, ...slot(i) } as CSSProperties}>
                <a href={`#pkg-${p.key}`} className="group absolute inset-y-0 -left-3 w-6 outline-none" aria-label={`${p.name}, ${p.price} — jump to the package`}>
                  {/* stem */}
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-[var(--tone)] to-transparent opacity-60 transition-opacity group-hover:opacity-100"
                    style={up ? { bottom: "50%", height: 54, transform: "translateX(-50%) rotate(180deg)" } : { top: "50%", height: 54 }}
                  />
                  {/* node */}
                  <span
                    aria-hidden="true"
                    className="sx-ping absolute left-1/2 top-1/2 grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 bg-[#04070e] transition-transform duration-300 group-hover:scale-125 group-focus-visible:scale-125"
                    style={{ borderColor: t.tone, boxShadow: `0 0 14px ${t.tone}`, "--ping": t.tone, "--i": i } as CSSProperties}
                  >
                    <span className="size-1.5 rounded-full" style={{ background: t.tone }} />
                  </span>
                  {/* label */}
                  <span
                    className={`absolute w-[204px] ${align} rounded-lg border border-[#9cc7ff]/20 bg-[#06101f]/75 px-3.5 py-2.5 text-center backdrop-blur-md transition-[border-color,box-shadow,transform] duration-300 group-hover:border-[var(--tone)] group-hover:shadow-[0_0_22px_-4px_var(--tone)] group-focus-visible:border-[var(--tone)] ${up ? "group-hover:-translate-y-1" : "group-hover:translate-y-1"}`}
                    style={up ? { bottom: "calc(50% + 54px)" } : { top: "calc(50% + 54px)" }}
                  >
                    <span className="block text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: t.tone }}>
                      {String(i + 1).padStart(2, "0")} · {t.label}
                    </span>
                    <span className="mt-1 block truncate text-[13px] font-semibold text-on-media">{p.name}</span>
                    <span className="mt-0.5 block text-[15px] font-bold tracking-tight text-on-media">{p.price}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
      </div>

      {/* below 1240px: a vertical ladder, each rung's bar on the same scale */}
      {/* Capped from sm: it now serves laptop widths too, and full-bleed at
          1100px stranded the price a screen away from its name. */}
      <ol data-reveal="" className="relative mt-10 max-w-2xl space-y-2 min-[1240px]:hidden">
        <span aria-hidden="true" className="absolute bottom-5 left-[8px] top-5 w-[2px] rounded-full bg-gradient-to-b from-[#7fd0ff]/70 via-[#2e9bf5]/80 to-[#fb923c]/80 shadow-[0_0_12px_rgba(46,155,245,.5)]" />
        {pkgs.map((p, i) => {
          const t = tierOf(i, pkgs.length);
          return (
            <li key={p.key}>
              <a href={`#pkg-${p.key}`} className="relative flex items-center gap-4 rounded-lg py-2.5 pr-1">
                <span aria-hidden="true" className="relative z-10 grid size-[18px] shrink-0 place-items-center rounded-full border-2 bg-[#04070e]" style={{ borderColor: t.tone, boxShadow: `0 0 12px ${t.tone}` }}>
                  <span className="size-1.5 rounded-full" style={{ background: t.tone }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.22em]" style={{ color: t.tone }}>
                    {String(i + 1).padStart(2, "0")} · {t.label}
                  </span>
                  <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                  <span aria-hidden="true" className="mt-1.5 block h-[3px] w-full overflow-hidden rounded-full bg-on-media/10">
                    <span className="block h-full rounded-full" style={{ width: `${12 + at(p.high) * 88}%`, background: `linear-gradient(90deg, ${t.tone}55, ${t.tone})` }} />
                  </span>
                </span>
                <span className="shrink-0 text-right text-[14px] font-bold tracking-tight">{p.price}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------- catalogue */

const STATE_INK: Record<InventoryState, string> = {
  ACTIVE: "#22c98d",
  LIMITED: "#facc15",
  BOOKED: "#7fd0ff",
  SOLD_OUT: "#8a90a2",
};

/** Segments in the athlete meter; a full meter is METER_FULL athletes. */
const METER = 12;
const METER_FULL = 25;

function PackageCard({ p, index, count }: { p: PackageView; index: number; count: number }) {
  const t = tierOf(index, count);
  const lit = p.athleteMax == null ? METER : Math.max(1, Math.round((Math.min(p.athleteMax, METER_FULL) / METER_FULL) * METER));

  return (
    <li
      id={`pkg-${p.key}`}
      data-pkg=""
      data-reveal=""
      data-featured={p.featured ? "" : undefined}
      className="sx-pkg relative flex min-w-0 scroll-mt-28 text-on-media"
      style={{ "--tone": t.tone, ...slot(index % 3) } as CSSProperties}
    >
      <div className="sx-pkg-card relative flex w-full min-w-0">
        <Glass
          plate={CARD.plate}
          ringClip={CARD_RING}
          lit={p.featured}
          fill={
            p.featured
              ? "bg-gradient-to-b from-[#0c2244]/80 via-[#081733]/80 to-[#050d1e]/90"
              : "bg-gradient-to-b from-[#0a1a30]/70 via-[#06101f]/75 to-[#040a16]/85"
          }
          outline={p.featured ? "bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff] to-[#7fd0ff]/80" : "bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/50 to-[#8fc8ff]/25"}
        />
        {/* tier glow bleeding in from the top edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ clipPath: CARD.plate, background: `radial-gradient(90% 55% at 50% 0%, ${t.tone}33, transparent 70%)` }}
        />
        <span aria-hidden="true" className="sx-pkg-glare pointer-events-none absolute inset-0 hidden lg:block" style={{ clipPath: CARD.plate }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: CARD.plate }}>
          <span className="sx-pkg-num absolute -bottom-4 -right-2 font-mono text-[128px] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.12)]">
            {String(index + 1).padStart(2, "0")}
          </span>
        </span>
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_var(--tone))]">
          <span className="sx-pkg-sweep absolute inset-0" style={{ clipPath: CARD_SWEEP }} />
          <span className="sx-pkg-spot absolute inset-0 hidden lg:block" style={{ clipPath: CARD_SWEEP }} />
        </span>

        {p.featured && (
          <span className="absolute -top-[11px] right-6 z-10 whitespace-nowrap rounded-full bg-[#2e9bf5] px-3 py-[4px] text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_12px_rgba(46,155,245,.8)]">
            Most popular
          </span>
        )}

        <div className="relative flex w-full min-w-0 flex-col px-5 pb-6 pt-7 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: t.tone }}>
              <span aria-hidden="true" className="h-px w-6 opacity-70" style={{ background: t.tone }} />
              {t.label}
            </p>
            {p.code ? (
              <span className="rounded border border-[#9cc7ff]/30 px-2 py-0.5 font-mono text-[10px] tracking-wider text-on-media/70">{p.code}</span>
            ) : p.state ? (
              <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-on-media/75">
                <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: STATE_INK[p.state], boxShadow: `0 0 8px ${STATE_INK[p.state]}` }} />
                {INVENTORY_COPY[p.state]}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-[20px] font-semibold leading-tight tracking-tight">{p.name}</h3>
          <p className="mt-1 text-[12px] text-on-media/65">{p.meta}</p>

          {/* the range may wrap onto two lines on a phone ("$1,500–$3,000");
              the item is min-w-0 above so it never widens the grid instead */}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[clamp(26px,7.4vw,34px)] font-bold leading-none tracking-tight sm:text-[34px]">{p.price}</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-on-media/50">indicative</span>
          </p>

          {/* athlete meter */}
          <div className="mt-5">
            <p className="flex items-baseline justify-between text-[10px] uppercase tracking-[0.18em] text-on-media/60">
              <span>Athletes</span>
              <span className="text-[13px] font-semibold normal-case tracking-normal text-on-media">
                {p.athletes}
                {p.athleteMax != null && <span className="text-on-media/55"> {p.athleteMax === 1 ? "athlete" : "athletes"}</span>}
              </span>
            </p>
            <span aria-hidden="true" className="mt-2 flex gap-[3px]">
              {Array.from({ length: METER }, (_, s) => (
                <span
                  key={s}
                  className="sx-meter h-2 flex-1 -skew-x-[24deg] rounded-[1px]"
                  style={
                    s < lit
                      ? ({ background: t.tone, boxShadow: `0 0 6px ${t.tone}99`, "--s": s } as CSSProperties)
                      : { background: "rgba(158,208,255,.1)" }
                  }
                />
              ))}
            </span>
          </div>

          <StepRule className="mt-5 -mr-6 w-[calc(100%+24px)]" />

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-on-media/55">What&rsquo;s inside</p>
          <ul className="mt-2.5 flex-1 space-y-2 text-[13px] text-on-media/85">
            {p.items.map((it) => (
              <li key={it} className="flex items-start gap-2.5">
                <CheckIcon className="mt-[3px] size-3.5 shrink-0" />
                {it}
              </li>
            ))}
            {p.exclusive && (
              <li className="flex items-start gap-2.5">
                <CheckIcon className="mt-[3px] size-3.5 shrink-0" />
                Category exclusivity
              </li>
            )}
          </ul>

          <Link
            href={`/brief?package=${p.key}`}
            className={[
              "sx-sheen group relative mt-6 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-[14px] font-medium text-white transition-[box-shadow,transform,border-color] hover:-translate-y-0.5",
              p.featured
                ? "bg-gradient-to-r from-[#4fb0ff] to-[#2e9bf5] shadow-[0_0_18px_rgba(46,155,245,.6)] hover:shadow-[0_0_26px_rgba(46,155,245,.8)]"
                : "border border-[#9cc7ff]/55 bg-[#07132a]/50 shadow-[0_0_10px_rgba(99,180,248,.2)] hover:border-[#bfe0ff] hover:shadow-[0_0_16px_rgba(99,180,248,.45)]",
            ].join(" ")}
          >
            Request a brief
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </li>
  );
}

export function Catalogue({ pkgs }: { pkgs: PackageView[] }) {
  return (
    <section id="catalogue" aria-labelledby="catalogue-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div id="catalogue-title">
          <SectionHead eyebrow="The catalogue" title={`${WORDS[pkgs.length] ?? pkgs.length} packages.`} accent="Ready to brief." />
        </div>
        {/* §9.4's filters: a chip row from md, one "Filters" button opening
            a bottom sheet on a phone (packages-fx.tsx) */}
        <div data-reveal="" style={slot(1)}>
          <PackageFilters />
        </div>
      </div>

      <PackageGrid className="mt-12 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
        {pkgs.map((p, i) => (
          <PackageCard key={p.key} p={p} index={i} count={pkgs.length} />
        ))}
      </PackageGrid>
    </section>
  );
}

/* ------------------------------------------------------------ brief steps */

const STEPS = [
  ["Request a brief", "Tell BTG the goal, budget and market. No card, no checkout."],
  ["BTG matches athletes", "Eligibility, conflicts and rates are handled by BTG staff."],
  ["Campaign goes live", "You approve content; fans redeem rewards; you get an ROI report."],
] as const;

/** Flat-topped hexagon, 0..48 box. */
const HEX = "M14 3h20l12 21-12 21H14L2 24Z";

export function BriefSteps() {
  return (
    <section aria-labelledby="steps-title" className="relative mx-auto w-full max-w-[1320px] px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="steps-title">
        <SectionHead eyebrow="How it works" title="Managed," accent="end to end.">
          Phase 1 is a managed marketplace: you pick the play, BTG runs it.
        </SectionHead>
      </div>

      <ol className="relative mt-14 grid gap-5 md:grid-cols-3 md:gap-7">
        {/* the connecting line, with a light running along it */}
        <span aria-hidden="true" className="absolute left-[16%] right-[16%] top-[52px] hidden h-px overflow-hidden bg-gradient-to-r from-[#7fd0ff]/10 via-[#7fd0ff]/50 to-[#7fd0ff]/10 md:block">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-28" />
        </span>
        {STEPS.map(([title, body], i) => (
          <li key={title} data-reveal="" style={slot(i)} className="relative">
            <div className="relative h-full px-6 pb-7 pt-6 text-center">
              <Glass
                plate={CARD.plate}
                ringClip={CARD_RING}
                fill="bg-gradient-to-b from-[#0a1a30]/60 via-[#06101f]/65 to-[#040a16]/80"
                outline="bg-gradient-to-br from-[#bfe0ff]/70 via-[#8fc8ff]/35 to-[#8fc8ff]/15"
              />
              <span aria-hidden="true" className="relative mx-auto grid size-[58px] place-items-center">
                <span className="sx-orbit absolute -inset-2 rounded-full border border-dashed border-[#7fd0ff]/35" />
                <svg viewBox="0 0 48 48" className="sx-glow-turn absolute inset-0 size-full text-[#7fd0ff]" style={slot(i)}>
                  <path d={HEX} fill="rgba(8,23,47,.85)" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className="relative font-mono text-[16px] font-bold text-on-media">{String(i + 1).padStart(2, "0")}</span>
              </span>
              <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
              <p className="relative mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-on-media/70">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ close */

export function PackagesClose() {
  return (
    <section className="relative mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-[6vw] lg:pb-24 2xl:px-0">
      <div data-reveal="" className="relative overflow-visible">
        <TiltSpot max={3}>
          <Glass
            plate={PANEL.plate}
            ringClip={PANEL_RING}
            lit
            fill="bg-gradient-to-br from-[#0d1f3d]/80 via-[#07122a]/80 to-[#1a0f08]/80"
            outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#fb923c]/70"
          />
          <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PANEL.plate }} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_rgba(127,208,255,.9))]">
            <span className="sx-impact-spot absolute inset-0" style={{ clipPath: PANEL_SPOT }} />
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              clipPath: PANEL.plate,
              background: "radial-gradient(50% 90% at 100% 100%, rgba(249,122,31,.22), transparent 70%), radial-gradient(45% 80% at 0% 0%, rgba(46,155,245,.22), transparent 70%)",
            }}
          />

          <div className="relative grid gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14 lg:px-14 lg:py-14">
            <div>
              <Eyebrow>Not sure where to start?</Eyebrow>
              <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(34px,3vw,48px)]">
                Tell BTG the goal.{" "}
                <span className="sx-hero-gradient sx-hero-shimmer" data-text="We'll build the lineup.">We&rsquo;ll build the lineup.</span>
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">
                Share the market, the budget and what success looks like. BTG staff match athletes, clear conflicts
                and come back with a quote &mdash; no card, no checkout.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Magnetic>
                {/* the pulse ring sits on a wrapper: the button clips its own
                    sheen sweep, and the ring must not be clipped with it */}
                <span className="sx-cta-pulse relative block w-full rounded-xl">
                  <Link
                    href="/brief"
                    className="sx-sheen group relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[15px] sm:px-9 font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)]"
                  >
                    Request a brief
                    <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </span>
              </Magnetic>
              <Magnetic>
                <Link
                  href="/sponsor/marketplace"
                  className="sx-sheen relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[15px] sm:px-9 font-medium text-on-media backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15"
                >
                  Browse the full marketplace
                </Link>
              </Magnetic>
            </div>
          </div>
        </TiltSpot>
      </div>

      <p data-reveal="" className="mt-8 max-w-3xl text-[11px] leading-relaxed text-on-media/50">
        Phase 1 sponsors request or reserve &mdash; there is no self-service checkout until Phase 2. Prices are
        indicative; the final quote comes from BTG after matching.
      </p>
    </section>
  );
}
