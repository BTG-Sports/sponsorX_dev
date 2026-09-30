/* --------------------------------------------------------------------------
   Closing section — the skyscraper stop, from the "Join the movement"
   mockup of 2026-09-30, re-laid on the owner's note to fit one viewport
   with no scrolling: the copy and buttons sit on the left over a gradient
   ground, the features and the numbers sit in a glass panel on the right,
   and the footer is pinned to the bottom of the same stage. The two sides
   stay clear of the middle of the frame, where the drone looks up at the
   SPONSORX screen — that screen must not be obscured on desktop.

   Server components. On the 3D city, so every ink is `on-media` or a
   fixed-dark literal (the --sx-on-media rule).

   - ClosingCopy   "/// JOIN THE MOVEMENT ///", the two-tone heading, the
                   intro, "Get Started →" and "Watch Our Story ▶".
   - ClosingPanel  chamfered glass, glowing cyan outline, stacked: four
                   feature tiles in a 2×2 grid over the "THE NUMBERS"
                   sub-panel (its four counters in a 2×2 grid too) —
                   fixtures.networkStats, the four counters with a named
                   source (stats-must-be-retrievable), not the mockup's
                   figures.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { ReactNode } from "react";

import { CountUp } from "./count-up";
import { Magnetic, TiltSpot } from "./hero-fx";
import { networkStats } from "@/lib/fixtures";

const C = 24;
const NC = 18;

function ring(outer: string[], inner: string[]) {
  return `polygon(${[...outer, outer[0], ...inner, inner[0]].join(", ")})`;
}

const PLATE = `polygon(${C}px 0, calc(100% - ${C}px) 0, 100% ${C}px, 100% calc(100% - ${C}px), calc(100% - ${C}px) 100%, ${C}px 100%, 0 calc(100% - ${C}px), 0 ${C}px)`;
const RING = ring(
  [`${C}px 0`, `calc(100% - ${C}px) 0`, `100% ${C}px`, `100% calc(100% - ${C}px)`, `calc(100% - ${C}px) 100%`, `${C}px 100%`, `0 calc(100% - ${C}px)`, `0 ${C}px`],
  [`${C + 0.4}px 1px`, `1px ${C + 0.4}px`, `1px calc(100% - ${C + 0.4}px)`, `${C + 0.4}px calc(100% - 1px)`, `calc(100% - ${C + 0.4}px) calc(100% - 1px)`, `calc(100% - 1px) calc(100% - ${C + 0.4}px)`, `calc(100% - 1px) ${C + 0.4}px`, `calc(100% - ${C + 0.4}px) 1px`],
);
/** 2px ring of the panel's shape — the pointer spotlight runs on it. */
const RING2 = ring(
  [`${C}px 0`, `calc(100% - ${C}px) 0`, `100% ${C}px`, `100% calc(100% - ${C}px)`, `calc(100% - ${C}px) 100%`, `${C}px 100%`, `0 calc(100% - ${C}px)`, `0 ${C}px`],
  [`${C + 0.8}px 2px`, `2px ${C + 0.8}px`, `2px calc(100% - ${C + 0.8}px)`, `${C + 0.8}px calc(100% - 2px)`, `calc(100% - ${C + 0.8}px) calc(100% - 2px)`, `calc(100% - 2px) calc(100% - ${C + 0.8}px)`, `calc(100% - 2px) ${C + 0.8}px`, `calc(100% - ${C + 0.8}px) 2px`],
);

const NUM_PLATE = `polygon(0 0, 100% 0, 100% calc(100% - ${NC}px), calc(100% - ${NC}px) 100%, 0 100%)`;
const NUM_RING = ring(
  ["0 0", "100% 0", `100% calc(100% - ${NC}px)`, `calc(100% - ${NC}px) 100%`, "0 100%"],
  ["1px 1px", "1px calc(100% - 1px)", `calc(100% - ${NC + 0.4}px) calc(100% - 1px)`, `calc(100% - 1px) calc(100% - ${NC + 0.4}px)`, "calc(100% - 1px) 1px"],
);

/* ----------------------------------------------------------------- icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ShieldIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3Z" />
      <path d="M9.2 12l2 2 3.8-4" />
    </svg>
  );
}
function HandshakeIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M2.5 9.5 6 7l4 1.5L14 7l3.5 2.5M2.5 9.5v6l4 3M21.5 9.5v6l-4 3" />
      <path d="M6 7l4 4.5a1.8 1.8 0 0 0 2.6 0L14 10l3.5-.5M9.5 14l2.5 2.5M12 12l2.5 2.5M14.5 10l2.5 2.5" />
    </svg>
  );
}
function ChartIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M4 20h16M6 17v-5M10 17V9M14 17v-3M18 17V7" />
      <path d="M5 9.5 10 6l4 3 5-4" />
    </svg>
  );
}
function GlobeIcon({ className = "size-8" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17M5.5 7.5h13M5.5 16.5h13" />
    </svg>
  );
}
function AthletesIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="9" cy="8" r="2.6" />
      <circle cx="16.5" cy="9" r="2.1" />
      <path d="M3.5 18.5a5.5 5.5 0 0 1 11 0M14.5 18a4 4 0 0 1 6.5-2.5" />
    </svg>
  );
}
function MegaphoneIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M4 10v4a1 1 0 0 0 1 1h3l6 4V5L8 9H5a1 1 0 0 0-1 1Z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5M8 15l1.2 4.2a1 1 0 0 0 1 .8h1.3" />
    </svg>
  );
}
function PlayRingIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}
function StarIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
    </svg>
  );
}
function ArrowIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.2} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function PlayIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ data */

