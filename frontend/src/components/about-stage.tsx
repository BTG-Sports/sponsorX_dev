/* --------------------------------------------------------------------------
   About stage — the 2D UI of /about (the owner, 2026-10-27: "finish the
   about page, make sure the design is the same as the other pages"). Until
   now the nav's "About" was inert text. Server components; the motion comes
   from the shared client islands (hero-fx, packages-fx).

   Like /packages, /get-started and /how-it-works it is a fixed-dark "media"
   ground in both themes, so every ink is `on-media` or a fixed-dark literal
   (the --sx-on-media rule).

   Top to bottom:
   - AboutHero      HUD eyebrow, the three-line headline, and the "ON RECORD"
                    card: the three things SponsorX keeps — what was promised,
                    who delivered it, whether it worked — as one ledger.
   - InsideBand     (page) what BTG stands for, as the marquee.
   - Story          why SponsorX exists: three before → now cards.
   - Values         the four commitments as tone-coloured glass cards
                    (SideCards' shape, no CTA).
   - Desks          the people behind it: BTG's four desks on the hexagon
                    track (vertical below lg, as LoopTrack).
   - Programmes     BTG Sports Group's two programmes, SponsorX and
                    SponsorX NEXT, each with its next step.
   - AboutClose     the closing panel and the fine print.

   Nothing here is read from the API, so the page carries no figure. Every
   promise is a destination page's own — the matching and conflict rules and
   the guardian rule (how-it-works-stage), the NEXT programme's terms
   (next-about-stage) — so this page can't drift from them.

   Tones: athlete blue, sponsor orange, venue green and fan yellow as
   /how-it-works; BTG the HUD cyan.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { MegaphoneIcon, RunnerIcon } from "./get-started-stage";
import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { GuardianIcon, PulseIcon, QrIcon, ShieldIcon, TargetIcon } from "./how-it-works-stage";
import { JOIN_MINUTES } from "./join-stage";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { PackageGrid } from "./packages-fx";
import { Eyebrow, SectionHead, StepRule, chamfer } from "./packages-stage";

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

const TONE = {
  sponsor: "#f97a1f",
  btg: "#7fd0ff",
  athlete: "#2e9bf5",
  fan: "#facc15",
  property: "#22c98d",
} as const;

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

function CheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.6} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A signed agreement — what was promised. */
function DocIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  );
}

/** An open magazine — SponsorX NEXT. */
function MagazineIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

/** The platform — a network of linked nodes. */
function NetworkIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <circle cx="12" cy="5" r="2.2" />
      <circle cx="5" cy="18" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M10.9 7 6.1 16M13.1 7l4.8 9M7.2 18h9.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------- hero */

/** The three things SponsorX keeps on record, top to bottom. */
const RECORD: { label: string; tone: string; icon: (p: { className?: string }) => ReactNode; asks: string; kept: string }[] = [
  { label: "Promised", tone: TONE.sponsor, icon: DocIcon, asks: "What was promised", kept: "The Campaign Order: deliverables and dates" },
  { label: "Delivered", tone: TONE.athlete, icon: RunnerIcon, asks: "Who delivered it", kept: "Each deliverable, approved by the sponsor" },
  { label: "Proven", tone: TONE.fan, icon: QrIcon, asks: "Whether it worked", kept: "Tracked events and rewards redeemed by QR" },
];

