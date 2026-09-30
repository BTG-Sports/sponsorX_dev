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

/** Cards: top-left and bottom-right corners chamfered, in px. */
const CC = 10;

/** Nonzero-winding ring — outer outline, then the 1px-inset inner outline
 *  traced the other way, which punches it out. */
function ring(outer: string[], inner: string[]) {
  return `polygon(${[...outer, outer[0], ...inner, inner[0]].join(", ")})`;
}

/** Mirrored (the block sits on the right): chamfers top-right and bottom-left. */
const CARD_PLATE = `polygon(0 0, calc(100% - ${CC}px) 0, 100% ${CC}px, 100% 100%, ${CC}px 100%, 0 calc(100% - ${CC}px))`;
const CARD_RING = ring(
  ["0 0", `calc(100% - ${CC}px) 0`, `100% ${CC}px`, "100% 100%", `${CC}px 100%`, `0 calc(100% - ${CC}px)`],
  ["1px 1px", `1px calc(100% - ${CC + 0.4}px)`, `${CC + 0.4}px calc(100% - 1px)`, "calc(100% - 1px) calc(100% - 1px)", `calc(100% - 1px) ${CC + 0.4}px`, `calc(100% - ${CC + 0.4}px) 1px`],
);

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
 *  reconciled with the §7 definitions on /packages. */
const PACKAGES = [
  {
    tier: "Starter",
    name: "SponsorX Test Drive",
    price: "$750",
    per: "per campaign",
    tagline: "Low-commitment. High potential.",
    items: ["Brand placement (digital)", "Social media mentions", "Basic performance report"],
  },
  {
    tier: "Growth",
    name: "Community Campaign",
    price: "~$5,000",
    per: "per season",
    tagline: "Build awareness. Drive engagement.",
    items: ["Full season logo placement", "Dedicated content", "Custom brand integrations"],
    featured: true,
  },
  {
    tier: "Enterprise",
    name: "Season Partner",
    price: "$15K – $30K+",
    per: "per season",
    tagline: "Own the category. Maximize impact.",
    items: ["Premium placement (all channels)", "Exclusive events & activations", "Full analytics & reporting"],
  },
];

/* ----------------------------------------------------------------- parts */

/** Chamfered glass plate with a glowing one-pixel outline — the panel and
 *  the cards share this; `lit` is the featured card's brighter treatment. */
