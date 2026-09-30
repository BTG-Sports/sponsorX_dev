"use client";

/* --------------------------------------------------------------------------
   Package carousel — the three sponsor packages on the soccer stop below
   `lg` (owner, 2026-09-30: one screen, "a carousel with wow factor"). From
   `lg` up the same <ol> is the mockup's static three-card row and none of
   this runs.

   A native, snap-scrolled track (swipe, trackpad, keyboard focus all just
   work) that opens on the featured card with its neighbours peeking in at
   the screen edges. On every scroll frame each card gets its signed
   distance from the centre, `--d` (−1.5‥1.5, in card steps) and `--ad`
   (its absolute value), written straight to the element — no React
   render per frame. globals.css turns those into the coverflow (rotateY,
   scale, fade), the holographic sheen sliding across the glass, the tier
   numeral's parallax and the light sweep that only the centred card shows
   (`.sx-pkg*`, phone-only rules). React state holds just the centred
   index, which drives the tier-coloured ambient glow behind the track and
   the tabs; each tab's progress bar is fed `--p` = 1 − |d| on the same
   frame, so it fills continuously as its card slides in.

   Tapping a card that isn't centred brings it to the centre instead of
   doing anything else; links inside a centred card behave normally.

   From `lg` up (with a hover-capable pointer) the same element is the
   static row, and the pointer takes over: a tier-coloured spotlight
   follows it round every card's outline, the hovered card tilts toward it
   with a glare on the glass while its siblings step back, and the light
   sweep moves to whichever card is hovered. The row's arrival is staged
   from the flight stop's weight (`--sx-w`, flight-stop.tsx): the three
   cards rise into place one after another as the drone settles.
   -------------------------------------------------------------------------- */

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

const PHONE = "(max-width: 63.999rem)";

export interface CarouselTier {
  label: string;
  /** Glow / sweep colour for this tier. */
  tone: string;
}

