"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — skyscraper extras (P1-ART-09).

   The tower body is a kit placement (Building_02 scaled up); this renders
   only what sits above it, two draw calls: an emissive primary-blue crown
   ring and a red aircraft warning light. The kit tower's bounding box tops
   out at exactly base.y + height, so both float just above that — the ring
   0.6 m up, the light 2 m up — and never intersect the tower's collision
   box. Collision boxes: lib/city/venue-boxes.ts (shares VENUE_DIMS).
   -------------------------------------------------------------------------- */
import type { SkyscraperSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import { BRAND } from "./venue-utils";

const K = VENUE_DIMS.skyscraper;
const WARNING_RED = "#ff3040";

export function SkyscraperExtras({ spec }: { spec: SkyscraperSpec }) {
  const [x, y, z] = spec.base;
  return (
    <group position={[x, y + spec.height, z]}>
      <mesh position-y={K.crownRise} rotation-x={Math.PI / 2}>
        <torusGeometry args={[K.crownRadius, K.crownTube, 12, 96]} />
        <meshStandardMaterial color={BRAND.blue} emissive={BRAND.blue} emissiveIntensity={2} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position-y={K.lightRise}>
        <sphereGeometry args={[K.lightRadius, 16, 12]} />
        <meshStandardMaterial color={WARNING_RED} emissive={WARNING_RED} emissiveIntensity={3} roughness={0.3} metalness={0} />
      </mesh>
    </group>
  );
}
