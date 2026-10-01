import { CityBackdrop } from "@/components/city/city-backdrop";
import { FlightStop } from "@/components/city/flight-stop";
import { ScrollTrack } from "@/components/city/scroll-track";
import {
  HeroActions,
  HeroEyebrow,
  ImpactCard,
  PlatformStrip,
  TrustedBrands,
} from "@/components/landing-hero";
import { FeaturedAthletes, ForAthletes, JobsBand } from "@/components/landing-athletes";
import { ClosingCopy, ClosingPanel } from "@/components/landing-close";
import { LandingLoader } from "@/components/landing-loader";
import { SiteFooter } from "@/components/site-chrome";
import { ForSponsors, SponsorsTag } from "@/components/landing-sponsors";
import { HowItWorks } from "@/components/landing-steps";

/* --------------------------------------------------------------------------
   SponsorX Network Landing — §9 screen 1, mockup screen 1.

   A scroll-driven fly-through (P1-ART-09). The cyberpunk city is one fixed
   full-screen canvas behind the page; the page body is a tall scroll track
   (components/city/scroll-track.tsx) and scrolling flies a drone camera
   through five waypoints — the plaza, the basketball court, the soccer
   field, the baseball field, the skyscraper (lib/city/flight.ts). Each
   waypoint owns one 2D overlay (a FlightStop) that fades in as the drone
   settles on it and out again as the user scrolls on. Together the five
   carry §9.1's content: the hero and stats (mockup), how it works, the
   sponsor packages, the athlete marketplace, and the closing "Join the
   movement" stop — which also carries the footer, so the whole close is
   one viewport with no scrolling; this route group (home) therefore has
   no layout footer. The §9.1 proof / case-study slots and the pre-launch
   build-preview band were both dropped on 2026-09-30 by the programme
   owner.

   Overlay backdrops are translucent (`bg-bg/75` + blur) so the city stays
   the page behind every stop yet the copy stays readable in both themes.
   The exception is the hero, a 1:1 of the 2026-09-30 mockup: a full-bleed
   stop (no container) whose copy sits straight on the city, the "REAL
   IMPACT" glass card to its right, then the trusted-brands band and the
   "THE PLATFORM" strip across the bottom of the same viewport — the pieces
   live in components/landing-hero.tsx.

   Entry (P1-ART-11): on a hard load or refresh the boot screen
   (components/landing-loader.tsx) covers everything until the city's
   files, chunk and first frame and the page's fonts are in; then it flies
   out and the hero's pieces rise in one after another (`sx-reveal`, delays
   below). A client-side arrival from another public page skips it: the
   page transition (P1-ART-12) covers the city load and opens onto the same
   entrance.
   -------------------------------------------------------------------------- */

/** Staggered entrance delay for one hero piece. */
const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as React.CSSProperties;

