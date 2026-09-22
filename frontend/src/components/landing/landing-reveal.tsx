"use client";
import { useEffect } from "react";

/* --------------------------------------------------------------------------
   Cinematic per-section content reveal (P1-ART-08). Each chapter's 2D content
   fades in → holds → fades out on scroll (hero visible on load; mid both ways;
   finale in only), keyed to its pinned section's scroll position.

   The transition blackout lives in landing-scene-mount.tsx instead — it's driven
   by the 3D scene's own eased progress (onDark) so black stays perfectly synced
   to the stadium fade, which raw scroll position could not guarantee.

   Progressive enhancement: reduced-motion / no-JS leave content visible
   (see globals.css).
   -------------------------------------------------------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function LandingReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-lreveal]"));
    if (els.length === 0) return;
    let raf = 0;

    const apply = () => {
      raf = 0;
      const vh = window.innerHeight;
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

  return null;
}
