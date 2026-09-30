"use client";

/* --------------------------------------------------------------------------
   Public marketing nav — the link row in the SiteHeader (owner's brief,
   2026-09-30): Home, How It Works, For Sponsors, For Athletes, NEXT,
   About, with the current page lit as a hologram (`.sx-holo` in
   globals.css: glow, a neon flicker and short RGB-split glitches) and a
   glowing underline that glides between the links (SiteNav below).

   Every item is its own page (owner, 2026-09-30) — not a section of the
   landing: For Sponsors is the package catalogue (/packages), For
   Athletes the application (/join), NEXT the programme page; How It Works
   and About have no page yet. So "current" is the pathname alone: Home on
   `/` exactly, the others on their route and anything under it. The
   landing's own buttons still fly the drone to its stops by hash
   (ScrollTrack); the nav doesn't.

   The row needs ~1280px: below `xl` it collides with Login / Get Started
   (measured 2026-09-30), so there the header shows a menu button instead
   (`SiteMenu`) — a full-screen takeover over the city with the same links,
   the same "current" logic, and Login + Get Started at the bottom, sized
   to fit one phone screen without scrolling.

   Items marked `pending` have no route yet; they render as inert text so
   nothing on the page 404s.
   -------------------------------------------------------------------------- */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Logo } from "./logo";

interface NavItem {
  label: string;
  href: string;
  pending?: boolean;
}

const NAV: NavItem[] = [
  { label: "Home", href: "/" },
  /* No page yet (owner, 2026-09-30) — inert until one is built. */
  { label: "How It Works", href: "/how-it-works", pending: true },
  { label: "For Sponsors", href: "/packages" },
  { label: "For Athletes", href: "/join" },
  /* P1-FE-24 — the NEXT programme landing (students and schools). */
  { label: "NEXT", href: "/next/about" },
  { label: "About", href: "/about", pending: true },
];

/** Which nav item is the current one — shared by the row and the menu. */
function useIsCurrent() {
  const pathname = usePathname();
  return (n: NavItem) => {
    if (n.pending) return false;
    if (n.href === "/") return pathname === "/";
    return pathname === n.href || pathname.startsWith(`${n.href}/`);
  };
}

/**
 * A label that rolls on hover: two stacked copies split into letters; on
 * hovering its `.sx-roll-host` the first copy's letters lift out and the
 * second's rise in, one after another (globals.css `.sx-roll`). The real
 * text is the sr-only span; both copies are aria-hidden. `holo` puts the
 * current-page hologram (`.sx-holo`, which reads `data-text`) on it.
 */
export function RollLabel({ text, holo = false }: { text: string; holo?: boolean }) {
  const letters = (layer: string) => (
    <span className={layer}>
      {[...text].map((c, i) => (
        <span key={i} style={{ "--i": i } as React.CSSProperties}>
          {c === " " ? "\u00a0" : c}
        </span>
      ))}
    </span>
  );
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" data-text={text} className={`sx-roll${holo ? " sx-holo" : ""}`}>
        {letters("sx-roll-a")}
        {letters("sx-roll-b")}
      </span>
    </>
  );
}

/**
 * The link row. One glass lens and one glowing hologram underline are
 * shared by every link and glide between them: the underline rests on the
 * current item and follows the pointer (or keyboard focus) while it is on
 * the row; the lens only shows while something is hovered or focused. The
 * target's box is written onto the <nav> as --sx-ix / --sx-iw, so the
 * glide is a CSS transition. When nothing was lit (mid-leg on the landing)
 * the next target snaps into place and fades in rather than sliding in
 * from the left edge. Links enter one by one when the header appears
 * (`.sx-nav-item`, held on the landing until the loader releases).
 */
