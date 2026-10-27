/* --------------------------------------------------------------------------
   How It Works stage — the 2D UI of /how-it-works (the owner, 2026-10-27:
   "finish the how it works page, design it based on the design you did on
   the other pages"). Until now the nav item was inert text; the landing's
   basketball stop (landing-steps.tsx) is the four-card teaser, and this is
   the whole story. Server components; the motion comes from the shared
   client islands (hero-fx, packages-fx).

   Like /packages and /get-started it is a fixed-dark "media" ground in both
   themes, so every ink is `on-media` or a fixed-dark literal (the
   --sx-on-media rule).

   Top to bottom:
   - HowHero        HUD eyebrow, the three-line headline, and the "THE LOOP"
                    card: the four sides — sponsor, BTG, athlete, fan — as
                    nodes on one ring, running clockwise.
   - InsideBand     (page) the §39 loop, stop by stop, as the marquee.
   - LoopTrack      the §39 loop on one glowing track, each stop tagged with
                    who does it (vertical below lg, as JoinPath).
   - SideCards      the four sides as tone-coloured glass cards (PathCards'
                    shape), each with its own four steps and one CTA.
   - Safeguards     what BTG checks, in JoinPromises' card style.
   - HowClose       the closing panel and the Phase 1 fine print.

   Every promise is the destination page's own — the athlete's minutes and
   review days (join-stage), the brief's "no card, no checkout", the
   property application's automatic approval, NEVER_ASKED — so this page
   can't drift from them.

   Tones: athlete blue, sponsor orange and venue green as /get-started; BTG
   the HUD cyan; fans the band's yellow.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { MegaphoneIcon, RunnerIcon, StadiumIcon } from "./get-started-stage";
import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { JOIN_MINUTES, REVIEW_DAYS } from "./join-stage";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { PackageGrid } from "./packages-fx";
import { Eyebrow, SectionHead, StepRule, chamfer } from "./packages-stage";
import { NEVER_ASKED } from "@/lib/join-flow";

/* ----------------------------------------------------------------- shapes */

const CARD = chamfer(14);
const CARD_RING = CARD.ring(1);
const CARD_SWEEP = CARD.ring(2);
const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const PANEL_SPOT = PANEL.ring(2);
/** Flat-topped hexagon, 0..48 box (as BriefSteps). */
const HEX = "M14 3h20l12 21-12 21H14L2 24Z";

const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

/* ------------------------------------------------------------------ icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function DownIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

/** BTG: matching — a target. */
export function TargetIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/** Fan: a QR code. */
export function QrIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 3h8v8H3V3Zm2 2v4h4V5H5Zm8-2h8v8h-8V3Zm2 2v4h4V5h-4ZM3 13h8v8H3v-8Zm2 2v4h4v-4H5Z" />
      <path d="M6 6h2v2H6zM16 6h2v2h-2zM6 16h2v2H6zM13 13h2v2h-2zM15 15h2v2h-2zM17 13h4v2h-4zM13 17h2v4h-2zM17 17h2v2h-2zM19 19h2v2h-2zM17 19h-2v2h2z" />
    </svg>
  );
}

export function ShieldIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 3 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

export function GuardianIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <circle cx="9" cy="6.5" r="3" />
      <circle cx="17" cy="10" r="2.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M13.8 16.2A4 4 0 0 1 21 18.6" />
    </svg>
  );
}

function LockIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2.5" />
    </svg>
  );
}

export function PulseIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ sides */

type SideKey = "sponsor" | "btg" | "athlete" | "fan" | "property";

const SIDES: Record<SideKey, { label: string; tone: string; icon: (p: { className?: string }) => ReactNode }> = {
  sponsor: { label: "Sponsor", tone: "#f97a1f", icon: MegaphoneIcon },
  btg: { label: "BTG", tone: "#7fd0ff", icon: TargetIcon },
  athlete: { label: "Athlete", tone: "#2e9bf5", icon: RunnerIcon },
  fan: { label: "Fan", tone: "#facc15", icon: QrIcon },
  property: { label: "Team or venue", tone: "#22c98d", icon: StadiumIcon },
};

