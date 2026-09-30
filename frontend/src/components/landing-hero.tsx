import Link from "next/link";
import type { ReactNode } from "react";

import { CountUp } from "./count-up";
import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { networkStats, trustedBrands } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Landing hero — the 2D UI of the plaza stop, a 1:1 of the hero mockup of
   2026-09-30 (1825×862 reference; positions below are its percentages).
   Server components. Everything sits straight on the 3D city, which is
   dark in both themes, so every ink is `on-media` or a fixed-dark literal
   (the --sx-on-media rule) — nothing here is on a themed surface.

   Top to bottom, as the mockup stacks them inside one viewport (the
   mockup's diagonal glow streaks are deliberately left out — the owner
   asked for them to go, 2026-09-30):

   - HeroEyebrow    "CONNECTING BRANDS / ATHLETES / FANS ——"
   - HeroActions    "Get Started →" (gradient) and "Learn More ▶" (outlined)
   - ImpactCard     the "REAL IMPACT" glass panel — three networkStats rows,
                    each a link to the stop that explains it. Figures are
                    fixtures and the card says so (P7-QA-02 — no public
                    metrics read exists yet).
   - TrustedBrands  the full-width "TRUSTED BY LEADING BRANDS" band with
                    slanted dividers; text wordmarks from
                    fixtures.trustedBrands (mockup names, not partners —
                    same fixture rule; no logo assets).
   - PlatformStrip  the "THE PLATFORM · A smarter way to sponsor, engage and
                    grow." band with the "SPONSORX · BUILT FOR WHAT'S NEXT"
                    tag at its right — two tracked lines only. The mockup's
                    stepped corner plate, blue tab, circle mark and divider
                    were all dropped on the owner's call, 2026-09-30.
   -------------------------------------------------------------------------- */

/* ----------------------------------------------------------------- icons */

const ICON = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
} as const;

export function ArrowRightIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...ICON} strokeWidth={2} className={className}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

function PlayCircleIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...ICON} strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* The impact rings hold solid glyphs, as in the mockup. */

function BarsIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="7" width="4" height="13" rx="1" />
      <rect x="16" y="3.5" width="4" height="16.5" rx="1" />
    </svg>
  );
}

function MegaphoneIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 9.5A1.5 1.5 0 0 1 4.5 8H8l7-4.2v16.4L8 16H7.2l1 4a.8.8 0 0 1-.8 1H6.3a.8.8 0 0 1-.8-.6L4.4 16A1.5 1.5 0 0 1 3 14.5v-5Z" />
      <path d="M17 8.6a4.6 4.6 0 0 1 0 6.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19.2 6.2a7.6 7.6 0 0 1 0 11.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function FansIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="9" cy="8" r="3.4" />
      <circle cx="16.8" cy="9" r="2.7" />
      <path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0Z" />
      <path d="M15.4 19.5c-.1-1.8-.8-3.4-1.9-4.6a4.6 4.6 0 0 1 7.7 4.6Z" />
    </svg>
  );
}

/** The impact rows use these, in networkStats order. */
const STAT_ICONS = [BarsIcon, MegaphoneIcon, FansIcon] as const;

/** Where each impact row sends the reader — the stop that explains it. */
const STAT_LINKS = ["#for-athletes", "#how-it-works", "#for-sponsors"] as const;

/* ------------------------------------------------------------------ hero */

export function HeroEyebrow() {
  return (
    <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
      {/* each word decodes in from scrambled glyphs after the loader (hero-fx) */}
      <span>
        <ScrambleText text="Connecting Brands" delay={0.1} />
        <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
        <ScrambleText text="Athletes" delay={0.35} />
        <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
        <ScrambleText text="Fans" delay={0.55} />
      </span>
      <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
    </p>
  );
}

