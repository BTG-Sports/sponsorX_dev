"use client";

/* --------------------------------------------------------------------------
   City backdrop (P1-ART-09) — the client boundary for the landing page's 3D
   background. First child of the home page (a Server Component).

   Always renders the poster (server-safe, instant LCP). On mount it runs the
   capability gate; when the scene may run it dynamic-imports city-scene.tsx
   with ssr:false — inside this client component, which is the only place
   Next 16 allows that — picks the GLB tier, and fades the canvas in over the
   poster once the scene reports its first drawn frame of the city (the kit
   loaded, or known to be absent — until then the poster stays). A vertical
   scrim sits above the canvas and below the page so the city shows behind
   the hero and every section below stays readable.

   FPS watchdog: the scene reports each frame's duration through a ref (no
   React render per frame), starting with that first city frame. Frames in
   the first 2 s are ignored (shader compile, texture upload); the next 3 s
   of frames are averaged once; under 24 fps the scene is unmounted for good
   and the poster stays. Frames longer than a second are treated as a pause
   (tab hidden), not a slow frame.

   Review mode: `?orbit=1` mounts the scene with orbit controls, lifts the
   wrapper above the page (z-30) so it receives pointer events, hides the
   scrim, and disables the watchdog so a slow review machine still shows the
   city.
   -------------------------------------------------------------------------- */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { detectCapability, pickTier, shouldRenderScene } from "@/lib/city/capability";
import type { Tier } from "@/lib/city/palette";

import { CityPoster } from "./city-poster";

const CityScene = dynamic(() => import("./city-scene"), { ssr: false });

const WARMUP_MS = 2000;
const WINDOW_MS = 3000;
const MIN_FPS = 24;
/** A frame this long is the tab coming back from the background, not a slow frame. */
const PAUSE_MS = 1000;

interface Mount {
  tier: Tier;
  orbit: boolean;
}

interface Watchdog {
  elapsed: number;
  windowMs: number;
  frames: number;
  settled: boolean;
}

export function CityBackdrop() {
  const [mount, setMount] = useState<Mount | null>(null);
  const [killed, setKilled] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const watchdog = useRef<Watchdog>({ elapsed: 0, windowMs: 0, frames: 0, settled: false });

  useEffect(() => {
    // Deferred a frame: the probe touches matchMedia and a scratch canvas, and
    // the state write must not be synchronous inside the effect body.
    let live = true;
    const id = requestAnimationFrame(() => {
      if (!live) return;
      const cap = detectCapability();
      if (!shouldRenderScene(cap)) return;
      const orbit = new URLSearchParams(window.location.search).get("orbit") === "1";
      setMount({ tier: pickTier(cap), orbit });
    });
    return () => {
      live = false;
      cancelAnimationFrame(id);
    };
  }, []);

  const onReady = useCallback(() => {
    const el = wrapperRef.current;
    if (el) el.style.opacity = "1";
  }, []);

  const onFrame = useCallback((ms: number) => {
    const w = watchdog.current;
    if (w.settled || ms > PAUSE_MS) return;
    w.elapsed += ms;
    if (w.elapsed < WARMUP_MS) return;
    w.windowMs += ms;
    w.frames += 1;
    if (w.windowMs < WINDOW_MS) return;
    w.settled = true;
    const fps = w.frames / (w.windowMs / 1000);
    if (fps < MIN_FPS) setKilled(true);
  }, []);

  const orbit = mount?.orbit ?? false;
  const showScene = mount !== null && !killed;

  return (
    <>
      <CityPoster />
      {showScene && (
        <>
          <div
            ref={wrapperRef}
            aria-hidden="true"
            className={[
              "fixed inset-0 opacity-0 transition-opacity duration-1000 ease-out",
              orbit ? "z-30 pointer-events-auto" : "-z-10 pointer-events-none",
            ].join(" ")}
          >
            <CityScene
              tier={mount.tier}
              orbit={orbit}
              onReady={onReady}
              onFrame={orbit ? undefined : onFrame}
            />
          </div>
          {!orbit && (
            <div
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 -z-[5]"
              style={{ background: "linear-gradient(to bottom, transparent 35vh, var(--sx-bg) 100vh)" }}
            />
          )}
        </>
      )}
    </>
  );
}