/** A small "who does this" tag. */
function SideTag({ side }: { side: SideKey }) {
  const { label, tone } = SIDES[side];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3px] text-[9px] font-semibold uppercase tracking-[0.16em]"
      style={{ borderColor: `${tone}55`, color: tone, background: `${tone}12` }}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: tone, boxShadow: `0 0 6px ${tone}` }} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------- hero */

/** The ring's four nodes, clockwise from the top, and what each one does. */
const RING: { side: SideKey; does: string; at: string }[] = [
  { side: "sponsor", does: "Briefs the goal", at: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { side: "btg", does: "Matches & clears", at: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
  { side: "athlete", does: "Delivers", at: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2" },
  { side: "fan", does: "Redeems by QR", at: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
];

/** Chevrons on the ring between the nodes, pointing clockwise (SVG angles, y down). */
const CHEVRONS = [-45, 45, 135, 225].map((deg) => {
  const r = (deg * Math.PI) / 180;
  return { x: 100 + 78 * Math.cos(r), y: 100 + 78 * Math.sin(r), turn: deg + 90 };
});

function LoopCard() {
  return (
    <aside className="relative text-on-media" aria-labelledby="loop-card-title">
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
            <h2 id="loop-card-title" className="text-[12px] font-normal uppercase tracking-[0.24em] lg:text-[14px]">
              The Loop
            </h2>
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/60">4 sides &middot; 1 platform</span>
          </div>
          <StepRule className="-mr-5 mt-1 w-[calc(100%+20px)] lg:-mr-7 lg:w-[calc(100%+28px)]" />

          {/* the ring: four sides, clockwise, one platform in the middle */}
          <div aria-hidden="true" className="relative mx-auto mb-2 mt-9 aspect-square w-[min(220px,62vw)] lg:mt-10">
            <span className="sx-orbit absolute -inset-3 rounded-full border border-dashed border-[#7fd0ff]/25" />
            <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible">
              <defs>
                <linearGradient id="loop-ring" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#f97a1f" />
                  <stop offset="0.35" stopColor="#7fd0ff" />
                  <stop offset="0.65" stopColor="#2e9bf5" />
                  <stop offset="1" stopColor="#facc15" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="78" fill="none" stroke="url(#loop-ring)" strokeWidth="2" opacity="0.85" style={{ filter: "drop-shadow(0 0 6px rgba(46,155,245,.6))" }} />
              <circle cx="100" cy="100" r="58" fill="rgba(6,16,31,.55)" stroke="#9ed0ff" strokeOpacity="0.15" />
              {CHEVRONS.map(({ x, y, turn }) => (
                <path
                  key={turn}
                  d="M-4 -5 L3 0 L-4 5"
                  fill="none"
                  stroke="#d6ecff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${turn})`}
                />
              ))}
            </svg>
            <span className="absolute inset-0 grid place-items-center text-center">
              <span>
                <span className="block text-[22px] font-bold leading-none tracking-tight">One loop</span>
                <span className="mt-1.5 block text-[9px] uppercase tracking-[0.2em] text-on-media/60">Brief &rarr; report</span>
              </span>
            </span>
            {RING.map(({ side, at }, i) => {
              const { tone, icon: Icon } = SIDES[side];
              return (
                <span
                  key={side}
                  className={`sx-ping absolute grid size-12 place-items-center rounded-full border-[1.5px] bg-[#08172f] ${at}`}
                  style={{ borderColor: tone, color: tone, boxShadow: `0 0 16px ${tone}88, inset 0 0 10px ${tone}26`, "--ping": tone, "--ping-cycle": "8s", "--i": i } as CSSProperties}
                >
                  <Icon className="size-[22px]" />
                </span>
              );
            })}
          </div>

          <ul className="mt-8 grid grid-cols-2 gap-x-4 border-t border-[#a9d3ff]/15 pt-3">
            {RING.map(({ side, does }, i) => (
              <li key={side} className={`flex items-center gap-2.5 py-2 ${i > 1 ? "border-t border-[#a9d3ff]/10" : ""}`}>
                <span aria-hidden="true" className="font-mono text-[11px] text-on-media/45">{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: SIDES[side].tone }}>
                    {SIDES[side].label}
                  </span>
                  <span className="block truncate text-[13px] font-medium">{does}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </TiltSpot>
    </aside>
  );
}

export function HowHero() {
  return (
    <section className="relative isolate flex min-h-[min(100svh,960px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: receding grid floor, horizon glow, brand glows, outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_16%_14%,rgba(46,155,245,.24),transparent_62%),radial-gradient(50%_45%_at_86%_74%,rgba(249,122,31,.16),transparent_60%),radial-gradient(40%_40%_at_60%_100%,rgba(250,204,21,.08),transparent_65%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[44%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(90px,19vw,300px)] font-black uppercase leading-none tracking-tighter">
          Loop
        </p>
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:w-[55%]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-10 px-5 py-10 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,32vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
              <span>
                <ScrambleText text="How It Works" delay={0.1} />
                <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
                <ScrambleText text="The full loop" delay={0.35} />
              </span>
              <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
            </p>
          </div>

          <h1 className="mt-5 text-[clamp(38px,8.6vw,54px)] font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(48px,4.6vw,76px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Brands Brief.</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="Athletes Deliver.">Athletes Deliver.</span>
            </span>
            <span className="sx-stage-line block" style={reveal(0.36)}>
              <span className="sx-hero-gradient-accent">Fans Redeem.</span>
            </span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[540px] text-[15px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[17px]"
            style={reveal(0.3)}
          >
            SponsorX runs the whole sponsorship loop in one place &mdash; from a sponsor&rsquo;s brief, to the athlete
            who delivers it, to the fan who redeems the reward, to the report that shows it worked. BTG manages every
            step in between.
          </p>

          <div className="sx-stage-in mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6" style={reveal(0.42)}>
            <Magnetic className="max-sm:w-full">
              <Link
                href="#loop"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Follow the loop
                <DownIcon className="size-[18px] transition-transform group-hover:translate-y-0.5" />
              </Link>
            </Magnetic>
            <Magnetic className="max-sm:w-full">
              <Link
                href="#sides"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Find your side
                <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
          </div>
        </div>

        <div className="sx-stage-in w-full lg:justify-self-end" style={reveal(0.35)}>
          <LoopCard />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="sx-stage-in pointer-events-none relative mx-auto mb-6 hidden w-full max-w-[1320px] items-center gap-3 px-[6vw] lg:flex 2xl:px-0 [@media(max-height:820px)]:hidden"
        style={reveal(1)}
      >
        <span className="sx-scroll-cue relative block h-9 w-px overflow-hidden bg-on-media/20" />
        <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-on-media/60">Scroll the loop</span>
      </div>
    </section>
  );
}

/** The marquee under the hero: the §39 loop, stop by stop. */
export const LOOP_BAND = [
  "Athlete application",
  "Approval",
  "NIL rate card",
  "Sponsor brief",
  "Matching",
  "Invitation",
  "Campaign order",
  "Deliverable",
  "Fan reward",
  "Earnings",
  "Sponsor report",
] as const;

/* --------------------------------------------------------------- the loop */

/** §39's protected loop, as six stops — who does each, and what happens. */
const LOOP: { title: string; body: string; sides: SideKey[] }[] = [
  {
    title: "Athletes apply",
    body: `About ${JOIN_MINUTES} minutes. A person at BTG reviews it, usually within ${REVIEW_DAYS} business days, then sets a NIL rate for each job type.`,
    sides: ["athlete", "btg"],
  },
  {
    title: "Sponsors brief",
    body: "The goal, the budget and the market, in one brief. Start from a package or from scratch. No card, no checkout.",
    sides: ["sponsor"],
  },
  {
    title: "BTG matches",
    body: "Athletes picked for audience fit and engagement, not follower count, screened for conflicts and priced from their rate card.",
    sides: ["btg"],
  },
  {
    title: "Invite & order",
    body: "Every invitation is the athlete’s to accept or decline. Accepted ones become a Campaign Order with the deliverables spelled out.",
    sides: ["athlete", "sponsor"],
  },
  {
    title: "Deliver & redeem",
    body: "The content goes up or the appearance happens. The sponsor approves the content, and fans scan a QR code to claim the reward.",
    sides: ["athlete", "fan"],
  },
  {
    title: "Earn & report",
    body: "Each completed deliverable shows in the athlete’s earnings. The sponsor gets a results report built from the tracked events.",
    sides: ["athlete", "sponsor"],
  },
];

function LoopNode({ i, tone }: { i: number; tone: string }) {
  return (
    <span aria-hidden="true" className="relative grid size-[52px] shrink-0 place-items-center">
      <span className="sx-orbit absolute -inset-2 rounded-full border border-dashed opacity-50" style={{ borderColor: tone }} />
      <svg viewBox="0 0 48 48" className="sx-glow-turn absolute inset-0 size-full" style={{ color: tone, ...slot(i) }}>
        <path d={HEX} fill="rgba(6,16,31,.92)" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <span className="relative font-mono text-[14px] font-bold text-on-media">{String(i + 1).padStart(2, "0")}</span>
    </span>
  );
}

function LoopCopy({ stop, i, compact = false }: { stop: (typeof LOOP)[number]; i: number; compact?: boolean }) {
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-on-media/50">Step {String(i + 1).padStart(2, "0")}</p>
      <h3 className={`mt-1 font-semibold tracking-tight ${compact ? "text-[17px]" : "text-[18px]"}`}>{stop.title}</h3>
      <p className="mt-2 flex flex-wrap gap-1.5">
        {stop.sides.map((s) => (
          <SideTag key={s} side={s} />
        ))}
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-on-media/70">{stop.body}</p>
    </>
  );
}

export function LoopTrack() {
  return (
    <section id="loop" aria-labelledby="loop-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div id="loop-title">
        <SectionHead eyebrow="The loop" title="From application" accent="to sponsor report.">
          Six stops, in order. Every campaign on SponsorX runs this loop, and each stop is tagged with who does it.
        </SectionHead>
      </div>

      {/* lg+: one track, six stops */}
      <ol className="relative mt-16 hidden grid-cols-6 gap-6 lg:grid">
        <span aria-hidden="true" className="absolute left-[26px] right-[calc(100%/6-26px)] top-[26px] h-[2px] overflow-hidden rounded-full bg-gradient-to-r from-[#2e9bf5]/80 via-[#7fd0ff]/80 to-[#f97a1f]/80 shadow-[0_0_14px_rgba(46,155,245,.55)]">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-40" />
        </span>
        {LOOP.map((stop, i) => (
          <li key={stop.title} data-reveal="" style={slot(i)} className="relative">
            <LoopNode i={i} tone={SIDES[stop.sides[0]].tone} />
            <div className="mt-6">
              <LoopCopy stop={stop} i={i} />
            </div>
          </li>
        ))}
      </ol>

      {/* below lg: the same stops on a vertical rail */}
      <ol data-reveal="" className="relative mt-12 max-w-2xl space-y-8 lg:hidden">
        <span aria-hidden="true" className="absolute bottom-6 left-[25px] top-6 w-[2px] rounded-full bg-gradient-to-b from-[#2e9bf5]/80 via-[#7fd0ff]/80 to-[#f97a1f]/80 shadow-[0_0_12px_rgba(46,155,245,.5)]" />
        {LOOP.map((stop, i) => (
          <li key={stop.title} className="relative flex gap-5">
            <LoopNode i={i} tone={SIDES[stop.sides[0]].tone} />
            <div className="min-w-0 pt-1">
              <LoopCopy stop={stop} i={i} compact />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------- the sides */

type Side = {
  key: SideKey;
  who: string;
  title: string;
  steps: string[];
  cta?: { href: string; label: string };
  more?: { href: string; label: string };
  note?: string;
};

const SIDE_CARDS: Side[] = [
  {
    key: "sponsor",
    who: "For brands & sponsors",
    title: "You set the goal",
    steps: [
      "Pick a package or start from your goal",
      "Send a brief: about three minutes, no card",
      "BTG comes back with matched athletes and a quote",
      "Approve the content, then read the results report",
    ],
    cta: { href: "/brief", label: "Start my brief" },
    more: { href: "/packages", label: "See the packages" },
  },
  {
    key: "athlete",
    who: "For athletes",
    title: "You do the work you love",
    steps: [
      `Apply in about ${JOIN_MINUTES} minutes; a person reviews it`,
      "BTG sets your NIL rate for each job type",
      "Accept or decline every invitation",
      "Deliver, and watch your earnings update",
    ],
    cta: { href: "/join", label: "Start my application" },
    note: "Under 18? A parent or guardian joins you.",
  },
  {
    key: "property",
    who: "For teams, schools & venues",
    title: "You open the doors",
    steps: [
      "Apply with your organisation and contacts",
      "Approved automatically once documents and email check out",
      "List your inventory: events, media and spaces",
      "Track sales and earnings in your portal",
    ],
    cta: { href: "/onboarding", label: "Start my application" },
  },
  {
    key: "fan",
    who: "For fans",
    title: "You claim the reward",
    steps: [
      "Spot the QR at the event or on a post",
      "Scan it with your phone camera",
      "Claim the reward on the page that opens",
      "Show it where the sponsor tells you to",
    ],
    note: "No app and no account. Nothing to sign up for.",
  },
];

function SideCard({ s, index }: { s: Side; index: number }) {
  const { tone, icon: Icon } = SIDES[s.key];
  return (
    <li data-pkg="" data-reveal="" className="sx-pkg relative flex min-w-0 text-on-media" style={{ "--tone": tone, ...slot(index) } as CSSProperties}>
      <div className="sx-pkg-card relative flex w-full min-w-0">
        <Glass
          plate={CARD.plate}
          ringClip={CARD_RING}
          fill="bg-gradient-to-b from-[#0a1a30]/70 via-[#06101f]/75 to-[#040a16]/85"
          outline="bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/50 to-[#8fc8ff]/25"
        />
        {/* the side's tone bleeding in from the top edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ clipPath: CARD.plate, background: `radial-gradient(90% 55% at 50% 0%, ${tone}38, transparent 70%)` }}
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

        <div className="relative flex w-full min-w-0 flex-col px-5 pb-6 pt-7 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone }}>
              <span aria-hidden="true" className="h-px w-6 opacity-70" style={{ background: tone }} />
              {s.who}
            </p>
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f]/55"
              style={{ borderColor: tone, color: tone, boxShadow: `0 0 14px ${tone}88, inset 0 0 10px ${tone}26` }}
            >
              <Icon className="size-[22px]" />
            </span>
          </div>

          <h3 className="mt-3 text-[21px] font-semibold leading-tight tracking-tight">{s.title}</h3>

          <StepRule className="mt-4 -mr-6 w-[calc(100%+24px)]" />

          <ol className="mt-3 flex-1 space-y-3 text-[13px] text-on-media/85">
            {s.steps.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-px grid size-[22px] shrink-0 place-items-center rounded-[5px] border font-mono text-[10px] font-bold"
                  style={{ borderColor: `${tone}66`, color: tone, background: `${tone}14` }}
                >
                  {i + 1}
                </span>
                <span className="pt-[2px] leading-snug">{step}</span>
              </li>
            ))}
          </ol>

          {s.note && <p className="mt-4 text-[12px] leading-snug text-on-media/60">{s.note}</p>}

          {s.cta ? (
            <Link
              href={s.cta.href}
              className="sx-sheen group relative mt-5 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-[14px] font-medium text-white transition-[box-shadow,transform,border-color] hover:-translate-y-0.5"
              style={{ background: `linear-gradient(90deg, ${tone}e6, ${tone})`, boxShadow: `0 0 18px ${tone}88` }}
              aria-label={`${s.who} — ${s.cta.label.toLowerCase()}`}
            >
              {s.cta.label}
              <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          ) : (
            <span
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-[13px] font-medium"
              style={{ borderColor: `${tone}55`, color: tone, background: `${tone}10` }}
            >
              <QrIcon className="size-4" />
              Just scan
            </span>
          )}
          {s.more ? (
            <Link href={s.more.href} className="mt-3 text-center text-[12px] font-medium text-on-media/70 transition-colors hover:text-on-media">
              {s.more.label} &rarr;
            </Link>
          ) : (
            <span aria-hidden="true" className="mt-3 block h-[18px]" />
          )}
        </div>
      </div>
    </li>
  );
}

export function SideCards() {
  return (
    <section id="sides" aria-labelledby="sides-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="sides-title">
        <SectionHead eyebrow="Your side of it" title="Four sides," accent="one platform.">
          Wherever you stand in the loop, here is what you do and what BTG handles for you.
        </SectionHead>
      </div>
      <PackageGrid label="The four sides of SponsorX" className="mt-12 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
        {SIDE_CARDS.map((s, i) => (
          <SideCard key={s.key} s={s} index={i} />
        ))}
      </PackageGrid>
    </section>
  );
}

/* ------------------------------------------------------------- safeguards */

const SAFEGUARDS = [
  {
    icon: ShieldIcon,
    title: "Conflicts cleared first",
    body: "Every athlete is checked against the brief’s category and their own restrictions before an invitation goes out.",
  },
  {
    icon: GuardianIcon,
    title: "Minors are protected",
    body: "An athlete under 18 applies with a parent or guardian, who accepts the agreements with them.",
  },
  {
    icon: LockIcon,
    title: "Nothing sensitive collected",
    body: NEVER_ASKED,
  },
  {
    icon: PulseIcon,
    title: "Reports from real events",
    body: "Results come from what was tracked: delivered content and rewards redeemed by QR. They are not estimates.",
  },
] as const;

export function Safeguards() {
  return (
    <section aria-labelledby="safeguards-title" className="relative mx-auto w-full max-w-[1320px] px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="safeguards-title">
        <SectionHead eyebrow="What BTG checks" title="Fast where it can be." accent="Careful where it counts." />
      </div>

      <ul className="mt-12 grid gap-5 md:grid-cols-2 md:gap-7 xl:grid-cols-4">
        {SAFEGUARDS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} data-reveal="" style={slot(i)} className="relative">
            <div className="relative h-full px-6 pb-7 pt-7">
              <Glass
                plate={CARD.plate}
                ringClip={CARD_RING}
                fill="bg-gradient-to-b from-[#0a1a30]/65 via-[#06101f]/70 to-[#040a16]/85"
                outline="bg-gradient-to-br from-[#bfe0ff]/80 via-[#8fc8ff]/40 to-[#8fc8ff]/15"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ clipPath: CARD.plate, background: "radial-gradient(80% 50% at 20% 0%, rgba(34,201,141,.16), transparent 70%)" }}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: CARD.plate }}>
                <span className="absolute -bottom-5 -right-1 font-mono text-[112px] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.1)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="relative grid size-11 place-items-center rounded-full border-[1.5px] border-[#22c98d] bg-[#06151a]/70 text-[#22c98d] shadow-[0_0_14px_rgba(34,201,141,.45),inset_0_0_10px_rgba(34,201,141,.15)]">
                <Icon className="size-5" />
              </span>
              <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
              <p className="relative mt-2 max-w-[340px] text-[13px] leading-relaxed text-on-media/70">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ close */

export function HowClose() {
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
              <Eyebrow>Ready to run the loop?</Eyebrow>
              <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(34px,3vw,48px)]">
                Pick your side.{" "}
                <span className="sx-hero-gradient-accent sx-hero-shimmer" data-text="BTG runs the rest.">BTG runs the rest.</span>
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">
                Every path starts with a short application or brief, and your account is set up from it. Not sure
                which one is yours? Ask BTG &mdash; a person replies.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Magnetic>
                {/* the pulse ring sits on a wrapper: the button clips its own
                    sheen sweep, and the ring must not be clipped with it */}
                <span className="sx-cta-pulse relative block w-full rounded-xl">
                  <Link
                    href="/get-started"
                    className="sx-sheen group relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[15px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:px-9"
                  >
                    Get started
                    <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </span>
              </Magnetic>
              <Magnetic>
                <Link
                  href="/contact"
                  className="sx-sheen relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[15px] font-medium text-on-media backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:px-9"
                >
                  Talk to BTG
                </Link>
              </Magnetic>
            </div>
          </div>
        </TiltSpot>
      </div>

      <p data-reveal="" className="mt-8 max-w-3xl text-[11px] leading-relaxed text-on-media/50">
        SponsorX is a managed marketplace: sponsors request a brief and BTG quotes after matching. There is no
        self-service checkout, and money moves outside SponsorX.
      </p>
    </section>
  );
}
