"use client";
import { useEffect, useRef } from "react";
import { LandingSceneApp } from "@/lib/three/landing-scene-app";

/* --------------------------------------------------------------------------
   React shell for the three.js landing scene (P1-ART-08). Owns the <canvas>
   element and the app lifecycle; all WebGL lives in LandingSceneApp. Loaded
   only via next/dynamic(ssr:false) from landing-scene-mount.tsx.
   -------------------------------------------------------------------------- */

export function LandingScene({
  onReady,
  onChapter,
}: {
  onReady?: () => void;
  onChapter?: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const app = new LandingSceneApp(canvasRef.current, { onReady, onChapter });
    app.start();
    return () => app.dispose();
  }, [onReady, onChapter]);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
