"use client";

/* --------------------------------------------------------------------------
   Flight rig (P1-ART-09) — flies the R3F camera along the drone route.

   Lives inside the Canvas. Every frame it reads the store's scroll progress
   (no subscription — useFrame polls `getState()`), eases its own copy toward
   it so the camera keeps a little inertia beyond what Lenis already gives
   the scroll, samples lib/city/flight.ts for the pose and writes it to the
   camera. Nothing here allocates per frame.

   Drone feel, on top of the spline:
   - banking: the camera rolls a few degrees into a sideways move (the
     component of the path tangent along the camera's right vector);
   - hover: a slow, few-centimetre bob, faded in over the first moments of
     the flight so the resting header pose stays exactly the authored one.
   -------------------------------------------------------------------------- */
import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { MathUtils, Vector3 } from "three";

import { sampleFlight, type FlightPose } from "@/lib/city/flight";
import { useFlight } from "@/lib/city/flight-store";

/** Exponential smoothing rate toward the scroll progress (per second). */
const FOLLOW = 7;
/** Roll per unit of sideways travel, and its cap (radians). */
const BANK = 0.28;
const BANK_MAX = 0.14;
/** Hover bob amplitude (metres) and rate (radians per second). */
const BOB = 0.05;
const BOB_RATE = 0.9;

const UP = new Vector3(0, 1, 0);

export function FlightRig() {
  const camera = useThree((s) => s.camera);
  const eased = useRef(useFlight.getState().progress);
  const pose = useMemo<FlightPose>(() => ({ position: new Vector3(), target: new Vector3(), tangent: new Vector3() }), []);
  const scratch = useMemo(() => ({ forward: new Vector3(), right: new Vector3() }), []);

  // First paint at the exact resting pose, before any frame runs.
  useLayoutEffect(() => {
    sampleFlight(eased.current, pose);
    camera.position.copy(pose.position);
    camera.lookAt(pose.target);
  }, [camera, pose]);

  // The frame's own `state.camera` (the same object) rather than the hook
  // value: the React Compiler lint forbids mutating a hook result here.
  useFrame(({ camera: cam, clock }, delta) => {
    const goal = useFlight.getState().progress;
    eased.current = MathUtils.damp(eased.current, goal, FOLLOW, delta);
    const p = eased.current;
    sampleFlight(p, pose);

    // Hover only once airborne: ramps 0→1 over the first 2% of the track.
    const airborne = Math.min(1, p * 50);
    cam.position.copy(pose.position);
    cam.position.y += Math.sin(clock.elapsedTime * BOB_RATE) * BOB * airborne;
    cam.lookAt(pose.target);

    // Bank into sideways travel.
    scratch.forward.subVectors(pose.target, pose.position).normalize();
    scratch.right.crossVectors(scratch.forward, UP).normalize();
    const lateral = pose.tangent.dot(scratch.right);
    const roll = MathUtils.clamp(-lateral * BANK, -BANK_MAX, BANK_MAX) * airborne;
    if (roll !== 0) cam.rotateZ(roll);
  });

  return null;
}
