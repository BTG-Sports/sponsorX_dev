/* --------------------------------------------------------------------------
   /next/about stage — the SponsorX NEXT programme landing as a magazine
   (design spec docs/superpowers/specs/2026-09-30-next-about-magazine-design.md).
   Server components; the client islands are next-about-fx.tsx and the book
   (next-about-book.tsx), and the reveal/arming island is /packages'
   StageReveal.

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
   - MagazineBook  (#magazine) the interactive magazine: eight faces — the
                   cover, pages 02–07 (MagPage), a back-cover face — handed
                   to the client MagBook (next-about-book.tsx), which turns
                   them as four 3D leaves from lg and one page at a time
                   below. The hero cover and its "Inside:" links open it.
   - Newsstand     (#editions) live editions as mini covers on a glass rack.
   - BackCover     the closing glass panel with both CTAs.

   Entrance: hero pieces rise in (`sx-stage-in` / `sx-stage-line`) once
   `html[data-sx-loaded]` is set; the book and the blocks below rise in as
   they scroll into view (`[data-reveal]`). Reduced motion: pieces simply
   appear.
   -------------------------------------------------------------------------- */

import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { MagBook } from "./next-about-book";
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
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-[#ffd12b] px-5 text-[14px] font-semibold text-[#0b0b14] shadow-[0_0_30px_rgba(255,209,43,.35)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(255,209,43,.55)] max-[359px]:px-3 max-[359px]:text-[13px] sm:h-[52px] sm:px-7 sm:text-[15px] xl:px-9";
const CTA_OUTLINE =
  "sx-sheen group relative inline-flex h-12 w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-white/45 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-white hover:bg-white/10 max-[359px]:px-3 max-[359px]:text-[13px] sm:h-[52px] sm:px-7 sm:text-[15px] xl:px-9";

/** CTAs on paper: navy plate with yellow text, and a navy outline. */
const PAPER_CTA =
  "mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-[#0b1a3a] px-5 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#ffd12b] transition-transform hover:-translate-y-0.5";
const PAPER_CTA_OUTLINE =
  "mt-6 inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md border-[1.5px] border-[#0b1a3a] px-5 font-sans max-sm:px-4 max-sm:text-[12px] max-sm:tracking-[0.06em] text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0b1a3a] transition-colors hover:bg-[#0b1a3a]/5";

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
function CoverPlate({ priority = false, hint = false }: { priority?: boolean; hint?: boolean }) {
  return (
    <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-[4px] ${COVER_BG} shadow-[0_40px_70px_rgba(0,0,0,.65),0_0_0_1px_rgba(255,255,255,.1)]`}>
      <Image src={LOGO} alt={LOGO_ALT} width={800} height={800} unoptimized preload={priority} className="mx-auto -mt-[2%] w-[92%] mix-blend-screen sm:w-full" />
      <span aria-hidden="true" className="absolute left-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Issue {ISSUE.number}
      </span>
      <span aria-hidden="true" className="absolute right-3 top-3 border border-white/55 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.2em] text-white">
        Free digital
      </span>
      <div className="absolute inset-x-4 bottom-4 pr-14">
        <p className="font-mag text-[22px] leading-[0.9] text-white sm:text-[clamp(26px,3vw,40px)]">
          Five jobs.
          <br />
          <span className="text-[#ffd12b]">One magazine.</span>
        </p>
        <p className="relative z-[2] mt-2 text-[9px] leading-[1.4] uppercase tracking-[0.16em] text-on-media/80">
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
      {hint && (
        <span
          aria-hidden="true"
          className="sx-book-hint pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded border border-[#ffd12b]/70 bg-[#04070e]/70 px-3 py-2 text-[10px] uppercase tracking-[0.24em] text-[#ffd12b]"
        >
          Open ▸
        </span>
      )}
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
            <p className="flex items-center gap-3 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-[#7fc4ff] sm:text-[11px] sm:tracking-[0.32em]">
              <span aria-hidden="true" className="h-px w-6 shrink-0 bg-[#7fc4ff]/80 sm:w-8" />
              <span className="min-w-0">
                <ScrambleText text="SponsorX NEXT" delay={0.1} />
                <span className="mx-2 text-on-media/40">/</span>
                <ScrambleText text={`Issue ${ISSUE.number}`} delay={0.3} />
                <span className="mx-2 hidden text-on-media/40 sm:inline">/</span>
                <span className="hidden sm:inline"><ScrambleText text={ISSUE.season} delay={0.5} /></span>
              </span>
              <span aria-hidden="true" className="sx-hud-dashes ml-1 hidden sm:block" />
            </p>
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
        <div className="sx-stage-in order-first mx-auto w-full max-w-[220px] sm:max-w-[320px] lg:order-last lg:max-w-none" style={reveal(0.7)}>
          <TiltSpot max={8}>
            <CoverGlow>
              {/* the whole cover opens the book; sits under the "Inside:" links
                  (z-[1] vs their z-[2]) and comes first in the tab order */}
              <a
                href="#magazine"
                aria-label="Open the magazine"
                className="absolute inset-0 z-[1] rounded-[4px] focus-visible:outline-2 focus-visible:outline-[#ffd12b]"
              />
              <CoverPlate priority />
            </CoverGlow>
          </TiltSpot>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- page */

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
    <div className={`relative px-6 py-6 sm:px-8 lg:px-8 lg:py-8 xl:px-10 xl:py-10 ${className}`} style={{ "--mag-drop": toneVar } as CSSProperties}>
      <p className="flex items-center justify-between font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-[#0b1a3a]/55">
        <span>{head}</span>
        <span className="font-mag text-[14px] tracking-[0.1em]">{folio}</span>
      </p>
      {title && (
        <>
          <h2 className="mt-4 font-mag text-[clamp(36px,8vw,52px)] leading-[0.9] lg:text-[clamp(40px,4vw,64px)]">
            {title}
            {accent && (
              <>
                <br />
                <span style={{ color: toneVar }}>{accent}</span>
              </>
            )}
          </h2>
          <span aria-hidden="true" className="mt-4 block h-px bg-[#0b1a3a]/25" />
        </>
      )}
      <div className={`${title ? "mt-4" : "mt-5"} font-mag-serif text-[14px] leading-[1.5] lg:text-[15px] lg:leading-[1.55] xl:text-[16px]`}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- the book */

/** Face 7 — the back cover: navy, the closing line and both CTAs. */
function BackFace() {
  return (
    <div className={`flex h-full flex-col justify-end p-5 sm:p-6 lg:p-8 xl:p-10 ${COVER_BG}`}>
      <Eyebrow>Back cover</Eyebrow>
      <p className="mt-3 font-mag text-[clamp(32px,7vw,44px)] leading-[0.9] lg:text-[clamp(36px,3.4vw,56px)]">
        Your byline starts <span className="text-[#ffd12b]">here.</span>
      </p>
      <p className="mt-3 font-mag-serif text-[14px] leading-[1.5] text-on-media/80 lg:text-[15px]">
        Students apply. Schools sign one agreement. The first edition is free.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Link href="/next/apply" className={CTA_YELLOW}>
          Apply to join your team
          <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href="/next/schools" className={CTA_OUTLINE}>
          Bring NEXT to your school
        </Link>
      </div>
    </div>
  );
}

/** The eight faces in reading order, handed to the client book. Pages
 *  02–07 are the same content the spreads carried. */
export function MagazineBook() {
  const faces: ReactNode[] = [
    <CoverPlate key="cover" hint />,
    <MagPage key="02" head="For students · ages 14–18" folio="02" title="Become" accent="the media.">
      <p className="sx-mag-dropcap">
        Join your school’s NEXT team as a writer, photographer, videographer, designer, editor or on the sales desk. No
        experience needed. Training is part of it.
      </p>
      <Link href="/next/apply" className={PAPER_CTA}>
        Apply to join
        <ArrowRightIcon className="size-4" />
      </Link>
    </MagPage>,
    <MagPage key="03" head="For schools & administrators" folio="03" title="Fully" accent="carried." tone="blue">
      <p className="sx-mag-dropcap">
        One programme agreement and one faculty advisor. SponsorX carries production, printing, sales operations, rights
        and cost. The first edition is digital and free.
      </p>
      <Link href="/next/schools" className={PAPER_CTA_OUTLINE}>
        Bring NEXT to your school
        <ArrowRightIcon className="size-4" />
      </Link>
    </MagPage>,
    <MagPage key="04" head="How it works" folio="04" title="Five jobs." accent="One magazine.">
      <blockquote className="border-b border-t-[3px] border-b-[#0b1a3a]/20 border-t-[#ffd12b] py-4 text-[18px] italic leading-[1.3] xl:text-[22px]">
        “Every athlete feature carries a QR code. Readers scan it to open that athlete’s SponsorX profile.”
      </blockquote>
    </MagPage>,
    <MagPage key="05" head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="05">
      <ol className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
        {STEPS.map((s) => (
          <li key={s.n} className={`border-t-2 border-[#0b1a3a] pt-2 ${s.n === "05" ? "sm:col-span-2" : ""}`}>
            <span aria-hidden="true" className="font-mag text-[28px] leading-none text-[#e0192b]">{s.n}</span>
            <p className="mt-1 font-sans text-[11px] font-semibold uppercase tracking-[0.1em]">{s.title}</p>
            <p className="mt-1 text-[14px] leading-[1.45] text-[#0b1a3a]/75 xl:text-[15px]">{s.text}</p>
          </li>
        ))}
      </ol>
    </MagPage>,
    <MagPage key="06" head="What you get out of it" folio="06" title="Work that" accent="follows you.">
      <div className="space-y-3">
        {BENEFITS.map((b) => (
          <p key={b.title}>
            <b className="font-semibold">{b.title}.</b>{" "}
            {"tag" in b && (
              <span className="mx-1 inline-block rounded-full border border-[#0b1a3a]/40 px-2 py-px align-middle font-sans text-[10px] font-medium uppercase tracking-[0.1em] text-[#0b1a3a]/70">
                {b.tag}
              </span>
            )}
            {b.text}
          </p>
        ))}
      </div>
    </MagPage>,
    <MagPage key="07" head={`BTG Sports Talk · Issue ${ISSUE.number}`} folio="07">
      <aside className="border-[1.5px] border-[#0b1a3a] bg-[#f3f4f6] px-4 py-3 xl:px-5 xl:py-4">
        <h3 className="font-sans text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e0192b]">Under 18? Read this.</h3>
        <p className="mt-2 text-[14px] leading-[1.5] xl:text-[15px]">
          A parent or guardian consents before you join. No GPA, no school records on anything public. Ever. Your faculty
          advisor approves what gets published.
        </p>
      </aside>
      <figure className="mt-5 flex items-center gap-4">
        <span
          aria-hidden="true"
          className="size-12 shrink-0 border-2 border-[#0b1a3a] [background:repeating-conic-gradient(#0b1a3a_0_25%,#fff_0_50%)_0_0/8px_8px]"
        />
        <figcaption className="text-[13px] italic leading-[1.45] text-[#0b1a3a]/75 xl:text-[14px]">
          Every athlete feature carries one of these. Scan it and the athlete’s SponsorX profile opens.
        </figcaption>
      </figure>
    </MagPage>,
    <BackFace key="back" />,
  ];

  return (
    <>
      <noscript>
        <style>{`.sx-book{aspect-ratio:auto!important;transform:none!important;perspective:none}.sx-leaf{position:static!important;width:100%!important;transform:none!important}.sx-face{position:static!important;display:block!important;transform:none!important;margin-bottom:24px}.sx-book-ctrl,.sx-book-shadow,.sx-book-hint{display:none!important}.sx-face[data-face="0"]{max-width:520px;margin-inline:auto}`}</style>
      </noscript>
      <MagBook faces={faces} />
    </>
  );
}

