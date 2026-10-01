"use client";

/* --------------------------------------------------------------------------
   Page transition (P1-ART-12) — the public site's second loading screen.

   The boot screen (landing-loader.tsx, P1-ART-11) plays once per document:
   a hard load or refresh of any public page. Every client-side move between
   public pages plays this instead:

     cover   the brand's X grows out of the click point in three layers —
             orange, blue, then ink — twisting into place as it swells
             until the ink covers the screen. The destination's name
             rises in letter by letter through the growing X.
     hold    the route is pushed (prefetched at the click) and the overlay
             waits for the page to be there. For the home that means the 3D
             city's first frame, so the counter is the real load-store
             number; anything else is ready a couple of frames after it
             commits. A minimum hold lets the name read.
     reveal  the name lifts away and an X-shaped hole tears open in the
             middle of the ink, then the blue, then the orange, each hole
             turning upright as it widens, until the new page is all there
             is. `html[data-sx-loaded]` is set as the hole opens so the
             destination's own entrance (the home's hero, the
             /packages stage) plays through it.

   Links are not touched: one capture-phase click listener on window cancels
   the default and Next's <Link> then stands down (it checks
   `defaultPrevented`), so every link on the site — nav, logo, CTAs, footer
   — gets the transition. Back/forward cannot be delayed, so a history move
   between public pages starts fully covered and plays only the reveal.

   Mounted once in the root layout so it survives the move between the
   (home) and (public) route groups. Everything outside the public site
   (sign-in, portals, fan QR) keeps plain navigation — lib/page-transition
   .ts decides. The shapes are clip-path polygons animated with the Web
   Animations API; React sees only the phase changes.
   -------------------------------------------------------------------------- */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { useLoad } from "@/lib/city/load-store";
import { easeDisplayed, overallProgress } from "@/lib/city/loading";
import {
  coverRadius,
  growFrames,
  holePolygon,
  isSitePath,
  routeLabel,
  xPoints,
  xPolygon,
} from "@/lib/page-transition";

import styles from "./page-transition.module.css";

type Phase = "idle" | "cover" | "hold" | "reveal";

interface Run {
  /** What to push (path, search and hash). */
  href: string;
  /** The pathname that means "arrived". */
  path: string;
  label: string;
  /** Where the X grows from — the click. */
  x: number;
  y: number;
  /** A history move: the page is already there, start covered. */
  instant: boolean;
  reduced: boolean;
}

/** One layer's growth. */
const COVER_MS = 640;
/** Between the orange, blue and ink layers, both ways. */
const STAGGER_MS = 85;
/** One layer's hole opening. */
const REVEAL_MS = 860;
/** From reveal to the first hole — the name starts lifting first. */
const TITLE_LEAD_MS = 240;
/** Least time covered after the push, so the name finishes rising. */
const MIN_HOLD_MS = 460;
const MIN_HOLD_INSTANT_MS = 950;
/** Whatever happens, open up. */
const SAFETY_MS = 12_000;
/** The cover twists into place as it grows (and the hole the other way). */
const TURN = Math.PI / 6;

const EASE_COVER = "cubic-bezier(0.76, 0, 0.24, 1)";
const EASE_REVEAL = "cubic-bezier(0.7, 0, 0.2, 1)";

/** The giant outline X behind the name — the same 12 points as the shapes. */
const GLYPH = xPoints(50, 50, 48)
  .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
  .join(" ");

/** The home waits on the city: a fresh load-store run, fonts already in. */
function prepareHome() {
  delete document.documentElement.dataset.sxLoaded;
  const load = useLoad.getState();
  load.reset();
  load.setTask("content", 1);
}

/** Before the push: clear `html[data-sx-loaded]` so the destination's own
 *  entrance (the home's hero, the /packages stage) waits for the reveal,
 *  which sets it again as the hole opens. */
