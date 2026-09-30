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

   Effects (globals.css `.sx-step*`; none changes layout, all stand down for
   reduced motion):
   - the steps take turns being "active", 01 → 04 on a loop — outline
     flare, hex glow + swell, the lit tick stretching — so the four read
     as one running process;
   - arrival is staged from the flight stop's weight (`--sx-w`,
     flight-stop.tsx): the heading wipes in and the cards rise one after
     another as the drone settles over the court;
   - a dashed HUD orbit turns slowly round each hex badge;
   - a large outlined step numeral sits behind each card;
   - with a fine pointer a card tilts toward it and a spotlight runs round
     its outline (TiltSpot, hero-fx.tsx), the numeral drifting against it.
   -------------------------------------------------------------------------- */

import type { ReactNode } from "react";

import { TiltSpot } from "./hero-fx";

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

/** A 2px ring of the same shape — the active flare and the pointer
 *  spotlight run on it. */
const RING2 = `polygon(${[
  `${C}px 0`,
  `calc(100% - ${C}px) 0`,
  `100% ${C}px`,
  `100% calc(100% - ${C}px)`,
  `calc(100% - ${C}px) 100%`,
  `${C}px 100%`,
  `0 calc(100% - ${C}px)`,
  `0 ${C}px`,
  `${C}px 0`,
  `${C + 0.8}px 2px`,
  `2px ${C + 0.8}px`,
  `2px calc(100% - ${C + 0.8}px)`,
  `${C + 0.8}px calc(100% - 2px)`,
  `calc(100% - ${C + 0.8}px) calc(100% - 2px)`,
  `calc(100% - 2px) calc(100% - ${C + 0.8}px)`,
  `calc(100% - 2px) ${C + 0.8}px`,
  `calc(100% - ${C + 0.8}px) 2px`,
  `${C + 0.8}px 2px`,
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
    <span className="sx-step-hex relative grid size-[clamp(44px,min(13vw,7.4svh),72px)] shrink-0 place-items-center text-[#4fb0ff] [filter:drop-shadow(0_0_6px_rgba(120,190,255,.55))] lg:size-[80px]">
      {/* dashed HUD orbit, turning slowly */}
      <svg aria-hidden="true" viewBox="0 0 100 100" className="sx-orbit pointer-events-none absolute -inset-[18%] h-[136%] w-[136%]" fill="none">
        <circle cx="50" cy="50" r="48" stroke="#9ed0ff" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 5" />
        <circle cx="50" cy="2" r="1.6" fill="#bfe6ff" />
      </svg>
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

function StepCard({ n, title, body, icon: Icon, index }: (typeof STEPS)[number] & { index: number }) {
  return (
    // --i: the card's place in the process — staggers its arrival and its
    // turn in the active loop.
    <li className="sx-step relative text-on-media lg:min-h-[167px]" style={{ "--i": index } as React.CSSProperties}>
      <TiltSpot className="h-full">
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
        {/* active flare (its turn in the loop) and the pointer spotlight */}
        <span className="sx-step-lit absolute inset-0" style={{ clipPath: RING2 }} />
        <span className="sx-impact-spot absolute inset-0" style={{ clipPath: RING2 }} />
      </span>
      {/* large outlined step numeral behind the copy */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: PLATE }}>
        <span className="sx-step-num absolute -bottom-[0.18em] right-3 font-mono text-[clamp(56px,10svh,96px)] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.07)] lg:text-[118px] lg:[-webkit-text-stroke:1px_rgba(158,208,255,.12)]">
          {n}
        </span>
      </span>

      {/* Below lg the card is one compact row — badge, then number + title
          and the body — with every size a clamp on the screen's height and
          width, so it shrinks on a small phone and grows on a tall one or
          a tablet. The arrow goes; the lit tick moves onto the bottom edge.
          On the shortest screens (landscape) the body goes too. */}
      <div className="relative flex h-full flex-col px-[clamp(14px,4vw,22px)] py-[clamp(9px,1.7svh,18px)] lg:px-[22px] lg:pb-[30px] lg:pt-[18px]">
        <span className="hidden text-[13px] font-medium tracking-[0.1em] text-on-media/90 lg:block">{n}</span>
        <div className="flex items-center gap-[clamp(12px,3.6vw,24px)] lg:mt-[6px] lg:gap-7">
          <HexBadge>
            <Icon className="size-[clamp(20px,min(5.8vw,3.3svh),32px)] lg:size-9" />
          </HexBadge>
          <div className="min-w-0 flex-1">
            <h3 className="text-[clamp(15px,min(4.5vw,2.4svh),22px)] font-semibold leading-tight tracking-tight text-on-media lg:text-[22px]">
              <span className="mr-2 align-[0.1em] text-[0.62em] font-medium tracking-[0.1em] text-[#9ed0ff] lg:hidden">{n}</span>
              {title}
            </h3>
            <p className="mt-[clamp(2px,0.5svh,6px)] text-[clamp(12px,min(3.5vw,1.8svh),16px)] leading-[1.4] text-on-media/80 lg:mt-2 lg:text-[15px] lg:leading-[1.45] max-lg:[@media(max-height:560px)]:hidden">
              {body}
            </p>
          </div>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hidden size-5 shrink-0 self-start text-[#9ed0ff] lg:block"
            aria-hidden="true"
          >
            <path d="M4 12h16M14 6l6 6-6 6" />
          </svg>
        </div>
        {/* lit tick, bottom-left */}
        <span
          aria-hidden="true"
          className="sx-step-tick absolute bottom-0 left-[18px] h-px w-10 origin-left bg-[#9ed0ff] shadow-[0_0_8px_rgba(158,208,255,.9),0_0_16px_rgba(46,155,245,.6)] lg:bottom-[19px] lg:left-[26px] lg:w-[65px]"
        />
      </div>
      </TiltSpot>
    </li>
  );
}

export function HowItWorks() {
  return (
    <div className="w-full max-w-[1040px] text-on-media">
      {/* eyebrow: label, solid blue slanted dash, hairline out to the right.
          It repeats the heading, so short phones (≤700px tall) drop it. */}
      <p className="flex items-center gap-[clamp(10px,3vw,18px)] text-[clamp(10px,min(3vw,1.5svh),13px)] font-medium uppercase tracking-[0.28em] text-on-media/90 lg:gap-[18px] lg:text-[13px] max-lg:[@media(max-height:700px)]:hidden">
        How it works
        <span aria-hidden="true" className="h-[7px] w-9 shrink-0 -skew-x-[30deg] bg-[#2e9bf5]" />
        <span
          aria-hidden="true"
          className="h-px w-[280px] min-w-0 max-w-[30vw] bg-gradient-to-r from-[#bfe0ff]/70 to-transparent"
        />
      </p>

      <h2 className="sx-wipe mt-[clamp(4px,1svh,12px)] text-[clamp(28px,min(9vw,5svh),48px)] font-bold leading-[1.05] tracking-tight text-on-media [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:mt-3 lg:text-[clamp(38px,3.2vw,58px)] max-lg:[@media(max-height:700px)]:mt-0">
        How it <span className="text-[#4fb0ff]">works</span>
      </h2>

      {/* The intro goes on the shortest screens (≤600px: SE-size, landscape). */}
      <p className="mt-[clamp(4px,1svh,12px)] max-w-[400px] text-[clamp(13px,min(3.8vw,2svh),17px)] leading-[1.4] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:mt-3 lg:text-[17px] max-lg:[@media(max-height:600px)]:hidden">
        A marketplace for athletes, fans, and brands.
        <br className="hidden sm:block" /> Built to create real value, real opportunities,
        <br className="hidden sm:block" /> and real impact.
      </p>

      {/* One column of compact rows below lg (2×2 on a landscape phone); the mockup's 2×2 from lg. */}
      <ol className="mt-[clamp(12px,2.6svh,32px)] grid gap-[clamp(8px,1.5svh,18px)] lg:mt-8 lg:grid-cols-2 lg:gap-[30px] max-lg:[@media(max-height:560px)_and_(orientation:landscape)]:grid-cols-2">
        {STEPS.map((s, i) => (
          <StepCard key={s.n} index={i} {...s} />
        ))}
      </ol>
    </div>
  );
}
