"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — plaza pedestal (P1-ART-09).

   Three draw calls: the octagonal tiers stacked from the ground, merged into
   one dark-concrete geometry; an emissive primary-blue ring at the top edge
   of every tier (plus the lip of the dais) merged into one; and a 0.6 m
   translucent glass "dais" ring inset on the top tier. Octagons are turned
   22.5° so a flat face looks down each axis.

   Above the dais floats the hologram: the logo's two-part "X" (owner's
   call, 2026-10-01) — the orange lightning bolt on the left and the white
   blade on the right, the two polygons of
   documentation/Design/marketing-visuals/exports/logos/sponsorx-x-dark.svg
   extruded to a 3D letter with the lockup's 8° italic lean. Each part is
   translucent with horizontal scan lines (one shared alpha map that
   scrolls) and a glowing edge outline, the whole turning slowly about +Y
   and bobbing, with a faint primary-blue projector cone from the dais up
   to it. Five more draw calls (bolt, blade, two outlines, cone).

   Local frame: centre at the origin, no yaw. Collision boxes:
   lib/city/venue-boxes.ts (shares VENUE_DIMS).
   -------------------------------------------------------------------------- */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import type { PedestalSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import { BRAND, makeCanvas, mergeParts, toTexture, useBuilt } from "./venue-utils";

const P = VENUE_DIMS.pedestal;
const OCTAGON_TURN = Math.PI / 8;
/** Hologram motion: turn rate (rad/s), bob amplitude (m) and rate (rad/s), scan-line scroll (texture units/s). */
const SPIN = 0.7;
const BOB = 0.06;
const BOB_RATE = 1.3;
const SCAN_SCROLL = 0.35;

type Built = {
  tiers: THREE.BufferGeometry | null;
  rings: THREE.BufferGeometry | null;
  dais: THREE.BufferGeometry | null;
  /** The logo X's orange lightning bolt (left) and white blade (right). */
  bolt: THREE.BufferGeometry | null;
  blade: THREE.BufferGeometry | null;
  boltOutline: THREE.BufferGeometry | null;
  bladeOutline: THREE.BufferGeometry | null;
  cone: THREE.BufferGeometry | null;
  scan: THREE.CanvasTexture | null;
  /** Height of the dais top above the pedestal's base. */
  stackTop: number;
};

/* The logo X's two polygons, in the SVG's own units (y down). The master is
   sponsorx-x-dark.svg: a 124×104 box, the paths inside a skewX(-8) group.
   Together they span x 2–100 and y 4–100, crossing at (52, 52). */
const LOGO_X_BOLT: [number, number][] = [[2, 6], [24, 6], [52, 46], [42, 52], [52, 58], [24, 98], [2, 98], [30, 52]];
const LOGO_X_BLADE: [number, number][] = [[100, 4], [78, 8], [52, 46], [60, 52], [52, 58], [78, 96], [100, 100], [74, 52]];
const LOGO_X_CENTER: [number, number] = [51, 52];
const LOGO_X_WIDTH = 98;
const LOGO_X_LEAN = Math.tan((8 * Math.PI) / 180);

/** One part of the logo X as a 3D solid: `size` wide, `depth` deep, centred
 *  on the origin in the XY plane, leaning right like the lockup's italic. */
function logoPart(points: [number, number][], size: number, depth: number): THREE.BufferGeometry {
  const s = size / LOGO_X_WIDTH;
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2((x - LOGO_X_CENTER[0]) * s, -(y - LOGO_X_CENTER[1]) * s)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
  // skewX(-8) in SVG (y down) is "shear X by +Y" once Y points up.
  g.applyMatrix4(new THREE.Matrix4().makeShear(LOGO_X_LEAN, 0, 0, 0, 0, 0));
  g.computeVertexNormals();
  return g;
}

/** Horizontal scan lines as an alpha map: bright rows, dark gaps. */
function scanLines(): THREE.CanvasTexture | null {
  const c = makeCanvas(4, 64);
  if (!c) return null;
  const { ctx, w, h } = c;
  ctx.fillStyle = "#3a3a3a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 5);
  // ExtrudeGeometry's UVs are in metres, so the repeat is per metre: ten
  // lines over the letter's height, as the box-built letter had.
  return toTexture(c, { srgb: false, repeat: [1, 10 / P.hologramSize], anisotropy: 1 });
}

function build(spec: PedestalSpec): Built | null {
  const top = spec.tiers[spec.tiers.length - 1];
  if (!top) return null;
  const tiers: THREE.BufferGeometry[] = [];
  const rings: THREE.BufferGeometry[] = [];
  let y = 0;
  for (const t of spec.tiers) {
    tiers.push(new THREE.CylinderGeometry(t.radius, t.radius, t.height, 8).rotateY(OCTAGON_TURN).translate(0, y + t.height / 2, 0));
    rings.push(
      new THREE.TorusGeometry(t.radius + P.ringGap, P.ringTube, 8, 64)
        .rotateX(Math.PI / 2)
        .translate(0, y + t.height, 0),
    );
    y += t.height;
  }
  const rd = Math.max(0.3, top.radius - P.daisInset);
  const dais = new THREE.CylinderGeometry(rd, rd, P.daisHeight, 8, 1, true).rotateY(OCTAGON_TURN).translate(0, y + P.daisHeight / 2, 0);
  rings.push(
    new THREE.TorusGeometry(rd + 0.02, 0.02, 8, 64)
      .rotateX(Math.PI / 2)
      .translate(0, y + P.daisHeight, 0),
  );
  const stackTop = y + P.daisHeight;
  const bolt = logoPart(LOGO_X_BOLT, P.hologramSize, P.hologramDepth);
  const blade = logoPart(LOGO_X_BLADE, P.hologramSize, P.hologramDepth);
  // Projector cone: from a small disc on the dais up to the letter's underside.
  const coneH = P.hologramLift + 0.15;
  const cone = new THREE.CylinderGeometry(P.hologramSize * 0.42, 0.3, coneH, 24, 1, true).translate(0, stackTop + coneH / 2, 0);
  return {
    tiers: mergeParts(tiers),
    rings: mergeParts(rings),
    dais,
    bolt,
    blade,
    boltOutline: new THREE.EdgesGeometry(bolt, 20),
    bladeOutline: new THREE.EdgesGeometry(blade, 20),
    cone,
    scan: scanLines(),
    stackTop,
  };
}

/** The floating, turning letter. Refs only — nothing re-renders per frame. */
function HologramX({ b }: { b: Built }) {
  const group = useRef<THREE.Group>(null);
  const material = useRef<THREE.MeshStandardMaterial>(null);
  const restY = b.stackTop + P.hologramLift + P.hologramSize / 2;
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    g.rotation.y += delta * SPIN;
    g.position.y = restY + Math.sin(state.clock.elapsedTime * BOB_RATE) * BOB;
    // The scan lines scroll: the bolt material's alpha map is the texture
    // built above, reached through the material ref (never through the
    // props). The blade shares the same texture, so both parts move in step.
    const scan = material.current?.alphaMap;
    if (scan) scan.offset.y = (scan.offset.y - delta * SCAN_SCROLL) % 1;
  });
  if (!b.bolt || !b.blade) return null;
  return (
    <>
      <group ref={group} position={[0, restY, 0]}>
        {/* the orange lightning bolt — the logo's left half */}
        <mesh geometry={b.bolt}>
          <meshStandardMaterial
            ref={material}
            color={BRAND.orange}
            emissive={BRAND.orange}
            emissiveIntensity={1.9}
            transparent
            opacity={0.72}
            alphaMap={b.scan ?? undefined}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.3}
            metalness={0}
          />
        </mesh>
        {b.boltOutline && (
          <lineSegments geometry={b.boltOutline}>
            <lineBasicMaterial color="#ffc48a" transparent opacity={0.9} depthWrite={false} />
          </lineSegments>
        )}
        {/* the white chrome blade — the logo's right half; a lower emissive
            keeps white from blowing out to a flat slab */}
        <mesh geometry={b.blade}>
          <meshStandardMaterial
            color={BRAND.white}
            emissive={BRAND.white}
            emissiveIntensity={1.1}
            transparent
            opacity={0.72}
            alphaMap={b.scan ?? undefined}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.25}
            metalness={0.3}
          />
        </mesh>
        {b.bladeOutline && (
          <lineSegments geometry={b.bladeOutline}>
            <lineBasicMaterial color="#ffffff" transparent opacity={0.9} depthWrite={false} />
          </lineSegments>
        )}
      </group>
      {b.cone && (
        <mesh geometry={b.cone}>
          <meshStandardMaterial
            color={BRAND.blue}
            emissive={BRAND.blue}
            emissiveIntensity={0.6}
            transparent
            opacity={0.1}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={1}
            metalness={0}
          />
        </mesh>
      )}
    </>
  );
}

export function Pedestal({ spec }: { spec: PedestalSpec }) {
  const b = useBuilt(spec, build);
  if (!b) return null;
  return (
    <group position={spec.center}>
      <HologramX b={b} />
      {b.tiers && (
        <mesh geometry={b.tiers}>
          <meshStandardMaterial color="#2a2f3a" roughness={0.9} metalness={0.05} />
        </mesh>
      )}
      {b.rings && (
        <mesh geometry={b.rings}>
          <meshStandardMaterial color={BRAND.blue} emissive={BRAND.blue} emissiveIntensity={2.2} roughness={0.35} metalness={0.2} />
        </mesh>
      )}
      {b.dais && (
        <mesh geometry={b.dais}>
          <meshStandardMaterial
            color={BRAND.blue}
            emissive={BRAND.blue}
            emissiveIntensity={0.8}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.2}
            metalness={0}
          />
        </mesh>
      )}
    </group>
  );
}