export function PackageCarousel({
  tiers,
  start = 0,
  children,
}: {
  tiers: CarouselTier[];
  /** Index of the card centred on first paint. */
  start?: number;
  children: ReactNode;
}) {
  const track = useRef<HTMLOListElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const [active, setActive] = useState(start);
  const count = Children.count(children);

  const items = () => Array.from(track.current?.children ?? []) as HTMLElement[];

  const centre = (i: number, smooth = true) => {
    const t = track.current;
    const li = items()[i];
    if (!t || !li) return;
    t.scrollTo({ left: li.offsetLeft - (t.clientWidth - li.offsetWidth) / 2, behavior: smooth ? "smooth" : "auto" });
  };

  useEffect(() => {
    const t = track.current;
    if (!t) return;
    const phone = window.matchMedia(PHONE);
    let raf = 0;

    const update = () => {
      raf = 0;
      const list = items();
      if (!phone.matches) {
        for (const li of list) {
          li.style.removeProperty("--d");
          li.style.removeProperty("--ad");
          li.style.removeProperty("z-index");
        }
        return;
      }
      const gap = parseFloat(getComputedStyle(t).columnGap) || 0;
      const mid = t.scrollLeft + t.clientWidth / 2;
      let best = 0;
      let bestAd = Infinity;
      list.forEach((li, i) => {
        const step = li.offsetWidth + gap;
        let d = Math.max(-1.5, Math.min(1.5, (li.offsetLeft + li.offsetWidth / 2 - mid) / step));
        // A settled snap can sit half a pixel off; call that centred so the
        // card renders at exactly scale(1) and its copy stays crisp.
        if (Math.abs(d) < 0.01) d = 0;
        const ad = Math.abs(d);
        li.style.setProperty("--d", d.toFixed(3));
        li.style.setProperty("--ad", ad.toFixed(3));
        // Nearest card on top — the neighbours tuck in behind it.
        li.style.zIndex = String(10 - Math.round(ad * 4));
        bars.current[i]?.style.setProperty("--p", Math.max(0, 1 - ad).toFixed(3));
        if (ad < bestAd) {
          bestAd = ad;
          best = i;
        }
      });
      setActive(best);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    // Open on the featured card, then keep the vars in step with the track.
    if (phone.matches) centre(start, false);
    update();

    let centred = start;
    const onResize = () => {
      if (phone.matches) centre(centred, false);
      schedule();
    };
    const onScrollEnd = () => {
      // Remember what the reader settled on, so a resize keeps it centred.
      const list = items();
      const mid = t.scrollLeft + t.clientWidth / 2;
      centred = list.reduce(
        (b, li, i) => (Math.abs(li.offsetLeft + li.offsetWidth / 2 - mid) < Math.abs(list[b].offsetLeft + list[b].offsetWidth / 2 - mid) ? i : b),
        0,
      );
    };

    // Desktop row: the pointer drives the spotlight on every card's outline
    // (--mx/--my, even from the gaps between cards), and the hovered card's
    // tilt and glare (--rx/--ry, unitless degrees). One write per frame.
    const desk = window.matchMedia("(min-width: 64rem) and (hover: hover)");
    let px = 0;
    let py = 0;
    let praf = 0;
    const paint = () => {
      praf = 0;
      for (const li of items()) {
        const r = li.getBoundingClientRect();
        const x = px - r.left;
        const y = py - r.top;
        li.style.setProperty("--mx", `${x.toFixed(0)}px`);
        li.style.setProperty("--my", `${y.toFixed(0)}px`);
        const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height;
        li.style.setProperty("--rx", inside ? ((0.5 - y / r.height) * 9).toFixed(2) : "0");
        li.style.setProperty("--ry", inside ? ((x / r.width - 0.5) * 12).toFixed(2) : "0");
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!desk.matches || e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      t.style.setProperty("--spot", "1");
      if (!praf) praf = requestAnimationFrame(paint);
    };
    const onPointerLeave = () => {
      t.style.setProperty("--spot", "0");
      for (const li of items()) {
        li.style.setProperty("--rx", "0");
        li.style.setProperty("--ry", "0");
      }
    };
    t.addEventListener("pointermove", onPointerMove);
    t.addEventListener("pointerleave", onPointerLeave);

    t.addEventListener("scroll", schedule, { passive: true });
    t.addEventListener("scrollend", onScrollEnd);
    window.addEventListener("resize", onResize);
    phone.addEventListener("change", onResize);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(praf);
      t.removeEventListener("pointermove", onPointerMove);
      t.removeEventListener("pointerleave", onPointerLeave);
      t.removeEventListener("scroll", schedule);
      t.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", onResize);
      phone.removeEventListener("change", onResize);
    };
    // `start` is the first-paint card only; later changes are the reader's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative w-full max-lg:-mx-5 max-lg:w-[calc(100%+40px)] sm:max-lg:-mx-[6vw] sm:max-lg:w-[calc(100%+12vw)] short-landscape:!mx-0 short-landscape:!w-full lg:max-w-[1042px]">
      {/* tier-coloured ambient glow behind the glass, crossfading per card */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[45%] -z-10 h-[62%] w-[70%] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-45 blur-[64px] transition-[background-color] duration-700 lg:hidden"
        style={{ backgroundColor: tiers[active]?.tone }}
      />

      <ol
        ref={track}
        aria-label="Sponsor packages"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a")) return;
          const li = (e.target as HTMLElement).closest("li[data-pkg]");
          const i = li ? items().indexOf(li as HTMLElement) : -1;
          if (i >= 0 && i !== active) centre(i);
        }}
        className="sx-pkg-track sx-pkg-row relative flex w-full snap-x snap-mandatory gap-[clamp(10px,3vw,22px)] overflow-x-auto px-[calc(50%-var(--sx-card)/2)] py-[clamp(14px,2.4svh,24px)] short-landscape:py-2 [--sx-card:clamp(228px,68vw,360px)] short-landscape:[--sx-card:clamp(220px,40vw,300px)] lg:grid lg:snap-none lg:grid-cols-3 lg:gap-[26px] lg:overflow-visible lg:p-0"
      >
        {children}
      </ol>

      {/* tabs — tier name + a bar that fills as its card reaches the centre */}
      <div className="mx-auto mt-[clamp(2px,0.6svh,8px)] flex w-full max-w-[380px] items-end gap-3 px-5 lg:hidden">
        {tiers.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => centre(i)}
            aria-label={`Show the ${t.label} package`}
            aria-current={i === active ? "true" : undefined}
            className={`group flex flex-1 flex-col items-center gap-1.5 py-1 text-[clamp(9px,1.35svh,11px)] font-semibold uppercase tracking-[0.2em] transition-colors ${i === active ? "text-on-media" : "text-on-media/45 hover:text-on-media/75"}`}
          >
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[0.9em] tracking-normal opacity-70">{String(i + 1).padStart(2, "0")}</span>
              {t.label}
            </span>
            <span aria-hidden="true" className="relative h-[2px] w-full overflow-hidden rounded-full bg-on-media/15">
              <span
                ref={(el) => {
                  bars.current[i] = el;
                }}
                className="absolute inset-0 origin-left rounded-full [transform:scaleX(var(--p,0))]"
                style={{ backgroundColor: t.tone, boxShadow: `0 0 10px ${t.tone}` }}
              />
            </span>
          </button>
        ))}
        <span className="sr-only" aria-live="polite">
          {tiers[active]?.label} package, {active + 1} of {count}
        </span>
      </div>
    </div>
  );
}
