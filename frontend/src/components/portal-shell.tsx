import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { PortalNav, type NavItem } from "./portal-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/* --------------------------------------------------------------------------
   Portal chrome: left sidebar and top bar, per the mockup's sponsor dashboard
   (screen 3), reworked to the sponsor-redesign language (spec 2026-09-11):
   accent glow atmosphere, gradient hairlines, staggered entrance, editorial
   watermark. Portal accent colours follow the BTG SponsorX logo (Roadmap A0):
   Athlete = blue, Sponsor = orange, Admin = steel, Property = soft blue.
   -------------------------------------------------------------------------- */

export type Portal = "sponsor" | "athlete" | "admin" | "property" | "next";
export type { NavItem };

const ACCENT: Record<
  Portal,
  {
    text: string;
    bg: string;
    dot: string;
    /** Gradient start for the active nav item's wash, faded to transparent. */
    wash: string;
    /** Gradient start for accent hairlines: header underline, sidebar edge. */
    edge: string;
    label: string;
  }
> = {
  athlete: {
    text: "text-athlete",
    bg: "bg-athlete/15",
    dot: "bg-athlete",
    wash: "from-athlete/15",
    edge: "from-athlete/60",
    label: "Athlete Portal",
  },
  sponsor: {
    text: "text-sponsor",
    bg: "bg-sponsor/15",
    dot: "bg-sponsor",
    wash: "from-sponsor/15",
    edge: "from-sponsor/60",
    label: "Sponsor Portal",
  },
  admin: {
    text: "text-admin",
    bg: "bg-admin/15",
    dot: "bg-admin",
    wash: "from-admin/15",
    edge: "from-admin/50",
    label: "Admin Portal",
  },
  property: {
    text: "text-property",
    bg: "bg-property/15",
    dot: "bg-property",
    wash: "from-property/15",
    edge: "from-property/60",
    label: "Property Portal",
  },
  /* SponsorX NEXT (P1-FE-18) — violet via the --sx-next token pair, which NEXT
     spec §14 keeps a proposed value behind the brand gate. The label's first
     word feeds the sidebar watermark, so it reads NEXT, not STUDENT. */
  next: {
    text: "text-next",
    bg: "bg-next/15",
    dot: "bg-next",
    wash: "from-next/15",
    edge: "from-next/60",
    label: "NEXT Student",
  },
};

function TopIcon({ path, label }: { path: string; label: string }) {
  return (
    <span
      title={label}
      className="grid size-9 cursor-pointer place-items-center rounded-full border border-line/70 bg-surface-2/40 text-muted transition-all duration-300 hover:-translate-y-0.5 hover:border-line hover:text-text hover:shadow-lg hover:shadow-black/30"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        <path d={path} />
      </svg>
    </span>
  );
}

export function PortalShell({
  portal,
  nav,
  rootHref,
  orgName,
  userName,
  userRole,
  children,
}: {
  portal: Portal;
  nav: NavItem[];
  /** Portal index route — matched exactly for nav highlighting. */
  rootHref: string;
  /** Tenant / account the actor is acting for, e.g. "Under Armour". */
  orgName?: string;
  userName: string;
  userRole: string;
  children: ReactNode;
}) {
  const accent = ACCENT[portal];

  return (
    <div className="flex min-h-screen">
      {/* ------------------------------------------------------- sidebar */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-hidden border-r border-line/70 bg-gradient-to-b from-surface via-surface to-bg md:flex md:flex-col">
        {/* atmosphere: accent bloom, gradient edge, portal watermark */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute -left-20 -top-20 size-56 rounded-full ${accent.dot} opacity-[0.13] blur-[90px]`}
        />
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute right-0 top-0 h-64 w-px bg-gradient-to-b ${accent.edge} to-transparent`}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-14 right-0.5 select-none text-5xl font-black leading-none tracking-tighter text-text/[0.04] [writing-mode:vertical-rl]"
        >
          {accent.label.split(" ")[0].toUpperCase()}
        </span>

        <Link href={rootHref} className="sx-animate relative block px-5 pb-4 pt-5">
          <Logo className="h-7" />
        </Link>

        <div
          className="sx-animate relative mb-2 flex items-center gap-2 px-5"
          style={{ animationDelay: "40ms" }}
        >
          <span className="relative flex size-1.5">
            <span
              className={`absolute inline-flex h-full w-full animate-ping rounded-full ${accent.dot} opacity-60 motion-reduce:animate-none`}
            />
            <span className={`relative inline-flex size-1.5 rounded-full ${accent.dot}`} />
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            {accent.label}
          </span>
          <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <PortalNav
            nav={nav}
            accentBg={accent.bg}
            accentText={accent.text}
            accentDot={accent.dot}
            accentWash={accent.wash}
            rootHref={rootHref}
          />
        </div>

        <div className="relative border-t border-line/70 px-5 py-4">
          <Link
            href="/map"
            className="group flex items-center justify-between text-[11px] text-faint transition-colors hover:text-muted"
          >
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="transition-transform duration-300 group-hover:-translate-x-0.5"
              >
                ←
              </span>
              route map
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-faint/70">
              SponsorX
            </span>
          </Link>
        </div>
      </aside>

      {/* ----------------------------------------------------- main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-surface/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          {/* accent hairline instead of a flat border */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${accent.edge} via-line to-transparent`}
          />

          <MobileNav
            nav={nav}
            rootHref={rootHref}
            accentBg={accent.bg}
            accentText={accent.text}
            accentDot={accent.dot}
            portalLabel={accent.label}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase leading-tight tracking-[0.2em] text-faint">
              Welcome back
            </p>
            <p className="truncate text-base font-semibold leading-tight tracking-tight">
              {orgName ?? userName}
              <span
                aria-hidden="true"
                className={`ml-1.5 inline-block size-1.5 rounded-full align-middle ${accent.dot}`}
              />
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <TopIcon
              path="M6 16V10a6 6 0 1 1 12 0v6l2 3H4l2-3Zm4 3a2 2 0 0 0 4 0"
              label="Notifications — not wired"
            />
            <TopIcon
              path="M12 17h.01M12 13.5c0-1.5 2-1.8 2-3.5a2 2 0 1 0-4 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
              label="Help — not wired"
            />
            <span className="hidden h-6 w-px bg-gradient-to-b from-transparent via-line to-transparent sm:block" />
            <UserMenu
              userName={userName}
              userRole={userRole}
              accentBg={accent.bg}
              accentText={accent.text}
            />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