export function SiteNav() {
  const isCurrent = useIsCurrent();
  const navRef = useRef<HTMLElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const current = NAV.find((n) => isCurrent(n))?.label ?? null;
  const target = hover ?? current;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const place = () => {
      const el = target
        ? nav.querySelector<HTMLElement>(`[data-nav="${CSS.escape(target)}"]`)
        : null;
      if (!el || el.offsetWidth === 0) {
        nav.removeAttribute("data-lit");
        return;
      }
      const snap = !nav.hasAttribute("data-lit");
      if (snap) nav.setAttribute("data-snap", "");
      nav.style.setProperty("--sx-ix", `${el.offsetLeft}px`);
      nav.style.setProperty("--sx-iw", `${el.offsetWidth}px`);
      nav.setAttribute("data-lit", "");
      if (snap) {
        void nav.offsetWidth; // commit the snapped position before re-enabling the glide
        nav.removeAttribute("data-snap");
      }
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [target]);

  return (
    <nav
      ref={navRef}
      data-hover={hover ? "" : undefined}
      onPointerLeave={() => setHover(null)}
      className="sx-nav relative hidden items-center gap-2 xl:absolute xl:left-1/2 xl:flex xl:-translate-x-1/2"
    >
      <span aria-hidden="true" className="sx-nav-lens" />
      <span aria-hidden="true" className="sx-nav-bar" />
      {NAV.map((n, i) => {
        const stagger = { "--i": i } as React.CSSProperties;
        if (n.pending) {
          return (
            <span
              key={n.label}
              className="sx-nav-item relative cursor-default whitespace-nowrap px-4 py-2 text-[15px] text-faint"
              style={stagger}
              title="Not built yet"
            >
              {n.label}
            </span>
          );
        }
        const lit = n.label === current;
        return (
          <Link
            key={n.label}
            href={n.href}
            data-nav={n.label}
            aria-current={lit ? "page" : undefined}
            onPointerEnter={() => setHover(n.label)}
            onFocus={() => setHover(n.label)}
            onBlur={() => setHover(null)}
            style={stagger}
            className={[
              "sx-nav-item sx-roll-host relative whitespace-nowrap px-4 py-2 text-[15px] transition-colors duration-300",
              lit ? "text-primary-soft" : "text-text/90 hover:text-white",
            ].join(" ")}
          >
            <RollLabel text={n.label} holo={lit} />
          </Link>
        );
      })}
    </nav>
  );
}

/* ------------------------------------------------------------ phone menu */

type Phase = "closed" | "open" | "closing";

const CLOSE_ICON = "M6 6l12 12M18 6 6 18";
const MENU_ICON = "M4 7h16M4 12h16M10 17h10";

