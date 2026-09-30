/* --------------------------------------------------------------------------
   "For athletes" — the 2D UI of the baseball stop, 1:1 with the athlete
   marketplace mockup of 2026-09-30 (1824×862 reference), minus the navbar.
   Server components. Sits straight on the 3D city, so every ink is
   `on-media` or a fixed-dark literal (the --sx-on-media rule). This stop's
   accent is the mockup's cyan.

   Left column, 6% in: the "//// ATHLETE MARKETPLACE ////" eyebrow, the
   two-tone heading, a two-line intro, four feature items (glowing rings +
   two-line labels) and the two buttons. Right: the "FEATURED ATHLETES"
   glass panel (chamfered top-left and bottom-right, glowing cyan outline,
   header row with a rule, four athlete rows — avatar ring, name + verified
   badge, sport | tier, tags, a hairline, two stats, "View Profile →").
   The rows read `fixtures.marketplace`-style athlete records that already
   have public profile pages, not the mockup's invented names; portraits
   are monograms until photos exist.

   The bottom band swaps the mockup's brand logos for the §5 standard-jobs
   ribbon (real product content, no partner claims, no logo artwork), with
   the "THE PERFECT MATCH BETWEEN BRANDS AND ATHLETES." tag at its right
   end behind the band's slanted hairline.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import type { ReactNode } from "react";

import { Magnetic, TiltSpot } from "./hero-fx";
import { athleteInv } from "@/lib/fixtures";

/** Panel chamfers: top-left small, bottom-right larger. */
const TL = 12;
const BR = 22;

function ring(outer: string[], inner: string[]) {
  return `polygon(${[...outer, outer[0], ...inner, inner[0]].join(", ")})`;
}

const PLATE = `polygon(${TL}px 0, 100% 0, 100% calc(100% - ${BR}px), calc(100% - ${BR}px) 100%, 0 100%, 0 ${TL}px)`;
const RING = ring(
  [`${TL}px 0`, "100% 0", `100% calc(100% - ${BR}px)`, `calc(100% - ${BR}px) 100%`, "0 100%", `0 ${TL}px`],
  [`${TL + 0.4}px 1px`, `1px ${TL + 0.4}px`, "1px calc(100% - 1px)", `calc(100% - ${BR + 0.4}px) calc(100% - 1px)`, `calc(100% - 1px) calc(100% - ${BR + 0.4}px)`, "calc(100% - 1px) 1px"],
);
/** 2px ring of the panel's shape — the pointer spotlight runs on it. */
const RING2 = ring(
  [`${TL}px 0`, "100% 0", `100% calc(100% - ${BR}px)`, `calc(100% - ${BR}px) 100%`, "0 100%", `0 ${TL}px`],
  [`${TL + 0.8}px 2px`, `2px ${TL + 0.8}px`, "2px calc(100% - 2px)", `calc(100% - ${BR + 0.8}px) calc(100% - 2px)`, `calc(100% - 2px) calc(100% - ${BR + 0.8}px)`, "calc(100% - 2px) 2px"],
);

/* ----------------------------------------------------------------- icons */

