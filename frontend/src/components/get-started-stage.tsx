/* --------------------------------------------------------------------------
   Get Started stage — the 2D UI of /get-started, in the landing page's
   visual language (the owner, 2026-10-27: "redesign the whole page based on
   the landing page and the other pages we did"). Server components; the
   motion comes from the shared client islands (hero-fx, packages-fx).

   Like /packages it is a fixed-dark "media" ground in both themes, so every
   ink is `on-media` or a fixed-dark literal (the --sx-on-media rule).

   Top to bottom:
   - StartHero    HUD eyebrow (scrambled in), the three-line headline wiping
                  up, the lede, and the landing's "REAL IMPACT" card with the
                  live network counts (hidden with no read — never samples).
                  Behind it the receding grid floor, brand glows and an
                  outlined word.
   - PathCards    the three ways in — athlete, sponsor, team or venue — as
                  the chamfered glass cards /packages uses, each in its own
                  tone, with what to expect and one call to action. Pointer
                  spotlight / tilt from lg up (PackageGrid, `.sx-pkg*`).
   - StartSteps   what happens after you choose, on the hexagon rail.
   - StartClose   for someone who already has an account.

   Every promise on the cards is the destination page's own (join-stage's
   minutes and review days, the brief's "no card, no checkout", the property
   application's automatic approval), so this page can't drift from them.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Magnetic, ScrambleText, TiltSpot } from "./hero-fx";
import { JOIN_MINUTES, REVIEW_DAYS } from "./join-stage";
import { ArrowRightIcon, ImpactCard } from "./landing-hero";
import { Glass } from "./landing-sponsors";
import { PackageGrid } from "./packages-fx";
import { Eyebrow, SectionHead, StepRule, chamfer } from "./packages-stage";
import type { PublicNetworkStats } from "@/lib/network-stats";

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

/* ------------------------------------------------------------------ icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function CheckIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.6} className={className}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

function DownIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2} className={className}>
      <path d="M12 4v16M6 14l6 6 6-6" />
    </svg>
  );
}

/** Athlete: a figure in motion. */
export function RunnerIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <circle cx="14.5" cy="4.2" r="2.2" />
      <path d="M10.6 7.4c.6-.5 1.4-.7 2.2-.5l2.7.8c.5.2.9.5 1.1 1l1.3 2.9 2.2.6a1 1 0 0 1-.5 1.9l-2.7-.7a1.3 1.3 0 0 1-.8-.7l-.7-1.5-1.4 3.2 2.2 2.2c.3.3.4.6.4 1v3.9a1 1 0 0 1-2 0v-3.5l-2.6-2.5-1.3 2.9a1.3 1.3 0 0 1-.9.7l-3.7.8a1 1 0 1 1-.4-2l3.1-.6 2.4-5.7-1.3-.4-1.7 1.9a1 1 0 1 1-1.5-1.3Z" />
    </svg>
  );
}

/** Sponsor: a megaphone. */
export function MegaphoneIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.5 3.6a1 1 0 0 1 1.5.9v13a1 1 0 0 1-1.5.9L13 15.3H8.7l.9 4.1a1 1 0 0 1-1 1.2H7a1 1 0 0 1-1-.8l-1.1-4.6A4 4 0 0 1 6 7.3h7l5.5-3.7Z" />
      <path d="M21.5 9.2a1 1 0 0 1 1 1v1.6a1 1 0 0 1-2 0v-1.6a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

