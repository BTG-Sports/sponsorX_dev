"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { Glyph, StageMenu, type Phase, type StageKind } from "./mobile-nav";
import type { NavItem } from "./portal-nav";
import { dockScroll, resolveDock, type DockScroll } from "@/lib/mobile-dock";
import type { VaultMode } from "@/lib/vault-routes";

/* --------------------------------------------------------------------------
   The dock — P1-ART-24 (2026-10-12; owner: "add a wow factor + awwwaaard on
   mobile view navigation"). Below md on the three staged portals: a floating
   one-thumb bar with four destinations and Menu, which opens the LED menu
   (StageMenu, mobile-nav.tsx) and replaces the top bar's hamburger.

   - The current page carries a lit "puck" that slides between items
     (`--x`); matching is the sidebar's (isActiveHref), so a detail page
     lights its section. A page off the dock lights a dot on Menu instead.
   - It slides away on a decisive scroll down and back on any scroll up, at
     the top and at the end of the page (lib/mobile-dock.ts) — never while
     focus is inside it, never under reduced motion.
   - z-30: under every drawer and dialog (z-40/50); hidden while the menu is
     open, and inert then, so Tab can't reach behind the sheet.
   Skins: app/mobile-nav.css, by `data-stage`.
   -------------------------------------------------------------------------- */

export function MobileDock({
  stage, dock, nav, rootHref, portalLabel, vault = "off", userName, userRole,
}: {
  stage: StageKind;
  dock: readonly string[];
  nav: NavItem[];
  rootHref: string;
  portalLabel: string;
  /** P1-ART-25 — when the menu names itself Finance (the shell's Vault mode). */
  vault?: VaultMode;
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const items = resolveDock(dock, nav, pathname, rootHref);
  const lit = items.findIndex((i) => i.active);
  const [phase, setPhase] = useState<Phase>("closed");
  const [hidden, setHidden] = useState(false);
  const scroll = useRef<DockScroll>({ hidden: false, lastY: 0 });
  const bar = useRef<HTMLElement>(null);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    const update = () => {
      raf = 0;
      const root = document.scrollingElement ?? document.documentElement;
      const next = dockScroll(scroll.current, {
        y: window.scrollY,
        maxY: root.scrollHeight - window.innerHeight,
        focusWithin: !!bar.current?.contains(document.activeElement),
        reducedMotion: reduce.matches,
      });
      if (next !== scroll.current) {
        scroll.current = next;
        setHidden(next.hidden);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const open = phase !== "closed";

  return (
    <>
      <nav
        ref={bar}
        aria-label="Quick navigation"
        data-stage={stage}
        data-hidden={hidden || phase === "open" ? "" : undefined}
        inert={phase === "open"}
        onFocus={() => {
          // focus inside never hides it
          scroll.current = { hidden: false, lastY: window.scrollY };
          setHidden(false);
        }}
        className="sx-dock md:hidden"
      >
        <div className="sx-dock-bar" style={{ "--n": items.length + 1, "--x": Math.max(lit, 0) } as CSSProperties}>
          <span className="sx-dock-puck" data-on={lit >= 0 ? "" : undefined} aria-hidden="true">
            <i />
            <i />
          </span>
          {items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined} data-long={item.label.length > 9 ? "" : undefined} className="sx-dock-item">
              <Glyph icon={item.icon} className="sx-dock-glyph" />
              <span className="sx-dock-label">{item.label}</span>
            </Link>
          ))}
          <button
            ref={menuBtn}
            type="button"
            /* "Open navigation" keeps the selectors the old hamburger had; "menu" is the label you see */
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => setPhase("open")}
            className="sx-dock-item sx-dock-menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="sx-dock-glyph">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            <span className="sx-dock-label">Menu</span>
            {lit < 0 && <span className="sx-dock-elsewhere" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open &&
        createPortal(
          <StageMenu
            id={menuId}
            stage={stage}
            phase={phase}
            onClose={() => setPhase((p) => (p === "open" ? "closing" : p))}
            onClosed={() => {
              setPhase("closed");
              menuBtn.current?.focus({ preventScroll: true });
            }}
            nav={nav}
            rootHref={rootHref}
            portalLabel={portalLabel}
            vault={vault}
            userName={userName}
            userRole={userRole}
          />,
          document.body,
        )}
    </>
  );
}
