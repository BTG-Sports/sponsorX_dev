/* --------------------------------------------------------------------------
   "For sponsors" — the 2D UI of the soccer stop, 1:1 with the for-sponsors
   mockup of 2026-09-30 (1824×862 reference), minus the trusted-brands band
   and the real-time impact card, which the owner left out. Server
   component. Sits straight on the 3D city, so every ink is `on-media` or a
   fixed-dark literal (the --sx-on-media rule).

   The mockup's outer glass panel was dropped and the block mirrored to the
   right on the owner's notes (2026-09-30), on a right-side gradient ground
   like the hero's, then mirrored inside too — everything right-aligned,
   card order reversed, chamfers, pill and check marks flipped. The block:
   the eyebrow with its short line, the two-tone heading, a two-line intro,
   three feature items split by hairlines, a rule, then three package cards
   (chamfered glass with a glowing outline, the middle one lit brighter
   with a "MOST POPULAR" pill); "All six packages →" rides on the right
   end of the rule, just above the cards. The trusted-brands band from the hero closes the stop,
   with the tag inside it after "+ More". The "REAL
   ATHLETES. REAL IMPACT." tag with its two diagonal strokes sits in the
   stop's bottom-left corner. Copy is the mockup's — the package bullets
   still need reconciling with §7's definitions.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { ReactNode } from "react";

import { Magnetic } from "./hero-fx";
import { PackageCarousel } from "./package-carousel";

/** Cards: top-left and bottom-right corners chamfered, in px. */
const CC = 10;

/** Nonzero-winding ring — outer outline, then the 1px-inset inner outline
 *  traced the other way, which punches it out. */
function ring(outer: string[], inner: string[]) {
  return `polygon(${[...outer, outer[0], ...inner, inner[0]].join(", ")})`;
}

/** Mirrored (the block sits on the right): chamfers top-right and bottom-left. */
const CARD_PLATE = `polygon(0 0, calc(100% - ${CC}px) 0, 100% ${CC}px, 100% 100%, ${CC}px 100%, 0 calc(100% - ${CC}px))`;
/** The card's outline ring, `w` px wide. */
function cardRing(w: number) {
  const i = CC + w * 0.4;
  return ring(
    ["0 0", `calc(100% - ${CC}px) 0`, `100% ${CC}px`, "100% 100%", `${CC}px 100%`, `0 calc(100% - ${CC}px)`],
    [`${w}px ${w}px`, `${w}px calc(100% - ${i}px)`, `${i}px calc(100% - ${w}px)`, `calc(100% - ${w}px) calc(100% - ${w}px)`, `calc(100% - ${w}px) ${i}px`, `calc(100% - ${i}px) ${w}px`],
  );
}
const CARD_RING = cardRing(1);
/** The phone carousel's light sweep runs on a slightly heavier ring. */
const SWEEP_RING = cardRing(2);

/* ----------------------------------------------------------------- icons */

const GLYPH = { viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;

function AudienceIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <circle cx="12" cy="7.5" r="3.2" />
      <circle cx="5.5" cy="9" r="2.3" />
      <circle cx="18.5" cy="9" r="2.3" />
      <path d="M6.5 19.5a5.5 5.5 0 0 1 11 0v.5h-11v-.5Z" />
      <path d="M1.5 18.4a4 4 0 0 1 5.6-3.6 7.4 7.4 0 0 0-1.8 4.4v.8H1.5v-1.6Z" />
      <path d="M22.5 18.4a4 4 0 0 0-5.6-3.6 7.4 7.4 0 0 1 1.8 4.4v.8h3.8v-1.6Z" />
    </svg>
  );
}

function ResultsIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <rect x="3.5" y="13" width="3.6" height="7.5" rx="0.8" />
      <rect x="10.2" y="9.5" width="3.6" height="11" rx="0.8" />
      <rect x="16.9" y="6" width="3.6" height="14.5" rx="0.8" />
      <path d="M3.8 8.6 9 5.2l4.3 2.3 6.2-4.2 1.2 1.7-7.3 5-4.3-2.3-4.4 2.9-.9-1.9Z" />
    </svg>
  );
}

function PackagesIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...GLYPH} className={className}>
      <path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Zm0 2.2L5.6 7.9 12 11.1l6.4-3.2L12 4.7ZM5 9.6v6.2l6 3V12.6l-6-3Zm14 0-6 3v6.2l6-3V9.6Z" />
    </svg>
  );
}

function CheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function ArrowIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ data */

const FEATURES = [
  { icon: AudienceIcon, title: "Authentic Audience", sub: "Real athletes. Real communities." },
  { icon: ResultsIcon, title: "Measurable Results", sub: "Track, optimize, grow." },
  { icon: PackagesIcon, title: "Flexible Packages", sub: "Built for every brand." },
];

/** §7 packages as the mockup words them. Bullets are the mockup's — to be
 *  reconciled with the §7 definitions on /packages. Listed in tier order
 *  (the phone carousel's order); `order` mirrors them on the desktop row,
 *  Enterprise first. `tone` colours the carousel's glow and light sweep. */
const PACKAGES = [
  {
    tier: "Starter",
    tone: "#7fd0ff",
    order: "lg:order-3",
    name: "SponsorX Test Drive",
    price: "$750",
    per: "per campaign",
    tagline: "Low-commitment. High potential.",
    items: ["Brand placement (digital)", "Social media mentions", "Basic performance report"],
  },
  {
    tier: "Growth",
    tone: "#2e9bf5",
    order: "lg:order-2",
    name: "Community Campaign",
    price: "~$5,000",
    per: "per season",
    tagline: "Build awareness. Drive engagement.",
    items: ["Full season logo placement", "Dedicated content", "Custom brand integrations"],
    featured: true,
  },
  {
    tier: "Enterprise",
    tone: "#fb923c",
    order: "lg:order-1",
    name: "Season Partner",
    price: "$15K – $30K+",
    per: "per season",
    tagline: "Own the category. Maximize impact.",
    items: ["Premium placement (all channels)", "Exclusive events & activations", "Full analytics & reporting"],
  },
];

/* ----------------------------------------------------------------- parts */

/** Chamfered glass plate with a glowing one-pixel outline — the panel and
 *  the cards share this (and /packages, packages-stage.tsx); `lit` is the
 *  featured card's brighter treatment. */
export function Glass({
  plate,
  ringClip,
  lit = false,
  fill,
  outline,
}: {
  plate: string;
  ringClip: string;
  lit?: boolean;
  fill: string;
  outline: string;
}) {
  return (
    <>
      <span aria-hidden="true" className={`absolute inset-0 backdrop-blur-xl backdrop-saturate-150 ${fill}`} style={{ clipPath: plate }} />
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0",
          lit
            ? "[filter:drop-shadow(0_0_4px_rgba(127,208,255,.9))_drop-shadow(0_0_16px_rgba(46,155,245,.55))]"
            : "[filter:drop-shadow(0_0_3px_rgba(120,190,255,.65))_drop-shadow(0_0_12px_rgba(46,155,245,.3))]",
        ].join(" ")}
      >
        <span className={`absolute inset-0 ${outline}`} style={{ clipPath: ringClip }} />
      </span>
    </>
  );
}

/**
 * One package. From lg it is the mockup's right-aligned card in the static
 * row. Below lg it is a slide of the phone carousel (package-carousel.tsx):
 * centred copy, sizes clamped on the screen's height so the card grows on a
 * tall phone and shrinks on a short one, and three phone-only layers the
 * carousel drives through `--d` / `--ad` (globals.css `.sx-pkg*`): the
 * outlined tier numeral drifting behind the copy, a holographic sheen
 * sliding across the glass, and a light sweep running round the outline of
 * the centred card only, in the tier's `tone`.
 */
