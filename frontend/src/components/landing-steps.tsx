/* --------------------------------------------------------------------------
   "How it works" — the 2D UI of the basketball stop, 1:1 with the
   how-it-works mockup of 2026-09-30 (1821×864 reference). Server
   component. Sits straight on the 3D city, so every ink is `on-media` or a
   fixed-dark literal (the --sx-on-media rule).

   Left column, 8% in from the edge: the eyebrow ("HOW IT WORKS", a solid
   blue slanted dash, a hairline running out to the right), the two-tone
   heading, a three-line intro, then four step cards in a 2×2 grid. Each
   card is a chamfered glass plate: a clipped frosted fill, a one-pixel
   outline cut with a nonzero-winding clip-path ring that is brightest on
   the left and fades right, a drop-shadow on the wrapper so the outline
   glows, the step number top-left, a hexagonal badge with a solid blue
   glyph, title + body, an arrow at the right and a short lit tick at the
   bottom-left. Copy is the mockup's.
   -------------------------------------------------------------------------- */

import type { ReactNode } from "react";

/** Corner chamfer of the cards, in px. */
const C = 12;

/** Outer chamfered outline, then the 1px-inset inner outline traced the
 *  other way round, which punches it out and leaves a one-pixel ring. */
const RING = `polygon(${[
  `${C}px 0`,
  `calc(100% - ${C}px) 0`,
  `100% ${C}px`,
  `100% calc(100% - ${C}px)`,
  `calc(100% - ${C}px) 100%`,
  `${C}px 100%`,
  `0 calc(100% - ${C}px)`,
  `0 ${C}px`,
  `${C}px 0`,
  `${C + 0.4}px 1px`,
  `1px ${C + 0.4}px`,
  `1px calc(100% - ${C + 0.4}px)`,
  `${C + 0.4}px calc(100% - 1px)`,
  `calc(100% - ${C + 0.4}px) calc(100% - 1px)`,
  `calc(100% - 1px) calc(100% - ${C + 0.4}px)`,
  `calc(100% - 1px) ${C + 0.4}px`,
  `calc(100% - ${C + 0.4}px) 1px`,
  `${C + 0.4}px 1px`,
].join(", ")})`;

/** The glass fill, clipped to the chamfered shape. */
const PLATE = `polygon(${C}px 0, calc(100% - ${C}px) 0, 100% ${C}px, 100% calc(100% - ${C}px), calc(100% - ${C}px) 100%, ${C}px 100%, 0 calc(100% - ${C}px), 0 ${C}px)`;

/* ----------------------------------------------------------------- icons */

const GLYPH = {
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true,
} as const;

function GoalIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <path
        d="M12 3a9 9 0 1 0 9 9h-2.2A6.8 6.8 0 1 1 12 5.2V3Z"
        opacity="0.95"
      />
      <path d="M12 7.2a4.8 4.8 0 1 0 4.8 4.8h-2.1A2.7 2.7 0 1 1 12 9.3V7.2Z" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M21.5 2.5 12.9 11.1l1.4 1.4 8.6-8.6V2.5h-1.4Z" />
      <path d="M17 2h4.9v4.9L17 2Z" />
    </svg>
  );
}

function TeamIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <circle cx="12" cy="7.5" r="3.4" />
      <circle cx="5" cy="9" r="2.5" />
      <circle cx="19" cy="9" r="2.5" />
      <path d="M6 19.5a6 6 0 0 1 12 0v.5H6v-.5Z" />
      <path d="M0.8 18.2a4.3 4.3 0 0 1 6.2-3.9 7.9 7.9 0 0 0-2 4.7v1H.8v-1.8Z" />
      <path d="M23.2 18.2a4.3 4.3 0 0 0-6.2-3.9 7.9 7.9 0 0 1 2 4.7v1h4.2v-1.8Z" />
    </svg>
  );
}

function GrowthIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <rect x="3" y="14" width="4" height="7" rx="0.8" />
      <rect x="9.5" y="10.5" width="4" height="10.5" rx="0.8" />
      <rect x="16" y="7" width="4" height="14" rx="0.8" />
      <path d="M3.5 9.6 9 5.8l4.4 2.4L19.5 3.6l1.3 1.6-7.6 5.6-4.4-2.4-4.3 3-1-1.8Z" />
      <path d="M16.6 2.6h4.8v4.8l-4.8-4.8Z" />
    </svg>
  );
}