const LINE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ShieldIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3Z" />
      <path d="M9.2 12l2 2 3.8-4" />
    </svg>
  );
}
function ProfileIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.5 17.5a4.5 4.5 0 0 1 9 0" />
    </svg>
  );
}
function MetricsIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="8" cy="8" r="2.4" />
      <circle cx="16.5" cy="9" r="2" />
      <path d="M3.5 18a4.5 4.5 0 0 1 9 0M13.5 17.5a3.5 3.5 0 0 1 6.5-1.5M15 3.5l2 2 3.5-3.5" />
    </svg>
  );
}
function ChatIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <path d="M4 5.5h16v10H10l-4 3.5v-3.5H4v-10Z" />
      <path d="M12 8v5M9.5 10.5h5" />
    </svg>
  );
}
function BadgeUserIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} className={className}>
      <circle cx="10" cy="8" r="3.2" />
      <path d="M4 19a6 6 0 0 1 12 0" />
      <path d="M16.5 5.5l1.2 1.2 2.3-2.3M15 9.5a3.5 3.5 0 1 0 0-.1" />
    </svg>
  );
}
function VerifiedIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2l2.4 1.9 3-.4 1.1 2.8 2.7 1.4-.6 3 1.9 2.3-1.9 2.3.6 3-2.7 1.4-1.1 2.8-3-.4L12 22l-2.4-1.9-3 .4-1.1-2.8-2.7-1.4.6-3L1.5 12l1.9-2.3-.6-3 2.7-1.4L6.6 2.5l3 .4L12 2Z" />
      <path d="M8.5 12.2l2.3 2.3 4.7-4.9" fill="none" stroke="#041018" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowIcon({ className = "size-3.5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={2.2} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
function PlayIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg {...LINE} strokeWidth={1.5} className={className}>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M10 8.5v7l5.5-3.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ data */

const FEATURES: { icon: (p: { className?: string }) => ReactNode; label: [string, string] }[] = [
  { icon: ShieldIcon, label: ["Verified", "Athletes"] },
  { icon: ProfileIcon, label: ["Detailed", "Profiles"] },
  { icon: MetricsIcon, label: ["Performance", "Metrics"] },
  { icon: ChatIcon, label: ["Direct", "Communication"] },
];

/** §5 job catalogue — the band's content. Rates live on /join. */
const JOBS = [
  "Story Drop",
  "Sponsored Post",
  "Athlete Reel",
  "Product Experience",
  "Local Appearance",
  "Content Day",
  "Monthly Ambassador",
];

/** Four featured rows — the first four active inventory athletes. */
const FEATURED = athleteInv.filter((a) => a.state === "ACTIVE").slice(0, 4);

const reach = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M+` : `${Math.round(n / 1000)}K+`);
const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/* ----------------------------------------------------------------- parts */

/** Below lg the panel sheds rows as the screen gets shorter, so the stop
 *  stays one view: all four from 650px tall, three from 580px, else two —
 *  and the row that ends up last drops its divider. */
const ROW_FIT = [
  "",
  "max-lg:[@media(max-height:580px)]:border-b-0",
  "max-lg:[@media(max-height:580px)]:hidden max-lg:[@media(max-height:650px)]:border-b-0",
  "max-lg:[@media(max-height:650px)]:hidden",
];

function AthleteRow({ a, index, last }: { a: (typeof FEATURED)[number]; index: number; last: boolean }) {
  const tags = [a.jobName, a.geo, a.verified ? "Verified" : "Self-reported"];
  return (
    // --i staggers the row's slide-in on arrival (`sx-row`); on hover a
    // light sweeps across it.
    <li
      className={[
        "sx-row relative flex items-center gap-[clamp(10px,3vw,20px)] py-[clamp(6px,1.1svh,14px)] lg:gap-5 lg:py-[14px] lg:[@media(max-height:800px)]:py-2",
        last ? "" : "border-b border-transparent [border-image:linear-gradient(90deg,rgba(94,224,255,.35),rgba(94,224,255,.08))_1]",
        ROW_FIT[index] ?? "",
      ].join(" ")}
      style={{ "--i": index } as React.CSSProperties}
    >
      {/* avatar ring — monogram until portraits exist */}
      <span className="sx-avatar-ring grid size-[clamp(40px,6.2svh,64px)] shrink-0 place-items-center rounded-full p-[2px] shadow-[0_0_16px_rgba(94,224,255,.45)] lg:size-[76px] lg:[@media(max-height:800px)]:size-[58px]">
        <span className="grid size-full place-items-center rounded-full bg-[#071426] text-[clamp(13px,2svh,18px)] font-semibold text-on-media lg:text-[20px]">
          {initials(a.athlete)}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[clamp(14px,2.1svh,17px)] font-semibold leading-tight text-on-media lg:text-[17px]">
          <span className="max-lg:truncate">{a.athlete}</span>
          {a.verified && <VerifiedIcon className="size-4 shrink-0 text-[#5ee0ff]" />}
        </p>
        <p className="mt-1 text-[clamp(11px,1.5svh,12px)] text-[#9fdfff] lg:text-[12px]">
          {a.sport}
          <span className="mx-2 text-on-media/35">|</span>
          {a.tier}
        </p>
        <ul className="mt-2 hidden flex-wrap gap-1.5 lg:flex">
          {tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-[#5ee0ff]/40 bg-[#07132a]/70 px-2.5 py-[3px] text-[10px] text-on-media/85"
            >
              {t}
            </li>
          ))}
        </ul>
      </div>

      <span aria-hidden="true" className="hidden h-12 w-px bg-on-media/15 lg:block" />

      <dl className="hidden shrink-0 gap-6 lg:flex" title={`Sample figures — ${a.source}`}>
        <div>
          <dd className="text-[15px] font-semibold leading-none text-on-media">{reach(a.reach)}</dd>
          <dt className="mt-1.5 text-[10px] text-on-media/65">Total Reach</dt>
        </div>
        <div>
          <dd className="text-[15px] font-semibold leading-none text-on-media">{a.engagementRate.toFixed(1)}%</dd>
          <dt className="mt-1.5 text-[10px] text-on-media/65">Engagement Rate</dt>
        </div>
      </dl>

      <Link
        href={`/athletes/${a.slug}`}
        aria-label={`View ${a.athlete}'s profile`}
        className="inline-flex size-9 shrink-0 items-center justify-center gap-2 rounded-full border border-[#9fdfff]/55 bg-[#07132a]/50 text-[12px] font-medium text-white shadow-[0_0_10px_rgba(94,224,255,.2)] transition-colors hover:border-[#5ee0ff] hover:shadow-[0_0_16px_rgba(94,224,255,.45)] lg:h-9 lg:w-auto lg:rounded-md lg:px-4"
      >
        {/* A round arrow button on phones; the label from lg. */}
        <span className="hidden lg:inline">View Profile</span>
        <ArrowIcon className="size-3.5 lg:size-3" />
      </Link>
    </li>
  );
}

