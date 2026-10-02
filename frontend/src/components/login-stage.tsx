/* --------------------------------------------------------------------------
   Sign-in stage — the 2D UI around Clerk's <SignIn> on /login (§9 screen 2),
   redesigned 2026-10-02 to carry the landing's, /packages', /join's and
   /next/about's visual language (owner: make the login as lively as those).
   Server components; the client islands are login-fx.tsx (the stage root,
   the panel spotlight, the workspace cycler) and the landing's ScrambleText,
   Magnetic and CountUp.

   Same rule as packages-stage.tsx: the whole stage is a fixed-dark "media"
   ground in both themes, so its own inks are `on-media` or fixed-dark
   literals. Clerk's widget and the new-user links read themed tokens —
   `.sx-login` in globals.css re-pins those to their dark values, so a Frost
   user gets the same night stage.

   Layers, back to front:
   - LoginGround   brand glows, a light that follows the pointer, two
                   floodlight beams sweeping (the old Stadium Night scene,
                   kept), rising motes, the receding floor grid — the floor
                   drifts against the pointer for depth (`--tx` / `--ty`,
                   LoginStage). No outlined word here: the landing's footer
                   under the stage carries the SPONSORX wordmark.
   - LoginTopBar   the lockup home and a "Back to site" link: /login sits
                   outside the public site, so it has no header of its own.
   - LoginHud      (lg+) scrambled eyebrow, the three-line masked headline,
                   the dek, "Where you'll land" (PortalCycler in a glass
                   card) and the network figures.
   - LoginMHero    (below lg) eyebrow and headline above the panel.
   - SignInPanel   chamfered glass with lit brackets, a scan line and an
                   outline spotlight; Clerk inside, then the two front doors
                   for someone without an account.
   - LoginFigures  the network figures — fixtures, and they say so (the
                   P7-QA-02 rule, same as the landing's impact card).
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { CountUp } from "./count-up";
import { Magnetic, ScrambleText } from "./hero-fx";
import { ArrowRightIcon } from "./landing-hero";
import { JOIN_MINUTES } from "./join-stage";
import { Glass } from "./landing-sponsors";
import { PortalCycler, SpotRing } from "./login-fx";
import { Logo } from "./logo";
import { StepRule, chamfer } from "./packages-stage";
import { networkStats } from "@/lib/fixtures";

/* ----------------------------------------------------------------- shapes */

const PANEL = chamfer(22);
const PANEL_RING = PANEL.ring(1);
const PANEL_SPOT = PANEL.ring(2);
const CARD = chamfer(16);
const CARD_RING = CARD.ring(1);

const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as CSSProperties;

/* ----------------------------------------------------------------- ground */

/** Rising motes: left %, size px, duration s, delay s, tone. Fixed, so the
 *  server and client render the same ground. */
const MOTES: ReadonlyArray<readonly [number, number, number, number, string]> = [
  [6, 3, 15, 0, "#7fd0ff"],
  [13, 2, 19, 6, "#f4f5f7"],
  [21, 4, 17, 2.5, "#4fb0ff"],
  [29, 2, 22, 9, "#fb923c"],
  [37, 3, 16, 4, "#f4f5f7"],
  [44, 2, 20, 11, "#7fd0ff"],
  [52, 3, 18, 1, "#fb923c"],
  [59, 2, 23, 7.5, "#4fb0ff"],
  [66, 4, 17, 3.5, "#f4f5f7"],
  [73, 2, 21, 12, "#7fd0ff"],
  [81, 3, 16, 5.5, "#fb923c"],
  [88, 2, 19, 0.8, "#4fb0ff"],
  [94, 3, 24, 8.5, "#f4f5f7"],
];

