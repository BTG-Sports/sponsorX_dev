"use client";
import { useEffect } from "react";

/* --------------------------------------------------------------------------
   Cinematic reveal controller (P1-ART-08). Drives each chapter's content
   opacity/translate from scroll position: fade in as the (pinned) section
   enters, hold while centered, fade out as it leaves — so content appears one
   section at a time over the 3D scene. Independent of WebGL (reveal works even
   when the 3D scene doesn't run). Progressive enhancement: reduced-motion or
   no-JS leave content fully visible (see globals.css).

   Each target is `[data-lreveal]` with a type:
     hero → visible on load, fades out only at the end of its section
     mid  → fade in → hold → fade out
     end  → fade in → hold (no fade out; it's the last, footer follows)
   Its pinned travel is measured from the nearest `[data-lreveal-wrap]`.
   -------------------------------------------------------------------------- */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function LandingReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-lreveal]"),
    );
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
        const span = rect.height - vh; // sticky travel distance
        const p = span > 0 ? clamp01(-rect.top / span) : rect.top <= 0 ? 1 : 0;

        let o: number;
        if (type === "hero") o = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        else if (type === "end") o = p < 0.2 ? p / 0.2 : 1;
        else o = p < 0.2 ? p / 0.2 : p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
        o = clamp01(o);

        // Small directional rise: up as it enters, up-and-away as it leaves.
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
