import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./logo";
import { MobileDock } from "./mobile-dock";
import { MobileNav } from "./mobile-nav";
import { OpsStage } from "./ops-fx";
import { OpsGround } from "./ops-stage";
import { ArenaGround } from "./arena-stage";
import { StadiumGround } from "./stadium-stage";
import { StagePortals } from "./stage-portals";
import { StageRoot } from "./stage-root";
import { VaultGround } from "./vault-stage";
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

export type Portal =
  | "sponsor"
  | "athlete"
  | "admin"
  | "property"
  | "next"
  | "advisor";
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
  /* The advisor desk (P1-FE-20) shares NEXT's violet — one programme, one
     colour — and differs only in label. Same token pair, same brand gate. */
  advisor: {
    text: "text-next",
    bg: "bg-next/15",
    dot: "bg-next",
    wash: "from-next/15",
    edge: "from-next/60",
    label: "NEXT Advisor",
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
  orgBrand,
  userName,
  userRole,
  stage = false,
  vault = false,
  dock,
  children,
}: {
  portal: Portal;
  nav: NavItem[];
  /** Portal index route — matched exactly for nav highlighting. */
  rootHref: string;
  /** Tenant / account the actor is acting for, e.g. "Under Armour". */
  orgName?: string;
  /** 2S7-FE-03 — an outside organisation's own branding (GET /branding):
   *  its logo beside its name and its colour on the name's dot. */
  orgBrand?: { logoUrl: string | null; primaryColor: string | null };
  userName: string;
  userRole: string;
  /** P1-ART-18 — the admin portal: the whole shell on the Mission Control
   *  stage (fixed-dark in both themes), with every page as content on it.
   *  P1-ART-22 — `"arena"`: the athlete portal's theme-aware stage. `true`
   *  still means the admin's `"ops"`.
   *  P1-ART-23 — `"stadium"`: the sponsor's fixed-dark Stadium Board. */
  stage?: boolean | "ops" | "arena" | "stadium";
  /** P1-ART-25 — on the admin stage, switch to the Vault on money routes. */
  vault?: boolean;
  /** P1-ART-24 — on a staged portal, the four hrefs (from `nav`) the phone
   *  dock carries; its Menu opens the LED menu and replaces the hamburger. */
  dock?: readonly string[];
  children: ReactNode;
}) {
  const accent = ACCENT[portal];
  const kind = stage === true ? "ops" : stage || null;
  const stageCls = kind === "ops" ? "sx-ops" : kind === "arena" ? "sx-arena" : kind === "stadium" ? "sx-stadium" : "";
  const docked = kind !== null && !!dock;
  /* Below md the page keeps clear of the floating dock (its height, its
     12px float and the safe area), so the last row or a pager never sits
     under it. */
  const stagePad = docked ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-14" : "pb-14";

  return (
    <StageRoot className={`flex min-h-screen ${stageCls}`} vault={kind === "ops" && vault}>
      {kind && <StagePortals className={stageCls} />}
      {/* ------------------------------------------------------- sidebar */}
      <aside className="sx-shell-aside sticky top-0 hidden h-screen w-56 shrink-0 overflow-hidden border-r border-line/70 bg-gradient-to-b from-surface via-surface to-bg md:flex md:flex-col">
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

        {/* Clips horizontally too: a scroller that only says overflow-y gets
            overflow-x: auto with it, and anything that leans out a pixel on
            hover (a label's nudge, a header's light sweep) drew an x scrollbar. */}
        <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <PortalNav
            nav={nav}
            accentBg={accent.bg}
            accentText={accent.text}
            accentDot={accent.dot}
            accentWash={accent.wash}
            rootHref={rootHref}
            portal={portal}
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
        <header className="sx-shell-header sticky top-0 z-20 flex items-center justify-between gap-4 bg-surface/70 px-4 py-3 backdrop-blur-xl sm:px-6">
          {/* accent hairline instead of a flat border */}
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r ${accent.edge} via-line to-transparent`}
          />

          {/* the staged portals open their menu from the dock instead */}
          {!docked && (
            <MobileNav
              nav={nav}
              rootHref={rootHref}
              accentBg={accent.bg}
              accentText={accent.text}
              accentDot={accent.dot}
              portalLabel={accent.label}
            />
          )}
          {orgBrand?.logoUrl && (
            /* A plain <img>: the logo is a public-bucket URL, and next/image
               optimisation is a host-specific primitive (stay host-portable). */
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgBrand.logoUrl} alt="" className="size-9 shrink-0 rounded-lg border border-line/70 bg-white object-contain p-0.5" />
          )}
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[10px] uppercase leading-tight tracking-[0.2em] text-faint">
              Welcome back
            </p>
            <p className="truncate text-base font-semibold leading-tight tracking-tight">
              {orgName ?? userName}
              <span
                aria-hidden="true"
                className={`ml-1.5 inline-block size-1.5 rounded-full align-middle ${orgBrand?.primaryColor ? "" : accent.dot}`}
                style={orgBrand?.primaryColor ? { backgroundColor: orgBrand.primaryColor } : undefined}
              />
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* the admin and stadium stages are dark in both themes — no
                toggle to offer there; the arena is theme-aware and keeps it */}
            {kind !== "ops" && kind !== "stadium" && <ThemeToggle />}
            {/* Both inert until their features ship — on a phone they only
               crowd the actor's name out of the header, so they wait for sm. */}
            <div className="hidden items-center gap-3 sm:flex">
              <TopIcon
                path="M6 16V10a6 6 0 1 1 12 0v6l2 3H4l2-3Zm4 3a2 2 0 0 0 4 0"
                label="Notifications — not wired"
              />
              <TopIcon
                path="M12 17h.01M12 13.5c0-1.5 2-1.8 2-3.5a2 2 0 1 0-4 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
                label="Help — not wired"
              />
            </div>
            <span className="hidden h-6 w-px bg-gradient-to-b from-transparent via-line to-transparent sm:block" />
            <UserMenu
              userName={userName}
              userRole={userRole}
              accentBg={accent.bg}
              accentText={accent.text}
            />
          </div>
        </header>

        {kind === "ops" ? (
          /* The stage: the ground behind every admin page, the house padding
             and column. No overflow clip here — the ground clips itself, and
             the desks' sticky toolbars (the matching studio) need the main
             column unclipped. */
          <OpsStage className={`sx-stage relative isolate flex min-w-0 flex-1 flex-col px-5 ${stagePad} pt-8 sm:px-8 lg:px-10 lg:pt-10`}>
            <OpsGround word="" />
            {/* P1-ART-25 — both grounds render; vault.css shows one */}
            <VaultGround />
            <main className="relative mx-auto w-full max-w-[1440px] min-w-0 flex-1">{children}</main>
          </OpsStage>
        ) : kind === "arena" ? (
          /* The arena (P1-ART-22): the same root island for the pointer light,
             the athlete ground, the same column. */
          <OpsStage className={`sx-arena-stage relative isolate flex min-w-0 flex-1 flex-col px-5 ${stagePad} pt-8 sm:px-8 lg:px-10 lg:pt-10`}>
            <ArenaGround />
            <main className="relative mx-auto w-full max-w-[1440px] min-w-0 flex-1">{children}</main>
          </OpsStage>
        ) : kind === "stadium" ? (
          /* The Stadium Board (P1-ART-23): the same root island for the pointer
             light, the sponsor ground, the same column. */
          <OpsStage className={`sx-stadium-stage relative isolate flex min-w-0 flex-1 flex-col px-5 ${stagePad} pt-8 sm:px-8 lg:px-10 lg:pt-10`}>
            <StadiumGround />
            <main className="relative mx-auto w-full max-w-[1440px] min-w-0 flex-1">{children}</main>
          </OpsStage>
        ) : (
          <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
        )}
      </div>

      {docked && kind && (
        <MobileDock
          stage={kind}
          dock={dock}
          nav={nav}
          rootHref={rootHref}
          portalLabel={accent.label}
          userName={userName}
          userRole={userRole}
        />
      )}
    </StageRoot>
  );
}