function RecordCard() {
  return (
    <aside className="relative text-on-media" aria-labelledby="record-card-title">
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
            <h2 id="record-card-title" className="whitespace-nowrap text-[12px] font-normal uppercase tracking-[0.24em] lg:text-[14px]">
              On Record
            </h2>
            {/* goes on the narrowest phones, where it would wrap the title */}
            <span className="whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/60 max-[359px]:hidden">3 questions &middot; 1 record</span>
          </div>
          <StepRule className="-mr-5 mt-1 w-[calc(100%+20px)] lg:-mr-7 lg:w-[calc(100%+28px)]" />

          {/* the ledger: three entries on one glowing spine */}
          <ol className="relative mt-6 space-y-5">
            <span
              aria-hidden="true"
              className="absolute bottom-6 left-[23px] top-6 w-[2px] rounded-full bg-gradient-to-b from-[#f97a1f]/80 via-[#2e9bf5]/80 to-[#facc15]/80 shadow-[0_0_12px_rgba(46,155,245,.5)]"
            />
            {RECORD.map(({ label, tone, icon: Icon, asks, kept }, i) => (
              <li key={label} className="relative flex items-center gap-4">
                <span
                  aria-hidden="true"
                  className="sx-ping relative grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f]"
                  style={{ borderColor: tone, color: tone, boxShadow: `0 0 16px ${tone}88, inset 0 0 10px ${tone}26`, "--ping": tone, "--ping-cycle": "6s", "--i": i } as CSSProperties}
                >
                  <Icon className="size-[22px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: tone }}>
                    {String(i + 1).padStart(2, "0")} &middot; {label}
                  </span>
                  <span className="mt-0.5 block text-[15px] font-semibold leading-tight tracking-tight">{asks}</span>
                  <span className="mt-1 block text-[12px] leading-snug text-on-media/65">{kept}</span>
                </span>
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded-full border"
                  style={{ borderColor: `${tone}66`, color: tone, background: `${tone}14` }}
                >
                  <CheckIcon className="size-3" />
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-6 flex items-center gap-2.5 border-t border-[#a9d3ff]/15 pt-4 text-[11px] leading-snug text-on-media/65">
            <PulseIcon className="size-4 shrink-0 text-[#7fd0ff]" />
            Every figure has a source. Nothing to count, nothing shown.
          </p>
        </div>
      </TiltSpot>
    </aside>
  );
}

export function AboutHero() {
  return (
    <section className="relative isolate flex min-h-[min(100svh,960px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: receding grid floor, horizon glow, brand glows, outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_16%_14%,rgba(46,155,245,.24),transparent_62%),radial-gradient(50%_45%_at_86%_74%,rgba(249,122,31,.16),transparent_60%),radial-gradient(40%_40%_at_60%_100%,rgba(127,208,255,.1),transparent_65%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[44%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(90px,19vw,300px)] font-black uppercase leading-none tracking-tighter">
          About
        </p>
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:w-[55%]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-10 px-5 py-10 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,32vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
              <span>
                <ScrambleText text="About" delay={0.1} />
                <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
                <ScrambleText text="BTG Sports Group" delay={0.35} />
              </span>
              <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
            </p>
          </div>

          <h1 className="mt-5 text-[clamp(38px,8.6vw,54px)] font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(48px,4.6vw,76px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>Real Athletes.</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="Real Partnerships.">Real Partnerships.</span>
            </span>
            <span className="sx-stage-line block" style={reveal(0.36)}>
              <span className="sx-hero-gradient-accent">On Record.</span>
            </span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[540px] text-[15px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[17px]"
            style={reveal(0.3)}
          >
            SponsorX is the sponsorship platform of BTG Sports Group. It connects brands, athletes and the teams and
            venues that bring fans together &mdash; and keeps what was promised, who delivered it and whether it worked
            on one record.
          </p>

          <div className="sx-stage-in mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6" style={reveal(0.42)}>
            <Magnetic className="max-sm:w-full">
              <Link
                href="#values"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                What we stand for
                <DownIcon className="size-[18px] transition-transform group-hover:translate-y-0.5" />
              </Link>
            </Magnetic>
            <Magnetic className="max-sm:w-full">
              <Link
                href="/contact"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Talk to BTG
                <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
          </div>
        </div>

        <div className="sx-stage-in w-full lg:justify-self-end" style={reveal(0.35)}>
          <RecordCard />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="sx-stage-in pointer-events-none relative mx-auto mb-6 hidden w-full max-w-[1320px] items-center gap-3 px-[6vw] lg:flex 2xl:px-0 [@media(max-height:820px)]:hidden"
        style={reveal(1)}
      >
        <span className="sx-scroll-cue relative block h-9 w-px overflow-hidden bg-on-media/20" />
        <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-on-media/60">Scroll our story</span>
      </div>
    </section>
  );
}

/** The marquee under the hero: what BTG stands for. */
export const VALUES_BAND = [
  "Fit over followers",
  "The athlete decides",
  "Guardians in the loop",
  "A person reviews every application",
  "Conflicts cleared first",
  "Numbers on record",
  "No card, no checkout",
  "Rewards fans can use",
] as const;

/* ------------------------------------------------------------------ story */

/** What sponsorship looked like, and what SponsorX does instead. */
const SHIFTS: { before: string; now: string; tone: string }[] = [
  {
    before: "Deals picked by follower count.",
    now: "Athletes matched on audience fit and engagement, and cleared for conflicts before anyone is invited.",
    tone: TONE.sponsor,
  },
  {
    before: "Athletes left guessing what they’re owed.",
    now: "Every invitation is the athlete’s to accept, and each completed deliverable shows in their earnings.",
    tone: TONE.athlete,
  },
  {
    before: "Results nobody can check.",
    now: "Reports built from tracked events: delivered content and rewards redeemed by QR. Not estimates.",
    tone: TONE.fan,
  },
];

export function Story() {
  return (
    <section id="story" aria-labelledby="story-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div id="story-title">
        <SectionHead eyebrow="Why SponsorX" title="Sponsorship that" accent="shows its work.">
          Athlete sponsorship runs on trust: a brand pays for reach, an athlete delivers, and everyone hopes it worked.
          BTG built SponsorX so each step leaves a record that both sides can see.
        </SectionHead>
      </div>

      <ol className="mt-12 grid gap-5 md:grid-cols-3 md:gap-7">
        {SHIFTS.map(({ before, now, tone }, i) => (
          <li key={before} data-reveal="" style={slot(i)} className="relative">
            <div className="relative flex h-full flex-col px-6 pb-7 pt-7">
              <Glass
                plate={CARD.plate}
                ringClip={CARD_RING}
                fill="bg-gradient-to-b from-[#0a1a30]/65 via-[#06101f]/70 to-[#040a16]/85"
                outline="bg-gradient-to-br from-[#bfe0ff]/80 via-[#8fc8ff]/40 to-[#8fc8ff]/15"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ clipPath: CARD.plate, background: `radial-gradient(80% 50% at 20% 0%, ${tone}29, transparent 70%)` }}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: CARD.plate }}>
                <span className="absolute -bottom-5 -right-1 font-mono text-[112px] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.1)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>

              <p className="relative text-[10px] font-semibold uppercase tracking-[0.22em] text-on-media/45">Before</p>
              <p className="relative mt-2 text-[15px] leading-snug text-on-media/55 line-through decoration-on-media/30">{before}</p>

              <span aria-hidden="true" className="relative my-5 flex items-center gap-3" style={{ color: tone }}>
                <span className="h-px flex-1" style={{ background: `linear-gradient(90deg, ${tone}, transparent)` }} />
                <ArrowRightIcon className="size-4 rotate-90" />
              </span>

              <p className="relative text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone }}>
                With SponsorX
              </p>
              <p className="relative mt-2 max-w-[360px] text-[15px] font-medium leading-snug">{now}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ----------------------------------------------------------------- values */

type Value = {
  key: string;
  tone: string;
  icon: (p: { className?: string }) => ReactNode;
  who: string;
  title: string;
  body: string;
  points: string[];
};

const VALUES: Value[] = [
  {
    key: "fit",
    tone: TONE.sponsor,
    icon: TargetIcon,
    who: "For brands",
    title: "Fit over followers",
    body: "We match on who an athlete really reaches and how that audience engages, not on follower count alone.",
    points: ["Priced from the athlete’s rate card", "Screened against the brief’s category"],
  },
  {
    key: "athlete",
    tone: TONE.athlete,
    icon: RunnerIcon,
    who: "For athletes",
    title: "The athlete decides",
    body: "No one is signed up for a campaign. Every invitation is the athlete’s to accept or decline.",
    points: ["Deliverables spelled out up front", "Earnings shown as each one is done"],
  },
  {
    key: "minors",
    tone: TONE.property,
    icon: GuardianIcon,
    who: "For families",
    title: "Minors reach a person",
    body: "An athlete under 18 applies with a parent or guardian, who accepts the agreements with them.",
    points: ["Decisions about minors are never automatic", "Sensitive categories always go to BTG"],
  },
  {
    key: "numbers",
    tone: TONE.fan,
    icon: PulseIcon,
    who: "For everyone",
    title: "Real numbers only",
    body: "Every figure on SponsorX comes from a record: an order, a tracked event, a payment status.",
    points: ["No samples passed off as results", "Nothing to count means nothing shown"],
  },
];

function ValueCard({ v, index }: { v: Value; index: number }) {
  const { tone, icon: Icon } = v;
  return (
    <li data-pkg="" data-reveal="" className="sx-pkg relative flex min-w-0 text-on-media" style={{ "--tone": tone, ...slot(index) } as CSSProperties}>
      <div className="sx-pkg-card relative flex w-full min-w-0">
        <Glass
          plate={CARD.plate}
          ringClip={CARD_RING}
          fill="bg-gradient-to-b from-[#0a1a30]/70 via-[#06101f]/75 to-[#040a16]/85"
          outline="bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/50 to-[#8fc8ff]/25"
        />
        {/* the value's tone bleeding in from the top edge */}
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

        <div className="relative flex w-full min-w-0 flex-col px-5 pb-7 pt-7 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone }}>
              <span aria-hidden="true" className="h-px w-6 opacity-70" style={{ background: tone }} />
              {v.who}
            </p>
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f]/55"
              style={{ borderColor: tone, color: tone, boxShadow: `0 0 14px ${tone}88, inset 0 0 10px ${tone}26` }}
            >
              <Icon className="size-[22px]" />
            </span>
          </div>

          <h3 className="mt-3 text-[21px] font-semibold leading-tight tracking-tight">{v.title}</h3>
          <p className="mt-2.5 text-[13px] leading-relaxed text-on-media/75">{v.body}</p>

          <StepRule className="mt-5 -mr-6 w-[calc(100%+24px)]" />

          <ul className="mt-3 space-y-2.5 text-[13px] text-on-media/85">
            {v.points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-px grid size-[20px] shrink-0 place-items-center rounded-[5px] border"
                  style={{ borderColor: `${tone}66`, color: tone, background: `${tone}14` }}
                >
                  <CheckIcon className="size-3" />
                </span>
                <span className="pt-px leading-snug">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function Values() {
  return (
    <section id="values" aria-labelledby="values-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="values-title">
        <SectionHead eyebrow="What we stand for" title="Four commitments," accent="kept on every deal." />
      </div>
      <PackageGrid label="What BTG stands for" className="mt-12 grid gap-7 md:grid-cols-2 xl:grid-cols-4">
        {VALUES.map((v, i) => (
          <ValueCard key={v.key} v={v} index={i} />
        ))}
      </PackageGrid>
    </section>
  );
}

/* ------------------------------------------------------------------ desks */

/** BTG's four desks (§10), and what each one looks after. */
const DESKS: { title: string; body: string; tone: string }[] = [
  {
    title: "Athlete Network",
    body: "Reviews every athlete application, sets each athlete’s NIL rate by job type, and staffs campaigns.",
    tone: TONE.athlete,
  },
  {
    title: "Admin",
    body: "Approves sponsor briefs and accounts, launches campaigns, and resolves anything a safety check held back.",
    tone: TONE.btg,
  },
  {
    title: "Content Approval",
    body: "Checks each deliverable against the brief and the rules before it counts toward the campaign.",
    tone: TONE.sponsor,
  },
  {
    title: "Finance",
    body: "Invoices sponsors, follows payment status, and keeps athlete earnings up to date.",
    tone: TONE.property,
  },
];

function DeskNode({ i, tone }: { i: number; tone: string }) {
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

function DeskCopy({ desk, compact = false }: { desk: (typeof DESKS)[number]; compact?: boolean }) {
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: desk.tone }}>
        BTG desk
      </p>
      <h3 className={`mt-1 font-semibold tracking-tight ${compact ? "text-[17px]" : "text-[18px]"}`}>{desk.title}</h3>
      <p className="mt-2.5 text-[13px] leading-relaxed text-on-media/70">{desk.body}</p>
    </>
  );
}

export function Desks() {
  return (
    <section id="team" aria-labelledby="team-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="team-title">
        <SectionHead eyebrow="The people behind it" title="Software where it can." accent="People where it counts.">
          Routine steps run on their own when every check passes. When one fails, the step is held for a person at one
          of BTG&rsquo;s four desks, with the reason.
        </SectionHead>
      </div>

      {/* lg+: one track, four desks */}
      <ol className="relative mt-16 hidden grid-cols-4 gap-8 lg:grid">
        <span aria-hidden="true" className="absolute left-[26px] right-[calc(100%/4-26px)] top-[26px] h-[2px] overflow-hidden rounded-full bg-gradient-to-r from-[#2e9bf5]/80 via-[#7fd0ff]/80 to-[#22c98d]/80 shadow-[0_0_14px_rgba(46,155,245,.55)]">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-40" />
        </span>
        {DESKS.map((desk, i) => (
          <li key={desk.title} data-reveal="" style={slot(i)} className="relative">
            <DeskNode i={i} tone={desk.tone} />
            <div className="mt-6 max-w-[280px]">
              <DeskCopy desk={desk} />
            </div>
          </li>
        ))}
      </ol>

      {/* below lg: the same desks on a vertical rail */}
      <ol data-reveal="" className="relative mt-12 max-w-2xl space-y-8 lg:hidden">
        <span aria-hidden="true" className="absolute bottom-6 left-[25px] top-6 w-[2px] rounded-full bg-gradient-to-b from-[#2e9bf5]/80 via-[#7fd0ff]/80 to-[#22c98d]/80 shadow-[0_0_12px_rgba(46,155,245,.5)]" />
        {DESKS.map((desk, i) => (
          <li key={desk.title} className="relative flex gap-5">
            <DeskNode i={i} tone={desk.tone} />
            <div className="min-w-0 pt-1">
              <DeskCopy desk={desk} compact />
            </div>
          </li>
        ))}
      </ol>

      <p data-reveal="" className="mt-12 flex max-w-2xl items-start gap-3 text-[13px] leading-relaxed text-on-media/70">
        <ShieldIcon className="mt-0.5 size-5 shrink-0 text-[#22c98d]" />
        <span>
          Some things never run on their own: anything about a minor, a sensitive category, or a price under its
          floor always reaches a person.
        </span>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- programmes */

type Programme = {
  key: string;
  tone: string;
  icon: (p: { className?: string }) => ReactNode;
  who: string;
  title: string;
  body: string;
  points: string[];
  cta: { href: string; label: string };
  more: { href: string; label: string };
};

const PROGRAMMES: Programme[] = [
  {
    key: "sponsorx",
    tone: TONE.athlete,
    icon: NetworkIcon,
    who: "The platform",
    title: "SponsorX",
    body: "The sponsorship marketplace. Brands, athletes, teams and venues, and the fans they reach, on one loop from brief to report.",
    points: ["Sponsors brief; BTG matches and quotes", "Athletes apply and deliver", "Fans redeem rewards by QR"],
    cta: { href: "/how-it-works", label: "See how it works" },
    more: { href: "/packages", label: "See the packages" },
  },
  {
    key: "next",
    tone: TONE.fan,
    icon: MagazineIcon,
    who: "The student programme",
    title: "SponsorX NEXT",
    body: "Student-run high-school sports media, published as BTG Sports Talk Magazine. Students aged 14–18 join their school’s NEXT team.",
    points: ["Writers, photographers, designers, editors and a sales desk", "No experience needed; training is part of it", "SponsorX carries production, printing and cost"],
    cta: { href: "/next/about", label: "Meet NEXT" },
    more: { href: "/next/schools", label: "Bring NEXT to your school" },
  },
];

function ProgrammeCard({ p, index }: { p: Programme; index: number }) {
  const { tone, icon: Icon } = p;
  return (
    <li data-pkg="" data-reveal="" className="sx-pkg relative flex min-w-0 text-on-media" style={{ "--tone": tone, ...slot(index) } as CSSProperties}>
      <div className="sx-pkg-card relative flex w-full min-w-0">
        <Glass
          plate={CARD.plate}
          ringClip={CARD_RING}
          fill="bg-gradient-to-b from-[#0a1a30]/70 via-[#06101f]/75 to-[#040a16]/85"
          outline="bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/50 to-[#8fc8ff]/25"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ clipPath: CARD.plate, background: `radial-gradient(70% 60% at 0% 0%, ${tone}38, transparent 70%)` }}
        />
        <span aria-hidden="true" className="sx-pkg-glare pointer-events-none absolute inset-0 hidden lg:block" style={{ clipPath: CARD.plate }} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_6px_var(--tone))]">
          <span className="sx-pkg-sweep absolute inset-0" style={{ clipPath: CARD_SWEEP }} />
          <span className="sx-pkg-spot absolute inset-0 hidden lg:block" style={{ clipPath: CARD_SWEEP }} />
        </span>

        <div className="relative grid w-full min-w-0 gap-6 px-5 pb-7 pt-7 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] sm:gap-8 sm:px-8">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f]/55"
                style={{ borderColor: tone, color: tone, boxShadow: `0 0 14px ${tone}88, inset 0 0 10px ${tone}26` }}
              >
                <Icon className="size-6" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: tone }}>
                  {p.who}
                </span>
                <span className="block text-[24px] font-bold leading-tight tracking-tight">{p.title}</span>
              </span>
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-on-media/75">{p.body}</p>
            <div className="mt-auto pt-6">
              <Link
                href={p.cta.href}
                className="sx-sheen group relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg px-6 text-[14px] font-medium text-[#041018] transition-[box-shadow,transform] hover:-translate-y-0.5 sm:w-auto"
                style={{ background: `linear-gradient(90deg, ${tone}e6, ${tone})`, boxShadow: `0 0 18px ${tone}88` }}
              >
                {p.cta.label}
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href={p.more.href} className="mt-3 block text-[12px] font-medium text-on-media/70 transition-colors hover:text-on-media sm:ml-1 sm:inline-block">
                {p.more.label} &rarr;
              </Link>
            </div>
          </div>

          <ul className="space-y-3 border-t border-[#a9d3ff]/15 pt-5 text-[13px] text-on-media/85 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-1">
            {p.points.map((pt, i) => (
              <li key={pt} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-px grid size-[22px] shrink-0 place-items-center rounded-[5px] border font-mono text-[10px] font-bold"
                  style={{ borderColor: `${tone}66`, color: tone, background: `${tone}14` }}
                >
                  {i + 1}
                </span>
                <span className="pt-[2px] leading-snug">{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </li>
  );
}

export function Programmes() {
  return (
    <section id="programmes" aria-labelledby="programmes-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="programmes-title">
        <SectionHead eyebrow="BTG Sports Group" title="One group," accent="two programmes.">
          SponsorX is where sponsorships run. SponsorX NEXT is where students learn sports media and feature the
          athletes on it &mdash; every athlete feature carries a QR code to that athlete&rsquo;s profile.
        </SectionHead>
      </div>
      <PackageGrid label="BTG Sports Group’s programmes" className="mt-12 grid gap-7 xl:grid-cols-2">
        {PROGRAMMES.map((p, i) => (
          <ProgrammeCard key={p.key} p={p} index={i} />
        ))}
      </PackageGrid>
    </section>
  );
}

/* ------------------------------------------------------------------ close */

export function AboutClose() {
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
              <Eyebrow>Work with BTG</Eyebrow>
              <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(34px,3vw,48px)]">
                Got a question?{" "}
                <span className="sx-hero-gradient-accent sx-hero-shimmer" data-text="A person replies.">A person replies.</span>
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">
                Brand, athlete, parent or school &mdash; a person at BTG reads every message. Or skip ahead and start
                your application or brief.
              </p>
              <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-on-media/60">
                <span className="inline-flex items-center gap-2">
                  <MegaphoneIcon className="size-4 text-[#f97a1f]" />
                  Sponsors brief in about three minutes
                </span>
                <span className="inline-flex items-center gap-2">
                  <RunnerIcon className="size-4 text-[#2e9bf5]" />
                  Athletes apply in about {JOIN_MINUTES} minutes
                </span>
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
                  Contact BTG
                </Link>
              </Magnetic>
            </div>
          </div>
        </TiltSpot>
      </div>

      <p data-reveal="" className="mt-8 max-w-3xl text-[11px] leading-relaxed text-on-media/50">
        SponsorX and SponsorX NEXT are programmes of BTG Sports Group. SponsorX is a managed marketplace: sponsors
        request a brief and BTG quotes after matching. There is no self-service checkout, and money moves outside
        SponsorX.
      </p>
    </section>
  );
}