export function LoginGround() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(55%_50%_at_14%_12%,rgba(46,155,245,.24),transparent_62%),radial-gradient(45%_45%_at_84%_36%,rgba(46,155,245,.14),transparent_65%),radial-gradient(55%_45%_at_86%_92%,rgba(249,122,31,.16),transparent_60%)]" />
      <div className="sx-login-light absolute inset-0" />

      <div className="sx-login-beam sx-login-beam-1" />
      <div className="sx-login-beam sx-login-beam-2" />
      <div className="sx-login-beam sx-login-beam-3" />

      <div className="sx-login-depth absolute inset-0" style={{ "--depth": 1 } as CSSProperties}>
        <div className="sx-stage-floor" />
        <div className="absolute inset-x-0 bottom-[46%] h-px bg-gradient-to-r from-transparent via-[#7fd0ff]/60 to-transparent shadow-[0_0_24px_4px_rgba(46,155,245,.35)]" />
      </div>
      {MOTES.map(([left, size, dur, delay, tone]) => (
        <span
          key={left}
          className="sx-login-mote absolute bottom-0 rounded-full"
          style={{
            left: `${left}%`,
            width: size,
            height: size,
            background: tone,
            boxShadow: `0 0 ${size * 3}px ${tone}`,
            animationDuration: `${dur}s`,
            animationDelay: `-${delay}s`,
          }}
        />
      ))}

      {/* ground under the HUD copy, so the floor lines never cross the text */}
      <div className="absolute inset-y-0 left-0 hidden w-[58%] bg-gradient-to-r from-[#04080f]/80 via-[#04080f]/35 to-transparent lg:block" />
    </div>
  );
}

/* ---------------------------------------------------------------- top bar */

export function LoginTopBar() {
  return (
    <header className="sx-stage-in relative z-10 flex items-center justify-between px-5 pt-5 sm:px-[6vw] sm:pt-7 2xl:px-[8vw]" style={reveal(0)}>
      <Link href="/" className="shrink-0 leading-none" aria-label="SponsorX home">
        <Logo className="h-8 sm:h-9" />
      </Link>
      <Link
        href="/"
        className="group inline-flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.2em] text-on-media/70 transition-colors hover:text-on-media"
      >
        <ArrowRightIcon className="size-4 rotate-180 transition-transform group-hover:-translate-x-0.5" />
        <span className="hidden sm:inline">Back to site</span>
        <span className="sm:hidden">Site</span>
      </Link>
    </header>
  );
}

/* ------------------------------------------------------------------- copy */

function Eyebrow() {
  return (
    <p className="flex items-center gap-4 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.2em] text-on-media/85 sm:text-[11px] sm:tracking-[0.3em]">
      <span>
        <ScrambleText text="SponsorX" delay={0.1} />
        <span className="mx-2 text-on-media/40 sm:mx-3">/</span>
        <ScrambleText text="Sign in" delay={0.35} />
      </span>
      <span aria-hidden="true" className="h-px w-16 min-w-0 shrink bg-on-media/60 sm:w-24" />
      <span aria-hidden="true" className="sx-hud-dashes -ml-2 hidden text-[#7fc4ff] sm:block" />
    </p>
  );
}

function Headline({ className = "" }: { className?: string }) {
  return (
    <h1 className={`font-bold leading-[1.02] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] ${className}`}>
      <span className="sx-stage-line block" style={reveal(0.12)}>Welcome Back.</span>
      <span className="sx-stage-line block" style={reveal(0.24)}>
        <span className="sx-hero-gradient sx-hero-shimmer" data-text="Your Network.">Your Network.</span>
      </span>
      <span className="sx-stage-line block" style={reveal(0.36)}>
        <span className="sx-hero-gradient-accent">Is Live.</span>
      </span>
    </h1>
  );
}

/* ---------------------------------------------------------------- figures */

const [ATHLETES, CAMPAIGNS, , REDEEMED] = networkStats;
const FIGURES = [ATHLETES, CAMPAIGNS, REDEEMED].map((s) => ({
  ...s,
  short: s.label.replace(/ in the network| delivered| redeemed/i, ""),
}));

