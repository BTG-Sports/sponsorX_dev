"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — plaza pedestal (P1-ART-09).

   Three draw calls: the octagonal tiers stacked from the ground, merged into
   one dark-concrete geometry; an emissive primary-blue ring at the top edge
   of every tier (plus the lip of the dais) merged into one; and a 0.6 m
   translucent glass "dais" ring inset on the top tier. The top surface is
   left empty for whatever the scene puts there. Octagons are turned 22.5°
   so a flat face looks down each axis.

   Local frame: centre at the origin, no yaw. Collision box:
   lib/city/venue-boxes.ts (shares VENUE_DIMS).
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { PedestalSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import { BRAND, mergeParts, useBuilt } from "./venue-utils";

const P = VENUE_DIMS.pedestal;
const OCTAGON_TURN = Math.PI / 8;

type Built = {
  tiers: THREE.BufferGeometry | null;
  rings: THREE.BufferGeometry | null;
  dais: THREE.BufferGeometry | null;
};

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
  return { tiers: mergeParts(tiers), rings: mergeParts(rings), dais };
}

export function Pedestal({ spec }: { spec: PedestalSpec }) {
  const b = useBuilt(spec, build);
  if (!b) return null;
  return (
    <group position={spec.center}>
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