export function FeaturedAthletes({ className = "" }: { className?: string }) {
  return (
    <aside className={`relative text-on-media ${className}`} aria-labelledby="featured-title">
      {/* With a fine pointer the panel tilts gently toward it and a
          spotlight runs round its outline; a slow scan line crosses the
          glass (TiltSpot, `sx-scan`, `sx-impact-spot`). */}
      <TiltSpot max={3}>
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#071a33]/60 via-[#051024]/65 to-[#03091a]/75 backdrop-blur-xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      <span aria-hidden="true" className="sx-scan pointer-events-none absolute inset-0" style={{ clipPath: PLATE }} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(94,224,255,.8))_drop-shadow(0_0_16px_rgba(46,155,245,.45))]"
      >
        <span className="absolute inset-0 bg-gradient-to-br from-[#bff0ff] via-[#5ee0ff]/80 to-[#5ee0ff]/45" style={{ clipPath: RING }} />
        <span className="sx-impact-spot absolute inset-0" style={{ clipPath: RING2 }} />
      </span>

      <div className="relative px-[clamp(14px,4.5vw,28px)] pb-[clamp(4px,1svh,16px)] pt-[clamp(10px,1.8svh,20px)] lg:px-7 lg:pb-4 lg:pt-5 lg:[@media(max-height:800px)]:pb-2 lg:[@media(max-height:800px)]:pt-3">
        <div className="flex items-center gap-3">
          <BadgeUserIcon className="size-5 text-[#5ee0ff] lg:size-6" />
          <h3 id="featured-title" className="text-[clamp(11px,1.6svh,15px)] font-semibold uppercase tracking-[0.12em] text-[#5ee0ff] lg:text-[15px]">
            Featured Athletes
          </h3>
          <Link href="/sponsor" className="ml-auto inline-flex items-center gap-2 text-[clamp(11px,1.6svh,13px)] font-medium text-on-media hover:text-[#5ee0ff] lg:text-[13px]">
            View All
            <ArrowIcon className="size-3.5" />
          </Link>
        </div>
        <span aria-hidden="true" className="mt-[clamp(6px,1.2svh,12px)] block h-px bg-gradient-to-r from-[#5ee0ff]/70 via-[#5ee0ff]/35 to-[#5ee0ff]/10" />

        <ul>
          {FEATURED.map((a, i) => (
            <AthleteRow key={a.id} a={a} index={i} last={i === FEATURED.length - 1} />
          ))}
        </ul>
      </div>
      </TiltSpot>
    </aside>
  );
}

