"use client";

/* --------------------------------------------------------------------------
   Header bar effects (site-chrome.tsx) — the client shell around the
   otherwise server-rendered header row. Nothing here re-renders on scroll:
   every per-frame value is written straight onto the bar as a CSS custom
   property or attribute, and globals.css (`.sx-bar*`) draws from them.

   - Capsule morph   past 24px of scroll the full-width glass bar sets
                     `data-scrolled` and globals.css morphs it into a
                     floating, rounded capsule inset from the viewport
                     (hysteresis: back to full width under 8px). The outer
                     <header> keeps its 72px, so nothing below shifts.
   - Progress rule   the bottom glow line fills with `--sx-progress`: the
                     drone's flight progress on the landing (the flight
                     store, subscribed without rendering), page scroll
                     everywhere else. On the landing it also carries one
                     tick per flight stop, lit once the drone has passed it.
   - Spotlight       with a fine, hovering pointer, the pointer position
                     (--sx-mx / --sx-my) and `data-hot` light a soft glow
                     inside the bar and, in capsule form, its edge.

   Reduced motion keeps the capsule and the rule (they are state, not
   decoration) but globals.css drops their transitions.
   -------------------------------------------------------------------------- */

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { STOPS } from "@/lib/city/flight";
import { useFlight } from "@/lib/city/flight-store";

export function HeaderBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const onHome = usePathname() === "/";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let scrolled = false;

    const paint = () => {
      raf = 0;
      const y = window.scrollY;
      const next = scrolled ? y > 8 : y > 24;
      if (next !== scrolled) {
        scrolled = next;
        el.toggleAttribute("data-scrolled", next);
      }
      let p: number;
      if (onHome) {
        p = useFlight.getState().progress;
      } else {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        p = max > 0 ? y / max : 0;
      }
      el.style.setProperty("--sx-progress", Math.min(1, Math.max(0, p)).toFixed(4));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const unsubscribe = onHome ? useFlight.subscribe(schedule) : () => {};

    // Pointer spotlight — fine pointers only.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--sx-mx", `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty("--sx-my", `${Math.round(e.clientY - r.top)}px`);
      el.setAttribute("data-hot", "");
    };
    const onLeave = () => el.removeAttribute("data-hot");
    if (fine) {
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerleave", onLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      unsubscribe();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [onHome]);

  return (
    <div ref={ref} className={`sx-bar ${className}`}>
      {/* pointer spotlight + (capsule only) the edge it catches */}
      <span aria-hidden="true" className="sx-bar-spot" />
      <span aria-hidden="true" className="sx-bar-edge" />

      {children}

      {/* bottom glow rule, filled with progress */}
      <span aria-hidden="true" className="sx-nav-line sx-bar-line">
        <span className="sx-bar-fill" />
        {onHome &&
          STOPS.map((s) => (
            <span
              key={s.id}
              className="sx-bar-tick"
              style={{ "--at": s.progress } as React.CSSProperties}
            />
          ))}
        <span className="sx-bar-head" />
      </span>
    </div>
  );
}
