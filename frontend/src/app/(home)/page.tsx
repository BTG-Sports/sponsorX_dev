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

   Entry (P1-ART-11): the loading screen (components/landing-loader.tsx)
   covers everything on every entry until the city's files, chunk and
   first frame and the page's fonts are in; then it flies out and the
   hero's pieces rise in one after another (`sx-reveal`, delays below).
   -------------------------------------------------------------------------- */

/** Staggered entrance delay for one hero piece. */
const reveal = (seconds: number) => ({ "--sx-reveal-delay": `${seconds}s` }) as React.CSSProperties;

export default function HomePage() {
  return (
    <>
      {/* No JS: the track collapses to normal flow and every stop is shown;
          the loading screen never appears and nothing waits on it. */}
      <noscript>
        <style>{`.sx-flight-track{height:auto!important}.sx-flight-stage{position:static;height:auto;overflow:visible}.sx-flight-stop{position:static;opacity:1!important;pointer-events:auto!important;transform:none!important}.sx-loader{display:none!important}[data-sx-landing] .sx-reveal,[data-sx-landing] .sx-reveal-fade{opacity:1!important;transform:none!important}`}</style>
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
          {/* hero row — copy at 6% from the left, card ending 3.8% from the right */}
          <div className="relative z-10 flex flex-1 items-center py-6 pl-[6vw] pr-[3.8vw] [@media(max-height:800px)]:py-3">
            {/* Dark ground under the copy: the city's billboards and lit
                facades otherwise sit right behind the paragraph. Fades out
                before the pedestal so the plaza stays the picture. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[40%] bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/55 to-transparent"
            />
            <div className="grid w-full gap-10 lg:grid-cols-[minmax(0,1fr)_min(400px,26vw)] lg:items-center">
              <div className="max-w-2xl">
                <div className="sx-reveal" style={reveal(0.05)}>
                  <HeroEyebrow />
                </div>

                {/* 64px at the mockup's width; on short viewports the height
                    caps it so the band and strip still fit below. */}
                <h1
                  className="sx-reveal mt-5 text-[clamp(38px,min(3.5vw,7.5svh),64px)] font-bold leading-[1.02] tracking-tight text-on-media [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]"
                  style={reveal(0.15)}
                >
                  <span className="block whitespace-nowrap">Maximize Impact.</span>
                  <span className="sx-hero-gradient block whitespace-nowrap">Measure Results.</span>
                  <span className="block whitespace-nowrap">Reward Fans.</span>
                </h1>

                <p
                  className="sx-reveal mt-5 max-w-[470px] text-[17px] leading-[1.45] text-on-media/90 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)]"
                  style={reveal(0.28)}
                >
                  The all-in-one sponsorship platform for BTG Sports Group and
                  our partners. Reach athletes, standardized campaigns, and
                  deliver measurable ROI &mdash; while giving fans real rewards
                  and experiences.
                </p>

                <div className="sx-reveal mt-6" style={reveal(0.4)}>
                  <HeroActions />
                </div>
              </div>

              <ImpactCard className="sx-reveal w-full lg:justify-self-end" style={reveal(0.35)} />
            </div>
          </div>

          <div className="sx-reveal" style={reveal(0.5)}>
            <TrustedBrands />
          </div>
          <div className="sx-reveal" style={reveal(0.6)}>
            <PlatformStrip />
          </div>
        </FlightStop>

        {/* ========================================= 2 · basketball court */}
        {/* 1:1 with the how-it-works mockup (2026-09-30): full-bleed, the
            column 8% in from the left, biased a little above centre, on the
            same dark gradient ground as the hero so the copy and cards never
            sit on lit facades. */}
        <FlightStop stop="basketball" id="how-it-works" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center pb-[8vh] pl-[8vw] pr-[6vw] pt-6 [@media(max-height:800px)]:pb-4">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[68%] bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-transparent"
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
            Real impact." tag inside it. */}
        <FlightStop stop="soccer" id="for-sponsors" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center justify-end pb-3 pl-[6vw] pr-[5.2vw] pt-2 [@media(max-height:800px)]:pb-1 [@media(max-height:800px)]:pt-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[75%] bg-gradient-to-l from-[#04080f]/90 via-[#04080f]/60 to-transparent"
            />
            <ForSponsors />
          </div>
          <TrustedBrands>
            <SponsorsTag />
          </TrustedBrands>
        </FlightStop>

        {/* ============================================ 4 · baseball field */}
        {/* 1:1 with the athlete-marketplace mockup (2026-09-30): full-bleed,
            copy 6% in from the left, the featured-athletes panel at the
            right edge (owner's note),
            the §5 jobs band (in place of the mockup's brand logos) closing
            the stop; left gradient ground like the hero's. */}
        <FlightStop stop="baseball" id="for-athletes" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center pb-3 pl-[6vw] pr-[6vw] pt-2 [@media(max-height:800px)]:pb-1 [@media(max-height:800px)]:pt-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[45%] bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-transparent"
            />
            <div className="grid w-full items-center gap-10 lg:grid-cols-[minmax(0,38%)_minmax(0,1fr)] lg:gap-[2vw] 2xl:grid-cols-[minmax(0,680px)_minmax(0,1fr)]">
              <ForAthletes />
              <FeaturedAthletes className="w-full max-w-[735px] lg:justify-self-end" />
            </div>
          </div>
          <JobsBand />
        </FlightStop>


        {/* ============================================== 5 · skyscraper */}
        {/* One viewport, no scrolling (owner's note): the copy on the left
            over a gradient ground, the features + numbers panel on the
            right, the footer pinned to the bottom of the stage. The two
            sides stay clear of the middle, where the drone looks up at
            the SPONSORX screen — that screen must not be obscured. */}
        <FlightStop stop="skyscraper" id="start" bleed className="relative">
          <div className="relative z-10 flex flex-1 items-center justify-between gap-8 px-[6vw] py-3 max-lg:flex-col max-lg:items-stretch [@media(max-height:800px)]:py-1">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 -z-10 w-[40%] bg-gradient-to-r from-[#04080f]/90 via-[#04080f]/60 to-transparent"
            />
            <ClosingCopy />
            <ClosingPanel className="w-full lg:w-[27vw] lg:max-w-[500px]" />
          </div>
          <SiteFooter />
        </FlightStop>
      </ScrollTrack>
      </div>
    </>
  );
}