function Glass({
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

function PackageCard({ tier, name, price, per, tagline, items, featured = false }: (typeof PACKAGES)[number]) {
  return (
    <li className="relative flex text-on-media">
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
      {featured && (
        <span className="absolute -top-[11px] right-[22px] rounded-full bg-[#2e9bf5] px-3 py-[4px] text-[9px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_0_12px_rgba(46,155,245,.8)]">
          Most popular
        </span>
      )}

      <div className="relative flex w-full flex-col items-end px-[26px] pb-[16px] pt-[24px] text-right [@media(max-height:800px)]:pb-2.5 [@media(max-height:800px)]:pt-4">
        <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7fc4ff]">
          <span aria-hidden="true" className="h-px w-6 bg-[#7fc4ff]/60" />
          {tier}
        </p>
        <h3 className="mt-2 text-[18px] font-semibold leading-tight tracking-tight">{name}</h3>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="text-[11px] text-on-media/65">{per}</span>
          <span className="text-[30px] font-bold leading-none tracking-tight">{price}</span>
        </p>
        <p className="mt-3 text-[12px] text-on-media/75">{tagline}</p>
        <ul className="mt-3 space-y-1.5 text-[12px] text-on-media/85">
          {items.map((it) => (
            <li key={it} className="flex items-center justify-end gap-2.5">
              {it}
              <CheckIcon className="size-3.5 shrink-0 text-[#4fb0ff]" />
            </li>
          ))}
        </ul>
        <Link
          href="/packages"
          className={[
            "mt-5 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md [@media(max-height:800px)]:mt-3 text-[13px] font-medium text-white transition-[box-shadow,transform] hover:-translate-y-0.5",
            featured
              ? "bg-gradient-to-r from-[#4fb0ff] to-[#2e9bf5] shadow-[0_0_18px_rgba(46,155,245,.6)] hover:shadow-[0_0_26px_rgba(46,155,245,.8)]"
              : "border border-[#9cc7ff]/60 bg-[#07132a]/40 shadow-[0_0_10px_rgba(99,180,248,.2)] hover:border-[#bfe0ff] hover:shadow-[0_0_16px_rgba(99,180,248,.45)]",
          ].join(" ")}
        >
          Request a brief
          <ArrowIcon className="size-3" />
        </Link>
      </div>
    </li>
  );
}

function Feature({ icon: Icon, title, sub }: { icon: (p: { className?: string }) => ReactNode; title: string; sub: string }) {
  return (
    <li className="flex items-center gap-3.5 text-right">
      <span>
        <span className="block text-[14px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[11px] text-on-media/65">{sub}</span>
      </span>
      <span className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-[#4fb0ff] bg-[#0b1a33]/60 text-[#4fb0ff] shadow-[0_0_12px_rgba(79,176,255,.5)]">
        <Icon className="size-4" />
      </span>
    </li>
  );
}

/* ------------------------------------------------------------------ main */

export function ForSponsors() {
  return (
    <div className="relative w-full max-w-[1195px] text-on-media">
      <div className="relative flex flex-col items-end pb-2 pt-3 text-right [@media(max-height:800px)]:pt-1">
        {/* eyebrow */}
        <p className="flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.28em] text-on-media/90">
          <span aria-hidden="true" className="h-px w-10 bg-[#7fc4ff]/80" />
          For sponsors
        </p>

        <h2 className="mt-2 text-[clamp(28px,2.5vw,46px)] font-bold leading-[1.1] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.6)]">
          Strategic <span className="text-[#6cc0ff]">Partnerships.</span>
          <br />
          <span className="sx-hero-gradient">Real Measurable Impact.</span>
        </h2>

        <p className="mt-2 max-w-[560px] text-[17px] leading-[1.4] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] [@media(max-height:800px)]:text-[15px]">
          Connect with athletes, activate your brand, and drive real business outcomes through authentic sports
          partnerships.
        </p>

        {/* feature items, split by hairlines */}
        <ul className="mt-5 flex flex-wrap items-center justify-end gap-x-7 gap-y-3 [@media(max-height:800px)]:mt-3">
          {FEATURES.map((f) => (
            <Feature key={f.title} {...f} />
          )).flatMap((el, i) =>
            i === 0 ? [el] : [<li key={`d${i}`} aria-hidden="true" className="hidden h-9 w-px bg-on-media/15 md:block" />, el],
          )}
        </ul>

        {/* rule, with "All six packages" riding on its right end */}
        <div className="relative mt-5 flex w-full items-center [@media(max-height:800px)]:mt-3">
          <span aria-hidden="true" className="block h-px flex-1 bg-gradient-to-l from-[#9cc7ff]/60 via-[#9cc7ff]/30 to-[#9cc7ff]/10" />
          <Link
            href="/packages"
            className="ml-5 inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-[#9cc7ff]/55 bg-[#07132a]/70 px-3.5 text-[12px] font-medium text-white shadow-[0_0_12px_rgba(99,180,248,.35)] backdrop-blur-md transition-colors hover:border-[#bfe0ff]"
          >
            All six packages
            <ArrowIcon className="size-3" />
          </Link>
        </div>

        {/* packages */}
        <ol className="mt-5 grid w-full max-w-[1042px] gap-[26px] md:grid-cols-3 [@media(max-height:800px)]:mt-3">
          {[...PACKAGES].reverse().map((p) => (
            <PackageCard key={p.name} {...p} />
          ))}
        </ol>
      </div>

    </div>
  );
}

/** "REAL ATHLETES. REAL IMPACT." behind the band's slanted hairline — sits
 *  inside the trusted-brands band after "+ More", at the band's right end
 *  (the mockup's bottom strip). Desktop only. */
export function SponsorsTag() {
  return (
    <div className="hidden shrink-0 items-center gap-5 pr-[6vw] lg:flex">
      <span aria-hidden="true" className="block h-[60px] w-px rotate-[22deg] bg-[#9cc7ff]/30" />
      <p className="text-[12px] font-medium uppercase leading-[1.8] tracking-[0.32em] text-on-media/90">
        Real athletes.
        <br />
        Real impact.
      </p>
    </div>
  );
}