function prepareArrival(path: string) {
  if (path === "/") prepareHome();
  else delete document.documentElement.dataset.sxLoaded;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function PageTransition() {
  const router = useRouter();
  const pathname = usePathname();

  const [phase, setPhase] = useState<Phase>("idle");
  const [run, setRun] = useState<Run | null>(null);

  const phaseRef = useRef<Phase>("idle");
  const pathRef = useRef(pathname);
  const overflowRef = useRef("");

  const orangeRef = useRef<HTMLDivElement>(null);
  const blueRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const animsRef = useRef<Animation[]>([]);

  const go = (next: Phase, nextRun?: Run | null) => {
    phaseRef.current = next;
    if (nextRun !== undefined) setRun(nextRun);
    setPhase(next);
  };

  const lockScroll = () => {
    const html = document.documentElement;
    overflowRef.current = html.style.overflow;
    html.style.overflow = "hidden";
  };
  const unlockScroll = () => {
    document.documentElement.style.overflow = overflowRef.current;
  };

  const layers = () =>
    [orangeRef.current, blueRef.current, inkRef.current].filter((el): el is HTMLDivElement => el !== null);

  // ---- entry: link clicks -------------------------------------------------
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const here = window.location.pathname;
      // Same page (a hash or a filter): the page handles it.
      if (url.pathname === here) return;
      if (!isSitePath(here) || !isSitePath(url.pathname)) return;

      e.preventDefault();
      // Mid-transition: swallow the click rather than stack a second run.
      if (phaseRef.current !== "idle") return;

      const href = `${url.pathname}${url.search}${url.hash}`;
      router.prefetch(href);
      lockScroll();
      go("cover", {
        href,
        path: url.pathname,
        label: routeLabel(url.pathname),
        x: e.clientX || window.innerWidth / 2,
        y: e.clientY || window.innerHeight / 2,
        instant: false,
        reduced: prefersReducedMotion(),
      });
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [router]);

  // ---- entry: back / forward ----------------------------------------------
  // A history move cannot be held, so it is caught during the render that
  // shows the new page (state adjusted while rendering, the React pattern
  // for "props changed"): that render already draws the overlay covered,
  // and the page is never painted uncovered. The hold effect does the rest.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (phase === "idle" && isSitePath(seenPath) && isSitePath(pathname)) {
      const instant: Run = {
        href: pathname,
        path: pathname,
        label: routeLabel(pathname),
        x: 0,
        y: 0,
        instant: true,
        reduced: prefersReducedMotion(),
      };
      setRun(instant);
      setPhase("hold");
    }
  }

  useLayoutEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  // ---- phases -------------------------------------------------------------
  useLayoutEffect(() => {
    phaseRef.current = phase;
    const r = run;

    if (phase === "idle") {
      // The last hole has opened past the screen; drop the fills.
      for (const a of animsRef.current) a.cancel();
      animsRef.current = [];
      return;
    }
    if (!r) return;

    if (phase === "cover") {
      let live = true;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const all = layers();
      const anims = r.reduced
        ? [inkRef.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: "ease-out", fill: "both" })]
        : all.map((el, i) =>
            el.animate(growFrames(r.x, r.y, coverRadius(r.x, r.y, w, h), TURN, xPolygon), {
              duration: COVER_MS,
              delay: i * STAGGER_MS,
              easing: EASE_COVER,
              fill: "both",
            }),
          );
      animsRef.current = anims;
      void anims[anims.length - 1].finished
        .then(() => {
          if (!live) return;
          prepareArrival(r.path);
          router.push(r.href);
          go("hold");
        })
        .catch(() => {});
      return () => {
        live = false;
      };
    }

    if (phase === "hold") {
      if (r.instant) {
        lockScroll();
        prepareArrival(r.path);
      }
      const start = performance.now();
      const minHold = r.instant ? MIN_HOLD_INSTANT_MS : MIN_HOLD_MS;
      let last = start;
      let displayed = 0;
      let arrivedFrames = 0;
      let raf = 0;
      const write = (v: number) => {
        if (pctRef.current) pctRef.current.textContent = String(Math.round(v * 100)).padStart(3, "0");
        if (fillRef.current) fillRef.current.style.transform = `scaleX(${v.toFixed(3)})`;
      };
      const tick = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (pathRef.current === r.path) arrivedFrames++;
        let target: number;
        if (r.path === "/") {
          target = arrivedFrames > 0 ? overallProgress({ ...useLoad.getState().tasks, content: 1 }) : 0.08;
        } else {
          // Two frames after the commit the page has laid out and painted.
          target = arrivedFrames >= 2 ? 1 : 0.72;
        }
        displayed = easeDisplayed(displayed, target, dt, r.path === "/" ? 6 : 9);
        write(displayed);
        const held = now - start;
        if ((target >= 1 && displayed >= 1 && held >= minHold) || held >= SAFETY_MS) {
          write(1);
          go("reveal");
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      write(0);
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }

    // reveal
    let live = true;
    const timer = window.setTimeout(() => {
      if (!live) return;
      document.documentElement.dataset.sxLoaded = "1";
      unlockScroll();
      for (const a of animsRef.current) a.cancel();
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const all = layers();
      const anims = r.reduced
        ? [inkRef.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 280, easing: "ease-in", fill: "forwards" })]
        : // ink first, then blue, then orange: the X opens in coloured rims
          [...all].reverse().map((el, i) =>
            el.animate(
              growFrames(cx, cy, coverRadius(cx, cy, w, h), -TURN / 2, (p) => holePolygon(w, h, p)),
              { duration: REVEAL_MS, delay: i * STAGGER_MS, easing: EASE_REVEAL, fill: "both" },
            ),
          );
      animsRef.current = anims;
      void anims[anims.length - 1].finished
        .then(() => {
          if (live) go("idle", null);
        })
        .catch(() => {});
    }, r.reduced ? 0 : TITLE_LEAD_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Never leave the page locked if this unmounts mid-run.
  useEffect(
    () => () => {
      if (phaseRef.current !== "idle") {
        unlockScroll();
        document.documentElement.dataset.sxLoaded = "1";
      }
    },
    [],
  );

  const words = (run?.label ?? "").split(" ");
  // each word's first letter's index across the whole name, for the stagger
  const offsets = words.map((_, wi) => words.slice(0, wi).reduce((n, w) => n + w.length, 0));

  return (
    <div
      className={styles.root}
      data-phase={phase}
      data-instant={run?.instant ? "" : undefined}
      data-reduced={run?.reduced ? "" : undefined}
      data-testid="page-transition"
    >
      <p className={styles.sr} role="status">
        {phase === "idle" || !run ? "" : phase === "reveal" ? `${run.label} loaded` : `Loading ${run.label}`}
      </p>

      <div ref={orangeRef} className={`${styles.layer} ${styles.orange}`} aria-hidden="true" />
      <div ref={blueRef} className={`${styles.layer} ${styles.blue}`} aria-hidden="true" />
      <div ref={inkRef} className={`${styles.layer} ${styles.ink}`} aria-hidden="true">
        <div className={styles.grid} />
        <div className={styles.sweep} />
        <svg className={styles.glyph} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <polygon points={GLYPH} pathLength={1} />
        </svg>

        <div className={`${styles.corner} ${styles.tl}`}>
          <span className={styles.mark} />
          SponsorX
        </div>
        <div className={`${styles.corner} ${styles.tr}`}>
          <span ref={pctRef}>000</span>
          <small>%</small>
        </div>

        <div className={styles.center}>
          <p className={styles.eyebrow}>Now entering</p>
          <p className={styles.title}>
            {words.map((word, wi) => (
              <span key={wi} className={styles.word}>
                {[...word].map((ch, ci) => (
                  <span key={ci} className={styles.char} style={{ "--i": offsets[wi] + ci } as React.CSSProperties}>
                    {ch}
                  </span>
                ))}
              </span>
            ))}
          </p>
          <div className={styles.track}>
            <span ref={fillRef} className={styles.fill} />
          </div>
        </div>

        <div className={`${styles.corner} ${styles.bl}`}>sponsorx{run?.path === "/" ? "" : run?.path}</div>
        <div className={`${styles.corner} ${styles.br}`}>BTG Sports Group</div>
      </div>
    </div>
  );
}
