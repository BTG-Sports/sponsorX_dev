"use client";

/* --------------------------------------------------------------------------
   City scene (P1-ART-09) — the React Three Fiber canvas.

   Loaded only on the client, only after the capability gate passes
   (city-backdrop.tsx dynamic-imports this with ssr:false), so three.js never
   enters the server bundle or the poster-only path. Owns everything that is
   *rendering* rather than content: renderer settings, the camera — flown
   along the scroll-driven drone route by flight-rig.tsx, starting from the
   plaza viewpoint (lib/city/flight.ts) — night lighting, fog, the optional
   environment map, and — desktop only — the post chain (Bloom → SMAA →
   Vignette → Noise). Content lives in city-world.tsx.

   Nothing is drawn until it can be drawn without a stall (P1-ART-11). The
   canvas starts with `frameloop="never"`. Once the kit and the environment
   map have both settled — loaded, missing or failed — `Warmup` compiles
   every shader program through the driver's background path
   (lib/city/compile.ts), reporting progress to the loader through
   `onCompileProgress`, draws one frame while the loading screen still covers
   the canvas, and only then switches the loop on. Before this, the first
   frame blocked the main thread for ~13 s of synchronous compilation and the
   loader's counter froze at one number. The environment map is applied
   before compiling so no material is compiled twice (once without, once
   with it).

   Two callbacks feed the backdrop without any React state changing per frame:
   `onFrame(ms)` from a useFrame subscriber (the FPS watchdog reads it) and
   `onReady()` once that first frame has been drawn (the fade-in). `orbit`
   swaps the fixed viewpoint for drei OrbitControls (review mode).
   -------------------------------------------------------------------------- */

import { OrbitControls, useEnvironment } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

import { ENV_URL } from "@/lib/city/assets";
import { warmUp, type ComposerLike } from "@/lib/city/compile";
import type { Tier } from "@/lib/city/palette";

import { KNOTS } from "@/lib/city/flight";

import { AssetErrorBoundary, useAssetAvailable } from "./asset-guard";
import { CityWorld } from "./city-world";
import { FlightRig } from "./flight-rig";

export interface CitySceneProps {
  tier: Tier;
  /** Review mode — orbit controls instead of the fixed viewpoint. */
  orbit?: boolean;
  /** Called once, after the first frame has been drawn. */
  onReady?: () => void;
  /** Called every frame with that frame's duration in milliseconds. */
  onFrame?: (ms: number) => void;
  /** Shader warm-up progress, 0..1, before the first frame. */
  onCompileProgress?: (fraction: number) => void;
}

/** The header viewpoint — the first flight knot: low over the plaza paving,
 *  a few metres south-east of the pedestal, looking up at the hologram above
 *  it (the boulevard and the skyscraper rise behind it). The fly-through
 *  starts from exactly this pose; review mode orbits around its target. */
const CAMERA_POSITION = KNOTS[0].position;
const LOOK_AT = KNOTS[0].target;
const BACKGROUND = "#070a12";
const FOG = "#0b1020";
const FOG_DENSITY: Record<Tier, number> = { desktop: 0.0055, lite: 0.008 };
const DPR_CAP: Record<Tier, number> = { desktop: 1.75, lite: 1.4 };
const ENV_INTENSITY = 0.6;

