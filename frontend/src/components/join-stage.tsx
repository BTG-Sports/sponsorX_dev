/* --------------------------------------------------------------------------
   Athlete Application stage — the 2D UI around the /join wizard (§11),
   redesigned 2026-09-30 to carry the landing's and /packages' visual
   language (owner: "it looks plain compared to the landing page and
   /packages"). Server components; the wizard itself is the client island
   join-wizard.tsx, and the reveals ride /packages' StageReveal.

   Same rule as packages-stage.tsx: the whole stage is a fixed-dark "media"
   ground in both themes, so its own inks are `on-media` or fixed-dark
   literals. The wizard inside still reads the themed tokens (text, muted,
   surface …) — `.sx-join` in globals.css re-pins those to their dark values
   for this subtree, the login page's precedent, so a Frost user gets the
   same night stage instead of dark ink on dark glass.

   Top to bottom:
   - JoinHero      the ground (glows, receding floor grid, outlined
                   "ATHLETES"), and a split stage from lg: the sticky HUD
                   panel — scrambled eyebrow, three-line masked headline and
                   the "THE APPLICATION" glass card — beside the wizard's
                   chamfered glass panel. Below lg a compact hero sits above
                   the wizard, only while it is on its intro (the wizard
                   writes `data-phase` onto `.sx-join`), so a phone in
                   the middle of a section sees the form, not the poster.
   - JoinPath      what happens after submitting, the §39 loop from the
                   athlete's side, on one glowing track (vertical below lg).
   - JoinPromises  the three promises the old brand panel listed.
   - JoinClose     the closing glass panel and the fine print.
   Between hero and path the page drops /packages' InsideBand, carrying the
   seven §5 job types by name.

   Every figure is derived: section and branch counts from SECTIONS, the
   minutes and review days from the constants below, which the copy on this
   page and the wizard's intro both state.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CountUp } from "./count-up";
import { Magnetic, ScrambleText } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { Eyebrow, SectionHead, StepRule, chamfer } from "./packages-stage";
import { NEVER_ASKED, SECTIONS } from "@/lib/join-flow";

/* ------------------------------------------------------------------ facts */

/** "About 8 minutes" — the wizard's intro says the same. */
export const JOIN_MINUTES = 8;
/** "Usually within 3 business days." */
export const REVIEW_DAYS = 3;

const SECTION_COUNT = SECTIONS.length;
const BRANCHES = SECTIONS.filter((s) => s.minorOnly).length;
const WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/* ----------------------------------------------------------------- shapes */

const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const CARD = chamfer(16);
const CARD_RING = CARD.ring(1);

/** Flat-topped hexagon, 0..48 box (BriefSteps' badge). */
const HEX = "M14 3h20l12 21-12 21H14L2 24Z";

const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;
const slot = (i: number) => ({ "--i": i }) as CSSProperties;

/* ------------------------------------------------------------------ icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ListIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={3} />
    </svg>
  );
}

function ClockIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function ReviewIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19.5a6.5 6.5 0 0 1 11-4.7" />
      <path d="m15 18.5 2 2 4-4.5" />
    </svg>
  );
}

function BranchIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <path d="M6 7v10M18 11c0 4-6 3-11.2 6.6" />
    </svg>
  );
}

function ShieldIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M12 3 19.5 6v5.5c0 4.6-3.1 8-7.5 9.5-4.4-1.5-7.5-4.9-7.5-9.5V6L12 3Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  );
}

function SaveIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 3.5v5h-5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20.5v-5h5" />
    </svg>
  );
}

/* ------------------------------------------------------------------- hero */

/** The HUD figures, shared by the desktop card and the phone strip. */
const FIGURES = [
  { icon: ListIcon, value: <CountUp value={SECTION_COUNT} />, label: "Sections", short: "Sections" },
  { icon: ClockIcon, value: <>~<CountUp value={JOIN_MINUTES} /></>, label: "Minutes to finish", short: "Minutes" },
  { icon: ReviewIcon, value: <CountUp value={REVIEW_DAYS} />, label: "Business days to review", short: "Day review" },
  { icon: BranchIcon, value: <CountUp value={BRANCHES} />, label: "Branch — under 18 only", short: "Branch" },
];