/** Team or venue: a stadium. */
export function StadiumIcon({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 4c5 0 9 1.6 9 3.6v8.8c0 2-4 3.6-9 3.6s-9-1.6-9-3.6V7.6C3 5.6 7 4 12 4Zm0 2C7.9 6 5 7.1 5 7.6S7.9 9.2 12 9.2s7-1.1 7-1.6S16.1 6 12 6Zm-7 4.3v6.1c.3.5 2.3 1.4 6 1.6v-3.3a1 1 0 0 1 2 0V18c3.7-.2 5.7-1.1 6-1.6v-6.1c-1.6.6-3.8 1-6 1.1v1.4a1 1 0 0 1-2 0v-1.4c-2.2-.1-4.4-.5-6-1.1Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------- hero */

export function StartHero({ stats }: { stats: PublicNetworkStats | null }) {
  return (
    <section className="relative isolate flex min-h-[min(100svh,920px)] flex-col overflow-hidden pt-[72px]">
      {/* ground: receding grid floor, horizon glow, brand glows, outlined word */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_16%_14%,rgba(46,155,245,.24),transparent_62%),radial-gradient(50%_45%_at_86%_74%,rgba(249,122,31,.16),transparent_60%),radial-gradient(40%_40%_at_60%_100%,rgba(34,201,141,.12),transparent_65%)]" />
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[44%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
        <p className="sx-stage-word absolute -bottom-[0.18em] left-1/2 -translate-x-1/2 whitespace-nowrap text-[clamp(90px,19vw,300px)] font-black uppercase leading-none tracking-tighter">
          Start
        </p>
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#04080f]/85 via-[#04080f]/40 to-transparent lg:w-[55%]" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1320px] flex-1 grid-cols-1 items-center gap-10 px-5 py-10 sm:px-[6vw] lg:grid-cols-[minmax(0,1fr)_min(420px,32vw)] lg:gap-14 lg:py-14 2xl:px-0">
        <div className="max-w-2xl">
          <div className="sx-stage-in" style={reveal(0.05)}>
            <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
              <span>
                <ScrambleText text="Get Started" delay={0.1} />
                <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
                <ScrambleText text="Choose your path" delay={0.35} />
              </span>
              <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
            </p>
          </div>

          <h1 className="mt-5 text-[clamp(38px,8.6vw,54px)] font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:text-[clamp(48px,4.6vw,76px)]">
            <span className="sx-stage-line block" style={reveal(0.12)}>One Network.</span>
            <span className="sx-stage-line block" style={reveal(0.24)}>
              <span className="sx-hero-gradient sx-hero-shimmer" data-text="Three Ways In.">Three Ways In.</span>
            </span>
            <span className="sx-stage-line block" style={reveal(0.36)}>
              <span className="sx-hero-gradient-accent">Pick Yours.</span>
            </span>
          </h1>

          <p
            className="sx-stage-in mt-6 max-w-[540px] text-[15px] leading-[1.55] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:text-[17px]"
            style={reveal(0.3)}
          >
            SponsorX connects brands, athletes and the teams and venues that bring fans together. Choose how you take
            part &mdash; each path starts with a short application, and your account is set up from it.
          </p>

          <div className="sx-stage-in mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6" style={reveal(0.42)}>
            <Magnetic className="max-sm:w-full">
              <Link
                href="#paths"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[14px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                Choose your path
                <DownIcon className="size-[18px] transition-transform group-hover:translate-y-0.5" />
              </Link>
            </Magnetic>
            <Magnetic className="max-sm:w-full">
              <Link
                href="/login"
                className="sx-sheen group relative inline-flex h-12 w-full flex-1 items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[14px] font-medium text-on-media shadow-[0_0_14px_rgba(99,180,248,.25)] backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:h-[52px] sm:flex-none sm:px-9 sm:text-[15px]"
              >
                I have an account
                <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Magnetic>
          </div>
        </div>

        {/* the landing's live network card — real counts, or nothing */}
        <ImpactCard stats={stats} linkBase="/" className="sx-stage-in w-full lg:justify-self-end" style={reveal(0.35)} />
      </div>

      <div
        aria-hidden="true"
        className="sx-stage-in pointer-events-none relative mx-auto mb-6 hidden w-full max-w-[1320px] items-center gap-3 px-[6vw] lg:flex 2xl:px-0 [@media(max-height:820px)]:hidden"
        style={reveal(1)}
      >
        <span className="sx-scroll-cue relative block h-9 w-px overflow-hidden bg-on-media/20" />
        <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-on-media/60">Scroll to choose</span>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- the paths */

type Path = {
  key: string;
  href: string;
  /** The tone the card glows in — the portal's colour where it has one. */
  tone: string;
  who: string;
  title: string;
  pitch: string;
  icon: (p: { className?: string }) => ReactNode;
  expect: string[];
  cta: string;
  more?: { href: string; label: string };
};

const PATHS: Path[] = [
  {
    key: "athlete",
    href: "/join",
    tone: "#2e9bf5",
    who: "For athletes",
    title: "Apply as an athlete",
    pitch: "Get paid to post, appear and represent brands your fans already love.",
    icon: RunnerIcon,
    expect: [
      `About ${JOIN_MINUTES} minutes — save and finish later`,
      `A person at BTG reads it, usually within ${REVIEW_DAYS} business days`,
      "Under 18? A parent or guardian joins you",
    ],
    cta: "Start my application",
  },
  {
    key: "sponsor",
    href: "/brief",
    tone: "#f97a1f",
    who: "For brands & sponsors",
    title: "Request a sponsor brief",
    pitch: "Tell BTG the goal, budget and market — get a matched shortlist of athletes back.",
    icon: MegaphoneIcon,
    expect: ["Four steps, about three minutes", "No card, no checkout", "Every athlete screened for conflicts first"],
    cta: "Start my brief",
    more: { href: "/packages", label: "See the packages first" },
  },
  {
    key: "property",
    href: "/onboarding",
    tone: "#22c98d",
    who: "For teams, schools & venues",
    title: "List your team or venue",
    pitch: "Sell your sponsorship inventory — events, media and spaces — on the SponsorX marketplace.",
    icon: StadiumIcon,
    expect: [
      "Organisation, contacts and how you get paid",
      "Approved automatically once your documents are in and your email is confirmed",
      "No bank or tax details — those go to our payment partner",
    ],
    cta: "Start my application",
  },
];

function PathCard({ p, index }: { p: Path; index: number }) {
  const Icon = p.icon;
  return (
    <li data-pkg="" data-reveal="" className="sx-pkg relative flex min-w-0 text-on-media" style={{ "--tone": p.tone, ...slot(index) } as CSSProperties}>
      <div className="sx-pkg-card relative flex w-full min-w-0">
        <Glass
          plate={CARD.plate}
          ringClip={CARD_RING}
          fill="bg-gradient-to-b from-[#0a1a30]/70 via-[#06101f]/75 to-[#040a16]/85"
          outline="bg-gradient-to-br from-[#bfe0ff]/90 via-[#8fc8ff]/50 to-[#8fc8ff]/25"
        />
        {/* the path's tone bleeding in from the top edge */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ clipPath: CARD.plate, background: `radial-gradient(90% 55% at 50% 0%, ${p.tone}38, transparent 70%)` }}
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

        <div className="relative flex w-full min-w-0 flex-col px-5 pb-6 pt-7 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: p.tone }}>
              <span aria-hidden="true" className="h-px w-6 opacity-70" style={{ background: p.tone }} />
              {p.who}
            </p>
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-full border-[1.5px] bg-[#08172f]/55"
              style={{ borderColor: p.tone, color: p.tone, boxShadow: `0 0 14px ${p.tone}88, inset 0 0 10px ${p.tone}26` }}
            >
              <Icon className="size-[22px]" />
            </span>
          </div>

          <h3 className="mt-3 text-[22px] font-semibold leading-tight tracking-tight">{p.title}</h3>
          <p className="mt-2 text-[13.5px] leading-relaxed text-on-media/75">{p.pitch}</p>

          <StepRule className="mt-5 -mr-6 w-[calc(100%+24px)]" />

          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-on-media/55">What to expect</p>
          <ul className="mt-2.5 flex-1 space-y-2 text-[13px] text-on-media/85">
            {p.expect.map((it) => (
              <li key={it} className="flex items-start gap-2.5">
                <span style={{ color: p.tone }}>
                  <CheckIcon className="mt-[3px] size-3.5 shrink-0" />
                </span>
                {it}
              </li>
            ))}
          </ul>

          <Link
            href={p.href}
            className="sx-sheen group relative mt-6 inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-[14px] font-medium text-white transition-[box-shadow,transform,border-color] hover:-translate-y-0.5"
            style={{ background: `linear-gradient(90deg, ${p.tone}e6, ${p.tone})`, boxShadow: `0 0 18px ${p.tone}88` }}
            aria-label={`${p.title} — ${p.cta.toLowerCase()}`}
          >
            {p.cta}
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          {p.more ? (
            <Link href={p.more.href} className="mt-3 text-center text-[12px] font-medium text-on-media/70 transition-colors hover:text-on-media">
              {p.more.label} &rarr;
            </Link>
          ) : (
            <span aria-hidden="true" className="mt-3 block h-[18px]" />
          )}
        </div>
      </div>
    </li>
  );
}

export function PathCards() {
  return (
    <section id="paths" aria-labelledby="paths-title" className="relative mx-auto w-full max-w-[1320px] scroll-mt-16 px-5 pb-20 pt-6 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="paths-title">
        <SectionHead eyebrow="Choose your path" title="Who are you" accent="joining as?">
          Pick the one that fits. You can always talk to BTG if you&rsquo;re more than one.
        </SectionHead>
      </div>
      <PackageGrid label="Ways to join SponsorX" className="mt-12 grid gap-7 md:grid-cols-2 xl:grid-cols-3">
        {PATHS.map((p, i) => (
          <PathCard key={p.key} p={p} index={i} />
        ))}
      </PackageGrid>
    </section>
  );
}

/* ------------------------------------------------------------------ steps */

const STEPS = [
  ["Choose your path", "Athlete, sponsor, or team and venue — each has its own short application."],
  ["Apply in minutes", "Save as you go. We email you to confirm it’s really you."],
  ["Your portal opens", "Athletes see offers, sponsors their campaigns, teams and venues their listings."],
] as const;

export function StartSteps() {
  return (
    <section aria-labelledby="start-steps-title" className="relative mx-auto w-full max-w-[1320px] px-5 pb-20 sm:px-[6vw] lg:pb-28 2xl:px-0">
      <div id="start-steps-title">
        <SectionHead eyebrow="What happens next" title="Three steps," accent="then you’re in.">
          BTG runs the marketplace and sets up your account from your application &mdash; you bring the talent, the brand or the venue.
        </SectionHead>
      </div>

      <ol className="relative mt-14 grid gap-5 md:grid-cols-3 md:gap-7">
        <span aria-hidden="true" className="absolute left-[16%] right-[16%] top-[52px] hidden h-px overflow-hidden bg-gradient-to-r from-[#7fd0ff]/10 via-[#7fd0ff]/50 to-[#7fd0ff]/10 md:block">
          <span className="sx-rule-pulse absolute inset-y-0 left-0 w-28" />
        </span>
        {STEPS.map(([title, body], i) => (
          <li key={title} data-reveal="" style={slot(i)} className="relative">
            <div className="relative h-full px-6 pb-7 pt-6 text-center">
              <Glass
                plate={CARD.plate}
                ringClip={CARD_RING}
                fill="bg-gradient-to-b from-[#0a1a30]/60 via-[#06101f]/65 to-[#040a16]/80"
                outline="bg-gradient-to-br from-[#bfe0ff]/70 via-[#8fc8ff]/35 to-[#8fc8ff]/15"
              />
              <span aria-hidden="true" className="relative mx-auto grid size-[58px] place-items-center">
                <span className="sx-orbit absolute -inset-2 rounded-full border border-dashed border-[#7fd0ff]/35" />
                <svg viewBox="0 0 48 48" className="sx-glow-turn absolute inset-0 size-full text-[#7fd0ff]" style={slot(i)}>
                  <path d={HEX} fill="rgba(8,23,47,.85)" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className="relative font-mono text-[16px] font-bold text-on-media">{String(i + 1).padStart(2, "0")}</span>
              </span>
              <h3 className="relative mt-5 text-[17px] font-semibold tracking-tight">{title}</h3>
              <p className="relative mx-auto mt-2 max-w-[280px] text-[13px] leading-relaxed text-on-media/70">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ close */

export function StartClose() {
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
              <Eyebrow>Already on SponsorX?</Eyebrow>
              <h2 className="mt-4 text-[clamp(28px,6.4vw,40px)] font-bold leading-[1.08] tracking-tight lg:text-[clamp(34px,3vw,48px)]">
                Pick up{" "}
                <span className="sx-hero-gradient-accent sx-hero-shimmer" data-text="where you left off.">where you left off.</span>
              </h2>
              <p className="mt-4 max-w-[560px] text-[15px] leading-[1.55] text-on-media/75">
                Sign in to your portal. Not sure which path is yours, or you&rsquo;re more than one? Ask BTG &mdash; a
                person replies.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Magnetic>
                <span className="sx-cta-pulse relative block w-full rounded-xl">
                  <Link
                    href="/login"
                    className="sx-sheen group relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] px-5 text-[15px] font-medium text-white shadow-[0_0_30px_rgba(46,155,245,.55)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(46,155,245,.7)] sm:px-9"
                  >
                    Sign in
                    <ArrowRightIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </span>
              </Magnetic>
              <Magnetic>
                <Link
                  href="/contact"
                  className="sx-sheen relative inline-flex h-[52px] w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/45 px-5 text-[15px] font-medium text-on-media backdrop-blur-lg transition-colors hover:border-[#bfe0ff] hover:bg-[#2e9bf5]/15 sm:px-9"
                >
                  Talk to BTG
                </Link>
              </Magnetic>
            </div>
          </div>
        </TiltSpot>
      </div>
    </section>
  );
}