export function ForAthletes() {
  return (
    // Below lg every size is clamped on the screen so the stop is one view:
    // the intro shows from 860px tall, the feature row from 700px, and the
    // buttons share one row.
    <div className="max-w-[680px] text-on-media">
      <p className="flex items-center gap-2 whitespace-nowrap text-[clamp(10px,1.5svh,13px)] font-medium uppercase tracking-[0.22em] text-on-media/90 lg:gap-3 lg:text-[13px] lg:tracking-[0.28em]">
        {/* a light runs through the slashes (`sx-slashes`) */}
        <span aria-hidden="true" className="sx-slashes text-[#5ee0ff]">{"////"}</span>
        Athlete Marketplace
        <span aria-hidden="true" className="sx-slashes text-[#5ee0ff]">{"////"}</span>
      </p>

      <h2 className="sx-wipe mt-[clamp(4px,1svh,12px)] text-[clamp(18px,min(5.8vw,4svh),38px)] font-bold lg:mt-3 lg:text-[clamp(30px,2.3vw,42px)] leading-[1.12] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]">
        <span className="block lg:whitespace-nowrap">Find the Right <span className="text-[#5ee0ff]">Athletes.</span></span>
        <span className="block lg:whitespace-nowrap">
          <span className="sx-hero-gradient sx-hero-shimmer" data-text="Build Lasting Partnerships.">Build Lasting Partnerships.</span>
        </span>
      </h2>

      <p className="mt-[clamp(4px,1svh,12px)] max-w-[520px] text-[clamp(13px,1.9svh,16px)] leading-[1.5] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] lg:mt-5 lg:text-[17px] lg:[@media(max-height:800px)]:mt-3 lg:[@media(max-height:800px)]:text-[15px] max-lg:[@media(max-height:860px)]:hidden">
        Connect with verified athletes, explore their profiles, and launch sponsorships that drive real value &mdash;
        on and off the field.
      </p>

      <ul className="mt-[clamp(8px,1.8svh,20px)] grid grid-cols-4 gap-2 lg:mt-7 lg:flex lg:flex-wrap lg:gap-x-5 lg:gap-y-3 lg:[@media(max-height:800px)]:mt-4 max-lg:[@media(max-height:700px)]:hidden">
        {FEATURES.map(({ icon: Icon, label }, i) => (
          // radar pings pass through the four icons in turn (`sx-ping`, cyan, 8s)
          <li
            key={label[1]}
            className="flex flex-col items-center gap-1.5 text-center [--ping-cycle:8s] [--ping:#5ee0ff] lg:flex-row lg:gap-3 lg:text-left"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className="sx-ping relative grid size-[clamp(30px,4.4svh,40px)] shrink-0 place-items-center rounded-full border-[1.5px] border-[#5ee0ff] bg-[#07132a]/60 text-[#5ee0ff] shadow-[0_0_12px_rgba(94,224,255,.5)] lg:size-10">
              <Icon className="size-4" />
            </span>
            <span className="text-[clamp(9.5px,min(2.6vw,1.4svh),12px)] leading-[1.25] text-on-media lg:text-[12px]">
              {label[0]}
              <br />
              {label[1]}
            </span>
          </li>
        ))}
      </ul>

      {/* capped magnetic lean + hover sheen, as in the hero */}
      <div className="mt-[clamp(10px,2svh,24px)] flex gap-3 lg:mt-8 lg:flex-wrap lg:gap-6 lg:[@media(max-height:800px)]:mt-5">
        <Magnetic className="max-lg:flex-1">
        <Link
          href="/sponsor"
          className="sx-sheen group relative inline-flex h-[clamp(40px,5.6svh,50px)] flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#5ee0ff] to-[#2e9bf5] px-2 text-[clamp(12.5px,3.6vw,15px)] font-medium lg:h-[50px] lg:flex-none lg:gap-4 lg:px-9 lg:text-[15px] text-[#041018] shadow-[0_0_30px_rgba(94,224,255,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(94,224,255,.7)]"
        >
          Browse Athletes
          <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        </Magnetic>
        <Magnetic className="max-lg:flex-1">
        <Link
          href="/brief"
          className="sx-sheen relative inline-flex h-[clamp(40px,5.6svh,50px)] flex-1 overflow-hidden items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-[#9fdfff]/50 bg-[#0a1428]/45 px-2 text-[clamp(12.5px,3.6vw,15px)] font-medium lg:h-[50px] lg:flex-none lg:gap-4 lg:px-9 lg:text-[15px] text-on-media shadow-[0_0_14px_rgba(94,224,255,.2)] backdrop-blur-lg transition-colors hover:border-[#5ee0ff] hover:bg-[#5ee0ff]/10"
        >
          Become a Sponsor
          <PlayIcon className="hidden size-[22px] text-on-media/85 sm:block" />
        </Link>
        </Magnetic>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ band */

/** A short slash centred on an item's left edge — i.e. exactly midway
 *  between two labels, since every item carries the same padding. Same
 *  28° lean as the plates' slanted edges. Desktop only. */
const SLASH =
  "lg:before:absolute lg:before:left-0 lg:before:top-1/2 lg:before:h-[22px] lg:before:w-px lg:before:-translate-x-1/2 lg:before:-translate-y-1/2 lg:before:-skew-x-[28deg] lg:before:bg-[#9cc7ff]/40";

/** Every item carries the slash (the first one too), so the two copies of
 *  the list are identical and the marquee's loop has no seam. */
function JobItems() {
  return JOBS.map((j) => (
    <li
      key={j}
      className={`relative shrink-0 whitespace-nowrap px-4 text-[clamp(10px,1.5svh,12px)] font-semibold uppercase tracking-[0.14em] text-on-media/90 lg:px-8 lg:text-[12px] ${SLASH}`}
    >
      {j}
    </li>
  ));
}

/** Dark glass plate with one glowing slanted edge — the band's two ends. */
function Plate({ edge }: { edge: "left" | "right" }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 hidden -skew-x-[28deg] bg-[#02050b]/55 lg:block ${
          edge === "right" ? "-left-24 right-0" : "-right-24 left-0"
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 hidden w-px -skew-x-[28deg] bg-[#bfe0ff]/60 shadow-[0_0_8px_rgba(120,190,255,.8)] lg:block ${
          edge === "right" ? "right-0" : "left-0"
        }`}
      />
    </>
  );
}

/** The hero band's glass and glowing rules, carrying the §5 job ribbon and
 *  the mockup's closing tag. The seven jobs drift past in a marquee at
 *  every width (`sx-marquee-all`, the list twice with the copy aria-hidden)
 *  — laid out statically they need ~1900px beside the label, "+ Rates" and
 *  the tag, and overlapped on any narrower desktop.
 *
 *  On desktop the ribbon runs *under* two dark glass plates — the label's
 *  at the left, "+ Rates" and the tag's at the right — each with a glowing
 *  edge at the plates' 28° slant: the ribbon reaches 64px in under each
 *  (negative margin) and is clipped along both slants (`.sx-jobs-clip`),
 *  so the jobs slide out exactly under the glowing edge instead of fading
 *  on a vertical line that never met the slant. Slashes sit exactly midway between labels at the same
 *  lean. Hovering the ribbon pauses it. Below lg there are no plates: the
 *  band is one 48px line (small label, marquee, "+ Rates"; the tag is
 *  desktop-only) with a short fade at both ends, and it goes on screens
 *  under 640px tall and on a phone held sideways. */
export function JobsBand() {
  return (
    <div
      className={[
        "relative z-10 flex h-12 w-full items-center overflow-hidden text-on-media lg:h-[76px] lg:[@media(max-height:800px)]:h-[64px] max-lg:[@media(max-height:640px)]:hidden",
        "bg-gradient-to-b from-[#0b1a33]/45 via-[#050b18]/50 to-[#03070f]/60 backdrop-blur-lg backdrop-saturate-150",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-20 before:h-px before:bg-[#bfe0ff]/80 before:shadow-[0_0_10px_rgba(120,190,255,.9),0_0_22px_rgba(46,155,245,.55)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:z-20 after:h-px after:bg-[#9cc7ff]/50 after:shadow-[0_0_8px_rgba(99,180,248,.55)]",
      ].join(" ")}
    >
      <div className="relative z-10 flex h-full shrink-0 items-center pl-5 pr-3 lg:pl-[6vw] lg:pr-12">
        <Plate edge="right" />
        <p className="relative w-[58px] text-[8px] uppercase leading-snug tracking-[0.15em] text-on-media/75 lg:w-auto lg:text-[10px] lg:tracking-[0.2em]">Standard jobs</p>
      </div>

      <div className="sx-marquee-view sx-jobs-clip relative flex h-full min-w-0 flex-1 items-center overflow-hidden max-lg:[mask-image:linear-gradient(90deg,transparent,#000_20px,#000_calc(100%-20px),transparent)] lg:-mx-16">
        <div className="sx-marquee-all flex w-max items-center">
          <ul className="flex shrink-0 items-center">
            <JobItems />
          </ul>
          <ul aria-hidden="true" className="flex shrink-0 items-center">
            <JobItems />
          </ul>
        </div>
      </div>

      <div className="relative z-10 flex h-full shrink-0 items-center">
        <Plate edge="left" />
        <Link
          href="/join"
          className="relative pl-3 pr-5 text-[9px] uppercase tracking-[0.2em] text-on-media/70 transition-colors hover:text-[#5ee0ff] lg:pl-12 lg:pr-8 lg:text-[10px] lg:tracking-[0.25em]"
        >
          + Rates
        </Link>
        <p
          className={`relative hidden pl-8 pr-[6vw] text-[12px] font-medium uppercase leading-[1.8] tracking-[0.32em] text-on-media/90 lg:block ${SLASH}`}
        >
          The perfect match
          <br />
          between brands
          <br />
          and athletes.
        </p>
      </div>
    </div>
  );
}
