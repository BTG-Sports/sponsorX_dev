import Link from "next/link";
import type { ReactNode } from "react";
import { PortalNav, type NavItem } from "./portal-nav";

/* --------------------------------------------------------------------------
   Portal chrome: left sidebar and top bar, per the mockup's sponsor dashboard
   (screen 3). Portal accent colours come from the three portal chips on the
   mockup sheet — sponsor purple, athlete teal, admin red.
   -------------------------------------------------------------------------- */

export type Portal = "sponsor" | "athlete" | "admin" | "property";
export type { NavItem };

const ACCENT: Record<
  Portal,
  { text: string; bg: string; dot: string; label: string }
> = {
  sponsor: { text: "text-primary-soft", bg: "bg-primary/15", dot: "bg-primary", label: "Sponsor Portal" },
  athlete: { text: "text-accent", bg: "bg-accent/12", dot: "bg-accent", label: "Athlete Portal" },
  admin: { text: "text-danger", bg: "bg-danger/12", dot: "bg-danger", label: "Admin Portal" },
  property: { text: "text-primary-soft", bg: "bg-primary/15", dot: "bg-primary", label: "Property Portal" },
};

function TopIcon({ path, label }: { path: string; label: string }) {
  return (
    <span title={label} className="text-muted transition-colors hover:text-text">
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
      <aside className="hidden w-52 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <Link href={rootHref} className="block px-5 py-5">
          <span className="block text-[13px] font-bold leading-none tracking-tight">
            BTG
          </span>
          <span className="mt-0.5 block text-[13px] font-bold leading-none tracking-tight">
            SPONSOR<span className={accent.text}>X</span>
          </span>
        </Link>

        <div className="mb-1 flex items-center gap-2 px-5">
          <span className={`size-1.5 rounded-full ${accent.dot}`} />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            {accent.label}
          </span>
        </div>

        <PortalNav
          nav={nav}
          accentBg={accent.bg}
          accentText={accent.text}
          rootHref={rootHref}
        />

        <div className="border-t border-line px-5 py-4">
          <Link href="/map" className="text-[11px] text-faint hover:text-muted">
            ← route map
          </Link>
        </div>
      </aside>

      {/* ----------------------------------------------------- main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3">
          <div className="min-w-0">
            <p className="text-[11px] leading-tight text-muted">Welcome back,</p>
            <p className="truncate text-base font-semibold leading-tight tracking-tight">
              {orgName ?? userName}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <TopIcon
              path="M6 16V10a6 6 0 1 1 12 0v6l2 3H4l2-3Zm4 3a2 2 0 0 0 4 0"
              label="Notifications — not wired"
            />
            <TopIcon
              path="M12 17h.01M12 13.5c0-1.5 2-1.8 2-3.5a2 2 0 1 0-4 0M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
              label="Help — not wired"
            />
            <span className="hidden h-6 w-px bg-line sm:block" />
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium leading-tight">{userName}</p>
              <p className="text-[10px] leading-tight text-faint">{userRole}</p>
            </div>
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${accent.bg} text-xs font-semibold ${accent.text}`}
            >
              {userName.slice(0, 1)}
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
