"use client";
import { CHAPTERS } from "@/lib/landing-chapters";

/* --------------------------------------------------------------------------
   Chapter progress rail (P1-ART-08). Fixed left rail marking the six sections,
   with the active one lit in its chapter accent — makes the "follow the ball
   down" system legible. Decorative (it mirrors the real <h*> headings), so it's
   aria-hidden and hidden on small screens (mobile stacks instead — Task 11).
   -------------------------------------------------------------------------- */

const LABELS = ["Intro", "Soccer", "Basketball", "Baseball", "Football", "Start"];

export function LandingProgressRail({ active }: { active: number }) {
  return (
    <nav
      aria-hidden="true"
      className="pointer-events-none fixed left-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-5 lg:flex"
    >
      {CHAPTERS.map((c, i) => {
        const isActive = i === active;
        const isDone = i < active;
        const dot = isActive
          ? c.accent === "orange"
            ? "bg-accent shadow-[0_0_0_4px_rgba(249,122,31,.18),0_0_16px_rgba(249,122,31,.7)]"
            : "bg-primary shadow-[0_0_0_4px_rgba(46,155,245,.18),0_0_16px_rgba(46,155,245,.7)]"
          : isDone
            ? "bg-primary-soft"
            : "bg-line";
        return (
          <div key={c.id} className="relative flex items-center gap-3">
            <span className={`size-2.5 rounded-full transition-colors duration-300 ${dot}`} />
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.14em] transition-opacity duration-300 ${
                isActive
                  ? c.accent === "orange"
                    ? "text-accent opacity-100"
                    : "text-primary-soft opacity-100"
                  : "text-faint opacity-0"
              }`}
            >
              {LABELS[i]}
            </span>
          </div>
        );
      })}
    </nav>
  );
}
