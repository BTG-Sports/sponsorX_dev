"use client";

/* --------------------------------------------------------------------------
   City backdrop (P1-ART-09) — the client boundary for the landing page's 3D
   background. First child of the home page (a Server Component).

   Always renders the poster (server-safe, instant LCP). On mount it runs the
   capability gate; when the scene may run it streams the tier's files first
   (city-preload.ts — real byte progress for the loading screen, and the
   bytes go into three's cache so the scene never downloads them twice),
   then dynamic-imports city-scene.tsx with ssr:false — inside this client
   component, which is the only place Next 16 allows that — and fades the
   canvas in over the poster once the scene reports its first drawn frame
   of the city (the kit loaded, or known to be absent — until then the
   poster stays). The canvas is fixed, full-screen, z-index 0: the page's
   scroll track and its overlay stops sit above it (z-10) and carry their
   own translucent backdrops, so there is no scrim — the city is the page
   behind every stop.

   Loading screen (P1-ART-11): this is the writer of the `assets` and
   `scene` tasks in lib/city/load-store.ts. Bytes streamed → `assets`; the
   scene chunk arriving → `scene` 0.4; the first city frame → `scene` 1. On
   the poster path both are marked complete at once so the loader finishes
   on the page content alone.

   FPS watchdog: the scene reports each frame's duration through a ref (no
   React render per frame), starting with that first city frame. Frames in
   the first 2 s are ignored (shader compile, texture upload); the next 3 s
   of frames are averaged once; under 24 fps the scene is unmounted for good
   and the poster stays. Frames longer than a second are treated as a pause
   (tab hidden), not a slow frame.

   Review mode: `?orbit=1` mounts the scene with orbit controls, lifts the
   wrapper above the page (z-30) so it receives pointer events, and disables
   the watchdog so a slow review machine still shows the city.
   -------------------------------------------------------------------------- */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { cityFiles } from "@/lib/city/assets";
import { detectCapability, pickTier, shouldRenderScene } from "@/lib/city/capability";
import { useLoad } from "@/lib/city/load-store";
import { SCENE_MODULE_LOADED } from "@/lib/city/loading";
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
      const load = useLoad.getState();
      if (!shouldRenderScene(cap)) {
        // Poster path: nothing of ours to wait for.
        load.setTask("assets", 1);
        load.setTask("scene", 1);
        return;
      }
      const orbit = new URLSearchParams(window.location.search).get("orbit") === "1";
      const tier = pickTier(cap);

      // Warm the scene chunk (three, R3F, drei, the post chain) while the
      // files stream — next/dynamic below resolves the same module from
      // the module cache when the scene mounts.
      void import("./city-scene")
        .then(() => {
          if (live) useLoad.getState().setTask("scene", SCENE_MODULE_LOADED);
        })
        .catch(() => {});

      // Stream the files with progress, then mount. The preload never
      // rejects; a network failure is reported complete and the scene's own
      // loaders (and asset-guard) take it from there.
      void import("./city-preload")
        .then(({ preloadCityFiles }) =>
          preloadCityFiles(cityFiles(tier), (f) => {
            if (live) useLoad.getState().setTask("assets", f);
          }),
        )
        .catch(() => {})
        .finally(() => {
          if (!live) return;
          useLoad.getState().setTask("assets", 1);
          setMount({ tier, orbit });
        });
    });
    return () => {
      live = false;
      cancelAnimationFrame(id);
    };
  }, []);

  const onReady = useCallback(() => {
    const el = wrapperRef.current;
    if (el) el.style.opacity = "1";
    useLoad.getState().setTask("scene", 1);
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
              orbit ? "z-30 pointer-events-auto" : "z-0 pointer-events-none",
            ].join(" ")}
          >
            <CityScene
              tier={mount.tier}
              orbit={orbit}
              onReady={onReady}
              onFrame={orbit ? undefined : onFrame}
            />
          </div>
        </>
      )}
    </>
  );
}
