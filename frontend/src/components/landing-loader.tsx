"use client";

/* --------------------------------------------------------------------------
   Landing loading screen (P1-ART-11).

   The boot screen: shown once per document — a hard load or refresh of any
   public page (the home here, every (public) page from its layout) — until
   the page can actually be shown. On the home that is the 3D city's files
   streamed, its chunk loaded and its first frame drawn, plus the page's
   fonts and the window load (lib/city/loading.ts weights them;
   city-backdrop.tsx writes the scene side, this writes `content`); on a
   page without the city (`city={false}`) it is fonts and load alone.

   Client-side moves between public pages never show it again: they get the
   page transition (page-transition.tsx, P1-ART-12), which covers the home's
   city load itself. `html[data-sx-booted]` marks that the boot has run —
   an attribute rather than a module flag so a dev hot-reload does not
   replay it, and gone on a real reload because <html> is fresh from the
   server. On the hydrating render it is never set yet, so server and
   client agree. The
   counter chases the real number, never overshoots it, and 100 is honest.
   A safety timeout marks everything complete so a stalled request can never
   strand the visitor behind the overlay.

   Server-rendered so the first paint is already the loader (no flash of
   the page); a <noscript> rule on the page hides it entirely without JS.
   Scroll is locked while it is up.

   Exit: on 100 the rig flares (`done`, a short hold), then the overlay
   fades and the rig scales toward the viewer (`leaving`, see the CSS) while
   `html[data-sx-loaded]` releases the hero's staggered entrance (globals
   .css, `.sx-reveal`). The attribute is removed on mount so a return visit
   played by the page transition replays the entrance (it clears and sets
   the attribute itself). The overlay unmounts when the exit ends.

   Nothing here re-renders per frame: the counter and the bar are written
   through refs from one requestAnimationFrame loop; React sees only the
   four phase changes.
   -------------------------------------------------------------------------- */
import { useEffect, useRef, useState } from "react";

import { useLoad } from "@/lib/city/load-store";
import { canFinish, easeDisplayed, overallProgress } from "@/lib/city/loading";

import styles from "./landing-loader.module.css";

/** Minimum time on screen — the animation has to read, and a cached
 *  return visit must not flash. */
const MIN_SHOW_MS = 1400;
/** Hold at 100 while the rig flares. */
const HOLD_MS = 380;
/** The exit transition's length (matches the CSS). */
const LEAVE_MS = 950;
/** Whatever happens, let the visitor in. */
const SAFETY_MS = 25_000;

type Phase = "loading" | "done" | "leaving" | "gone";

const DUST: ReadonlyArray<{ x: number; d: number; t: number; delay: number }> = [
  { x: 22, d: 3, t: 2.6, delay: 0 },
  { x: 48, d: 4, t: 3.1, delay: -1.2 },
  { x: 70, d: 3, t: 2.8, delay: -0.6 },
  { x: 36, d: 2, t: 3.4, delay: -2.1 },
  { x: 60, d: 2, t: 2.4, delay: -1.7 },
  { x: 82, d: 3, t: 3.0, delay: -0.3 },
];

/** Depth of the hologram letter: one slice per entry, in px along Z. The
 *  first and last are the glowing faces; the rest are its body. */
const SLICE_Z = [-7, -4.5, -2, 0.5, 3, 5.5, 7] as const;

function slices() {
  return (
    <>
      {SLICE_Z.map((z) => (
        <i key={z} style={{ "--z": `${z}px` } as React.CSSProperties} />
      ))}
      <span className={styles.side} />
      <span className={`${styles.side} ${styles.side2}`} />
    </>
  );
}

/** Has this document's boot screen already run? */
function booted() {
  return typeof document !== "undefined" && document.documentElement.dataset.sxBooted === "1";
}