function ApplicationCard() {
  return (
    <aside className="relative text-on-media" aria-labelledby="application-title">
      <Glass
        plate={CARD.plate}
        ringClip={CARD_RING}
        lit
        fill="bg-gradient-to-b from-[#0d1f3d]/60 via-[#07122a]/65 to-[#04091a]/80"
        outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/70 to-[#7fd0ff]/30"
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: CARD.plate }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]">
        <span className="absolute right-0 top-0 h-[26px] w-[2px] bg-[#d6ecff]" />
        <span className="absolute right-0 top-0 h-[2px] w-[26px] bg-[#d6ecff]" />
        <span className="absolute bottom-0 left-0 h-[22px] w-[1.5px] bg-[#d6ecff] opacity-70" />
        <span className="absolute bottom-0 left-0 h-[1.5px] w-[22px] bg-[#d6ecff] opacity-70" />
      </span>

      <div className="relative px-6 pb-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="application-title" className="text-[13px] font-normal uppercase tracking-[0.24em]">
            The Application
          </h2>
          <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/60">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#22c98d] shadow-[0_0_8px_#22c98d]" />
            Saves as you go
          </span>
        </div>
        <StepRule className="-mr-6 mt-1 w-[calc(100%+24px)]" />

        <ul className="mt-1 grid grid-cols-2 gap-x-5">
          {FIGURES.map(({ icon: Icon, value, label }, i) => (
            <li key={label} className={`flex items-center gap-3.5 py-3 ${i > 1 ? "border-t border-[#a9d3ff]/15" : ""}`}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-[#4fb0ff] bg-[#08172f]/55 text-[#4fb0ff] shadow-[0_0_14px_rgba(79,176,255,.5),inset_0_0_10px_rgba(79,176,255,.15)]">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[24px] font-bold leading-none tracking-tight">{value}</span>
                <span className="mt-1 block text-[10px] uppercase leading-tight tracking-[0.08em] text-on-media/75">{label}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* the wizard's progress bar, previewed: one segment per section,
            the enforced one in orange, the branch dashed */}
        <div className="mt-2 border-t border-[#a9d3ff]/15 pt-4">
          <div aria-hidden="true" className="flex h-9 items-end gap-1">
            {SECTIONS.map((s, i) => {
              const enforced = s.id === "restrictions";
              const tone = enforced || s.minorOnly ? "#fb923c" : "#4fb0ff";
              return (
                <span
                  key={s.id}
                  className="sx-bar flex-1 -skew-x-[18deg] rounded-[2px]"
                  style={{
                    height: `${38 + (i / (SECTION_COUNT - 1)) * 62}%`,
                    ...(s.minorOnly
                      ? { border: `1px dashed ${tone}`, background: `${tone}14` }
                      : { background: `linear-gradient(to top, ${tone}22, ${tone})`, boxShadow: `0 0 10px ${tone}66` }),
                    ...slot(i),
                  }}
                />
              );
            })}
          </div>
          <p className="mt-2 flex justify-between text-[9px] uppercase tracking-[0.18em] text-on-media/55">
            <span>Identity</span>
            <span className="text-[#fb923c]/90">Enforced · Branch</span>
            <span>Agreement</span>
          </p>
        </div>
      </div>
    </aside>
  );
}

function Headline({ className = "" }: { className?: string }) {
  return (
    <h2 className={`font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] ${className}`}>
      <span className="sx-stage-line block" style={reveal(0.12)}>Your Name.</span>
      <span className="sx-stage-line block" style={reveal(0.24)}>
        <span className="sx-hero-gradient sx-hero-shimmer" data-text="Your Game.">Your Game.</span>
      </span>
      <span className="sx-stage-line block" style={reveal(0.36)}>Your Sponsors.</span>
    </h2>
  );
}

/** `centred`: the sm–lg hero sits on the wizard's axis, so the rule is
 *  mirrored on the left there (phones and lg+ keep the single trailing one). */
function HeroEyebrow({ centred = false }: { centred?: boolean }) {
  return (
    <p className={`flex items-center gap-4 whitespace-nowrap ${centred ? "sm:justify-center" : ""} text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]`}>
      {centred && <span aria-hidden="true" className="hidden h-px w-24 bg-on-media/60 sm:block" />}
      <span>
        <ScrambleText text="Athlete Network" delay={0.1} />
        <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
        <ScrambleText text="Apply" delay={0.35} />
      </span>
      <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
    </p>
  );
}

/** The wizard's frame: chamfered glass from sm, full-bleed on a phone. The
 *  content box is clipped to the plate so the sticky action bar can never
 *  paint past the cut corner. `.sx-join-stage` is the glow the wizard
 *  crossfades as the athlete passes the enforced section. */
function WizardPanel({ children }: { children: ReactNode }) {
  return (
    <div id="apply" className="sx-join-stage sx-stage-in relative mx-auto w-full max-w-[460px] scroll-mt-24 lg:mx-0" style={reveal(0.3)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden sm:block">
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          lit
          fill="bg-gradient-to-b from-[#0b1b35]/80 via-[#06101f]/85 to-[#040a16]/90"
          outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/60 to-[#fb923c]/50"
        />
        <span className="sx-scan absolute inset-0" style={{ clipPath: PANEL.plate }} />
        <span className="absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]">
          <span className="absolute right-0 top-0 h-[34px] w-[2px] bg-[#d6ecff]" />
          <span className="absolute right-0 top-0 h-[2px] w-[34px] bg-[#d6ecff]" />
          <span className="absolute bottom-0 left-0 h-[28px] w-[1.5px] bg-[#d6ecff] opacity-70" />
          <span className="absolute bottom-0 left-0 h-[1.5px] w-[28px] bg-[#d6ecff] opacity-70" />
        </span>
      </div>
      <div className="relative sm:m-px sm:[clip-path:var(--sx-plate)]" style={{ "--sx-plate": PANEL.plate } as CSSProperties}>
        {children}
      </div>
    </div>
  );
}

export function JoinHero({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate flex min-h-[min(100svh,980px)] flex-col pt-[72px]">
      {/* ground: brand glows, receding floor, horizon, outlined word — the
          whole hero tall, so it runs down to the band however long the wizard is */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_16%_14%,rgba(46,155,245,.24),transparent_62%),radial-gradient(45%_45%_at_82%_40%,rgba(46,155,245,.14),transparent_65%),radial-gradient(55%_45%_at_88%_88%,rgba(249,122,31,.16),transparent_60%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(80px,17vw,280px)] font-black uppercase leading-none tracking-tighter">
          Athletes
        </p>
        <div className="absolute inset-y-0 left-0 hidden w-[55%] bg-gradient-to-r from-[#04080f]/80 via-[#04080f]/30 to-transparent lg:block" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] grid-cols-1 gap-8 pb-10 pt-6 sm:px-[6vw] sm:pt-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:items-start lg:gap-16 lg:pb-24 lg:pt-14 xl:gap-24 2xl:px-0">
        {/* ------------------------------------- HUD panel (lg+), sticky */}
        <div className="hidden lg:sticky lg:top-28 lg:block lg:self-start">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <HeroEyebrow />
          </div>
          <Headline className="mt-5 text-[clamp(48px,4.5vw,74px)]" />
          <p
            className="sx-stage-in mt-6 max-w-[500px] text-[16px] leading-[1.6] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)]"
            style={reveal(0.3)}
          >
            Everything in SponsorX starts with this application. Sponsors, campaigns, rewards and earnings all
            begin with an athlete joining the network &mdash; {WORDS[SECTION_COUNT]?.toLowerCase() ?? SECTION_COUNT}{" "}
            sections, {WORDS[BRANCHES]?.toLowerCase() ?? BRANCHES} branch, no surprises.
          </p>
          <div className="sx-stage-in mt-9 max-w-[500px] [@media(max-height:760px)]:hidden" style={reveal(0.45)}>
            <ApplicationCard />
          </div>
        </div>

        {/* ------------------------- phone / tablet hero, intro only */}
        {/* Left-aligned on a phone, like the full-bleed form under it; from sm
            the panel is a centred 460px column, so the hero centres on the
            same axis and its stats strip takes the panel's exact width. */}
        <div className="sx-join-mhero px-5 sm:mx-auto sm:w-full sm:max-w-[620px] sm:px-0 sm:pt-4 sm:text-center lg:hidden">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <HeroEyebrow centred />
          </div>
          <Headline className="mt-4 text-[clamp(36px,10vw,56px)] sm:mt-6 sm:text-[clamp(52px,8.4vw,76px)]" />
          <p className="sx-stage-in mt-4 max-w-[520px] text-[15px] leading-[1.55] text-on-media/85 sm:mx-auto sm:mt-5 sm:text-[16px]" style={reveal(0.3)}>
            Everything in SponsorX starts with this application. A person at BTG reads every one.
          </p>
          <ul
            aria-label="The application"
            className="sx-stage-in mt-6 grid max-w-[520px] grid-cols-4 sm:mx-auto sm:mt-8 sm:max-w-[460px] divide-x divide-[#a9d3ff]/15 rounded-lg border border-[#9cc7ff]/25 bg-[#06101f]/60 py-3 shadow-[0_0_18px_-6px_rgba(46,155,245,.6)] backdrop-blur-md"
            style={reveal(0.4)}
          >
            {FIGURES.map(({ value, short }) => (
              <li key={short} className="min-w-0 px-2 text-center">
                <span className="block text-[20px] font-bold leading-none tracking-tight">{value}</span>
                <span className="mt-1 block truncate text-[9px] uppercase tracking-[0.1em] text-on-media/65">{short}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ---------------------------------------------------- the wizard */}
        <WizardPanel>{children}</WizardPanel>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- path */

/** What happens after "Submit" — the §39 loop, athlete side. */
const PATH = [
  ["Apply", `${WORDS[SECTION_COUNT] ?? SECTION_COUNT} sections, about ${JOIN_MINUTES} minutes. Save and finish later whenever you like.`],
  ["Hand review", `A person at BTG reads your application — usually within ${REVIEW_DAYS} business days.`],
  ["Rate card", "Once approved, BTG sets your NIL rate for each of the seven job types, by tier."],
  ["Invitations", "BTG matches you to sponsor briefs. Every invitation is yours to accept or decline."],
  ["Deliver", "Post the content or make the appearance; fans redeem the reward by QR."],
  ["Earnings", "Each completed deliverable shows in your earnings. Payment happens outside SponsorX in Phase 1."],
] as const;

const PATH_TONES = ["#7fd0ff", "#7fd0ff", "#4fb0ff", "#2e9bf5", "#fb923c", "#fb923c"];

function PathNode({ i, tone }: { i: number; tone: string }) {
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

export function JoinPath() {
  return (
    <section aria-labelledby="path-title" className="relative mx-auto w-full max-w-[1320px] px-5 py-20 sm:px-[6vw] lg:py-28 2xl:px-0">
      <div id="path-title">
        <SectionHead eyebrow="After you apply" title="From application" accent="to first campaign.">
          The application is the front door. This is what happens behind it, in order &mdash; the same loop every
          athlete on the network runs.
        </SectionHead>
      </div>

      {/* lg+: one track, six stops */}
      <ol className="relative mt-16 hidden grid-cols-6 gap-6 lg:grid">
        <span aria-hidden="true" className="absolute left-[26px] right-[calc(100%/6-26px)] top-[26px] h-[2px] overflow-hidden rounded-full bg-gradient-to-r from-[#7fd0ff]/70 via-[#2e9bf5]/80 to-[#fb923c]/80 shadow-[0_0_14px_rgba(46,155,245,.55)]">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-40" />
        </span>
        {PATH.map(([title, body], i) => (
          <li key={title} data-reveal="" style={slot(i)} className="relative">
            <PathNode i={i} tone={PATH_TONES[i]} />
            <p className="mt-6 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: PATH_TONES[i] }}>
              Step {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-on-media/70">{body}</p>
          </li>
        ))}
      </ol>

      {/* below lg: the same stops on a vertical rail */}
      <ol data-reveal="" className="relative mt-12 max-w-2xl space-y-7 lg:hidden">
        <span aria-hidden="true" className="absolute bottom-6 left-[25px] top-6 w-[2px] rounded-full bg-gradient-to-b from-[#7fd0ff]/70 via-[#2e9bf5]/80 to-[#fb923c]/80 shadow-[0_0_12px_rgba(46,155,245,.5)]" />
        {PATH.map(([title, body], i) => (
          <li key={title} className="relative flex gap-5">
            <PathNode i={i} tone={PATH_TONES[i]} />
            <div className="min-w-0 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: PATH_TONES[i] }}>
                Step {String(i + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-[17px] font-semibold tracking-tight">{title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-on-media/70">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* --------------------------------------------------------------- promises */

const PROMISES = [
  { icon: ReviewIcon, title: "Reviewed by hand", body: `A person at BTG reads every application — usually within ${REVIEW_DAYS} business days.` },
  { icon: ShieldIcon, title: "Nothing sensitive is collected", body: NEVER_ASKED },
  { icon: SaveIcon, title: "Leave and come back", body: `Progress is saved after every section. The whole thing takes about ${JOIN_MINUTES} minutes.` },
] as const;

export function JoinPromises() {
  return (
    <section aria-labelledby="promises-title" className="relative mx-auto w-full max-w-[1320px] px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="promises-title">
        <SectionHead eyebrow="Our promises" title="A few minutes of your time." accent="No surprises." />
      </div>

      <ul className="mt-12 grid gap-5 md:grid-cols-3 md:gap-7">
        {PROMISES.map(({ icon: Icon, title, body }, i) => (
          <li key={title} data-reveal="" style={slot(i)} className="relative">
            <div className="relative h-full px-6 pb-7 pt-7">
              <Glass
                plate={CARD.plate}
                ringClip={CARD_RING}
                fill="bg-gradient-to-b from-[#0a1a30]/65 via-[#06101f]/70 to-[#040a16]/85"
                outline="bg-gradient-to-br from-[#bfe0ff]/80 via-[#8fc8ff]/40 to-[#8fc8ff]/15"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-60"
                style={{ clipPath: CARD.plate, background: "radial-gradient(80% 50% at 20% 0%, rgba(34,201,141,.16), transparent 70%)" }}
              />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden" style={{ clipPath: CARD.plate }}>
                <span className="absolute -bottom-5 -right-1 font-mono text-[112px] font-bold leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(158,208,255,.1)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </span>
              <span className="relative grid size-11 place-items-center rounded-full border-[1.5px] border-[#22c98d] bg-[#06151a]/70 text-[#22c98d] shadow-[0_0_14px_rgba(34,201,141,.45),inset_0_0_10px_rgba(34,201,141,.15)]">
                <Icon className="size-5" />
              </span>
              <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
              <p className="relative mt-2 max-w-[340px] text-[13px] leading-relaxed text-on-media/70">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ close */

export function JoinClose() {
  return (
    <section className="relative mx-auto w-full max-w-[1320px] px-5 pb-16 sm:px-[6vw] lg:pb-24 2xl:px-0">
      <div data-reveal="" className="relative">
        <Glass
          plate={PANEL.plate}
          ringClip={PANEL_RING}
          lit
          fill="bg-gradient-to-br from-[#0d1f3d]/80 via-[#07122a]/80 to-[#1a0f08]/80"
          outline="bg-gradient-to-r from-[#bfe6ff] via-[#7fd0ff]/60 to-[#fb923c]/70"
        />
        <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PANEL.plate }} />
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
            <Eyebrow>Ready when you are</Eyebrow>
            <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(34px,3vw,48px)]">
              One application.{" "}
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="Every campaign after it.">Every campaign after it.</span>
            </h2>
            <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">
              Start now and finish later &mdash; progress saves after every section, and nothing is sent until
              you submit on the last one.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <Magnetic>
              <span className="sx-cta-pulse relative block w-full rounded-xl">
                <a
                  href="#apply"
                  className="sx-sheen group relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[15px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:px-9"
                >
                  Go to the application
                  <ArrowRightIcon className="size-[18px] -rotate-90 transition-transform group-hover:-translate-y-0.5" />
                </a>
              </span>
            </Magnetic>
            <Magnetic>
              <Link
                href="/packages"
                className="sx-sheen relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[15px] font-medium text-on-media backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:px-9"
              >
                See what sponsors buy
              </Link>
            </Magnetic>
          </div>
        </div>
      </div>

      <p data-reveal="" className="mt-8 max-w-3xl text-[11px] leading-relaxed text-on-media/50">
        Athletes under 18 add a parent, guardian or authorized representative &mdash; the one extra section.{" "}
        {NEVER_ASKED}
      </p>
    </section>
  );
}
