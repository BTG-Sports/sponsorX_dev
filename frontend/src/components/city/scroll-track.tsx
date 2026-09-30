"use client";

/* --------------------------------------------------------------------------
   Scroll track (P1-ART-09) — the tall empty runway the fly-through scrolls
   along, and the only writer of the flight store.

   Renders a ~600svh block whose sticky, viewport-high stage holds the 2D
   overlays (flight-stop.tsx). The page scrolls; the stage stays put; the
   fixed canvas behind it flies. Lenis smooths the document scroll
   (inertial, one instance, destroyed on unmount) and on each of its scroll
   events this computes

       progress = scrolled / (scrollable)

   over the track — `(scrollY − trackTop) / (trackHeight − innerHeight)`,
   clamped 0..1 — and writes it to the store. When the track is the whole
   page that is exactly `scrollY / (scrollHeight − innerHeight)`; here the
   footer follows the track, so progress reaches 1 at the skyscraper and
   holds there while the footer scrolls in.

   Anchors: the nav's `#how-it-works` / `#for-sponsors` links (and any hash
   naming a stop) can no longer land on a section — the sections are
   stacked in one sticky stage — so a capture-phase click listener turns
   them into a scroll to that stop's progress; a hash on first load and any
   later `hashchange` (back/forward, a link from elsewhere) do the same. `prefers-reduced-motion` skips Lenis: native scroll, same
   progress maths, so the page still works — the poster path has no camera
   to fly anyway.
   -------------------------------------------------------------------------- */
import Lenis from "lenis";
import { useEffect, useRef, type ReactNode } from "react";

import { STOPS, stopForHash } from "@/lib/city/flight";
import { useFlight } from "@/lib/city/flight-store";

/** Track height in viewport heights — one stop per ~125svh of scroll. */
const TRACK_SVH = 100 + (STOPS.length - 1) * 125;

export function ScrollTrack({ children }: { children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const setProgress = useFlight.getState().setProgress;

    // Track geometry, refreshed on resize (the header above it can reflow).
    let top = 0;
    let range = 1;
    const measure = () => {
      top = el.getBoundingClientRect().top + window.scrollY;
      range = Math.max(1, el.offsetHeight - window.innerHeight);
    };

    let last = -1;
    const update = () => {
      const p = Math.min(1, Math.max(0, (window.scrollY - top) / range));
      if (p !== last) {
        last = p;
        setProgress(p);
      }
    };

    const lenis = reduced ? null : new Lenis({ autoRaf: true, allowNestedScroll: true, lerp: 0.09 });
    const scrollTo = (y: number, immediate = false) => {
      if (lenis) lenis.scrollTo(y, { immediate, lock: !immediate });
      else window.scrollTo({ top: y, behavior: immediate ? "auto" : "smooth" });
    };
    const scrollToStop = (hash: string, immediate = false) => {
      const stop = stopForHash(hash);
      if (!stop) return false;
      measure();
      scrollTo(top + stop.progress * range, immediate);
      return true;
    };

    // Hash links → the stop. Capture phase so it runs before next/link's own
    // click handling, which bails when the event is already default-prevented.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href, window.location.href);
      if (url.pathname !== window.location.pathname || !url.hash) return;
      if (!scrollToStop(url.hash)) return;
      e.preventDefault();
      history.replaceState(null, "", url.hash);
    };

    const onHashChange = () => scrollToStop(window.location.hash);

    measure();
    update();
    if (window.location.hash) scrollToStop(window.location.hash, true);

    const ro = new ResizeObserver(() => {
      measure();
      update();
    });
    ro.observe(el);
    window.addEventListener("resize", measure);
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", onHashChange);
    const off = lenis ? lenis.on("scroll", update) : null;
    if (!lenis) window.addEventListener("scroll", update, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", onHashChange);
      off?.();
      if (!lenis) window.removeEventListener("scroll", update);
      lenis?.destroy();
    };
  }, []);

  return (
    <div ref={track} className="sx-flight-track relative z-10" style={{ height: `${TRACK_SVH}svh` }}>
      <div className="sx-flight-stage sticky top-0 h-[100svh] overflow-hidden">{children}</div>
    </div>
  );
}