export function LandingLoader({ city = true }: { city?: boolean }) {
  // A client-side arrival renders "gone" straight away: no overlay, no
  // effect, nothing reset under the page transition's feet.
  const [phase, setPhase] = useState<Phase>(() => (booted() ? "gone" : "loading"));
  const bootRef = useRef(phase === "loading");
  const pctRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!bootRef.current) return;
    const html = document.documentElement;
    html.dataset.sxBooted = "1";
    delete html.dataset.sxLoaded;
    useLoad.getState().reset();
    if (!city) {
      // No city on this page: only its own content to wait for.
      useLoad.getState().setTask("assets", 1);
      useLoad.getState().setTask("scene", 1);
    }

    const prevOverflow = html.style.overflow;
    html.style.overflow = "hidden";

    // The page's own readiness: fonts (Poppins) and the window load event.
    const fonts = typeof document.fonts?.ready?.then === "function" ? document.fonts.ready : Promise.resolve();
    const loaded =
      document.readyState === "complete"
        ? Promise.resolve()
        : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    let live = true;
    // Once the page is released it is no longer ours: an unmount after that
    // (leaving a public page) must not touch the scroll lock or the entrance
    // the page transition is holding for the next page.
    let released = false;
    void Promise.all([fonts, loaded]).then(() => {
      if (live) useLoad.getState().setTask("content", 1);
    });

    const safety = window.setTimeout(() => useLoad.getState().completeAll(), SAFETY_MS);
    const timers: number[] = [];

    const start = performance.now();
    let last = start;
    let displayed = 0;
    let raf = 0;

    const write = (v: number) => {
      const pct = Math.round(v * 100);
      if (pctRef.current) pctRef.current.textContent = String(pct);
      if (fillRef.current) fillRef.current.style.width = `${(v * 100).toFixed(1)}%`;
    };

    const finish = () => {
      setPhase("done");
      timers.push(
        window.setTimeout(() => {
          html.dataset.sxLoaded = "1";
          html.style.overflow = prevOverflow;
          released = true;
          setPhase("leaving");
        }, HOLD_MS),
      );
      timers.push(window.setTimeout(() => setPhase("gone"), HOLD_MS + LEAVE_MS));
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const target = overallProgress(useLoad.getState().tasks);
      displayed = easeDisplayed(displayed, target, dt);
      write(displayed);
      if (canFinish({ target, displayed, elapsedMs: now - start, minShowMs: MIN_SHOW_MS })) {
        finish();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    write(0);
    raf = requestAnimationFrame(tick);

    return () => {
      live = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      for (const t of timers) window.clearTimeout(t);
      if (released) return;
      html.style.overflow = prevOverflow;
      html.dataset.sxLoaded = "1";
    };
  }, [city]);

  if (phase === "gone") return null;

  return (
    <div className={`sx-loader ${styles.overlay}`} data-phase={phase} data-testid="landing-loader">
      <p className={styles.sr} role="status">
        {phase === "loading" ? (city ? "Loading the city" : "Loading SponsorX") : "Loaded"}
      </p>

      <div className={styles.stage} aria-hidden="true">
        <div className={styles.float}>
          <div className={styles.world}>
            <div className={`${styles.face} ${styles.back}`} />
            <div className={`${styles.face} ${styles.right}`} />
            <div className={`${styles.face} ${styles.bottom}`} />
            <div className={`${styles.layer} ${styles.layer2}`} />
            <div className={`${styles.layer} ${styles.layer1}`} />
            <div className={`${styles.face} ${styles.left}`} />
            <div className={`${styles.face} ${styles.front}`}>
              <span className={styles.slot} />
            </div>
            <div className={`${styles.face} ${styles.top}`}>
              <span className={styles.pad} />
            </div>

            <span className={styles.beam} />
            <div className={styles.holo}>
              <div className={`${styles.bar} ${styles.bar1}`}>{slices()}</div>
              <div className={`${styles.bar} ${styles.bar2}`}>{slices()}</div>
            </div>

            <div className={styles.dust}>
              {DUST.map((p, i) => (
                <i
                  key={i}
                  style={
                    {
                      "--x": `${p.x}%`,
                      "--d": `${p.d}px`,
                      "--t": `${p.t}s`,
                      "--delay": `${p.delay}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={styles.hud} aria-hidden="true">
        <p className={styles.label}>{city ? "Loading the city" : "Loading SponsorX"}</p>
        <p className={styles.pct}>
          <span ref={pctRef}>0</span>
          <small>%</small>
        </p>
        <div className={styles.track}>
          <span ref={fillRef} className={styles.fill} />
        </div>
      </div>
    </div>
  );
}
