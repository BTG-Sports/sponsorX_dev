import Link from "next/link";
import { Logo } from "./logo";
import { SiteNav } from "./site-nav";

/* --------------------------------------------------------------------------
   Public marketing chrome — mockup screen 1, header redrawn 1:1 to the hero
   mockup of 2026-09-30 (1825×862 reference) and then trimmed on the owner's
   notes the same day: a 72px full-width glass bar (theme bg at 55% + heavy
   blur + a faint top sheen) with the logo 8% from the left, the nav links
   centred (site-nav.tsx — Home added, current page lit as a hologram),
   then Login and the gradient "Get Started →" ending 6% from the right.
   The bottom rule is a glow line (`.sx-nav-line`). Gone on the owner's
   call: the slanted hairline dividers and the theme toggle. (The "N"
   circle at the far right of the mockup is the Next.js dev-tools
   indicator, not UI.)
   -------------------------------------------------------------------------- */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20">
      <div className="relative flex h-[72px] w-full items-center bg-bg/55 px-5 backdrop-blur-xl sm:pl-[8vw] sm:pr-[6vw]">
        {/* glass sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[.05] to-transparent"
        />

        <Link href="/" className="relative shrink-0 leading-none">
          <Logo className="h-9" />
        </Link>

        <SiteNav />

        <div className="relative ml-auto flex items-center gap-4 sm:gap-7">
          <Link
            href="/login"
            className="hidden text-[15px] text-text/90 transition-colors hover:text-primary-soft sm:block"
          >
            Login
          </Link>
          <Link
            href="/login"
            className="group inline-flex h-10 items-center gap-3 whitespace-nowrap rounded-xl bg-gradient-to-r from-primary-soft to-primary px-5 text-[15px] font-medium text-white shadow-[0_0_22px_rgba(46,155,245,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(46,155,245,.7)] sm:gap-4 sm:px-7"
          >
            Get Started
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-[18px] transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            >
              <path d="M4 12h16M14 6l6 6-6 6" />
            </svg>
          </Link>
        </div>

        {/* bottom glow rule */}
        <span aria-hidden="true" className="sx-nav-line absolute inset-x-0 bottom-0 h-px" />
      </div>
    </header>
  );
}

/* --------------------------------------------------------------------------
   Footer — 1:1 with the closing mockup of 2026-09-30: a dark plate with a
   glowing top rule over the city, the logo and blurb on the left, a
   vertical hairline, the three link columns (same links as before), then
   four social rings at the right (the build line and the mockup's slanted
   HUD hairlines were dropped on the owner's notes). The social links have
   no destinations yet, so they render as inert rings titled accordingly.
   -------------------------------------------------------------------------- */

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Sponsors",
    links: [
      { label: "Packages", href: "/packages" },
      { label: "Sponsor Portal", href: "/sponsor" },
      { label: "Sign In", href: "/login" },
    ],
  },
  {
    title: "Athletes",
    links: [
      { label: "Join the Network", href: "/join" },
      { label: "Athlete Portal", href: "/athlete" },
      { label: "List your team or venue", href: "/onboarding" },
    ],
  },
  {
    title: "Internal",
    links: [
      { label: "Admin", href: "/admin" },
      { label: "Route Map", href: "/map" },
    ],
  },
];

const SOCIAL: { label: string; path: string }[] = [
  { label: "X", path: "M4 4l16 16M20 4 4 20" },
  { label: "Instagram", path: "M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v10a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 17V7A3.5 3.5 0 0 1 7 3.5ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM17 7h.01" },
  { label: "YouTube", path: "M3.5 8.5c0-1.5 1-2.5 2.5-2.7 4-.4 8-.4 12 0 1.5.2 2.5 1.2 2.5 2.7v7c0 1.5-1 2.5-2.5 2.7-4 .4-8 .4-12 0-1.5-.2-2.5-1.2-2.5-2.7v-7ZM10 9v6l5-3-5-3Z" },
  { label: "LinkedIn", path: "M6 9.5v10M6 5.5v.01M11 19.5v-10M11 13.5c0-2.2 1.5-4 3.5-4s3.5 1.8 3.5 4v6" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 w-full overflow-hidden bg-[#03070f]/92 text-on-media backdrop-blur-xl">
      {/* glowing top rule */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#5ee0ff]/80 to-transparent shadow-[0_0_10px_rgba(94,224,255,.9),0_0_22px_rgba(46,155,245,.55)]"
      />

      <div className="relative mx-auto flex w-full max-w-[1300px] flex-wrap gap-x-16 gap-y-8 px-6 pb-5 pt-7 sm:px-10 [@media(max-height:800px)]:pt-5">
        <div className="max-w-[230px]">
          <Logo className="h-10" />
          <p className="mt-3 text-[11px] leading-relaxed text-on-media/70">
            Connecting brands, athletes and fans &mdash; with the delivery and
            the numbers on record.
          </p>
        </div>

        <span aria-hidden="true" className="hidden w-px self-stretch bg-on-media/15 lg:block" />

        <div className="flex flex-wrap gap-x-24 gap-y-8">
          {FOOTER_COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-on-media">{c.title}</p>
              <ul className="mt-3 space-y-2 text-[12px] text-on-media/75">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="transition-colors hover:text-[#5ee0ff]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[1300px] flex-wrap items-center justify-between gap-4 px-6 pb-5 sm:px-10 [@media(max-height:800px)]:pb-3">
        <ul className="ml-auto flex items-center gap-3">
          {SOCIAL.map((s) => (
            <li key={s.label}>
              <span
                role="img"
                aria-label={`${s.label} — not linked yet`}
                title="Not linked yet"
                className="grid size-8 place-items-center rounded-full border border-on-media/40 text-on-media/85"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
                  <path d={s.path} />
                </svg>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