function PackageCard({
  index,
  tier,
  tone,
  order,
  name,
  price,
  per,
  tagline,
  items,
  featured = false,
}: (typeof PACKAGES)[number] & { index: number }) {
  return (
    <li
      data-pkg=""
      data-featured={featured ? "" : undefined}
      className={`sx-pkg relative flex w-[var(--sx-card)] shrink-0 snap-center text-on-media lg:w-auto ${order}`}
      // --lgi: the card's slot in the desktop row (Enterprise first), which
      // staggers its arrival there.
      style={{ "--tone": tone, "--lgi": PACKAGES.length - 1 - index } as React.CSSProperties}
    >
      {/* The effects transform this inner box, never the <li>: Chrome measures
          snap positions on the transformed box, so a transformed snap item
          would move its own target mid-scroll and settle off-centre. */}
      <div className="sx-pkg-card relative flex w-full">
      <Glass
        plate={CARD_PLATE}
        ringClip={CARD_RING}
        lit={featured}
        fill={
          featured
            ? "bg-gradient-to-b from-[#0c2244]/65 via-[#081733]/68 to-[#050d1e]/78"
            : "bg-gradient-to-b from-[#0a1a30]/58 via-[#06101f]/62 to-[#040a16]/74"
        }
        outline={featured ? "bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff] to-[#7fd0ff]/80" : "bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/60 to-[#8fc8ff]/40"}
      />
      {/* Effect layers (globals.css `.sx-pkg*`). Phone: the carousel drives
          the sheen, numeral and sweep through --d. Desktop: the pointer
          drives a spotlight on the outline, a glare on the glass and the
          tilt (--mx/--my/--rx/--ry, package-carousel.tsx); the sweep runs on
          the hovered card, or the featured one when nothing is hovered. */}
      <span aria-hidden="true" className="sx-pkg-sheen pointer-events-none absolute inset-0 lg:hidden" style={{ clipPath: CARD_PLATE }} />
      <span aria-hidden="true" className="sx-pkg-glare pointer-events-none absolute inset-0 hidden lg:block" style={{ clipPath: CARD_PLATE }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: CARD_PLATE }}>
        <span className="sx-pkg-num absolute -right-4 bottom-[22%] font-mono text-[clamp(90px,17svh,160px)] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.11)] lg:-bottom-3 lg:-left-2 lg:right-auto lg:text-[clamp(96px,11svh,128px)] lg:[-webkit-text-stroke:1px_rgba(158,208,255,.13)]">
          {String(index + 1).padStart(2, "0")}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_var(--tone))]"
      >
        <span className="sx-pkg-sweep absolute inset-0" style={{ clipPath: SWEEP_RING }} />
        <span className="sx-pkg-spot absolute inset-0 hidden lg:block" style={{ clipPath: SWEEP_RING }} />
      </span>

      {featured && (
        <span className="absolute -top-[11px] left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#2e9bf5] px-3 py-[4px] text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_12px_rgba(46,155,245,.8)] lg:left-auto lg:right-[22px] lg:translate-x-0">
          Most popular
        </span>
      )}

      <div className="relative flex w-full flex-col items-center px-[clamp(18px,5vw,26px)] pb-[clamp(14px,2.4svh,22px)] pt-[clamp(18px,3svh,30px)] text-center lg:items-end lg:px-[26px] lg:pb-[16px] lg:pt-[24px] lg:text-right lg:[@media(max-height:800px)]:pb-2.5 lg:[@media(max-height:800px)]:pt-4">
        <p className="flex items-center gap-2.5 text-[clamp(9px,1.4svh,11px)] font-semibold uppercase tracking-[0.22em] text-[#7fc4ff] short-landscape:hidden lg:text-[10px]">
          <span aria-hidden="true" className="h-px w-6 bg-[#7fc4ff]/60" />
          {tier}
          <span aria-hidden="true" className="h-px w-6 bg-[#7fc4ff]/60 lg:hidden" />
        </p>
        <h3 className="mt-[clamp(4px,1svh,10px)] text-[clamp(15px,min(4.9vw,2.5svh),21px)] font-semibold leading-tight tracking-tight lg:mt-2 lg:text-[18px]">{name}</h3>
        <p className="mt-[clamp(4px,1svh,10px)] flex items-center gap-1 max-lg:flex-col-reverse lg:mt-2 lg:items-baseline lg:gap-3">
          <span className="text-[clamp(10px,1.45svh,12px)] text-on-media/65 lg:text-[11px]">{per}</span>
          <span className="whitespace-nowrap text-[clamp(24px,min(8.4vw,4.3svh),40px)] font-bold leading-none tracking-tight lg:text-[30px]">{price}</span>
        </p>
        <p className="mt-[clamp(6px,1.3svh,12px)] text-[clamp(11px,min(3.1vw,1.6svh),13px)] text-on-media/75 lg:mt-3 lg:text-[12px] max-lg:[@media(max-height:600px)]:hidden">{tagline}</p>
        <ul className="mt-[clamp(6px,1.3svh,12px)] space-y-[clamp(3px,0.7svh,8px)] text-[clamp(11.5px,1.65svh,14px)] text-on-media/85 max-lg:text-left lg:mt-3 lg:space-y-1.5 lg:text-[12px]">
          {items.map((it) => (
            <li key={it} className="flex items-center justify-start gap-2.5 max-lg:flex-row-reverse max-lg:justify-end lg:justify-end">
              {it}
              <CheckIcon className="size-3.5 shrink-0 text-[#4fb0ff]" />
            </li>
          ))}
        </ul>
        <Link
          href="/packages"
          className={[
            "mt-[clamp(10px,2svh,20px)] inline-flex h-[clamp(36px,5.4svh,46px)] w-full items-center justify-center gap-1.5 rounded-md text-[clamp(12.5px,1.7svh,15px)] font-medium text-white transition-[box-shadow,transform] hover:-translate-y-0.5 lg:mt-5 lg:h-9 lg:text-[13px] lg:[@media(max-height:800px)]:mt-3",
            featured
              ? "bg-gradient-to-r from-[#4fb0ff] to-[#2e9bf5] shadow-[0_0_18px_rgba(46,155,245,.6)] hover:shadow-[0_0_26px_rgba(46,155,245,.8)]"
              : "border border-[#9cc7ff]/60 bg-[#07132a]/40 shadow-[0_0_10px_rgba(99,180,248,.2)] hover:border-[#bfe0ff] hover:shadow-[0_0_16px_rgba(99,180,248,.45)]",
          ].join(" ")}
        >
          Request a brief
          <ArrowIcon className="size-3" />
        </Link>
      </div>
      </div>
    </li>
  );
}

