"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { detectCapability, shouldRenderScene } from "@/lib/landing-capability";
import { LandingProgressRail } from "./landing-progress-rail";
import { LandingTransition, type TransitionApi } from "./landing-transition";

/* --------------------------------------------------------------------------
   Client mount wrapper (P1-ART-08). Decides at runtime whether the 3D scene may
   run (capability gate); if so, dynamically imports the WebGL scene (never SSR'd)
   and fades it in over the poster after the first frame, and shows the progress
   rail driven by the scene's active chapter. If not (reduced-motion / no-WebGL /
   low-perf), renders nothing and the poster remains.
   -------------------------------------------------------------------------- */

const LandingScene = dynamic(
  () => import("./landing-scene").then((m) => m.LandingScene),
  { ssr: false },
);

export function LandingSceneMount() {
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);
  const [active, setActive] = useState(0);
  const [dprCap, setDprCap] = useState(2);
  const transitionApiRef = useRef<TransitionApi | null>(null);

  useEffect(() => {
    // Decide after first paint (keeps 3D off the critical path — spec §9).
    const id = requestAnimationFrame(() => {
      const cap = detectCapability();
      if (shouldRenderScene(cap)) {
        setDprCap(cap.coarse ? 1.5 : 2); // lighter render on touch devices
        setRender(true);
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (!render) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-[5] transition-opacity duration-700"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <LandingScene
          dprCap={dprCap}
          onReady={() => setVisible(true)}
          onChapter={setActive}
          onTransition={(s) => transitionApiRef.current?.update(s)}
          onDegrade={() => setRender(false)} // low FPS → fall back to poster
        />
      </div>
      {/* Transition beat — black backdrop + title card + ball-comet + warp
          streaks, driven by the scene's eased progress. Above the canvas,
          below the content (z-10) and header (z-20). */}
      <LandingTransition apiRef={transitionApiRef} />
      {/* Mobile: content stacks over the centered ball — darken the scene behind
          it for text contrast. Desktop flanks the ball, so no scrim there. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-[4] bg-bg/45 lg:hidden" />
      <LandingProgressRail active={active} />
    </>
  );
}
