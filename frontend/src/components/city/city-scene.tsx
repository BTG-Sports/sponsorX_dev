"use client";

/* --------------------------------------------------------------------------
   City scene (P1-ART-09) — the React Three Fiber canvas.

   Loaded only on the client, only after the capability gate passes
   (city-backdrop.tsx dynamic-imports this with ssr:false), so three.js never
   enters the server bundle or the poster-only path. Owns everything that is
   *rendering* rather than content: renderer settings, the fixed viewpoint
   (plaza, looking north up the boulevard at the skyscraper), night lighting,
   fog, the optional environment map, and — desktop only — the post chain
   (Bloom → SMAA → Vignette → Noise). Content lives in city-world.tsx.

   Two callbacks feed the backdrop without any React state changing per frame:
   `onFrame(ms)` from a useFrame subscriber (the FPS watchdog reads it) and
   `onReady()` once the first frame *of the city* has been drawn (the
   fade-in). Both wait for the kit to settle — loaded, missing or failed —
   because until then the Suspense boundary shows an empty scene, and a frame
   time measured on that would say nothing about the real load. `orbit` swaps
   the fixed viewpoint for drei OrbitControls (review mode).
   -------------------------------------------------------------------------- */

import { Environment, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, SMAA, Vignette } from "@react-three/postprocessing";
import { Suspense, useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import * as THREE from "three";

import type { Tier } from "@/lib/city/palette";

import { AssetErrorBoundary, useAssetAvailable } from "./asset-guard";
import { CityWorld } from "./city-world";

export interface CitySceneProps {
  tier: Tier;
  /** Review mode — orbit controls instead of the fixed viewpoint. */
  orbit?: boolean;
  /** Called once, after the first frame has been drawn. */
  onReady?: () => void;
  /** Called every frame with that frame's duration in milliseconds. */
  onFrame?: (ms: number) => void;
}

/** The header viewpoint: low over the plaza paving, a few metres south-east
 *  of the pedestal, looking up at the hologram above it (the boulevard and
 *  the skyscraper rise behind it). */
const CAMERA_POSITION: [number, number, number] = [4.2, 1.35, 41];
const LOOK_AT: [number, number, number] = [0, 3.4, 28];
const BACKGROUND = "#070a12";
const FOG = "#0b1020";
const FOG_DENSITY: Record<Tier, number> = { desktop: 0.0055, lite: 0.008 };
const DPR_CAP: Record<Tier, number> = { desktop: 1.75, lite: 1.4 };
const ENV_URL = "/textures/city/env.hdr";

export default function CityScene({ tier, orbit = false, onReady, onFrame }: CitySceneProps) {
  // Flipped by the kit once its meshes are on screen (or there are none);
  // a ref so the per-frame reporter can read it without a render.
  const kitSettled = useRef(false);
  const onKitSettled = useCallback(() => {
    kitSettled.current = true;
  }, []);

  return (
    <Canvas
      frameloop="always"
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

      <Viewpoint orbit={orbit} />
      <FrameReporter gate={kitSettled} onReady={onReady} onFrame={onFrame} />

      <Suspense fallback={null}>
        <CityEnvironment />
        <CityWorld tier={tier} orbit={orbit} onKitSettled={onKitSettled} />
      </Suspense>

      {tier === "desktop" && (
        <EffectComposer multisampling={0}>
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

/** Aims the camera once at the boulevard; in review mode hands it to
 *  OrbitControls around the same target. Review mode also accepts
 *  `?cam=x,y,z&at=x,y,z` so a specific venue can be inspected directly. */
function Viewpoint({ orbit }: { orbit: boolean }) {
  const camera = useThree((s) => s.camera);
  const target = (orbit && vec3Param("at")) || LOOK_AT;

  useLayoutEffect(() => {
    const cam = orbit && vec3Param("cam");
    if (cam) camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(target[0], target[1], target[2]);
  }, [camera, orbit, target]);

  return orbit ? <OrbitControls target={target} enableDamping /> : null;
}

/** Reports frame times and the first drawn frame once `gate` is open (the kit
 *  has settled). Refs only — nothing here causes a React render. */
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

/** The pack's HDR as image-based lighting — skipped cleanly when the file is
 *  not there (drei's loader would otherwise throw through Suspense). */
function CityEnvironment() {
  const status = useAssetAvailable(ENV_URL);
  if (status !== "ok") return null;
  return (
    <AssetErrorBoundary label="environment map">
      <Environment files={ENV_URL} environmentIntensity={0.6} />
    </AssetErrorBoundary>
  );
}
