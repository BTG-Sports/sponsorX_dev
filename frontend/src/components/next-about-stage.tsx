/* --------------------------------------------------------------------------
   /next/about stage — the SponsorX NEXT programme landing as a magazine
   (design spec docs/superpowers/specs/2026-09-30-next-about-magazine-design.md).
   Server components; the one client island is next-about-fx.tsx, and the
   reveal/arming island is /packages' StageReveal.

   The page is a fixed-dark `.sx-stage` in both themes (the landing's HUD
   ground) with white paper laid on it. Every ink is `on-media` or a fixed
   literal: on paper the palette is the BTG Sports Talk Magazine logo's —
   navy ink, red numerals, yellow rules — never a themed token.

   Top to bottom (page.tsx lays them out):
   - MagCover      the hero: HUD eyebrow, the three-line display headline,
                   serif dek, two CTAs, a glass stat strip, and the COVER —
                   the logo as masthead, corner tags, cover lines, an
                   "Inside:" line linking the sections — tilting with the
                   pointer (TiltSpot) under a scan line and a glow (CoverGlow).
   - InsideBand    /packages' marquee band, "In this issue" (reused).
   - OpenerSpread  paper spread 1: For students | For schools, each a page.
   - FeatureSpread spread 2 (#how): Five jobs — the QR pull quote | the list.
   - BenefitsSpread spread 3 (#students): what you get | under-18 note + QR.
   - Newsstand     (#editions) live editions as mini covers on a glass rack.
   - BackCover     the closing glass panel with both CTAs.

   Entrance: hero pieces rise in (`sx-stage-in` / `sx-stage-line`) once
   `html[data-sx-loaded]` is set; each spread page-flips up as it scrolls
   into view (`.sx-mag-spread[data-reveal]`, globals.css). Reduced motion:
   pieces simply appear.
   -------------------------------------------------------------------------- */

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { CoverGlow } from "./next-about-fx";
import { Eyebrow, chamfer } from "./packages-stage";
import { BENEFITS, ISSUE, LOGO, LOGO_ALT, STEPS, editionHref, usesLogo, type EditionCard } from "@/lib/next-about";

/* ---------------------------------------------------------------- shared */

const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const STRIP = chamfer(12);
const STRIP_RING = STRIP.ring(1);

/** Staggered entrance delay for a hero piece. */
const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
/** Stagger slot for a scroll-revealed piece. */
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

const COVER_BG = "bg-[linear-gradient(180deg,#000_0%,#061027_45%,#0d1a3a_100%)]";

/** The yellow primary CTA on the stage. Dark ink on yellow (14:1); white on
 *  yellow would fail P1-QA-02, the /join lesson. */
