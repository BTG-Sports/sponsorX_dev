import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/* --------------------------------------------------------------------------
   Public marketing chrome — mockup screen 1.

   Nav items marked `pending` have no route yet; they render as inert text
   rather than links so nothing on the page 404s.
   -------------------------------------------------------------------------- */

type NavLink = { label: string; href: string; pending?: boolean };

const NAV: NavLink[] = [
  { label: "How It Works", href: "#how-it-works" },
  { label: "For Sponsors", href: "#for-sponsors" },
  { label: "For Athletes", href: "/join" },
  /* P1-FE-24 — the NEXT programme landing (students and schools). */
  { label: "NEXT", href: "/next/about" },
  { label: "About", href: "#", pending: true },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur print:hidden">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3.5">
        <Link href="/" className="shrink-0 leading-none">
          <Logo className="h-7" />
        </Link>

        <nav className="ml-auto hidden items-center gap-6 md:flex">
          {NAV.map((n) =>
            n.pending ? (
              <span
                key={n.label}
                className="cursor-default text-xs font-medium text-faint"
                title="Not built yet"
              >
                {n.label}
              </span>
            ) : (
              <Link
                key={n.label}
                href={n.href}
                className="text-xs font-medium text-muted transition-colors hover:text-text"
              >
                {n.label}
              </Link>
            ),
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3 md:ml-0">
          <ThemeToggle />
          <Link
            href="/login"
            className="text-xs font-medium text-muted transition-colors hover:text-text"
          >
            Login
          </Link>
          <Link
            href="/login"
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line print:hidden">
      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <Logo className="h-7" />
            <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-faint">
              Connecting brands, athletes and fans — with the delivery and the
              numbers on record.
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Sponsors
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-faint">
                <li>
                  <Link href="#for-sponsors" className="hover:text-muted">
                    Packages
                  </Link>
                </li>
                <li>
                  <Link href="/sponsor" className="hover:text-muted">
                    Sponsor portal
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-muted">
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Athletes
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-faint">
                <li>
                  <Link href="/join" className="hover:text-muted">
                    Join the network
                  </Link>
                </li>
                <li>
                  <Link href="/athlete" className="hover:text-muted">
                    Athlete portal
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                Internal
              </p>
              <ul className="mt-2 space-y-1.5 text-[11px] text-faint">
                <li>
                  <Link href="/admin" className="hover:text-muted">
                    Admin
                  </Link>
                </li>
                <li>
                  <Link href="/map" className="hover:text-muted">
                    Route map
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <p className="mt-10 border-t border-line-soft pt-5 text-[10px] text-faint">
          BTG Sports Group · SponsorX Phase 1 · pre-launch build
        </p>
      </div>
    </footer>
  );
}
