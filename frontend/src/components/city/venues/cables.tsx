"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — overhead cables (P1-ART-09).

   Every CableSpec becomes a quadratic Bézier tube from `from` to `to`; all
   the tubes are merged into one geometry with one dark material, so the
   whole city's cables are a single draw call. A quadratic Bézier passes
   halfway between the chord and its control point at t = 0.5, so the
   control point is pulled down by 2·sag to make the cable's midpoint sag by
   exactly `sag` metres, as the spec type promises.

   World frame: cable endpoints are world coordinates, so the mesh sits at
   the origin. Cables are on the `air` layer in the layout and have no venue
   collision box.
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { CableSpec } from "@/lib/city/types";

import { mergeParts, useBuilt } from "./venue-utils";

const RADIUS = 0.035;
const SEGMENTS = 24;
const RADIAL = 5;

type Built = { tube: THREE.BufferGeometry | null };

function build(cables: CableSpec[]): Built {
  const parts = cables.map((c) => {
    const a = new THREE.Vector3(...c.from);
    const b = new THREE.Vector3(...c.to);
    const control = a.clone().add(b).multiplyScalar(0.5);
    control.y -= 2 * c.sag;
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, control, b), SEGMENTS, RADIUS, RADIAL, false);
  });
  return { tube: mergeParts(parts) };
}

export function Cables({ cables }: { cables: CableSpec[] }) {
  const b = useBuilt(cables, build);
  if (!b?.tube) return null;
  return (
    <mesh geometry={b.tube}>
      <meshStandardMaterial color="#0d0f14" roughness={1} metalness={0} />
    </mesh>
  );
}
