"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Logo } from "./logo";
import type { NavItem } from "./portal-nav";

/* --------------------------------------------------------------------------
   Mobile portal navigation: the sidebar is hidden below `md`, so the top-bar
   hamburger opens a full-screen takeover menu — clip-path circle reveal from
   the hamburger corner, oversized staggered links, portal watermark, accent
   glow. Closes on Escape, the ✕, or navigating. The exit animation runs a
   `closing` phase and unmounts on animationend (reduced-motion shortens the
   animations to 1ms rather than removing them, so the event still fires).
   -------------------------------------------------------------------------- */

type Phase = "closed" | "open" | "closing";

export function MobileNav({
  nav,
  rootHref,
  accentText,
  accentDot,
  portalLabel,
}: {
  nav: NavItem[];
  rootHref: string;
  accentBg: string;
  accentText: string;
  accentDot: string;
  portalLabel: string;
}) {
  const [phase, setPhase] = useState<Phase>("closed");
  const pathname = usePathname();
  const visible = phase !== "closed";

  function close() {
    setPhase((p) => (p === "open" ? "closing" : p));
  }

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPhase((p) => (p === "open" ? "closing" : p));
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [visible]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setPhase("open")}
        aria-label="Open navigation"
        aria-expanded={visible}
        className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
          className="size-5"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Portaled to <body>: the sticky header's backdrop-filter makes it the
          containing block for fixed descendants, which would trap this
          full-screen overlay inside the header box. */}
      {visible &&
        createPortal(
          <div
            role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && phase === "closing")
              setPhase("closed");
          }}
          onClick={(e) => {
            // Any tap on a nav link starts the exit as it navigates.
            if ((e.target as HTMLElement).closest("a")) close();
          }}
          className={`${phase === "closing" ? "sx-menu-out" : "sx-menu-in"} fixed inset-0 z-40 flex flex-col overflow-hidden bg-bg`}
        >
          {/* ----------------------------------------------- atmosphere */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute -left-24 -top-24 size-80 rounded-full ${accentDot} opacity-[0.14] blur-[110px]`}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-32 -right-24 size-80 rounded-full bg-primary opacity-[0.10] blur-[120px]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-6 right-0 select-none text-[30vw] font-black leading-none tracking-tighter text-text/[0.04]"
          >
            {portalLabel.split(" ")[0].toUpperCase()}
          </span>

          {/* --------------------------------------------------- header */}
          <div className="sx-animate flex items-center justify-between px-6 pb-1 pt-[clamp(0.75rem,2vh,1.25rem)]">
            <Link href={rootHref}>
              <Logo className="h-7" />
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close navigation"
              className="grid size-9 place-items-center rounded-full border border-line text-muted transition-all duration-300 hover:rotate-90 hover:border-text/30 hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
                className="size-4"
              >
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>

          <div
            className="sx-animate flex items-center gap-2 px-6 pt-[clamp(0.5rem,1.5vh,1rem)]"
            style={{ animationDelay: "80ms" }}
          >
            <span className={`size-1.5 rounded-full ${accentDot}`} />
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              {portalLabel}
            </span>
            <span className="h-px flex-1 bg-line" />
          </div>

          {/* ----------------------------------------------------- links */}
          <nav className="relative flex min-h-0 flex-1 flex-col justify-center px-6 py-[clamp(0.5rem,2vh,1.5rem)]">
            {nav.map((item, i) => {
              const delay = { animationDelay: `${140 + i * 50}ms` };
              const index = String(i + 1).padStart(2, "0");

              if (item.pending) {
                return (
                  <span
                    key={item.label}
                    title="Not built yet"
                    className="sx-animate flex cursor-default items-baseline gap-4 py-[clamp(2px,0.8vh,6px)]"
                    style={delay}
                  >
                    <span className="w-6 font-mono text-[10px] text-faint">
                      {index}
                    </span>
                    <span className="text-[clamp(1.05rem,3.6vh,1.5rem)] font-semibold leading-tight tracking-tight text-faint">
                      {item.label}
                    </span>
                    <span className="rounded-full border border-line px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-faint">
                      soon
                    </span>
                  </span>
                );
              }

              const active =
                pathname === item.href ||
                (item.href !== rootHref && pathname.startsWith(`${item.href}/`));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="sx-animate group flex items-baseline gap-4 py-[clamp(2px,0.8vh,6px)]"
                  style={delay}
                >
                  <span
                    className={`w-6 font-mono text-[10px] transition-colors ${active ? accentText : "text-faint group-hover:text-muted"}`}
                  >
                    {index}
                  </span>
                  <span
                    className={`relative text-[clamp(1.05rem,3.6vh,1.5rem)] font-semibold leading-tight tracking-tight transition-transform duration-300 group-hover:translate-x-1.5 ${
                      active ? accentText : "text-text"
                    }`}
                  >
                    {item.label}
                    <span
                      aria-hidden="true"
                      className={`absolute -bottom-1 left-0 h-0.5 w-full origin-left scale-x-0 rounded-full ${accentDot} transition-transform duration-300 group-hover:scale-x-100`}
                    />
                  </span>
                  {active && (
                    <span className={`size-1.5 self-center rounded-full ${accentDot}`} />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* ----------------------------------------------------- footer */}
          <div
            className="sx-animate flex items-center justify-between border-t border-line px-6 py-[clamp(0.6rem,1.8vh,1rem)]"
            style={{ animationDelay: `${180 + nav.length * 50}ms` }}
          >
            <Link href="/map" className="text-[11px] text-faint hover:text-muted">
              ← route map
            </Link>
            <span className="text-[10px] uppercase tracking-[0.2em] text-faint">
              SponsorX
            </span>
          </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