const CTA_YELLOW =
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-[#ffd12b] px-5 text-[14px] font-semibold text-[#0b0b14] shadow-[0_0_30px_rgba(255,209,43,.35)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(255,209,43,.55)] sm:h-[52px] sm:px-9 sm:text-[15px]";
const CTA_OUTLINE =
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-white/45 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-white hover:bg-white/10 sm:h-[52px] sm:px-9 sm:text-[15px]";

/** CTAs on paper: navy plate with yellow text, and a navy outline. */
const PAPER_CTA =
  "mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-[#0b1a3a] px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#ffd12b] transition-transform hover:-translate-y-0.5";
const PAPER_CTA_OUTLINE =
  "mt-6 inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-[#0b1a3a] px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0b1a3a] transition-colors hover:bg-[#0b1a3a]/5";

/** The two CTAs. `delay` makes them a hero entrance piece; `className`
 *  sets the row/column behaviour above `sm` (the hero: a row from sm; the
 *  back cover: a row from sm, a column again from lg beside the copy). */
function CTAs({ delay, className = "sm:flex-row sm:items-center sm:gap-5" }: { delay?: number; className?: string }) {
  return (
    <div
      className={`${delay == null ? "" : "sx-stage-in "}flex flex-col items-stretch gap-3 ${className}`}
      style={delay == null ? undefined : reveal(delay)}
    >
      <Magnetic className="max-sm:w-full">
        <Link href="/next/apply" className={CTA_YELLOW}>
          Apply to join your team
          <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Magnetic>
      <Magnetic className="max-sm:w-full">
        <Link href="/next/schools" className={CTA_OUTLINE}>
          Bring NEXT to your school
        </Link>
      </Magnetic>
    </div>
  );
}

/* ------------------------------------------------------------------ cover */

/** The cover plate: the logo as masthead (screen-blended so its black
 *  ground vanishes into the navy), corner tags, cover lines, the "Inside:"
 *  contents line, a barcode and the HUD scan. Decorative layers aria-hidden;
 *  the masthead has the magazine's name as alt, the lines are real text. */
function CoverPlate({ priority = false }: { priority?: boolean }) {
  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-[4px] ${COVER_BG} shadow-[0_40px_70px_rgba(0,0,0,.65),0_0_0_1px_rgba(255,255,255,.1)]`}>
      <Image src={LOGO} alt={LOGO_ALT} width={800} height={800} unoptimized priority={priority} className="-mt-[2%] w-full mix-blend-screen" />
      <span aria-hidden="true" className="absolute left-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Issue {ISSUE.number}
      </span>
      <span aria-hidden="true" className="absolute right-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Free digital
      </span>
      <div className="absolute inset-x-4 bottom-4 pr-14">
        <p className="font-mag text-[clamp(26px,3vw,40px)] leading-[0.9] text-white">
          Five jobs.
          <br />
          <span className="text-[#ffd12b]">One magazine.</span>
        </p>
        <p className="mt-2 text-[9px] uppercase tracking-[0.16em] text-on-media/80">
          Inside:{" "}
          <a href="#how" className="underline-offset-2 hover:underline">how it works</a> ·{" "}
          <a href="#students" className="underline-offset-2 hover:underline">what you get</a> ·{" "}
          <a href="#editions" className="underline-offset-2 hover:underline">latest editions</a>
        </p>
      </div>
      <span
        aria-hidden="true"
        className="absolute bottom-4 right-4 h-5 w-12 opacity-80 [background:repeating-linear-gradient(90deg,#fff_0_1px,transparent_1px_3px,#fff_3px_4px,transparent_4px_6px)]"
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" />
    </div>
  );
}

const STATS = [
  ["05", "Jobs"],
  ["14–18", "Ages"],
  ["$0", "First edition"],
  ["QR", "On every feature"],
] as const;

/** Four figures from the page's own copy — no fetch. */
function StatStrip() {
  return (
    <div className="sx-stage-in relative mt-8 max-w-[560px]" style={reveal(0.55)}>
      <Glass
        plate={STRIP.plate}
        ringClip={STRIP_RING}
        fill="bg-gradient-to-b from-[#0d1f3d]/60 to-[#04091a]/80"
        outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#7fd0ff]/25"
      />
      <dl className="relative grid grid-cols-2 gap-y-4 px-5 py-4 sm:grid-cols-4 sm:gap-y-0 sm:px-6">
        {STATS.map(([value, label], i) => (
          <div key={label} className={`flex flex-col-reverse ${i > 0 ? "sm:border-l sm:border-[#a9d3ff]/15 sm:pl-5" : ""}`}>
            <dt className="mt-1 text-[9px] uppercase tracking-[0.16em] text-on-media/70">{label}</dt>
            <dd className={`font-mag text-[26px] leading-none ${i === 2 ? "text-[#ffd12b]" : ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MagCover() {
  return (
    <section className="relative isolate flex min-h-[min(100svh,980px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: the landing's glows, the receding floor, the horizon, the outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_18%_12%,rgba(46,155,245,.22),transparent_62%),radial-gradient(55%_45%_at_88%_78%,rgba(249,122,31,.16),transparent_60%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.12em] left-1/2 -translate-x-1/2 whitespace-nowrap font-mag text-[clamp(120px,26vw,420px)] uppercase leading-none">
          Next
        </p>
        <div className="absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:block" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-8 px-5 py-8 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,30vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <Eyebrow>
              <ScrambleText text={`SponsorX NEXT · Issue ${ISSUE.number} · ${ISSUE.season}`} delay={0.1} />
            </Eyebrow>
          </div>

          <h1 className="mt-5 font-mag text-[clamp(48px,11vw,72px)] leading-[0.88] tracking-[0.01em] [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(72px,7vw,112px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Your school’s</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>sports story.</span>
            <span className="sx-stage-line block text-[#ffd12b]" style={reveal(0.36)}>Told by you.</span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[520px] font-mag-serif text-[16px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[18px]"
            style={reveal(0.3)}
          >
            NEXT is a sports magazine for your high school, made by students. You write it, shoot it, design it, and sell
            the ads that pay for it. SponsorX brings the platform, templates, training and publishing.
          </p>

          <div className="mt-8">
            <CTAs delay={0.42} />
          </div>

          <StatStrip />
        </div>

        {/* the cover: above the copy below lg, right of it from lg */}
        <div className="sx-stage-in order-first mx-auto w-full max-w-[220px] sm:max-w-[320px] lg:order-last lg:max-w-none" style={reveal(0.5)}>
          <TiltSpot max={8}>
            <CoverGlow>
              <CoverPlate priority />
            </CoverGlow>
          </TiltSpot>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- spread */

/** One sheet of paper holding two pages. Carries `data-reveal` so
 *  StageReveal marks it; the `.sx-mag-spread` rules flip the sheet in. */
export function MagSpread({ id, index, children, className = "" }: { id?: string; index: number; children: ReactNode; className?: string }) {
  return (
    <section
      id={id}
      data-reveal=""
      style={slot(index)}
      className={`sx-mag-spread relative mx-auto w-full max-w-[1180px] scroll-mt-24 px-5 sm:px-[6vw] ${className}`}
    >
      <div className="sx-mag-sheet grid grid-cols-1 lg:grid-cols-2">
        {children}
        <span aria-hidden="true" className="sx-mag-spine hidden lg:block" />
        <span aria-hidden="true" className="sx-mag-curl" />
      </div>
    </section>
  );
}

/** One page: folio row (running head, page number), optional display
 *  headline with its accent line in the page's tone, a rule, then the body
 *  in the serif. `tone` also colours the drop cap (`--mag-drop`). */
export function MagPage({
  head,
  folio,
  title,
  accent,
  tone = "red",
  children,
  className = "",
}: {
  head: string;
  folio: string;
  title?: string;
  accent?: string;
  tone?: "red" | "blue";
  children: ReactNode;
  className?: string;
}) {
  const toneVar = tone === "blue" ? "var(--mag-blue)" : "var(--mag-red)";
  return (
    <div className={`relative px-6 py-7 sm:px-8 lg:px-10 lg:py-10 ${className}`} style={{ "--mag-drop": toneVar } as CSSProperties}>
      <p className="flex items-center justify-between font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-[#0b1a3a]/55">
        <span>{head}</span>
        <span className="font-mag text-[14px] tracking-[0.1em]">{folio}</span>
      </p>
      {title && (
        <>
          <h2 className="mt-5 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(48px,4.6vw,72px)]">
            {title}
            <br />
            <span style={{ color: toneVar }}>{accent}</span>
          </h2>
          <span aria-hidden="true" className="mt-4 block h-px bg-[#0b1a3a]/25" />
        </>
      )}
      <div className={`${title ? "mt-4" : "mt-6"} font-mag-serif text-[16px] leading-[1.55]`}>{children}</div>
    </div>
  );
}

/** The second page's top rule when the two pages stack below lg. */
const RIGHT_PAGE = "max-lg:border-t max-lg:border-[#0b1a3a]/15";