export default function HomePage() {
  return (
    <>
      {/* No JS: the track collapses to normal flow and every stop is shown;
          the loading screen never appears and nothing waits on it. */}
      <noscript>
        <style>{`.sx-flight-track{height:auto!important}.sx-flight-stage{position:static;height:auto;overflow:visible}.sx-flight-stop{position:static;opacity:1!important;pointer-events:auto!important;transform:none!important}.sx-loader{display:none!important}[data-sx-landing] .sx-reveal,[data-sx-landing] .sx-reveal-fade{opacity:1!important;transform:none!important}[data-sx-landing] .sx-line{clip-path:none!important;transform:none!important}`}</style>
      </noscript>

      {/* Loading screen (P1-ART-11) — first so its mount effect resets the
          load store before the backdrop starts writing to it. */}
      <LandingLoader />

      {/* 3D city behind the page (P1-ART-09) — client boundary; poster-only
          when the device or the user's motion preference says so. */}
      <CityBackdrop />

      {/* The public header is sticky and 72px tall. Pull the track up under
          it so the sticky stage starts at y=0 and fills the whole viewport
          from scroll 0 — the stops pad their own top by 72px. */}
      <div className="-mt-[72px]">
      <ScrollTrack>
        {/* ============================================ 1 · plaza — hero */}
        <FlightStop stop="plaza" bleed className="relative">
          {/* hero row — copy at 6% from the left, card ending 3.8% from the right.
              Below lg the stop is one phone screen with no scrolling (owner,
              2026-09-30): copy, buttons, the impact card as a three-stat row
              and a one-line brands band; the platform strip is dropped. */}
          <div className="relative z-10 flex flex-1 items-center px-5 py-4 lg:py-6 lg:pl-[6vw] lg:pr-[3.8vw] [@media(max-height:800px)]:py-3">
            {/* Dark ground under the copy: the city's billboards and lit
                facades otherwise sit right behind the paragraph. Fades out
                before the pedestal so the plaza stays the picture. On a
                phone the copy spans the width, so the ground does too. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/55 to-transparent lg:w-[40%]"
            />
            <div className="grid w-full grid-cols-1 gap-6 short-landscape:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] short-landscape:items-center lg:grid-cols-[minmax(0,1fr)_min(400px,26vw)] lg:items-center lg:gap-10 max-lg:[@media(max-height:700px)]:gap-4">
              <div className="max-w-2xl">
                <div className="sx-reveal" style={reveal(0.05)}>
                  <HeroEyebrow />
                </div>

                {/* 64px at the mockup's width; on short viewports the height
                    caps it so the band and strip still fit below. On a phone
                    the width sets it, so "Measure Results." never wraps.
                    After the loader each line wipes up out of a mask in turn
                    (`sx-line`), and "Measure Results." then carries a slow
                    highlight gliding across its gradient (`sx-hero-shimmer`).
                    "Reward Fans." takes the logo's orange (`sx-hero-gradient-
                    accent`) — blue then orange, like the lockup's tagline. */}
                <h1
                  className="mt-4 text-[clamp(28px,min(9.4vw,6.2svh),56px)] font-bold leading-[1.02] tracking-tight text-on-media [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)] lg:mt-5 lg:text-[clamp(38px,min(3.5vw,7.5svh),64px)]"
                >
                  <span className="sx-line block whitespace-nowrap" style={reveal(0.12)}>Maximize Impact.</span>
                  <span className="sx-line block whitespace-nowrap" style={reveal(0.24)}>
                    <span className="sx-hero-gradient sx-hero-shimmer" data-text="Measure Results.">Measure Results.</span>
                  </span>
                  <span className="sx-line block whitespace-nowrap" style={reveal(0.36)}>
                    <span className="sx-hero-gradient-accent">Reward Fans.</span>
                  </span>
                </h1>

                {/* On the shortest phones (landscape, 640px-tall) the
                    paragraph goes so the buttons and stats still fit. */}
                <p
                  className="sx-reveal mt-4 max-w-[470px] text-[15px] leading-[1.45] text-on-media/90 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:mt-5 lg:text-[17px] max-lg:[@media(max-height:620px)]:hidden"
                  style={reveal(0.28)}
                >
                  The all-in-one sponsorship platform for BTG Sports Group and
                  our partners. Reach athletes, standardized campaigns, and
                  deliver measurable ROI &mdash; while giving fans real rewards
                  and experiences.
                </p>

                <div className="sx-reveal mt-5 lg:mt-6" style={reveal(0.4)}>
                  <HeroActions />
                </div>
              </div>

              <ImpactCard className="sx-reveal w-full lg:justify-self-end" style={reveal(0.35)} />
            </div>

            {/* Scroll cue — desktop, where there is room below the copy:
                the page flies on as you scroll, and this is the one hint. */}
            <div
              aria-hidden="true"
              className="sx-reveal pointer-events-none absolute bottom-5 left-[6vw] hidden items-center gap-3 lg:flex [@media(max-height:820px)]:hidden"
              style={reveal(1)}
            >
              <span className="sx-scroll-cue relative block h-9 w-px overflow-hidden bg-on-media/20" />
              <span className="text-[10px] font-medium uppercase tracking-[0.32em] text-on-media/60">Scroll to explore</span>
            </div>
          </div>

          {/* A phone held sideways puts copy and card side by side and
              drops the band, so the stop stays one view there too. */}
          <div className="sx-reveal short-landscape:hidden" style={reveal(0.5)}>
            <TrustedBrands />
          </div>
          <div className="sx-reveal hidden lg:block" style={reveal(0.6)}>
            <PlatformStrip />
          </div>
        </FlightStop>

        {/* ========================================= 2 · basketball court */}
        {/* 1:1 with the how-it-works mockup (2026-09-30): full-bleed, the
            column 8% in from the left, biased a little above centre, on the
            same dark gradient ground as the hero so the copy and cards never
            sit on lit facades. Below lg it is one screen with no scrolling:
            phone gutters, a full-width ground, and the steps as compact rows
            that scale with the device (landing-steps.tsx). */}
        <FlightStop stop="basketball" id="how-it-works" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center px-5 py-[clamp(12px,2.5svh,32px)] sm:px-[6vw] lg:pb-[8vh] lg:pl-[8vw] lg:pr-[6vw] lg:pt-6 lg:[@media(max-height:800px)]:pb-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-transparent lg:w-[68%]"
            />
            <HowItWorks />
          </div>
        </FlightStop>

        {/* ============================================= 3 · soccer field */}
        {/* From the for-sponsors mockup (2026-09-30), minus its outer panel
            and mirrored to the right on the owner's notes: full-bleed, the
            block 5% in from the right edge, biased a little above centre,
            on a right-side gradient ground like the hero's; the hero's
            trusted-brands band closes the stop with the "Real athletes.
            Real impact." tag inside it. Below lg it is one screen with no
            scrolling: phone gutters, a full-width ground, the packages as a
            swipe carousel (landing-sponsors.tsx), and no brands band — the
            hero already shows it. */}
        <FlightStop stop="soccer" id="for-sponsors" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center justify-end px-5 py-[clamp(10px,2svh,24px)] sm:px-[6vw] lg:pb-3 lg:pl-[6vw] lg:pr-[5.2vw] lg:pt-2 lg:[@media(max-height:800px)]:pb-1 lg:[@media(max-height:800px)]:pt-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-full bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-[#04080f]/25 lg:w-[75%] lg:bg-gradient-to-l lg:to-transparent"
            />
            <ForSponsors />
          </div>
          <div className="hidden lg:block">
            <TrustedBrands>
              <SponsorsTag />
            </TrustedBrands>
          </div>
        </FlightStop>

        {/* ============================================ 4 · baseball field */}
        {/* 1:1 with the athlete-marketplace mockup (2026-09-30): full-bleed,
            copy 6% in from the left, the featured-athletes panel at the
            right edge (owner's note),
            the §5 jobs band (in place of the mockup's brand logos) closing
            the stop; left gradient ground like the hero's. Below lg it is
            one screen with no scrolling: phone gutters, a full-width ground,
            the copy over a compact panel that sheds rows on short screens
            (landing-athletes.tsx), the jobs band as a one-line marquee; a
            phone held sideways puts copy and panel side by side. */}
        <FlightStop stop="baseball" id="for-athletes" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center px-5 py-[clamp(10px,2svh,24px)] sm:px-[6vw] lg:pb-3 lg:pl-[6vw] lg:pr-[6vw] lg:pt-2 lg:[@media(max-height:800px)]:pb-1 lg:[@media(max-height:800px)]:pt-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-[#04080f]/25 lg:w-[45%] lg:to-transparent"
            />
            <div className="grid w-full grid-cols-1 items-center gap-[clamp(12px,2.6svh,28px)] short-landscape:grid-cols-2 short-landscape:gap-6 lg:grid-cols-[minmax(0,38%)_minmax(0,1fr)] lg:gap-[2vw] 2xl:grid-cols-[minmax(0,680px)_minmax(0,1fr)]">
              <ForAthletes />
              <FeaturedAthletes className="w-full max-w-[735px] lg:justify-self-end" />
            </div>
          </div>
          <div className="short-landscape:hidden">
            <JobsBand />
          </div>
        </FlightStop>


        {/* ============================================== 5 · skyscraper */}
        {/* One viewport, no scrolling (owner's note): the copy on the left
            over a gradient ground, the features + numbers panel on the
            right, the footer pinned to the bottom of the stage. The two
            sides stay clear of the middle, where the drone looks up at
            the SPONSORX screen — that screen must not be obscured. */}
        <FlightStop stop="skyscraper" id="start" bleed className="relative">
          {/* Below lg: copy over the panel, then the compact footer — all one
              screen, sized to the device; side by side on a phone held
              sideways. */}
          <div className="relative z-10 flex flex-1 items-center justify-between gap-8 px-[6vw] py-3 max-lg:flex-col max-lg:items-stretch max-lg:justify-center max-lg:gap-[clamp(12px,2.4svh,28px)] max-lg:px-5 max-lg:py-[clamp(10px,2svh,24px)] sm:max-lg:px-[6vw] short-landscape:!flex-row short-landscape:!items-center short-landscape:!gap-6 lg:[@media(max-height:800px)]:py-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-[#04080f]/25 lg:w-[40%] lg:to-transparent"
            />
            <ClosingCopy />
            <ClosingPanel className="w-full short-landscape:w-[48%] short-landscape:shrink-0 lg:w-[27vw] lg:max-w-[500px]" />
          </div>
          <SiteFooter compact />
        </FlightStop>
      </ScrollTrack>
      </div>
    </>
  );
}