function LineIcon({ d, className = "size-5" }: { d: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

/**
 * The header's menu button below `xl`, and the takeover it opens. Follows
 * the portal menu (mobile-nav.tsx): portaled to <body> (the sticky header's
 * backdrop-filter would otherwise trap a fixed overlay inside its box), a
 * clip-path circle reveal — here from the button itself, measured on open
 * into `--sx-menu-at` — and an exit phase that unmounts on animationend.
 * Closes on the ✕, Escape, any link, or the viewport growing past `xl`.
 * `data-lenis-prevent` keeps the landing's smooth scroll from flying the
 * drone while the menu is up.
 */
export function SiteMenu() {
  const [phase, setPhase] = useState<Phase>("closed");
  const [at, setAt] = useState("calc(100% - 2.5rem) 2.25rem");
  const trigger = useRef<HTMLButtonElement>(null);
  const isCurrent = useIsCurrent();
  const visible = phase !== "closed";

  const close = () => setPhase((p) => (p === "open" ? "closing" : p));

  const open = () => {
    const r = trigger.current?.getBoundingClientRect();
    if (r) setAt(`${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`);
    setPhase("open");
  };

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhase((p) => (p === "open" ? "closing" : p));
    };
    const wide = window.matchMedia("(min-width: 80rem)");
    const onWide = () => wide.matches && setPhase("closed");
    document.addEventListener("keydown", onKeyDown);
    wide.addEventListener("change", onWide);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      wide.removeEventListener("change", onWide);
      document.body.style.overflow = "";
    };
  }, [visible]);

  return (
    <div className="xl:hidden">
      <button
        ref={trigger}
        type="button"
        onClick={open}
        aria-label="Open menu"
        aria-expanded={visible}
        aria-haspopup="dialog"
        className="grid size-10 place-items-center rounded-xl border border-[#bfe0ff]/35 bg-[#0a1428]/40 text-text/90 shadow-[0_0_14px_rgba(99,180,248,.2)] transition-colors hover:border-primary-soft hover:text-primary-soft"
      >
        <LineIcon d={MENU_ICON} />
      </button>

      {visible &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            data-lenis-prevent=""
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget || phase !== "closing") return;
              setPhase("closed");
              trigger.current?.focus();
            }}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) close();
            }}
            style={{ "--sx-menu-at": at } as React.CSSProperties}
            className={`${phase === "closing" ? "sx-menu-out" : "sx-menu-in"} fixed inset-0 z-50 flex h-[100svh] flex-col overflow-hidden bg-[#03070f]/95 text-on-media backdrop-blur-xl`}
          >
            {/* atmosphere */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-primary opacity-[0.18] blur-[110px]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 -left-24 size-80 rounded-full bg-[#fb923c] opacity-[0.08] blur-[120px]"
            />

            {/* top row — the header's own geometry, so the logo stays put and
                the ✕ lands where the menu button was */}
            <div className="relative flex h-[72px] shrink-0 items-center justify-between px-5 sm:pl-[8vw] sm:pr-[6vw]">
              <Link href="/" className="leading-none">
                <Logo className="h-9" />
              </Link>
              <button
                type="button"
                onClick={close}
                autoFocus
                aria-label="Close menu"
                className="grid size-10 place-items-center rounded-xl border border-[#bfe0ff]/35 text-on-media/90 transition-all duration-300 hover:rotate-90 hover:border-primary-soft hover:text-primary-soft"
              >
                <LineIcon d={CLOSE_ICON} className="size-[18px]" />
              </button>
              <span aria-hidden="true" className="sx-nav-line absolute inset-x-0 bottom-0 h-px" />
            </div>

            <p
              className="sx-animate relative flex items-center gap-3 px-5 pt-[clamp(1rem,3svh,2rem)] text-[10px] font-medium uppercase tracking-[0.32em] text-primary-soft sm:pl-[8vw]"
              style={{ animationDelay: "80ms" }}
            >
              <span aria-hidden="true" className="h-px w-6 bg-primary-soft" />
              Navigate
              <span aria-hidden="true" className="sx-hud-dashes ml-1" />
            </p>

            {/* links */}
            <nav className="relative flex min-h-0 flex-1 flex-col justify-center px-5 sm:pl-[8vw]">
              {NAV.map((n, i) => {
                const delay = { animationDelay: `${130 + i * 45}ms` };
                const index = String(i + 1).padStart(2, "0");
                const label = "relative text-[clamp(22px,4.4svh,34px)] font-bold leading-tight tracking-tight";

                if (n.pending) {
                  return (
                    <span
                      key={n.label}
                      title="Not built yet"
                      className="sx-animate flex cursor-default items-center gap-4 py-[clamp(4px,1.1svh,10px)]"
                      style={delay}
                    >
                      <span className="w-6 font-mono text-[10px] text-on-media/30">{index}</span>
                      <span className={`${label} text-on-media/35`}>{n.label}</span>
                      <span className="rounded-full border border-on-media/20 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-on-media/45">
                        soon
                      </span>
                    </span>
                  );
                }

                const current = isCurrent(n);
                return (
                  <Link
                    key={n.label}
                    href={n.href}
                    aria-current={current ? "page" : undefined}
                    className="sx-animate group flex items-center gap-4 py-[clamp(4px,1.1svh,10px)]"
                    style={delay}
                  >
                    <span
                      className={`w-6 font-mono text-[10px] transition-colors ${current ? "text-primary-soft" : "text-on-media/40 group-hover:text-on-media/70"}`}
                    >
                      {index}
                    </span>
                    <span
                      data-text={n.label}
                      className={`${label} transition-transform duration-300 group-hover:translate-x-1.5 ${current ? "sx-holo text-primary-soft" : "text-on-media"}`}
                    >
                      {n.label}
                    </span>
                    {current && (
                      <span
                        aria-hidden="true"
                        className="size-1.5 rounded-full bg-primary-soft shadow-[0_0_10px_rgba(127,208,255,.9)]"
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* actions */}
            <div
              className="sx-animate relative grid shrink-0 grid-cols-2 gap-3 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:px-[8vw]"
              style={{ animationDelay: `${160 + NAV.length * 45}ms` }}
            >
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[#bfe0ff]/50 bg-[#0a1428]/40 text-[15px] font-medium text-on-media transition-colors hover:border-primary-soft hover:bg-primary/15"
              >
                Login
              </Link>
              <Link
                href="/login"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] text-[15px] font-medium text-white shadow-[0_0_24px_rgba(46,155,245,.5)]"
              >
                Get Started
                <LineIcon d="M4 12h16M14 6l6 6-6 6" className="size-[18px] transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