/** `index` staggers the feature's arrival and its turn in the radar ping. */
function Feature({
  icon: Icon,
  title,
  sub,
  index,
}: {
  icon: (p: { className?: string }) => ReactNode;
  title: string;
  sub: string;
  index: number;
}) {
  return (
    <li
      className="sx-rise flex flex-col-reverse items-center justify-end gap-1.5 text-center lg:flex-row lg:justify-start lg:gap-3.5 lg:text-right"
      style={{ "--i": index } as React.CSSProperties}
    >
      <span>
        <span className="block text-[clamp(11px,1.55svh,13px)] font-semibold leading-tight lg:text-[14px]">{title}</span>
        <span className="mt-0.5 hidden text-[11px] text-on-media/65 lg:block">{sub}</span>
      </span>
      <span className="sx-ping relative grid size-[clamp(28px,4.2svh,36px)] shrink-0 place-items-center rounded-full border-[1.5px] border-[#4fb0ff] bg-[#0b1a33]/60 text-[#4fb0ff] shadow-[0_0_12px_rgba(79,176,255,.5)] lg:size-9">
        <Icon className="size-4" />
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ main */

export function ForSponsors() {
  return (
    <div className="relative w-full max-w-[1195px] text-on-media">
      {/* Below lg: left-aligned, every size clamped on the screen so the
          whole stop is one view on any phone or tablet; the intro goes
          under 860px tall, the feature row under 640px, and the packages
          become the carousel (package-carousel.tsx); a phone held sideways
          puts the copy and the carousel side by side. */}
      <div className="relative flex flex-col items-start text-left short-landscape:grid short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] short-landscape:items-center short-landscape:gap-6 lg:items-end lg:pb-2 lg:pt-3 lg:text-right lg:[@media(max-height:800px)]:pt-1">
        <div className="flex w-full flex-col items-start lg:items-end">
        {/* eyebrow */}
        <p className="flex items-center gap-3 text-[clamp(10px,1.5svh,13px)] font-medium uppercase tracking-[0.28em] text-on-media/90 max-lg:flex-row-reverse lg:text-[13px]">
          <span aria-hidden="true" className="h-px w-10 bg-[#7fc4ff]/80" />
          For sponsors
        </p>

        <h2 className="sx-wipe-flip mt-[clamp(4px,0.9svh,10px)] text-[clamp(20px,min(6.6vw,4.2svh),40px)] font-bold leading-[1.1] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.6)] lg:mt-2 lg:text-[clamp(28px,2.5vw,46px)]">
          Strategic <span className="text-[#6cc0ff]">Partnerships.</span>
          <br />
          <span className="sx-hero-gradient sx-hero-shimmer" data-text="Real Measurable Impact.">Real Measurable Impact.</span>
        </h2>

        <p className="mt-[clamp(4px,0.9svh,10px)] max-w-[560px] text-[clamp(13px,1.9svh,16px)] leading-[1.4] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:mt-2 lg:text-[17px] lg:[@media(max-height:800px)]:text-[15px] max-lg:[@media(max-height:860px)]:hidden">
          Connect with athletes, activate your brand, and drive real business outcomes through authentic sports
          partnerships.
        </p>

        {/* feature items, split by hairlines (three columns below lg) */}
        <ul className="mt-[clamp(8px,1.8svh,20px)] grid w-full grid-cols-3 gap-2 lg:mt-5 lg:flex lg:w-auto lg:flex-wrap lg:items-center lg:justify-end lg:gap-x-7 lg:gap-y-3 lg:[@media(max-height:800px)]:mt-3 max-lg:[@media(max-height:640px)]:hidden">
          {FEATURES.map((f, i) => (
            <Feature key={f.title} index={i} {...f} />
          )).flatMap((el, i) =>
            i === 0 ? [el] : [<li key={`d${i}`} aria-hidden="true" className="hidden h-9 w-px bg-on-media/15 lg:block" />, el],
          )}
        </ul>

        {/* rule, with "All six packages" riding on its right end — a light
            runs along the rule into the button (`sx-rule-pulse`), which
            leans toward a near pointer and takes a sheen on hover */}
        <div className="relative mt-[clamp(8px,1.8svh,20px)] flex w-full items-center lg:mt-5 lg:[@media(max-height:800px)]:mt-3">
          <span aria-hidden="true" className="relative block h-px flex-1 overflow-hidden bg-gradient-to-l from-[#9cc7ff]/60 via-[#9cc7ff]/30 to-[#9cc7ff]/10">
            <span className="sx-rule-pulse absolute inset-y-0 left-0 w-24" />
          </span>
          <Magnetic className="ml-5 shrink-0">
            <Link
              href="/packages"
              className="sx-sheen relative inline-flex h-8 shrink-0 items-center gap-2 overflow-hidden rounded-md border border-[#9cc7ff]/55 bg-[#07132a]/70 px-3.5 text-[12px] font-medium text-white shadow-[0_0_12px_rgba(99,180,248,.35)] backdrop-blur-md transition-colors hover:border-[#bfe0ff]"
            >
              All six packages
              <ArrowIcon className="size-3" />
            </Link>
          </Magnetic>
        </div>

        </div>

        {/* packages — the phone carousel below lg, the mockup's row from lg */}
        <div className="mt-[clamp(0px,0.4svh,6px)] w-full lg:mt-5 lg:flex lg:justify-end lg:[@media(max-height:800px)]:mt-3">
          <PackageCarousel tiers={PACKAGES.map((p) => ({ label: p.tier, tone: p.tone }))} start={PACKAGES.findIndex((p) => p.featured)}>
            {PACKAGES.map((p, i) => (
              <PackageCard key={p.name} index={i} {...p} />
            ))}
          </PackageCarousel>
        </div>
      </div>

    </div>
  );
}

/** "REAL ATHLETES. REAL IMPACT." behind the band's slanted hairline — sits
 *  inside the trusted-brands band after "+ More", at the band's right end
 *  (the mockup's bottom strip). From 1784px, with the fifth brand: it sits
 *  in the band's right column after "+ More" (92 + 204px in a column of
 *  6vw + 256px), which leaves it ≥ 64px from the screen edge from there up
 *  (see FIT in landing-hero.tsx). */
export function SponsorsTag() {
  return (
    <div className="hidden shrink-0 items-center gap-5 pl-10 min-[1784px]:flex">
      <span aria-hidden="true" className="block h-[60px] w-px rotate-[22deg] bg-[#9cc7ff]/30" />
      <p className="text-[12px] font-medium uppercase leading-[1.8] tracking-[0.32em] text-on-media/90">
        Real athletes.
        <br />
        Real impact.
      </p>
    </div>
  );
}
