"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — plaza pedestal (P1-ART-09).

   Three draw calls: the octagonal tiers stacked from the ground, merged into
   one dark-concrete geometry; an emissive primary-blue ring at the top edge
   of every tier (plus the lip of the dais) merged into one; and a 0.6 m
   translucent glass "dais" ring inset on the top tier. Octagons are turned
   22.5° so a flat face looks down each axis.

   Above the dais floats the hologram: a full 3D letter "X" (two crossed
   bars, one merged geometry) in translucent primary blue with horizontal
   scan lines (an alpha map that scrolls) and a glowing edge outline, turning
   slowly about +Y and bobbing, with a faint projector cone from the dais up
   to it. Three more draw calls (letter, outline, cone).

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
  letter: THREE.BufferGeometry | null;
  outline: THREE.BufferGeometry | null;
  cone: THREE.BufferGeometry | null;
  scan: THREE.CanvasTexture | null;
  /** Height of the dais top above the pedestal's base. */
  stackTop: number;
};

/** Two bars crossed at ±45° in the XY plane, centred on the origin. */
function letterX(size: number, depth: number): THREE.BufferGeometry | null {
  const barW = size * 0.3;
  // A bar's diagonal reach: its half-length along the 45° axis must land the
  // bar ends on the letter's bounding square.
  const barL = size * Math.SQRT2 - barW;
  const a = new THREE.BoxGeometry(barW, barL, depth).rotateZ(Math.PI / 4);
  const b = new THREE.BoxGeometry(barW, barL, depth).rotateZ(-Math.PI / 4);
  return mergeParts([a, b]);
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
  return toTexture(c, { srgb: false, repeat: [1, 10], anisotropy: 1 });
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
  const letter = letterX(P.hologramSize, P.hologramDepth);
  const outline = letter ? new THREE.EdgesGeometry(letter, 20) : null;
  // Projector cone: from a small disc on the dais up to the letter's underside.
  const coneH = P.hologramLift + 0.15;
  const cone = new THREE.CylinderGeometry(P.hologramSize * 0.42, 0.3, coneH, 24, 1, true).translate(0, stackTop + coneH / 2, 0);
  return { tiers: mergeParts(tiers), rings: mergeParts(rings), dais, letter, outline, cone, scan: scanLines(), stackTop };
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
    // The scan lines scroll: the material's alpha map is the texture built
    // above, reached through the material ref (never through the props).
    const scan = material.current?.alphaMap;
    if (scan) scan.offset.y = (scan.offset.y - delta * SCAN_SCROLL) % 1;
  });
  if (!b.letter) return null;
  return (
    <>
      <group ref={group} position={[0, restY, 0]}>
        <mesh geometry={b.letter}>
          <meshStandardMaterial
            ref={material}
            color={BRAND.blue}
            emissive={BRAND.blue}
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
        {b.outline && (
          <lineSegments geometry={b.outline}>
            <lineBasicMaterial color="#9fd3ff" transparent opacity={0.9} depthWrite={false} />
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
