"use client";
import { useEffect, useRef } from "react";
import { LandingSceneApp } from "@/lib/three/landing-scene-app";

/* --------------------------------------------------------------------------
   React shell for the three.js landing scene (P1-ART-08). Owns the <canvas>
   element and the app lifecycle; all WebGL lives in LandingSceneApp. Loaded
   only via next/dynamic(ssr:false) from landing-scene-mount.tsx.

   Callbacks are held in refs so the WebGL app is created exactly once — a new
   onReady/onChapter identity on re-render must NOT tear down and rebuild the
   scene (which would happen if they were in the effect deps).
   -------------------------------------------------------------------------- */

export function LandingScene({
  onReady,
  onChapter,
}: {
  onReady?: () => void;
  onChapter?: (index: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onReadyRef = useRef(onReady);
  const onChapterRef = useRef(onChapter);

  // Keep the refs current without re-initializing the WebGL app.
  useEffect(() => {
    onReadyRef.current = onReady;
    onChapterRef.current = onChapter;
  }, [onReady, onChapter]);

  useEffect(() => {
    if (!canvasRef.current) return;
    const app = new LandingSceneApp(canvasRef.current, {
      onReady: () => onReadyRef.current?.(),
      onChapter: (i) => onChapterRef.current?.(i),
    });
    app.start();
    return () => app.dispose();
  }, []);

  return <canvas ref={canvasRef} className="block h-full w-full" />;
}
