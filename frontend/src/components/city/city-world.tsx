/* --------------------------------------------------------------------------
   City world (P1-ART-09) — everything inside the canvas that is *content*.

   Resolves the tier's layout once (`getCityLayout` is pure data, memoised per
   tier), then composes the three renderers that consume it: the kit
   instances (GLB meshes), the procedural venues (courts, pitch, diamond,
   pedestal, skyscraper extras, gantry, cables — venues/venues.tsx) and one
   point light per landmark anchor. Lights are coloured by what they stand
   over: accent orange for the basketball and baseball lots, primary blue for
   the plaza, the soccer pitch and the skyscraper crown. No shadows anywhere.

   `orbit` (review mode, ?orbit=1) adds an axes helper at the world origin so
   the plan's coordinates can be checked against the scene.
   -------------------------------------------------------------------------- */

import { useMemo } from "react";

import { getCityLayout } from "@/lib/city/layout";
import type { Tier } from "@/lib/city/palette";
import type { Landmark } from "@/lib/city/types";

import { KitInstances } from "./kit-instances";
import { Venues } from "./venues/venues";

const ACCENT = "#f97a1f";
const PRIMARY = "#2e9bf5";

/** Point-light budget per landmark (candela, physically-based decay 2). */
const LIGHT = { intensity: 40, distance: 60, decay: 2 } as const;

/** How far above the ground anchor the light sits when the landmark carries
 *  no height of its own (venue floodlight mast height). */
const DEFAULT_LIGHT_HEIGHT = 8;

export interface CityWorldProps {
  tier: Tier;
  orbit?: boolean;
  /** Forwarded to the kit: fires once its meshes are on screen or it is
   *  known there are none (see kit-instances.tsx). */
  onKitSettled?: () => void;
}

export function CityWorld({ tier, orbit = false, onKitSettled }: CityWorldProps) {
  const layout = useMemo(() => getCityLayout(tier), [tier]);

  return (
    <>
      <GroundSlab />
      <KitInstances layout={layout} tier={tier} onSettled={onKitSettled} />
      <Venues layout={layout} textureSize={tier === "lite" ? 1024 : 2048} />
      <LandmarkLights landmarks={layout.landmarks} />
      {orbit && <axesHelper args={[12]} />}
    </>
  );
}

/** The earth under everything: one dark plane the size of the site, just
 *  below the kit's ground tiles (whose tops are at y = 0 and bottoms at
 *  −0.14), so the skyline fill and the lot aprons never float over the fog. */
function GroundSlab() {
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, -0.16, -100]} receiveShadow={false}>
      <planeGeometry args={[400, 480]} />
      <meshStandardMaterial color="#0c0e14" roughness={1} metalness={0} />
    </mesh>
  );
}

function LandmarkLights({ landmarks }: { landmarks: Record<string, Landmark> }) {
  return (
    <>
      {Object.values(landmarks).map((l) => {
        const warm = /basket|baseball/i.test(`${l.id} ${l.name}`);
        const [x, y, z] = l.position;
        // A landmark with a height (size[1] — the skyscraper) lights its crown;
        // the flat venues and the plaza get a mast-height light.
        const lift = Math.max(DEFAULT_LIGHT_HEIGHT, l.size?.[1] ?? 0);
        return (
          <pointLight
            key={l.id}
            name={`light:${l.id}`}
            position={[x, y + lift, z]}
            color={warm ? ACCENT : PRIMARY}
            intensity={LIGHT.intensity}
            distance={LIGHT.distance}
            decay={LIGHT.decay}
          />
        );
      })}
    </>
  );
}
