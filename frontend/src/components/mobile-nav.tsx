"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ICONS, type NavIcon } from "./icons";
import { Logo } from "./logo";
import type { NavItem } from "./portal-nav";
import { sheetGroups } from "@/lib/mobile-dock";
import { groupNav, isActiveHref, type NavGroup } from "@/lib/nav-groups";
import { VAULT_LABEL, vaultOn, type VaultMode } from "@/lib/vault-routes";

/* --------------------------------------------------------------------------
   Mobile portal navigation: the sidebar is hidden below `md`, so the top-bar
   hamburger opens a full-screen takeover menu — clip-path circle reveal from
   the hamburger corner, oversized staggered links, portal watermark, accent
   glow. Closes on Escape, the ✕, or navigating. The exit animation runs a
   `closing` phase and unmounts on animationend (reduced-motion shortens the
   animations to 1ms rather than removing them, so the event still fires).
   -------------------------------------------------------------------------- */

export type Phase = "closed" | "open" | "closing";

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
  const grouped = groupNav(nav);
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
          <nav className={`relative flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-[clamp(0.5rem,2vh,1.5rem)] ${grouped.groups.length ? "justify-start" : "justify-center"}`}>
            {grouped.groups.length > 0 ? (
              <GroupedLinks grouped={grouped} pathname={pathname} rootHref={rootHref} accentText={accentText} accentDot={accentDot} />
            ) : nav.map((item, i) => {
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

/* P1-ART-21 — the drawer, grouped like the sidebar: each group's name, then
   its desks two to a row so the whole admin nav fits a phone without
   scrolling past the fold for the first groups. */
function GroupedLinks({
  grouped, pathname, rootHref, accentText, accentDot,
}: { grouped: ReturnType<typeof groupNav<NavItem>>; pathname: string; rootHref: string; accentText: string; accentDot: string }) {
  /* Staggered by group, not by item — 29 desks one after another took a second to settle. */
  const renderLink = (item: NavItem, gi: number) => {
    const delay = { animationDelay: `${140 + gi * 60}ms` };
    if (item.pending) {
      return (
        <span key={item.label} title="Not built yet" style={delay} className="sx-animate py-1 text-[15px] font-semibold leading-tight text-faint">
          {item.label} <span className="rounded-full border border-line px-1.5 text-[9px] uppercase tracking-wider">soon</span>
        </span>
      );
    }
    const active = isActiveHref(item.href, pathname, rootHref);
    return (
      <Link key={item.href} href={item.href} style={delay} className={`sx-animate flex items-center gap-2 py-1 text-[15px] font-semibold leading-tight tracking-tight ${active ? accentText : "text-text"}`}>
        {item.label}
        {active && <span className={`size-1.5 rounded-full ${accentDot}`} />}
      </Link>
    );
  };
  const groups: NavGroup<NavItem>[] = grouped.groups;
  return (
    <>
      <div className="flex flex-col">{grouped.top.map((item) => renderLink(item, 0))}</div>
      {groups.map((g, n) => (
        <section key={g.key} className="mt-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-faint">{g.label}</p>
          <div className="grid grid-cols-2 gap-x-4">{g.items.map((item) => renderLink(item, n + 1))}</div>
        </section>
      ))}
    </>
  );
}

/* --------------------------------------------------------------------------
   P1-ART-24 — the LED menu: the staged portals' menu (admin, athlete,
   sponsor), opened from the dock's Menu (mobile-dock.tsx). The legacy menu
   above stays for property, NEXT and advisor, untouched.

   The same dialog contract: role="dialog", aria-modal, Escape and the ✕
   close it, a link tap closes it as it navigates, the body's scroll is
   locked, focus moves in and Tab stays inside; the dock puts focus back on
   its Menu button once the exit has played (`onClosed`, on animationend —
   reduced motion shortens the animations rather than removing them, so the
   event still fires).

   One structure, three looks: `data-stage` picks the skin in
   app/mobile-nav.css — Mission Control (ops), the Arena, the Stadium Board.
   -------------------------------------------------------------------------- */

export type StageKind = "ops" | "arena" | "stadium";

export function Glyph({ icon, className = "size-5" }: { icon: NavIcon; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={ICONS[icon] ?? ICONS.grid} />
    </svg>
  );
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function StageMenu({
  id, stage, phase, onClose, onClosed, nav, rootHref, portalLabel, vault = "off", userName, userRole,
}: {
  id: string;
  stage: StageKind;
  phase: Exclude<Phase, "closed">;
  /** Start the exit. */
  onClose: () => void;
  /** The exit has played: unmount and return focus. */
  onClosed: () => void;
  nav: NavItem[];
  rootHref: string;
  portalLabel: string;
  /** P1-ART-25 — the shell's Vault mode: on a Vault screen the menu is the
   *  Finance portal's (the sheet opens on the client, so it can just ask). */
  vault?: VaultMode;
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();
  const label = vaultOn(pathname ?? "", vault) ? VAULT_LABEL : portalLabel;
  const sheet = useRef<HTMLDivElement>(null);
  const { top, groups } = groupNav(nav);
  const ordered = sheetGroups(groups, pathname, rootHref);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const list = [...sheet.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const inside = sheet.current.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>("[data-sheet-close]")?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => onKey(e);
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, []);

  const initial = (userName.trim()[0] ?? "?").toUpperCase();

  return (
    <div
      ref={sheet}
      id={id}
      role="dialog"
      aria-modal="true"
      aria-label="Navigation"
      data-stage={stage}
      data-phase={phase}
      className="sx-sheet md:hidden"
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && phase === "closing") onClosed();
      }}
      onClick={(e) => {
        // Any tap on a link starts the exit as it navigates.
        if ((e.target as HTMLElement).closest("a")) onClose();
      }}
    >
      {/* the skin's ground: floor grid + sweep / floodlight / dot-matrix */}
      <div aria-hidden="true" className="sx-sheet-fx">
        <span className="sx-sheet-fx-a" />
        <span className="sx-sheet-fx-b" />
      </div>

      <div className="sx-sheet-head">
        <Link href={rootHref} className="sx-sheet-logo">
          <Logo className="h-7" />
        </Link>
        <button type="button" data-sheet-close onClick={onClose} aria-label="Close navigation" className="sx-sheet-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-[18px]">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <p className="sx-sheet-portal">
        <span className="sx-sheet-live" aria-hidden="true" />
        {label}
        <span className="sx-sheet-rule" aria-hidden="true" />
      </p>

      <nav aria-label={label} className="sx-sheet-body">
        {top.map((item) => (
          <SheetTile key={item.pending ? item.label : item.href} item={item} hero pathname={pathname} rootHref={rootHref} g={0} r={0} />
        ))}
        {ordered.map((g, gi) => (
          <section key={g.key} className="sx-sheet-group" style={{ "--g": gi + 1 } as CSSProperties}>
            <h2 className="sx-sheet-group-head">
              <span>{g.label}</span>
              <span className="sx-sheet-rule" aria-hidden="true" />
              <span className="sx-sheet-count" aria-hidden="true">{String(g.items.length).padStart(2, "0")}</span>
            </h2>
            <div className="sx-sheet-grid">
              {g.items.map((item, k) => (
                <SheetTile key={item.pending ? item.label : item.href} item={item} pathname={pathname} rootHref={rootHref} g={gi + 1} r={Math.floor(k / 2)} />
              ))}
            </div>
          </section>
        ))}
      </nav>

      <div className="sx-sheet-foot">
        <span className="sx-sheet-avatar" aria-hidden="true">{initial}</span>
        <span className="min-w-0 flex-1">
          <span className="sx-sheet-name">{userName}</span>
          <span className="sx-sheet-role">{userRole}</span>
        </span>
        <Link href="/map" className="sx-sheet-map">
          route map
        </Link>
      </div>
    </div>
  );
}

function SheetTile({
  item, hero = false, pathname, rootHref, g, r,
}: { item: NavItem; hero?: boolean; pathname: string; rootHref: string; /** group index — the stagger */ g: number; /** row in the group (the board's power-on runs row by row) */ r: number }) {
  const style = { "--g": g, "--r": r } as CSSProperties;
  const cls = `sx-tile${hero ? " sx-tile-hero" : ""}`;
  if (item.pending) {
    return (
      <span className={cls} data-pending="" aria-disabled="true" style={style}>
        <span className="sx-tile-glyph"><Glyph icon={item.icon} /></span>
        <span className="sx-tile-label">{item.label}</span>
        <span className="sx-tile-soon">soon</span>
      </span>
    );
  }
  const active = isActiveHref(item.href, pathname, rootHref);
  return (
    <Link href={item.href} className={cls} aria-current={active ? "page" : undefined} style={style}>
      <span className="sx-tile-br sx-tile-br-a" aria-hidden="true" />
      <span className="sx-tile-br sx-tile-br-b" aria-hidden="true" />
      <span className="sx-tile-glyph"><Glyph icon={item.icon} className={hero ? "size-6" : "size-5"} /></span>
      <span className="sx-tile-text">
        <span className="sx-tile-label">{item.label}</span>
        {hero && <span className="sx-tile-sub">{active ? "You are here" : "Back to the overview"}</span>}
      </span>
      {hero &&
        (active ? (
          <span className="sx-tile-here" aria-hidden="true" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sx-tile-arrow size-5">
            <path d="M5 12h14m-6-6 6 6-6 6" />
          </svg>
        ))}
    </Link>
  );
}
