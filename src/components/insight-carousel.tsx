"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* --------------------------------------------------------------------------
   Phone-only insight carousel (InsightStrip renders this under `sm`).
   Native scroll-snap does the swiping; JS adds autoplay and the infinite
   wrap: the track is [last, ...items, first], and when a scroll settles on a
   clone it jumps instantly to the real slide. Autoplay pauses while the user
   is touching and under prefers-reduced-motion.
   -------------------------------------------------------------------------- */

export type InsightItem = { icon: string; text: ReactNode };

const GAP = 8; // matches the track's gap-2
const AUTOPLAY_MS = 4000;

function Card({ item }: { item: InsightItem }) {
  return (
    <div className="flex w-full shrink-0 snap-start items-center gap-2 rounded-lg border border-line bg-surface/75 px-3 py-2">
      <span aria-hidden="true" className="text-sm">
        {item.icon}
      </span>
      <span className="text-[11px] leading-snug text-muted">{item.text}</span>
    </div>
  );
}

export function InsightCarousel({ items }: { items: InsightItem[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [dot, setDot] = useState(0);
  const n = items.length;

  // Clone the last slide onto the front and the first onto the back so both
  // directions can run off the end and wrap seamlessly.
  const slides =
    n > 1 ? [items[n - 1], ...items, items[0]] : items;

  function stepSize() {
    const first = scrollerRef.current?.firstElementChild;
    return first instanceof HTMLElement ? first.offsetWidth + GAP : 0;
  }

  function slideTo(i: number) {
    const s = stepSize();
    if (s) scrollerRef.current?.scrollTo({ left: i * s, behavior: "smooth" });
  }

  function nudge(dir: 1 | -1) {
    const el = scrollerRef.current;
    const s = stepSize();
    if (el && s) slideTo(Math.round(el.scrollLeft / s) + dir);
  }

  // Track position; when a scroll settles on a clone, teleport to its twin.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || n <= 1) return;

    el.scrollLeft = stepSize(); // start on the first real slide, no animation

    let settle: ReturnType<typeof setTimeout>;
    function onScroll() {
      clearTimeout(settle);
      settle = setTimeout(() => {
        const s = stepSize();
        const node = scrollerRef.current;
        if (!s || !node) return;
        let i = Math.round(node.scrollLeft / s);
        if (i <= 0) {
          i = n;
          node.scrollLeft = n * s;
        } else if (i >= n + 1) {
          i = 1;
          node.scrollLeft = s;
        }
        setDot(i - 1);
      }, 120);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      clearTimeout(settle);
    };
  }, [n]);

  // Autoplay — skipped for reduced motion, paused while the user's finger is down.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || n <= 1) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let held = false;
    const hold = () => {
      held = true;
    };
    const release = () => {
      held = false;
    };
    el.addEventListener("pointerdown", hold, { passive: true });
    el.addEventListener("pointerup", release, { passive: true });
    el.addEventListener("pointercancel", release, { passive: true });

    const id = setInterval(() => {
      const s = stepSize();
      if (held || document.hidden || !s) return;
      el.scrollTo({
        left: (Math.round(el.scrollLeft / s) + 1) * s,
        behavior: "smooth",
      });
    }, AUTOPLAY_MS);

    return () => {
      clearInterval(id);
      el.removeEventListener("pointerdown", hold);
      el.removeEventListener("pointerup", release);
      el.removeEventListener("pointercancel", release);
    };
  }, [n]);

  if (n <= 1) {
    return items[0] ? <Card item={items[0]} /> : null;
  }

  return (
    <div>
      <div
        ref={scrollerRef}
        className="sx-snap-x flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((it, i) => (
          <Card key={i} item={it} />
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 px-1">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to insight ${i + 1}`}
              onClick={() => slideTo(i + 1)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === dot ? "w-5 bg-primary" : "w-1.5 bg-line hover:bg-muted"
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-1">
          {([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir === 1 ? "Next insight" : "Previous insight"}
              onClick={() => nudge(dir)}
              className="grid size-7 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="size-3.5"
              >
                <path d={dir === 1 ? "m9 5 7 7-7 7" : "m15 5-7 7 7 7"} />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