/** Mockup buttons: 198×50, 12px radius, 15px labels. White label on the
 *  gradient is the mockup's call (1:1); it is under the P1-QA-02 4.5:1 bar
 *  on the lightest stop of the gradient. On a phone the two sit side by
 *  side, sharing the row, 44px tall. With a fine pointer both lean toward
 *  it as it nears (Magnetic) and a sheen sweeps across on hover (`sx-sheen`). */
export function HeroActions() {
  return (
    <div className="flex items-center gap-3 sm:flex-wrap sm:gap-6">
      <Magnetic className="max-sm:flex-1">
      <Link
        href="#start"
        className="sx-sheen group relative inline-flex h-11 flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-3 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[50px] sm:flex-none sm:gap-4 sm:px-10 sm:text-[15px]"
      >
        Get Started
        <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
      </Link>
      </Magnetic>
      <Magnetic className="max-sm:flex-1">
      <Link
        href="#how-it-works"
        className="sx-sheen relative inline-flex h-11 flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/40 px-3 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-primary-soft hover:bg-primary/15 sm:h-[50px] sm:flex-none sm:gap-4 sm:px-10 sm:text-[15px]"
      >
        Learn More
        <PlayCircleIcon className="size-[22px] text-on-media/85" />
      </Link>
      </Magnetic>
    </div>
  );
}

/* ----------------------------------------------------------- impact card */

/** The mockup shows three rows; the fourth counter (rewards redeemed)
 *  stays in the fixture for the portals. */
const IMPACT_ROWS = networkStats.slice(0, 3);

/** Chamfer on the panel's top-right corner, in px. */
const CHAMFER = 14;

/** The panel's outline: outer chamfered polygon, then the 1px-inset inner
 *  polygon traced the other way round, which punches it out (nonzero
 *  winding) and leaves a one-pixel ring with the chamfer. */
const RING = [
  "0 0",
  `calc(100% - ${CHAMFER}px) 0`,
  `100% ${CHAMFER}px`,
  "100% 100%",
  "0 100%",
  "0 0",
  "1px 1px",
  "1px calc(100% - 1px)",
  "calc(100% - 1px) calc(100% - 1px)",
  `calc(100% - 1px) ${CHAMFER + 0.4}px`,
  `calc(100% - ${CHAMFER + 0.4}px) 1px`,
  "1px 1px",
].join(", ");

/** The glass fill, clipped to the chamfered shape. */
const PLATE = `polygon(0 0, calc(100% - ${CHAMFER}px) 0, 100% ${CHAMFER}px, 100% 100%, 0 100%)`;

/** A 2px ring of the same shape — the pointer spotlight runs on it. */
const SPOT_RING = [
  "0 0",
  `calc(100% - ${CHAMFER}px) 0`,
  `100% ${CHAMFER}px`,
  "100% 100%",
  "0 100%",
  "0 0",
  "2px 2px",
  "2px calc(100% - 2px)",
  "calc(100% - 2px) calc(100% - 2px)",
  `calc(100% - 2px) ${CHAMFER + 0.8}px`,
  `calc(100% - ${CHAMFER + 0.8}px) 2px`,
  "2px 2px",
].join(", ");

/** Bright corner accents; the glow comes from the wrapper's drop-shadow. */
const ACCENT = "absolute bg-[#d6ecff]";

/**
 * The "REAL IMPACT" panel, 1:1 with the mockup. Layers:
 *   1. a clipped frosted-glass fill (the city shows through, blue-black
 *      tint, chamfered top-right corner);
 *   2. the outline — a one-pixel light-blue ring cut with clip-path, under
 *      a drop-shadow so the whole border glows; on top of it the bright
 *      bracket on the top-left corner, the lit chamfer on the top-right and
 *      a fainter bracket bottom-right (drop-shadow sits on the wrapper, not
 *      the clipped child, so the glow is not clipped with it);
 *   3. the content: title, the stepped title rule (runs to the right
 *      border), three rows of ring + solid glyph, number, label, arrow.
 * Over the glass a slow scan line passes every few seconds (`sx-scan`);
 * with a fine pointer the card tilts toward it and a spotlight runs round
 * the outline under it (TiltSpot, `sx-impact-spot`).
 */
