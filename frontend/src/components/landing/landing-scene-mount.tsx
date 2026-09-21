"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { detectCapability, shouldRenderScene } from "@/lib/landing-capability";

/* --------------------------------------------------------------------------
   Client mount wrapper (P1-ART-08). Decides at runtime whether the 3D scene may
   run (capability gate); if so, dynamically imports the WebGL scene (never SSR'd)
   and fades it in over the poster after the first frame. If not (reduced-motion /
   no-WebGL / low-perf), renders nothing and the poster remains.
   -------------------------------------------------------------------------- */

const LandingScene = dynamic(
  () => import("./landing-scene").then((m) => m.LandingScene),
  { ssr: false },
);

export function LandingSceneMount() {
  const [render, setRender] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Decide after first paint (keeps 3D off the critical path — spec §9).
    const id = requestAnimationFrame(() => {
      if (shouldRenderScene(detectCapability())) setRender(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  if (!render) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-[5] transition-opacity duration-700"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <LandingScene onReady={() => setVisible(true)} />
    </div>
  );
}