/* -------------------------------------------------------------- newsstand */

function MiniCover({ e }: { e: EditionCard }) {
  const place = e.school ? [e.school.city, e.school.stateCode].filter(Boolean).join(", ") : "";
  return (
    <Link href={editionHref(e)} className="sx-mag-mini group block">
      <span
        className={`relative block aspect-[3/4] w-full overflow-hidden rounded-[3px] ${COVER_BG} shadow-[0_16px_30px_rgba(0,0,0,.6),0_0_0_1px_rgba(255,255,255,.1)] group-hover:-translate-y-1.5 group-hover:shadow-[0_22px_36px_rgba(0,0,0,.7),0_0_0_1px_rgba(191,224,255,.6)]`}
      >
        {usesLogo(e.publication) ? (
          <Image src={LOGO} alt="" width={400} height={400} unoptimized className="-mt-[2%] w-full mix-blend-screen" />
        ) : (
          <span
            aria-hidden="true"
            className="line-clamp-3 block px-2 pb-8 pt-3 font-mag text-[clamp(22px,4vw,30px)] leading-[0.9] text-white [overflow-wrap:anywhere]"
          >
            {e.publication}
          </span>
        )}
        <span aria-hidden="true" className="absolute inset-x-2 bottom-2 font-mag text-[18px] leading-none text-[#ffd12b]">
          {e.label}
        </span>
      </span>
      <span className="mt-3 block text-[13px] font-semibold text-on-media">
        {e.publication} · {e.label}
      </span>
      {e.school && (
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em] text-on-media/70">
          {e.school.name}
          {place && ` · ${place}`}
        </span>
      )}
      <span className="mt-2 block text-[12px] font-semibold text-[#ffd12b]">Read the edition →</span>
    </Link>
  );
}