export function ImpactCard({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <aside
      className={["relative text-on-media", className].join(" ")}
      style={style}
      aria-labelledby="impact-title"
    >
      <TiltSpot>
      {/* 1 · glass */}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#0d1f3d]/45 via-[#07122a]/55 to-[#04091a]/65 backdrop-blur-2xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      {/* scan line over the glass */}
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PLATE }} />

      {/* 2 · glowing outline (+ the pointer spotlight on a 2px ring) */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_3px_rgba(120,190,255,.85))_drop-shadow(0_0_14px_rgba(46,155,245,.45))]"
      >
        <span className="absolute inset-0 bg-[#a9d3ff]/75" style={{ clipPath: `polygon(${RING})` }} />
        <span className="sx-impact-spot absolute inset-0" style={{ clipPath: `polygon(${SPOT_RING})` }} />
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]"
      >
        {/* top-left bracket */}
        <span className={`${ACCENT} left-0 top-0 h-[34px] w-[2.5px]`} />
        <span className={`${ACCENT} left-0 top-0 h-[2.5px] w-[34px]`} />
        {/* lit chamfer, top-right */}
        <span className={`${ACCENT} top-0 h-[2px] w-[26px]`} style={{ right: CHAMFER }} />
        <span
          className={`${ACCENT} right-0 top-0 h-[2px] origin-top-right -rotate-45`}
          style={{ width: CHAMFER * Math.SQRT2 }}
        />
        <span className={`${ACCENT} right-0 h-[26px] w-[2px]`} style={{ top: CHAMFER }} />
        {/* bottom-right bracket, fainter */}
        <span className={`${ACCENT} bottom-0 right-0 h-[30px] w-[1.5px] opacity-70`} />
        <span className={`${ACCENT} bottom-0 right-0 h-[1.5px] w-[30px] opacity-70`} />
      </span>

      {/* 3 · content — below lg the rows become three columns of number
          and label (no rings, no arrows) so the card is one short band. */}
      <div className="relative px-4 pb-3 pt-3.5 lg:px-6 lg:pb-5 lg:pt-6">
        <h2
          id="impact-title"
          className="text-[11px] font-normal uppercase tracking-[0.2em] text-on-media lg:text-[15px]"
        >
          Real Impact
        </h2>
        {/* title rule: runs right, steps up, then continues to the border */}
        <svg
          aria-hidden="true"
          className="-mr-4 mt-1 block h-3 w-[calc(100%+16px)] text-[#a9d3ff] lg:-mr-6 lg:mt-2 lg:h-5 lg:w-[calc(100%+24px)]"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.7"
        >
          <path d="M0 19.5 H54 L64 6 H100" vectorEffect="non-scaling-stroke" strokeWidth="1" />
        </svg>

        <ul className="mt-1 grid grid-cols-3 lg:block">
          {IMPACT_ROWS.map((s, i) => {
            const Icon = STAT_ICONS[i];
            return (
              <li
                key={s.label}
                className={
                  i > 0
                    ? "border-l border-[#a9d3ff]/20 lg:border-l-0 lg:border-t lg:border-transparent lg:[border-image:linear-gradient(90deg,rgba(169,211,255,.45),rgba(169,211,255,.08))_1]"
                    : ""
                }
              >
                <Link
                  href={STAT_LINKS[i]}
                  title={`Sample figure — will read ${s.source}`}
                  className="group flex flex-col items-center px-1 py-1.5 text-center transition-colors hover:text-primary-soft lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-5 lg:px-0 lg:py-2.5 lg:text-left"
                >
                  <span className="hidden size-[52px] place-items-center rounded-full border-[1.5px] border-[#4fb0ff] bg-[#08172f]/55 text-[#4fb0ff] shadow-[0_0_14px_rgba(79,176,255,.55),inset_0_0_10px_rgba(79,176,255,.15)] lg:grid">
                    <Icon className="size-[24px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[22px] font-bold leading-none tracking-tight text-on-media lg:text-[26px]">
                      <CountUp value={s.value} prefix={s.prefix} />
                    </span>
                    <span className="mt-1 block text-[9px] font-normal uppercase leading-tight tracking-[0.05em] text-on-media/85 lg:mt-1.5 lg:truncate lg:text-[11px]">
                      {s.label}
                    </span>
                  </span>
                  <ArrowRightIcon className="hidden size-[18px] text-on-media/85 transition-transform group-hover:translate-x-1 lg:block" />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* P7-QA-02: fixtures.networkStats constants — no public metrics read
            exists yet. The mockup carries no footnote, so the provenance
            lives in each row's title tooltip and here for screen readers. */}
        <p className="sr-only">
          Sample figures from fixture data. Live counts arrive with the public
          metrics read.
        </p>
      </div>
      </TiltSpot>
    </aside>
  );
}

/* -------------------------------------------------------- trusted brands */

const WORDMARK = {
  italic: "text-[17px] font-extrabold italic lg:text-[22px]",
  lower: "text-[17px] font-extrabold lowercase lg:text-[22px]",
  upper: "text-[11px] font-extrabold uppercase tracking-[0.22em] lg:text-[13px]",
} as const;

/** Faint, tall, slanted hairline before an item — desktop only, centred in
 *  the gap (on the item's left edge; the items carry the gap as padding). */
const DIVIDER =
  "lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-[60px] lg:before:w-px lg:before:-translate-y-1/2 lg:before:rotate-[22deg] lg:before:bg-[#9cc7ff]/30";

/**
 * Desktop fit (owner, 2026-09-30). The band is three columns: two equal
 * side columns of 6vw + 256px (the label block's width) and the brands
 * between them, so the group is always centred on the band. The wordmarks
 * keep the mockup's size and spread evenly across the middle
 * (`justify-evenly` over an 80px minimum gap), so the spacing grows with
 * the screen instead of pooling at the sides; "+ More" follows the last
 * brand at the start of the right column. A brand only shows once, spread
 * out, it keeps at least 64px from the label and from "+ More" (and so
 * ≥ 104px between wordmarks); narrower, brands drop from the end rather
 * than anything shrinking or crowding. Per index, the screen width a brand
 * needs, from the rendered widths (wordmarks 50 / 79 / 90 / 157 / 139px,
 * 40px padding each side, middle = 0.88·width − 512px, and the spare
 * spread over n + 1 slots must give each ≥ 24px): three from 1212px, four
 * from 1508px, five from 1784px (two always). Re-derive if a brand, the
 * label or the padding changes. Phones show all five in the marquee.
 */
const FIT = ["", "", "lg:max-[1212px]:hidden", "lg:max-[1508px]:hidden", "lg:max-[1784px]:hidden"] as const;

function BrandItems({ from = 0, fit }: { from?: number; fit?: readonly string[] }) {
  return trustedBrands.map((b, i) => (
    <li
      key={b.name}
      className={[
        "relative flex shrink-0 items-center whitespace-nowrap px-4 text-on-media lg:px-10",
        b.logo ? "" : WORDMARK[b.style],
        i + from > 0 ? DIVIDER : "",
        fit?.[i] ?? "",
      ].join(" ")}
    >
      {b.logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- brand artwork, host-portable, no next/image optimizer
        <img src={b.logo} alt={b.name} className="h-6 w-auto lg:h-7" />
      ) : (
        b.name
      )}
    </li>
  ));
}

/**
 * `children` render after "+ More" (the sponsors stop puts its tag there).
 *
 * Below lg the band is one 56px line: the label as a small two-line tag on
 * the left and the wordmarks drifting past in a marquee (`sx-marquee`,
 * globals.css — two copies of the list, the second aria-hidden, so the loop
 * is seamless); "+ More" and the slanted plates are desktop-only. From lg
 * it is the three-column grid described at FIT.
 */
export function TrustedBrands({ children }: { children?: ReactNode }) {
  return (
    <div
      className={[
        "relative z-10 flex h-14 w-full items-center overflow-hidden text-on-media lg:grid lg:h-[76px] lg:grid-cols-[calc(6vw+256px)_minmax(0,1fr)_calc(6vw+256px)] max-lg:[@media(max-height:700px)]:h-12 lg:[@media(max-height:800px)]:h-[64px]",
        // frosted glass: the city shows through, tinted blue-black, lit from the top
        "bg-gradient-to-b from-[#0b1a33]/45 via-[#050b18]/50 to-[#03070f]/60 backdrop-blur-lg backdrop-saturate-150",
        // glowing top and bottom rules
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[#bfe0ff]/80 before:shadow-[0_0_10px_rgba(120,190,255,.9),0_0_22px_rgba(46,155,245,.55)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#9cc7ff]/50 after:shadow-[0_0_8px_rgba(99,180,248,.55)]",
      ].join(" ")}
      title="Sample — mockup brand names, not confirmed partners"
    >
      {/* label sits in its own darker, slanted plate with a lit edge */}
      <div className="relative flex h-full shrink-0 items-center pl-5 pr-3 lg:justify-self-start lg:pl-[6vw] lg:pr-16">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 -left-24 right-0 hidden -skew-x-[28deg] bg-[#02050b]/55 lg:block"
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-px -skew-x-[28deg] bg-[#bfe0ff]/60 shadow-[0_0_8px_rgba(120,190,255,.8)] lg:block"
        />
        <p className="relative w-[74px] text-[8px] uppercase leading-snug tracking-[0.15em] text-on-media/75 lg:w-auto lg:whitespace-nowrap lg:text-[10px] lg:tracking-[0.2em]">
          Trusted by leading brands
        </p>
      </div>

      <div className="sx-marquee-view relative flex h-full min-w-0 flex-1 items-center overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] lg:w-full lg:overflow-visible lg:[mask-image:none]">
        <div className="sx-marquee flex w-max items-center lg:w-full">
          <ul className="flex shrink-0 items-center lg:w-full lg:justify-evenly">
            <BrandItems fit={FIT} />
          </ul>
          <ul aria-hidden="true" className="flex shrink-0 items-center lg:hidden">
            <BrandItems from={1} />
          </ul>
        </div>
      </div>

      <div className="hidden h-full items-center lg:flex">
        <span className={`relative shrink-0 pl-10 text-[10px] uppercase tracking-[0.25em] text-on-media/70 ${DIVIDER}`}>
          + More
        </span>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- platform strip */

export function PlatformStrip() {
  return (
    <div className="relative z-10 flex w-full flex-wrap items-center justify-between gap-6 bg-gradient-to-b from-[#04080f]/70 to-[#02050a]/85 py-7 pl-[7.5vw] pr-[8vw] text-on-media backdrop-blur-lg [@media(max-height:800px)]:py-4">
      <div>
        <p className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.32em] text-primary-soft">
          <span aria-hidden="true" className="h-px w-6 bg-primary-soft" />
          The Platform
          <span aria-hidden="true" className="sx-hud-dashes ml-2" />
        </p>
        <h2 className="mt-3 text-[30px] font-bold leading-[1.1] tracking-tight sm:text-[34px]">
          A smarter way to
          <br />
          sponsor, engage and <span className="text-primary-soft">grow.</span>
        </h2>
      </div>

      <p className="text-[11px] font-medium uppercase tracking-[0.35em]">
        SponsorX
        <span className="mt-1.5 block text-[10px] tracking-[0.3em] text-on-media/60">
          Built for what&rsquo;s next
        </span>
      </p>
    </div>
  );
}
