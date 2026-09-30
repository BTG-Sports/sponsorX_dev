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
    <div className="max-w-[31vw] text-on-media max-lg:max-w-none">
      <p className="flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.3em] text-[#5ee0ff]">
        <span aria-hidden="true">{"///"}</span>
        Join the movement
        <span aria-hidden="true">{"///"}</span>
      </p>

      <h2 className="mt-3 text-[clamp(30px,2.7vw,50px)] font-bold leading-[1.08] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]">
        Real Athletes.
        <br />
        <span className="sx-hero-gradient">Real Partnerships.</span>
      </h2>

      <p className="mt-4 max-w-[440px] text-[17px] leading-[1.45] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] [@media(max-height:800px)]:mt-3 [@media(max-height:800px)]:text-[15px]">
        Connect, collaborate and grow with verified athletes, trusted brands, and a global community.
      </p>

      <div className="mt-6 flex flex-wrap gap-4 [@media(max-height:800px)]:mt-4">
        <Link
          href="/login"
          className="group inline-flex h-[46px] items-center gap-4 rounded-xl bg-gradient-to-r from-[#5ee0ff] to-[#2e9bf5] px-9 text-[15px] font-medium text-[#041018] shadow-[0_0_28px_rgba(94,224,255,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_38px_rgba(94,224,255,.7)]"
        >
          Get Started
          <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="#how-it-works"
          className="inline-flex h-[46px] items-center gap-3 rounded-xl border border-[#9fdfff]/50 bg-[#0a1428]/45 px-7 text-[15px] font-medium text-on-media shadow-[0_0_14px_rgba(94,224,255,.2)] backdrop-blur-lg transition-colors hover:border-[#5ee0ff] hover:bg-[#5ee0ff]/10"
        >
          <PlayIcon className="size-[22px] text-[#5ee0ff]" />
          Watch Our Story
        </Link>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

export function ClosingPanel({ className = "" }: { className?: string }) {
  return (
    <div className={`relative text-on-media ${className}`}>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#071a33]/60 via-[#051024]/65 to-[#03091a]/78 backdrop-blur-xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(94,224,255,.8))_drop-shadow(0_0_18px_rgba(46,155,245,.5))]"
      >
        <span className="absolute inset-0 bg-gradient-to-b from-[#bff0ff] via-[#5ee0ff]/80 to-[#2e9bf5]/70" style={{ clipPath: RING }} />
      </span>

      <div className="relative flex flex-col gap-5 p-6 [@media(max-height:800px)]:gap-3 [@media(max-height:800px)]:p-4">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-5 [@media(max-height:800px)]:gap-y-3">
          {FEATURES.map(({ icon: Icon, title, sub }) => (
            <li key={title} className="flex flex-col items-center px-2 text-center">
              <Icon className="size-8 text-[#5ee0ff] [filter:drop-shadow(0_0_6px_rgba(94,224,255,.6))]" />
              <span className="mt-3 text-[14px] font-semibold leading-tight">{title}</span>
              <span className="mt-1.5 text-[11px] leading-[1.35] text-on-media/75">{sub}</span>
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
          <div className="relative px-4 pb-4 pt-3">
            <h3 id="numbers-title" className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5ee0ff]">
              The numbers
            </h3>
            <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">
              {networkStats.map((s, i) => {
                const Icon = NUMBER_ICONS[i];
                return (
                  <li key={s.label} className="flex items-center gap-3" title={`Sample figure — will read ${s.source}`}>
                    <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#5ee0ff]/70 text-[#5ee0ff] shadow-[0_0_10px_rgba(94,224,255,.4)]">
                      <Icon className="size-4" />
                    </span>
                    <span>
                      <span className="block text-[17px] font-bold leading-none text-[#5ee0ff]">
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
    </div>
  );
}
