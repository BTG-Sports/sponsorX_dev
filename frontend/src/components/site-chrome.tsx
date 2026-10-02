import Link from "next/link";
import { Logo } from "./logo";
import { HeaderBar } from "./header-fx";
import { Magnetic } from "./hero-fx";
import { RollLabel, SiteMenu, SiteNav } from "./site-nav";

/* --------------------------------------------------------------------------
   Public marketing chrome — mockup screen 1, header redrawn 1:1 to the hero
   mockup of 2026-09-30 (1825×862 reference) and then trimmed on the owner's
   notes the same day: a 72px full-width glass bar (theme bg at 55% + heavy
   blur + a faint top sheen) with the logo 8% from the left, the nav links
   centred (site-nav.tsx — Home added, current page lit as a hologram),
   then Login and the gradient "Get Started →" ending 6% from the right.
   Below 1280px the links don't fit, so a menu button (SiteMenu) takes
   their place and opens a full-screen menu.
   The bottom rule is a glow line (`.sx-nav-line`). The "wow" pass the
   same day (header-fx.tsx, site-nav.tsx): the bar morphs into a floating
   capsule once the page scrolls, the rule fills with flight / scroll
   progress, a pointer spotlight lights the glass, the links carry a
   gliding lens + underline and a letter-roll hover, and Get Started is
   magnetic with a periodic shine. Gone on the owner's
   call: the slanted hairline dividers and the theme toggle. (The "N"
   circle at the far right of the mockup is the Next.js dev-tools
   indicator, not UI.)
   -------------------------------------------------------------------------- */

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 h-[72px] print:hidden">
      <HeaderBar className="relative flex items-center bg-bg/55 px-5 backdrop-blur-xl sm:pl-[8vw] sm:pr-[6vw]">
        {/* glass sheen */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-b from-white/[.05] to-transparent"
        />

        <Link href="/" className="relative shrink-0 leading-none">
          <Logo className="h-9" />
        </Link>

        <SiteNav />

        {/* Below xl the link row gives way to the menu button (SiteMenu);
            on a phone Login moves into the menu and Get Started drops its
            arrow so logo, CTA and button fit a 360px screen. */}
        <div className="relative ml-auto flex items-center gap-3 sm:gap-7">
          <Link
            href="/login"
            className="sx-roll-host hidden text-[15px] text-text/90 transition-colors hover:text-primary-soft sm:block"
          >
            <RollLabel text="Login" />
          </Link>
          <Magnetic maxX={8} maxY={4}>
            <Link
              href="/login"
              className="sx-shine sx-roll-host group relative inline-flex h-10 items-center gap-3 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-r from-primary-soft to-primary px-4 text-[14px] font-medium text-white shadow-[0_0_22px_rgba(46,155,245,.5)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_32px_rgba(46,155,245,.7)] sm:gap-4 sm:px-7 sm:text-[15px]"
            >
              <RollLabel text="Get Started" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="hidden size-[18px] transition-transform group-hover:translate-x-0.5 sm:block"
                aria-hidden="true"
              >
                <path d="M4 12h16M14 6l6 6-6 6" />
              </svg>
            </Link>
          </Magnetic>
          <SiteMenu />
        </div>
      </HeaderBar>
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
      /* 2S1-FE-10 — guardianship, account or payment questions reach a person at BTG. */
      { label: "Contact BTG", href: "/contact" },
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

function SocialRings({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex items-center gap-3 ${className}`}>
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
  );
}

/**
 * `compact` (the landing's last stop, where the closing section and the
 * footer must share one screen): below lg the logo and the social rings
 * share the first line, the blurb goes, the three link columns sit side by
 * side in small type and drop out under 600px tall. Every other page keeps
 * the full footer.
 */
export function SiteFooter({ compact = false }: { compact?: boolean }) {
  // Phone-only overrides, applied when compact.
  const c = (cls: string) => (compact ? cls : "");
  return (
    <footer className="relative z-10 w-full overflow-hidden bg-[#03070f]/92 text-on-media backdrop-blur-xl print:hidden">
      {/* glowing top rule, a light travelling along it */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px overflow-hidden bg-gradient-to-r from-transparent via-[#5ee0ff]/80 to-transparent shadow-[0_0_10px_rgba(94,224,255,.9),0_0_22px_rgba(46,155,245,.55)]"
      >
        <span className="sx-rule-pulse absolute inset-y-0 left-0 w-40" />
      </span>
      {/* the landing's closing stop: a giant faint outlined wordmark behind
          the footer (decorative, no layout) */}
      {compact && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-[0.3em] left-1/2 -translate-x-1/2 select-none whitespace-nowrap text-[clamp(96px,17vw,320px)] font-black leading-none tracking-tighter text-transparent [-webkit-text-stroke:1px_rgba(94,224,255,.08)] lg:[-webkit-text-stroke:1px_rgba(94,224,255,.11)]"
        >
          SPONSORX
        </span>
      )}

      <div
        className={`relative mx-auto flex w-full max-w-[1300px] flex-wrap gap-x-16 gap-y-8 px-6 pb-5 pt-7 sm:px-10 [@media(max-height:800px)]:pt-5 ${c(
          "max-lg:flex-col max-lg:gap-y-[clamp(8px,1.6svh,16px)] max-lg:px-5 max-lg:pb-[max(10px,env(safe-area-inset-bottom))] max-lg:pt-[clamp(10px,2svh,20px)] max-lg:[@media(max-height:800px)]:pt-[clamp(10px,2svh,20px)] sm:max-lg:px-[6vw]",
        )}`}
      >
        <div className={`max-w-[230px] ${c("max-lg:flex max-lg:max-w-none max-lg:items-center max-lg:justify-between")}`}>
          <Logo className={`h-10 ${c("max-lg:h-7")}`} />
          <p className={`mt-3 text-[11px] leading-relaxed text-on-media/70 ${c("max-lg:hidden")}`}>
            Connecting brands, athletes and fans &mdash; with the delivery and
            the numbers on record.
          </p>
          {compact && <SocialRings className="lg:hidden" />}
        </div>

        <span aria-hidden="true" className="hidden w-px self-stretch bg-on-media/15 lg:block" />

        <div className={`flex flex-wrap gap-x-24 gap-y-8 ${c("max-lg:grid max-lg:grid-cols-3 max-lg:gap-3 max-lg:[@media(max-height:600px)]:hidden")}`}>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] text-on-media ${c("max-lg:text-[10px] max-lg:tracking-[0.16em]")}`}>{col.title}</p>
              <ul className={`mt-3 space-y-2 text-[12px] text-on-media/75 ${c("max-lg:mt-1.5 max-lg:space-y-[clamp(2px,0.5svh,6px)] max-lg:text-[clamp(10.5px,1.5svh,12px)] max-lg:leading-snug")}`}>
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="sx-underline transition-colors hover:text-[#5ee0ff]">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div
        className={`relative mx-auto flex w-full max-w-[1300px] flex-wrap items-center justify-between gap-4 px-6 pb-5 sm:px-10 [@media(max-height:800px)]:pb-3 ${c("max-lg:hidden")}`}
      >
        <SocialRings className="ml-auto" />
      </div>
    </footer>
  );
}