export function LoginFigures({ className = "" }: { className?: string }) {
  return (
    <ul
      aria-label="The network"
      className={`grid grid-cols-3 divide-x divide-[#a9d3ff]/15 rounded-lg border border-[#9cc7ff]/25 bg-[#06101f]/60 py-3 shadow-[0_0_18px_-6px_rgba(46,155,245,.6)] backdrop-blur-md ${className}`}
    >
      {FIGURES.map((s) => (
        <li key={s.label} title={`Sample figure — will read ${s.source}`} className="min-w-0 px-3 text-center lg:px-5 lg:text-left">
          <span className="block text-[22px] font-bold leading-none tracking-tight lg:text-[26px]">
            <CountUp value={s.value} prefix={s.prefix} />
          </span>
          <span className="mt-1.5 block truncate text-[9px] uppercase tracking-[0.12em] text-on-media/65 lg:whitespace-normal lg:text-[10px] lg:leading-snug">
            <span className="lg:hidden">{s.short}</span>
            <span className="hidden lg:inline">{s.label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------- HUD (lg+) */

function LandCard() {
  return (
    <aside className="relative text-on-media" aria-labelledby="land-title">
      <Glass
        plate={CARD.plate}
        ringClip={CARD_RING}
        fill="bg-gradient-to-b from-[#0d1f3d]/55 via-[#07122a]/60 to-[#04091a]/75"
        outline="bg-gradient-to-br from-[#bfe6ff] via-[#7fd0ff]/60 to-[#7fd0ff]/25"
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: CARD.plate }} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(160,215,255,.9))]">
        <span className="absolute right-0 top-0 h-[24px] w-[2px] bg-[#d6ecff]" />
        <span className="absolute right-0 top-0 h-[2px] w-[24px] bg-[#d6ecff]" />
      </span>

      <div className="relative px-6 pb-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="land-title" className="text-[13px] font-normal uppercase tracking-[0.24em]">
            Where you&rsquo;ll land
          </h2>
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/55">One sign-in</span>
        </div>
        <StepRule className="-mr-6 mt-1 w-[calc(100%+24px)]" />
        <PortalCycler className="mt-3" />
        <p className="mt-4 border-t border-[#a9d3ff]/15 pt-3 text-[11px] leading-relaxed text-on-media/55">
          No need to pick &mdash; your account already knows its role, and we open the right workspace.
        </p>
      </div>
    </aside>
  );
}

export function LoginHud() {
  return (
    <div className="hidden lg:block">
      <div className="sx-stage-in" style={reveal(0.05)}>
        <Eyebrow />
      </div>
      <Headline className="mt-5 text-[clamp(48px,4.4vw,76px)] [@media(max-height:820px)]:text-[clamp(44px,3.8vw,62px)]" />
      <p
        className="sx-stage-in mt-6 max-w-[480px] text-[16px] leading-[1.6] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] [@media(max-height:820px)]:mt-4"
        style={reveal(0.3)}
      >
        Sponsors, athletes, properties, NEXT schools and the BTG team &mdash; one door into SponsorX. Sign in and pick
        up exactly where you left off.
      </p>
      <div className="sx-stage-in mt-8 max-w-[480px] [@media(max-height:720px)]:hidden [@media(max-height:820px)]:mt-5" style={reveal(0.45)}>
        <LandCard />
      </div>
      <div className="sx-stage-in mt-5 max-w-[480px] [@media(max-height:880px)]:hidden" style={reveal(0.58)}>
        <LoginFigures />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- phone / tablet */

export function LoginMHero() {
  return (
    <div className="px-1 sm:text-center lg:hidden">
      <div className="sx-stage-in sm:flex sm:justify-center" style={reveal(0.05)}>
        <Eyebrow />
      </div>
      <Headline className="mt-4 text-[clamp(34px,10vw,56px)] sm:mt-5" />
    </div>
  );
}

/* ------------------------------------------------------------------ panel */

const DOOR =
  "sx-sheen group relative flex w-full items-center gap-3 overflow-hidden rounded-lg border px-3.5 py-3 text-left transition-[background-color,border-color,transform] hover:-translate-y-0.5";

/** The managed-marketplace front doors (P1-FE-17's dual paths). Clerk's own
 *  "Sign up" creates an identity with no SponsorX account, which lands on
 *  /portal's "not set up yet" — correct, but a dead end for someone arriving
 *  cold. An athlete applies, a sponsor asks for a brief, and BTG provisions
 *  from there. */
function NewUserDoors() {
  return (
    <div className="mt-6 border-t border-[#a9d3ff]/15 pt-5 lg:[@media(max-height:780px)]:mt-4 lg:[@media(max-height:780px)]:pt-3">
      <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-on-media/60">
        New to SponsorX?
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-[#a9d3ff]/30 to-transparent" />
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
        <Magnetic maxX={4} maxY={3} className="w-full">
          <Link href="/join" className={`${DOOR} border-[#fb923c]/35 bg-[#fb923c]/[.06] hover:border-[#fb923c]/70 hover:bg-[#fb923c]/[.12]`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#fb923c]/60 text-[#fb923c] shadow-[0_0_10px_rgba(251,146,60,.35)]">
              <ArrowRightIcon className="size-4 -rotate-45 transition-transform group-hover:rotate-0" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-on-media">Apply as an athlete</span>
              <span className="block text-[10.5px] text-on-media/55 lg:[@media(max-height:780px)]:hidden">About {JOIN_MINUTES} minutes</span>
            </span>
          </Link>
        </Magnetic>
        <Magnetic maxX={4} maxY={3} className="w-full">
          <Link href="/brief" className={`${DOOR} border-[#4fb0ff]/35 bg-[#4fb0ff]/[.06] hover:border-[#4fb0ff]/70 hover:bg-[#4fb0ff]/[.12]`}>
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[#4fb0ff]/60 text-[#4fb0ff] shadow-[0_0_10px_rgba(79,176,255,.35)]">
              <ArrowRightIcon className="size-4 -rotate-45 transition-transform group-hover:rotate-0" />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold text-on-media">Request a sponsor brief</span>
              <span className="block text-[10.5px] text-on-media/55 lg:[@media(max-height:780px)]:hidden">BTG builds the match</span>
            </span>
          </Link>
        </Magnetic>
      </div>
    </div>
  );
}

/** The sign-in frame: chamfered glass from sm, a plain column on a phone
 *  (the glass would only eat the gutters there). Clerk goes in `children`. */
export function SignInPanel({ children }: { children: ReactNode }) {
  return (
    <SpotRing className="sx-login-panel sx-stage-in relative mx-auto w-full max-w-[460px] lg:mx-0 lg:justify-self-end" style={reveal(0.3)}>
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
          <span className="sx-impact-spot absolute inset-0" style={{ clipPath: PANEL_SPOT }} />
          <span className="absolute right-0 top-0 h-[34px] w-[2px] bg-[#d6ecff]" />
          <span className="absolute right-0 top-0 h-[2px] w-[34px] bg-[#d6ecff]" />
          <span className="absolute bottom-0 left-0 h-[28px] w-[1.5px] bg-[#d6ecff] opacity-70" />
          <span className="absolute bottom-0 left-0 h-[1.5px] w-[28px] bg-[#d6ecff] opacity-70" />
        </span>
      </div>

      <div className="sx-login-card relative px-1 py-2 sm:px-8 sm:pb-7 sm:pt-6 lg:[@media(max-height:780px)]:pb-5 lg:[@media(max-height:780px)]:pt-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-normal uppercase tracking-[0.26em] text-on-media/85">Portal access</p>
          <span className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-on-media/60">
            <span aria-hidden="true" className="sx-login-ping relative size-1.5 rounded-full bg-[#22c98d] shadow-[0_0_8px_#22c98d]" />
            Secure session
          </span>
        </div>
        <StepRule className="-mr-1 mb-5 mt-1 w-[calc(100%+4px)] sm:-mr-8 sm:w-[calc(100%+32px)] lg:[@media(max-height:780px)]:mb-3" />

        {children}

        <NewUserDoors />
      </div>
    </SpotRing>
  );
}