export default function CityScene({ tier, orbit = false, onReady, onFrame, onCompileProgress }: CitySceneProps) {
  // Both flip once their asset is on the scene — or known to be absent.
  const [kitSettled, setKitSettled] = useState(false);
  const [envSettled, setEnvSettled] = useState(false);
  const onKitSettled = useCallback(() => setKitSettled(true), []);
  const onEnvSettled = useCallback(() => setEnvSettled(true), []);

  // "never" until the warm-up has drawn the first frame.
  const [frameloop, setFrameloop] = useState<"never" | "always">("never");
  const onDrawn = useCallback(() => setFrameloop("always"), []);

  // Opened by the warm-up right before that frame; a ref so the per-frame
  // reporter can read it without a render.
  const drawGate = useRef(false);
  const composerRef = useRef<ComposerLike | null>(null);
  const setComposer = useCallback((c: ComposerLike | null) => {
    composerRef.current = c;
  }, []);

  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, DPR_CAP[tier]]}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        outputColorSpace: THREE.SRGBColorSpace,
      }}
      camera={{ fov: 55, near: 0.5, far: 900, position: CAMERA_POSITION }}
    >
      <color attach="background" args={[BACKGROUND]} />
      <fogExp2 attach="fog" args={[FOG, FOG_DENSITY[tier]]} />

      <hemisphereLight args={["#1a2340", "#05060a", 0.7]} />
      <directionalLight color="#8fb4ff" intensity={0.35} position={[-60, 120, -40]} />

      {orbit ? <Viewpoint /> : <FlightRig />}
      <FrameReporter gate={drawGate} onReady={onReady} onFrame={onFrame} />
      <Warmup
        when={kitSettled && envSettled}
        composer={composerRef}
        gate={drawGate}
        onProgress={onCompileProgress}
        onDrawn={onDrawn}
      />

      <Suspense fallback={null}>
        <CityEnvironment onSettled={onEnvSettled} />
        <CityWorld tier={tier} orbit={orbit} onKitSettled={onKitSettled} />
      </Suspense>

      {tier === "desktop" && (
        <EffectComposer ref={setComposer} multisampling={0}>
          <Bloom mipmapBlur luminanceThreshold={0.65} intensity={0.9} />
          <SMAA />
          <Vignette offset={0.3} darkness={0.55} />
          <Noise opacity={0.02} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/** Parse `x,y,z` from a review-mode query parameter. */
function vec3Param(name: string): [number, number, number] | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(name);
  if (!raw) return null;
  const v = raw.split(",").map(Number);
  return v.length === 3 && v.every(Number.isFinite) ? [v[0], v[1], v[2]] : null;
}

/** Review mode (`?orbit=1`): hands the camera to OrbitControls around the
 *  header target, or around `?at=x,y,z` from `?cam=x,y,z`, so a specific
 *  venue can be inspected directly. */
function Viewpoint() {
  const camera = useThree((s) => s.camera);
  const target = vec3Param("at") || LOOK_AT;

  useLayoutEffect(() => {
    const cam = vec3Param("cam");
    if (cam) camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(target[0], target[1], target[2]);
  }, [camera, target]);

  return <OrbitControls target={target} enableDamping />;
}

/** Compiles every program once the scene's assets have settled, draws the
 *  first frame behind the loading screen, then hands the loop over. */
function Warmup({
  when,
  composer,
  gate,
  onProgress,
  onDrawn,
}: {
  when: boolean;
  composer: RefObject<ComposerLike | null>;
  gate: RefObject<boolean>;
  onProgress?: (fraction: number) => void;
  onDrawn: () => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const advance = useThree((s) => s.advance);

  // The driver charges a start-up cost to whichever program is compiled
  // first on a fresh context (measured at ~5 s here). Issue a throwaway one
  // the moment the canvas exists, through the background path, so that cost
  // is paid while the kit still parses rather than in front of the visitor.
  useEffect(() => {
    const probe = new THREE.Scene();
    probe.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
    gl.compile(probe, camera);
  }, [gl, camera]);

  useEffect(() => {
    if (!when) return;
    let live = true;
    void warmUp(
      gl,
      scene,
      camera,
      composer.current,
      (f) => {
        if (live) onProgress?.(f);
      },
      () => new THREE.PMREMGenerator(gl),
    ).then(() => {
      if (!live) return;
      // One frame while the overlay still covers the canvas: texture uploads
      // and buffer allocation land here, not on the visible first frame.
      gate.current = true;
      advance(performance.now());
      onDrawn();
    });
    return () => {
      live = false;
    };
  }, [when, gl, scene, camera, advance, composer, gate, onProgress, onDrawn]);

  return null;
}

/** Reports frame times and the first drawn frame once `gate` is open (the
 *  warm-up is drawing). Refs only — nothing here causes a React render. */
function FrameReporter({
  gate,
  onReady,
  onFrame,
}: Pick<CitySceneProps, "onReady" | "onFrame"> & { gate: RefObject<boolean> }) {
  const announced = useRef(false);

  useFrame((_, delta) => {
    if (!gate.current) return;
    onFrame?.(delta * 1000);
    if (!announced.current) {
      announced.current = true;
      // useFrame runs before this frame's draw; the next animation frame is
      // the first moment the canvas is guaranteed to hold a rendered image.
      requestAnimationFrame(() => onReady?.());
    }
  });

  return null;
}

/** The pack's HDR as image-based lighting, applied to the scene before the
 *  warm-up so every material compiles once, with it. Skipped cleanly — and
 *  reported settled — when the file is not there or fails to parse. */
function CityEnvironment({ onSettled }: { onSettled: () => void }) {
  const status = useAssetAvailable(ENV_URL);

  useEffect(() => {
    if (status === "missing") onSettled();
  }, [status, onSettled]);

  if (status !== "ok") return null;
  return (
    <AssetErrorBoundary label="environment map" onFail={onSettled}>
      <LoadedEnvironment onSettled={onSettled} />
    </AssetErrorBoundary>
  );
}

function LoadedEnvironment({ onSettled }: { onSettled: () => void }) {
  const texture = useEnvironment({ files: ENV_URL });
  // The scene is read from the store inside the effect: the React Compiler
  // lint forbids mutating a value a hook returned.
  const get = useThree((s) => s.get);

  useLayoutEffect(() => {
    const scene = get().scene;
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = texture;
    scene.environmentIntensity = ENV_INTENSITY;
    onSettled();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
    };
  }, [get, texture, onSettled]);

  return null;
}
