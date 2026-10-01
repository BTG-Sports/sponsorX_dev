"use client";

/* --------------------------------------------------------------------------
   /packages effects — the client islands the otherwise server-rendered
   package stage (packages-stage.tsx) needs. None of them changes layout.

   - StageReveal  arms the stage (`data-armed`) and marks each
                  `[data-reveal]` inside it `data-in` as it scrolls into
                  view, once; globals.css (`[data-sx-stage]`) turns that into
                  a staggered rise. Without JS nothing is armed, so nothing is
                  ever hidden. Reduced motion: everything is marked at once.
   - PackageFilters  §9.4's five filters. From md a row of chips; on a
                  phone one "Filters" button that opens a bottom sheet
                  (portal, same open/close contract as the brief drawer:
                  Esc, backdrop, body scroll lock, unmount on the -out
                  animationend). All of it is decorative until the §13
                  step 3 eligibility query exists, and the sheet says so.
   - PackageGrid  the catalogue's <ul>. With a fine, hovering pointer from
                  lg up it writes the pointer's position into every card
                  (--mx/--my, even from the gaps, so the outlines light up as
                  it passes between them) and a tilt into the hovered one
                  (--rx/--ry, unitless degrees), plus --spot on the list while
                  the pointer is over it — the landing's desktop package row
                  (package-carousel.tsx) does the same, and the `.sx-pkg*`
                  rules in globals.css are shared with it. One write a frame.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function StageReveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (const el of items) el.dataset.in = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = "";
          io.unobserve(e.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    for (const el of items) io.observe(el);
    root.dataset.armed = "";
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-sx-stage="" className={className}>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- filters */

/** §9.4's filters — decorative until the §13 step 3 eligibility query exists. */
const FILTERS = [
  ["Sport", "Basketball, soccer, track, volleyball …"],
  ["Geography", "DMV, Baltimore, Kigali …"],
  ["Athlete tier", "Emerging, Creator, Premium"],
  ["Job type", "Story Drop, Sponsored Post, Athlete Reel …"],
  ["Budget", "From $750 to $30K+"],
] as const;

const NOT_WIRED = "Filters not wired — needs the §13 eligibility query";

function SlidersIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </svg>
  );
}

function ChevronIcon({ className = "size-3" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CloseIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const CHIP =
  "flex h-9 items-center gap-2 rounded-md border border-[#9cc7ff]/30 bg-[#07132a]/60 px-3.5 text-[12px] font-medium text-on-media/75 backdrop-blur-md transition-colors hover:border-[#bfe0ff] hover:text-on-media";

export function PackageFilters() {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const requestClose = () => setClosing(true);
  const onClosed = () => {
    setClosing(false);
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  /* Unmount rides the slide-out's animationend; the timer is the fallback
     should that event be lost (stale-CSS HMR). */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing]);

  return (
    <>
      {/* md up: the chip row */}
      <div className="hidden flex-wrap items-center gap-2 md:flex">
        {FILTERS.map(([f]) => (
          <button key={f} type="button" title={NOT_WIRED} className={CHIP}>
            {f}
            <ChevronIcon />
          </button>
        ))}
      </div>

      {/* phone: one button */}
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`${CHIP} md:hidden`}
      >
        <SlidersIcon className="size-4 text-[#7fd0ff]" />
        Filters
        <span className="ml-0.5 rounded-sm bg-[#7fd0ff]/15 px-1.5 font-mono text-[10px] text-[#7fd0ff]">{FILTERS.length}</span>
      </button>

      {open &&
        createPortal(
          <div
            className={["fixed inset-0 z-50 text-on-media md:hidden", closing ? "pointer-events-none" : ""].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label="Filter packages"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className={[closing ? "sx-backdrop-out" : "sx-backdrop", "absolute inset-0 cursor-default bg-[#02050b]/70 backdrop-blur-sm"].join(" ")}
            />
            <div
              className={[
                closing ? "sx-sheet-out" : "sx-sheet",
                "absolute inset-x-0 bottom-0 flex max-h-[86svh] flex-col rounded-t-2xl border-t border-[#9cc7ff]/40 bg-gradient-to-b from-[#0b1a33] to-[#04091a] pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-12px_50px_rgba(46,155,245,.25)]",
              ].join(" ")}
              onAnimationEnd={(ev) => {
                if (ev.animationName === "sx-sheet-out") onClosed();
              }}
            >
              {/* glowing top rule + grab handle */}
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[#bfe0ff]/80 shadow-[0_0_10px_rgba(120,190,255,.9),0_0_22px_rgba(46,155,245,.55)]" />
              <span aria-hidden="true" className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-on-media/25" />

              <div className="flex items-center justify-between px-5 pb-3 pt-3">
                <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.32em] text-[#7fc4ff]">
                  <span aria-hidden="true" className="h-px w-6 bg-[#7fc4ff]/80" />
                  Filter packages
                </p>
                <button
                  ref={closeBtn}
                  type="button"
                  onClick={requestClose}
                  aria-label="Close"
                  className="grid size-9 place-items-center rounded-md border border-[#9cc7ff]/30 text-on-media/75 transition-colors hover:border-[#bfe0ff] hover:text-on-media"
                >
                  <CloseIcon />
                </button>
              </div>

              <ul className="min-h-0 flex-1 overflow-y-auto px-5">
                {FILTERS.map(([f, hint], i) => (
                  <li key={f} className={i > 0 ? "border-t border-[#a9d3ff]/12" : ""}>
                    <button type="button" title={NOT_WIRED} className="flex w-full items-center gap-4 py-3.5 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold tracking-tight">{f}</span>
                        <span className="mt-0.5 block truncate text-[12px] text-on-media/55">{hint}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-on-media/70">
                        Any
                        <ChevronIcon className="size-3.5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="px-5 pt-3">
                <button
                  type="button"
                  onClick={requestClose}
                  className="sx-sheen relative inline-flex h-12 w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-[#4fb0ff] to-[#2b8fe9] text-[14px] font-medium text-white shadow-[0_0_24px_rgba(46,155,245,.5)]"
                >
                  Show all packages
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-on-media/50">
                  Filtering goes live with athlete matching. For now every package is shown.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------- grid */

export function PackageGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    const desk = window.matchMedia("(min-width: 64rem) and (hover: hover) and (pointer: fine)");
    const cards = () => Array.from(list.children) as HTMLElement[];
    let px = 0;
    let py = 0;
    let raf = 0;
    const paint = () => {
      raf = 0;
      for (const li of cards()) {
        const r = li.getBoundingClientRect();
        const x = px - r.left;
        const y = py - r.top;
        li.style.setProperty("--mx", `${x.toFixed(0)}px`);
        li.style.setProperty("--my", `${y.toFixed(0)}px`);
        const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
        li.style.setProperty("--rx", inside ? ((0.5 - y / r.height) * 8).toFixed(2) : "0");
        li.style.setProperty("--ry", inside ? ((x / r.width - 0.5) * 10).toFixed(2) : "0");
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!desk.matches || e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      list.style.setProperty("--spot", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      list.style.setProperty("--spot", "0");
      for (const li of cards()) {
        li.style.setProperty("--rx", "0");
        li.style.setProperty("--ry", "0");
      }
    };
    list.addEventListener("pointermove", onMove);
    list.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      list.removeEventListener("pointermove", onMove);
      list.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <ul ref={ref} aria-label="Sponsor packages" className={`sx-pkg-row ${className}`}>
      {children}
    </ul>
  );
}