function TrophyIcon({ className = "size-9" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <path d="M7 2.5h10v6.2a5 5 0 0 1-10 0V2.5Z" />
      <path d="M4.5 4H7v2.2H5.8a1.7 1.7 0 0 0 0 3.4H7.3a5.1 5.1 0 0 0 .9 1.9 3.9 3.9 0 0 1-4.6-3.8V4h.9Z" />
      <path d="M19.5 4H17v2.2h1.2a1.7 1.7 0 0 1 0 3.4h-1.5a5.1 5.1 0 0 1-.9 1.9 3.9 3.9 0 0 0 4.6-3.8V4h-.9Z" />
      <path d="M10.5 14.3h3v3h-3z" />
      <path d="M7.5 17.3h9a1 1 0 0 1 1 1v1.7h-11v-1.7a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/* ----------------------------------------------------------------- steps */

const STEPS: { n: string; title: string; body: string; icon: (p: { className?: string }) => ReactNode }[] = [
  {
    n: "01",
    title: "Tell us the goal",
    body: "Objective, budget, and target category — one brief. No endless back and forth.",
    icon: GoalIcon,
  },
  {
    n: "02",
    title: "We match athletes",
    body: "Selected on engagement, content quality, and audience fit — not follower count.",
    icon: TeamIcon,
  },
  {
    n: "03",
    title: "Athletes create",
    body: "Content, appearances and other activations are delivered with authentic results.",
    icon: GrowthIcon,
  },
  {
    n: "04",
    title: "You get the numbers",
    body: "Track performance in real time with transparent reporting and attribution.",
    icon: TrophyIcon,
  },
];

/** Hexagonal badge — pointy top, glowing light-blue outline, dark glass fill. */
function HexBadge({ children }: { children: ReactNode }) {
  return (
    <span className="relative grid size-[80px] shrink-0 place-items-center text-[#4fb0ff] [filter:drop-shadow(0_0_6px_rgba(120,190,255,.55))]">
      <svg
        aria-hidden="true"
        viewBox="0 0 80 90"
        className="absolute inset-0 h-full w-full"
        fill="rgba(8,20,40,.6)"
        stroke="#9ed0ff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      >
        <polygon points="40,3 75,22 75,68 40,87 5,68 5,22" />
      </svg>
      <span className="relative">{children}</span>
    </span>
  );
}

function StepCard({ n, title, body, icon: Icon }: (typeof STEPS)[number]) {
  return (
    <li className="relative min-h-[167px] text-on-media">
      {/* glass */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#0a1a30]/55 via-[#06101f]/60 to-[#040a16]/72 backdrop-blur-xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      {/* glowing outline — brightest on the left, fading right */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_3px_rgba(120,190,255,.7))_drop-shadow(0_0_12px_rgba(46,155,245,.35))]"
      >
        <span
          className="absolute inset-0 bg-gradient-to-r from-[#bfe0ff] via-[#8fc8ff]/70 to-[#8fc8ff]/40"
          style={{ clipPath: RING }}
        />
      </span>

      <div className="relative flex h-full flex-col px-[22px] pb-[30px] pt-[18px]">
        <span className="text-[13px] font-medium tracking-[0.1em] text-on-media/90">{n}</span>
        <div className="mt-[6px] flex items-center gap-7">
          <HexBadge>
            <Icon className="size-9" />
          </HexBadge>
          <div className="min-w-0 flex-1">
            <h3 className="text-[22px] font-semibold leading-tight tracking-tight text-on-media">{title}</h3>
            <p className="mt-2 text-[15px] leading-[1.45] text-on-media/80">{body}</p>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0 self-start text-[#9ed0ff]"
            aria-hidden="true"
          >
            <path d="M4 12h16M14 6l6 6-6 6" />
          </svg>
        </div>
        {/* lit tick, bottom-left */}
        <span
          aria-hidden="true"
          className="absolute bottom-[19px] left-[26px] h-px w-[65px] bg-[#9ed0ff] shadow-[0_0_8px_rgba(158,208,255,.9),0_0_16px_rgba(46,155,245,.6)]"
        />
      </div>
    </li>
  );
}

export function HowItWorks() {
  return (
    <div className="w-full max-w-[1040px] text-on-media">
      {/* eyebrow: label, solid blue slanted dash, hairline out to the right */}
      <p className="flex items-center gap-[18px] text-[13px] font-medium uppercase tracking-[0.28em] text-on-media/90">
        How it works
        <span aria-hidden="true" className="h-[7px] w-9 -skew-x-[30deg] bg-[#2e9bf5]" />
        <span
          aria-hidden="true"
          className="h-px w-[280px] max-w-[30vw] bg-gradient-to-r from-[#bfe0ff]/70 to-transparent"
        />
      </p>

      <h2 className="mt-3 text-[clamp(38px,3.2vw,58px)] font-bold leading-[1.05] tracking-tight text-on-media [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]">
        How it <span className="text-[#4fb0ff]">works</span>
      </h2>

      <p className="mt-3 max-w-[400px] text-[17px] leading-[1.4] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)]">
        A marketplace for athletes, fans, and brands.
        <br className="hidden sm:block" /> Built to create real value, real opportunities,
        <br className="hidden sm:block" /> and real impact.
      </p>

      <ol className="mt-8 grid gap-[30px] md:grid-cols-2">
        {STEPS.map((s) => (
          <StepCard key={s.n} {...s} />
        ))}
      </ol>
    </div>
  );
}
