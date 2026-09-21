"use client";
import { useEffect, useRef } from "react";
import { SECTION_COUNT } from "@/lib/landing-chapters";

/* --------------------------------------------------------------------------
   Cinematic reveal + transition blackout (P1-ART-08).

   1. Per-chapter content fade: each section's 2D content fades in → holds →
      fades out on scroll (hero visible on load; mid both ways; finale in only).
   2. Transition blackout: a full-screen black overlay (below the header, above
      the 3D canvas) ramps to opaque at every chapter boundary and back — a true
      "travel through darkness" dip that guarantees the previous stadium's floor
      is never visible during a transition, whatever the 3D is doing.

   Progressive enhancement: reduced-motion / no-JS leave content visible and the
   overlay transparent (see globals.css).
   -------------------------------------------------------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/** Half-width (in chapters) of the blackout around each boundary. */
const DARK_W = 0.14;

export function LandingReveal() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-lreveal]"));
    let raf = 0;

    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;

      // 1. per-section content fade
      for (const el of els) {
        const type = el.dataset.lreveal;
        const wrap = (el.closest("[data-lreveal-wrap]") ?? el.parentElement) as HTMLElement | null;
        if (!wrap) continue;
        const rect = wrap.getBoundingClientRect();
        const span = rect.height - vh;
        const p = span > 0 ? clamp01(-rect.top / span) : rect.top <= 0 ? 1 : 0;
        let o: number;
        if (type === "hero") o = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        else if (type === "end") o = p < 0.2 ? p / 0.2 : 1;
        else o = p < 0.2 ? p / 0.2 : p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        o = clamp01(o);
        const rise = (1 - o) * 26;
        const ty = p < 0.2 ? rise : p > 0.8 ? -rise : 0;
        el.style.opacity = String(o);
        el.style.transform = `translateY(${ty}px)`;
      }

      // 2. transition blackout — opaque at each chapter boundary (1..n-1)
      const max = document.documentElement.scrollHeight - vh;
      const prog = max > 0 ? clamp01(window.scrollY / max) : 0;
      const f = prog * SECTION_COUNT;
      let dark = 0;
      for (let b = 1; b < SECTION_COUNT; b++) {
        const dd = Math.abs(f - b);
        if (dd < DARK_W) dark = Math.max(dark, 1 - dd / DARK_W);
      }
      if (overlayRef.current) overlayRef.current.style.opacity = String(smooth(dark));
    };

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Below the header (z-20) and content (z-10), above the 3D canvas.
  return (
    <div
      ref={overlayRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[5] bg-black"
      style={{ opacity: 0 }}
    />
  );
}