const FEATURES: { icon: (p: { className?: string }) => ReactNode; title: string; sub: string }[] = [
  { icon: ShieldIcon, title: "Verified Athletes", sub: "Real profiles. Real engagement." },
  { icon: HandshakeIcon, title: "Direct Collaboration", sub: "No middlemen. No hidden fees." },
  { icon: ChartIcon, title: "Track Performance", sub: "Real metrics. Real results." },
  { icon: GlobeIcon, title: "Global Reach", sub: "Athletes & brands worldwide." },
];

/** In networkStats order: athletes, campaigns, fan value, rewards. */
const NUMBER_ICONS = [AthletesIcon, MegaphoneIcon, PlayRingIcon, StarIcon] as const;

/* ------------------------------------------------------------------ copy */

export function ClosingCopy() {
  return (
    // Below lg every size is clamped on the screen so this, the panel and
    // the footer share one view: the intro shows from 800px tall and the
    // two buttons share a row.
    <div className="max-w-[31vw] text-on-media max-lg:max-w-none">
      <p className="flex items-center gap-2 whitespace-nowrap text-[clamp(10px,1.5svh,13px)] font-medium uppercase tracking-[0.24em] text-[#5ee0ff] lg:gap-3 lg:text-[13px] lg:tracking-[0.3em]">
        <span aria-hidden="true" className="sx-slashes">{"///"}</span>
        Join the movement
        <span aria-hidden="true" className="sx-slashes">{"///"}</span>
      </p>

      <h2 className="sx-wipe mt-[clamp(4px,1svh,12px)] text-[clamp(22px,min(7.4vw,4.4svh),44px)] font-bold lg:mt-3 lg:text-[clamp(30px,2.7vw,50px)] leading-[1.08] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]">
        Real Athletes.
        <br />
        <span className="sx-hero-gradient sx-hero-shimmer" data-text="Real Partnerships.">Real Partnerships.</span>
      </h2>

      <p className="mt-[clamp(4px,1svh,12px)] max-w-[440px] text-[clamp(13px,1.9svh,16px)] leading-[1.45] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:mt-4 lg:text-[17px] lg:[@media(max-height:800px)]:mt-3 lg:[@media(max-height:800px)]:text-[15px] max-lg:[@media(max-height:800px)]:hidden">
        Connect, collaborate and grow with verified athletes, trusted brands, and a global community.
      </p>

      {/* The last call to action: a pulse ring ripples out of "Get Started"
          (`sx-cta-pulse`); both lean toward a near pointer — capped at 5px,
          under half their 16px gap — and take a sheen on hover. */}
      <div className="mt-[clamp(10px,2svh,24px)] flex gap-3 lg:mt-6 lg:flex-wrap lg:gap-4 lg:[@media(max-height:800px)]:mt-4">
        <Magnetic className="sx-cta-pulse relative rounded-xl max-lg:flex-1" maxX={5} maxY={4}>
        <Link
          href="/login"
          className="sx-sheen group relative inline-flex h-[clamp(40px,5.6svh,46px)] flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#5ee0ff] to-[#2e9bf5] px-2 text-[clamp(12.5px,3.6vw,15px)] font-medium lg:h-[46px] lg:flex-none lg:gap-4 lg:px-9 lg:text-[15px] text-[#041018] shadow-[0_0_28px_rgba(94,224,255,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(94,224,255,.7)]"
        >
          Get Started
          <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        </Magnetic>
        <Magnetic className="max-lg:flex-1" maxX={5} maxY={4}>
        <Link
          href="#how-it-works"
          className="sx-sheen relative inline-flex h-[clamp(40px,5.6svh,46px)] flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#9fdfff]/50 bg-[#0a1428]/45 px-2 text-[clamp(12.5px,3.6vw,15px)] font-medium lg:h-[46px] lg:flex-none lg:gap-3 lg:px-7 lg:text-[15px] text-on-media shadow-[0_0_14px_rgba(94,224,255,.2)] backdrop-blur-lg transition-colors hover:border-[#5ee0ff] hover:bg-[#5ee0ff]/10"
        >
          <PlayIcon className="size-5 text-[#5ee0ff] lg:size-[22px]" />
          Watch Our Story
        </Link>
        </Magnetic>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

export function ClosingPanel({ className = "" }: { className?: string }) {
  return (
    // Rises in on arrival (`sx-rise`); with a fine pointer it tilts gently
    // and a spotlight runs round its outline; a scan line crosses the glass.
    <div className={`sx-rise relative text-on-media ${className}`} style={{ "--i": 1 } as React.CSSProperties}>
      <TiltSpot max={3}>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#071a33]/60 via-[#051024]/65 to-[#03091a]/78 backdrop-blur-xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PLATE }} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(94,224,255,.8))_drop-shadow(0_0_18px_rgba(46,155,245,.5))]"
      >
        <span className="absolute inset-0 bg-gradient-to-b from-[#bff0ff] via-[#5ee0ff]/80 to-[#2e9bf5]/70" style={{ clipPath: RING }} />
        <span className="sx-impact-spot absolute inset-0" style={{ clipPath: RING2 }} />
      </span>

      {/* Below lg: the four features become one row of icon + title (the
          sub-lines are desktop-only; the row goes under 650px tall) over a
          compact 2×2 of the numbers. */}
      <div className="relative flex flex-col gap-[clamp(8px,1.6svh,20px)] p-[clamp(12px,3.5vw,24px)] lg:gap-5 lg:p-6 lg:[@media(max-height:800px)]:gap-3 lg:[@media(max-height:800px)]:p-4">
        <ul className="grid grid-cols-4 gap-2 lg:grid-cols-2 lg:gap-x-4 lg:gap-y-5 lg:[@media(max-height:800px)]:gap-y-3 max-lg:[@media(max-height:650px)]:hidden">
          {FEATURES.map(({ icon: Icon, title, sub }, i) => (
            // the four icons glow in turn (`sx-glow-turn`)
            <li key={title} className="flex flex-col items-center text-center lg:px-2" style={{ "--i": i } as React.CSSProperties}>
              <Icon className="sx-glow-turn size-[clamp(22px,3.4svh,32px)] text-[#5ee0ff] [filter:drop-shadow(0_0_6px_rgba(94,224,255,.6))] lg:size-8" />
              <span className="mt-[clamp(4px,0.8svh,12px)] text-[clamp(10px,min(2.7vw,1.45svh),14px)] font-semibold leading-tight lg:mt-3 lg:text-[14px]">{title}</span>
              <span className="mt-1.5 hidden text-[11px] leading-[1.35] text-on-media/75 lg:block">{sub}</span>
            </li>
          ))}
        </ul>

        {/* THE NUMBERS */}
        <aside className="relative" aria-labelledby="numbers-title">
          <span aria-hidden="true" className="absolute inset-0 bg-[#061226]/70" style={{ clipPath: NUM_PLATE }} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_3px_rgba(94,224,255,.7))_drop-shadow(0_0_12px_rgba(46,155,245,.4))]"
          >
            <span className="absolute inset-0 bg-gradient-to-b from-[#5ee0ff]/90 to-[#2e9bf5]/60" style={{ clipPath: NUM_RING }} />
          </span>
          <div className="relative px-[clamp(12px,3.5vw,16px)] pb-[clamp(10px,1.6svh,16px)] pt-[clamp(8px,1.3svh,12px)] lg:px-4 lg:pb-4 lg:pt-3">
            <h3 id="numbers-title" className="text-[clamp(10px,1.4svh,11px)] font-semibold lg:text-[11px] uppercase tracking-[0.22em] text-[#5ee0ff]">
              The numbers
            </h3>
            <ul className="mt-[clamp(6px,1.1svh,10px)] grid grid-cols-2 gap-x-4 gap-y-[clamp(6px,1.1svh,10px)] lg:mt-2.5 lg:gap-y-2.5">
              {networkStats.map((s, i) => {
                const Icon = NUMBER_ICONS[i];
                return (
                  <li key={s.label} className="flex items-center gap-3" title={`Sample figure — will read ${s.source}`}>
                    <span className="grid size-[clamp(26px,3.8svh,32px)] shrink-0 place-items-center rounded-full border border-[#5ee0ff]/70 lg:size-8 text-[#5ee0ff] shadow-[0_0_10px_rgba(94,224,255,.4)]">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-[clamp(15px,2.2svh,17px)] font-bold leading-none text-[#5ee0ff] lg:text-[17px]">
                        <CountUp value={s.value} prefix={s.prefix} />
                      </span>
                      <span className="mt-1 block text-[10px] text-on-media/80">{s.label}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {/* P7-QA-02: fixtures.networkStats — not live. */}
            <p className="sr-only">Sample figures from fixture data. Live counts arrive with the public metrics read.</p>
          </div>
        </aside>
      </div>
      </TiltSpot>
    </div>
  );
}
