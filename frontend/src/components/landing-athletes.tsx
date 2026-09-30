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

function AthleteRow({ a, last }: { a: (typeof FEATURED)[number]; last: boolean }) {
  const tags = [a.jobName, a.geo, a.verified ? "Verified" : "Self-reported"];
  return (
    <li
      className={[
        "flex items-center gap-5 py-[14px] [@media(max-height:800px)]:py-2",
        last ? "" : "border-b border-transparent [border-image:linear-gradient(90deg,rgba(94,224,255,.35),rgba(94,224,255,.08))_1]",
      ].join(" ")}
    >
      {/* avatar ring — monogram until portraits exist */}
      <span className="grid size-[76px] shrink-0 place-items-center rounded-full bg-[conic-gradient(from_200deg,#5ee0ff,#2e9bf5_40%,#a479ff_70%,#5ee0ff)] p-[2px] shadow-[0_0_16px_rgba(94,224,255,.45)] [@media(max-height:800px)]:size-[58px]">
        <span className="grid size-full place-items-center rounded-full bg-[#071426] text-[20px] font-semibold text-on-media">
          {initials(a.athlete)}
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[17px] font-semibold leading-tight text-on-media">
          {a.athlete}
          {a.verified && <VerifiedIcon className="size-4 text-[#5ee0ff]" />}
        </p>
        <p className="mt-1 text-[12px] text-[#9fdfff]">
          {a.sport}
          <span className="mx-2 text-on-media/35">|</span>
          {a.tier}
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
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

      <span aria-hidden="true" className="hidden h-12 w-px bg-on-media/15 md:block" />

      <dl className="hidden shrink-0 gap-6 md:flex" title={`Sample figures — ${a.source}`}>
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
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-[#9fdfff]/55 bg-[#07132a]/50 px-4 text-[12px] font-medium text-white shadow-[0_0_10px_rgba(94,224,255,.2)] transition-colors hover:border-[#5ee0ff] hover:shadow-[0_0_16px_rgba(94,224,255,.45)]"
      >
        View Profile
        <ArrowIcon className="size-3" />
      </Link>
    </li>
  );
}

export function FeaturedAthletes({ className = "" }: { className?: string }) {
  return (
    <aside className={`relative text-on-media ${className}`} aria-labelledby="featured-title">
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-[#071a33]/60 via-[#051024]/65 to-[#03091a]/75 backdrop-blur-xl backdrop-saturate-150"
        style={{ clipPath: PLATE }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 [filter:drop-shadow(0_0_4px_rgba(94,224,255,.8))_drop-shadow(0_0_16px_rgba(46,155,245,.45))]"
      >
        <span className="absolute inset-0 bg-gradient-to-br from-[#bff0ff] via-[#5ee0ff]/80 to-[#5ee0ff]/45" style={{ clipPath: RING }} />
      </span>

      <div className="relative px-7 pb-4 pt-5 [@media(max-height:800px)]:pb-2 [@media(max-height:800px)]:pt-3">
        <div className="flex items-center gap-3">
          <BadgeUserIcon className="size-6 text-[#5ee0ff]" />
          <h3 id="featured-title" className="text-[15px] font-semibold uppercase tracking-[0.12em] text-[#5ee0ff]">
            Featured Athletes
          </h3>
          <Link href="/sponsor" className="ml-auto inline-flex items-center gap-2 text-[13px] font-medium text-on-media hover:text-[#5ee0ff]">
            View All
            <ArrowIcon className="size-3.5" />
          </Link>
        </div>
        <span aria-hidden="true" className="mt-3 block h-px bg-gradient-to-r from-[#5ee0ff]/70 via-[#5ee0ff]/35 to-[#5ee0ff]/10" />

        <ul>
          {FEATURED.map((a, i) => (
            <AthleteRow key={a.id} a={a} last={i === FEATURED.length - 1} />
          ))}
        </ul>
      </div>
    </aside>
  );
}

export function ForAthletes() {
  return (
    <div className="max-w-[680px] text-on-media">
      <p className="flex items-center gap-3 text-[13px] font-medium uppercase tracking-[0.28em] text-on-media/90">
        <span aria-hidden="true" className="text-[#5ee0ff]">{"////"}</span>
        Athlete Marketplace
        <span aria-hidden="true" className="text-[#5ee0ff]">{"////"}</span>
      </p>

      <h2 className="mt-3 text-[clamp(30px,2.3vw,42px)] font-bold leading-[1.12] tracking-tight [text-shadow:0_2px_6px_rgba(0,0,0,.7),0_4px_28px_rgba(0,0,0,.6)]">
        <span className="block lg:whitespace-nowrap">Find the Right <span className="text-[#5ee0ff]">Athletes.</span></span>
        <span className="sx-hero-gradient block lg:whitespace-nowrap">Build Lasting Partnerships.</span>
      </h2>

      <p className="mt-5 max-w-[520px] text-[17px] leading-[1.5] text-on-media/85 [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_2px_16px_rgba(0,0,0,.7)] [@media(max-height:800px)]:mt-3 [@media(max-height:800px)]:text-[15px]">
        Connect with verified athletes, explore their profiles, and launch sponsorships that drive real value &mdash;
        on and off the field.
      </p>

      <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-3 [@media(max-height:800px)]:mt-4">
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label[1]} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full border-[1.5px] border-[#5ee0ff] bg-[#07132a]/60 text-[#5ee0ff] shadow-[0_0_12px_rgba(94,224,255,.5)]">
              <Icon className="size-4" />
            </span>
            <span className="text-[12px] leading-[1.25] text-on-media">
              {label[0]}
              <br />
              {label[1]}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-wrap gap-6 [@media(max-height:800px)]:mt-5">
        <Link
          href="/sponsor"
          className="group inline-flex h-[50px] items-center gap-4 rounded-xl bg-gradient-to-r from-[#5ee0ff] to-[#2e9bf5] px-9 text-[15px] font-medium text-[#041018] shadow-[0_0_30px_rgba(94,224,255,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_40px_rgba(94,224,255,.7)]"
        >
          Browse Athletes
          <ArrowIcon className="size-[18px] transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link
          href="/brief"
          className="inline-flex h-[50px] items-center gap-4 rounded-xl border border-[#9fdfff]/50 bg-[#0a1428]/45 px-9 text-[15px] font-medium text-on-media shadow-[0_0_14px_rgba(94,224,255,.2)] backdrop-blur-lg transition-colors hover:border-[#5ee0ff] hover:bg-[#5ee0ff]/10"
        >
          Become a Sponsor
          <PlayIcon className="size-[22px] text-on-media/85" />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ band */

const DIVIDER =
  "lg:before:absolute lg:before:-left-5 lg:before:top-1/2 lg:before:h-[60px] lg:before:w-px lg:before:-translate-y-1/2 lg:before:rotate-[22deg] lg:before:bg-[#9cc7ff]/30";

/** The hero band's glass and glowing rules, carrying the §5 job ribbon and
 *  the mockup's closing tag. */
export function JobsBand() {
  return (
    <div
      className={[
        "relative z-10 flex w-full flex-col gap-3 overflow-hidden py-4 text-on-media lg:h-[76px] lg:flex-row lg:items-center lg:gap-0 lg:py-0 lg:[@media(max-height:800px)]:h-[64px]",
        "bg-gradient-to-b from-[#0b1a33]/45 via-[#050b18]/50 to-[#03070f]/60 backdrop-blur-lg backdrop-saturate-150",
        "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[#bfe0ff]/80 before:shadow-[0_0_10px_rgba(120,190,255,.9),0_0_22px_rgba(46,155,245,.55)]",
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-[#9cc7ff]/50 after:shadow-[0_0_8px_rgba(99,180,248,.55)]",
      ].join(" ")}
    >
      <div className="relative flex shrink-0 items-center pl-[6vw] pr-14 lg:h-full">
        <span aria-hidden="true" className="absolute inset-y-0 -left-24 right-0 hidden -skew-x-[28deg] bg-[#02050b]/55 lg:block" />
        <span aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-px -skew-x-[28deg] bg-[#bfe0ff]/60 shadow-[0_0_8px_rgba(120,190,255,.8)] lg:block" />
        <p className="relative text-[10px] uppercase tracking-[0.2em] text-on-media/75">Standard jobs</p>
      </div>

      <ul className="flex flex-1 flex-wrap items-center justify-center gap-y-1 px-4 lg:flex-nowrap lg:justify-evenly lg:px-0">
        {JOBS.map((j, i) => (
          <li key={j} className={`relative px-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-on-media/90 lg:px-5 ${i > 0 ? DIVIDER : ""}`}>
            {j}
          </li>
        ))}
      </ul>

      <Link
        href="/join"
        className={`relative shrink-0 pl-[6vw] text-[10px] uppercase tracking-[0.25em] text-on-media/70 hover:text-[#5ee0ff] lg:pl-10 lg:pr-10 ${DIVIDER}`}
      >
        + Rates
      </Link>

      <div className="hidden shrink-0 items-center gap-5 pr-[6vw] lg:flex">
        <span aria-hidden="true" className="block h-[60px] w-px rotate-[22deg] bg-[#9cc7ff]/30" />
        <p className="text-[12px] font-medium uppercase leading-[1.8] tracking-[0.32em] text-on-media/90">
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