function RackNote({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-xl">
      {title && <p className="font-mag text-[28px] leading-none">{title}</p>}
      <p className={`${title ? "mt-2" : ""} text-[15px] leading-[1.55] text-on-media/80`}>{children}</p>
    </div>
  );
}

/** Live editions as mini covers on a glass rack. `null` is the fetch
 *  failing, `[]` is nothing published yet — both keep the old page's copy. */
export function Newsstand({ list }: { list: EditionCard[] | null }) {
  return (
    <section id="editions" aria-labelledby="editions-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-24 px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div data-reveal="" className="max-w-2xl">
        <Eyebrow>Latest editions</Eyebrow>
        <h2 id="editions-title" className="mt-4 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(56px,4.6vw,80px)]">
          On the stand <span className="text-[#7fd0ff]">now.</span>
        </h2>
      </div>

      <div data-reveal="" style={slot(1)} className="relative mt-10">
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          fill="bg-gradient-to-b from-[#0d1f3d]/60 via-[#07122a]/65 to-[#04091a]/80"
          outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/70 to-[#7fd0ff]/30"
        />
        <div className="relative px-6 py-8 sm:px-10 lg:px-12 lg:py-10">
          {list === null ? (
            <RackNote>
              The editions list didn’t load. Try again in a moment — you can still apply or read about the programme for
              schools.
            </RackNote>
          ) : list.length === 0 ? (
            <RackNote title="No editions published yet">
              The first NEXT editions publish this school year. <span className="text-[#ffd12b]">Yours could be one of them.</span>
            </RackNote>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-10">
                {list.map((e, i) => (
                  <li key={e.id} data-reveal="" style={slot(i + 2)} className="lg:w-[150px]">
                    <MiniCover e={e} />
                  </li>
                ))}
              </ul>
              <span aria-hidden="true" className="sx-mag-shelf mt-8 hidden lg:block" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- back cover */

export function BackCover() {
  return (
    <section className="relative mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-[6vw] lg:pb-24 2xl:px-0">
      <div data-reveal="" className="relative overflow-visible">
        <TiltSpot max={3}>
          <Glass
            plate={PANEL.plate}
            ringClip={PANEL_RING}
            lit
            fill="bg-gradient-to-br from-[#0d1f3d]/80 via-[#07122a]/80 to-[#1a0f08]/80"
            outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#ffd12b]/70"
          />
          <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PANEL.plate }} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              clipPath: PANEL.plate,
              background:
                "radial-gradient(50% 90% at 100% 100%, rgba(255,209,43,.16), transparent 70%), radial-gradient(45% 80% at 0% 0%, rgba(46,155,245,.22), transparent 70%)",
            }}
          />
          <div className="relative grid gap-8 px-5 py-10 sm:px-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-14 lg:px-14 lg:py-14">
            <div>
              <Eyebrow>Back cover</Eyebrow>
              <h2 className="mt-4 font-mag text-[clamp(40px,9vw,56px)] leading-[0.9] lg:text-[clamp(56px,4.6vw,80px)]">
                Your byline starts <span className="text-[#ffd12b]">here.</span>
              </h2>
              <p className="mt-4 max-w-[560px] font-mag-serif text-[16px] leading-[1.55] text-on-media/80 lg:text-[18px]">
                Students apply. Schools sign one agreement. The first edition is free.
              </p>
            </div>
            <CTAs className="md:flex-row md:gap-5 lg:flex-col lg:gap-3" />
          </div>
        </TiltSpot>
      </div>
    </section>
  );
}
