"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — sandlot baseball field (P1-ART-09).

   Three draw calls: one square plane of side 2·fenceRadius + 4 centred on
   home plate whose canvas is transparent except the grass quarter-disc
   (±45° about the bisector, alpha-tested) and the dirt at home; one merged
   geometry for the three bases, the home-plate pentagon and the pitcher's
   rubber; and a low cone for the mound. Everything else — mowing arcs,
   warning track, the dirt diamond with its grass infield and 1.2 m base
   paths, the home and mound circles, foul lines, batter's and catcher's
   boxes, on-deck circles — is drawn on the one canvas.

   Local frame: home plate at the origin, the bisector (home → second base)
   along local +Z, foul lines at ±45° from it, so `bisectorYaw` follows the
   kit convention (yaw θ ⇒ world direction (sin θ, 0, cos θ)) through the
   <group>'s rotation-y. First base is to the batter's right, local −X.
   Collision box: lib/city/venue-boxes.ts (shares VENUE_DIMS).
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { BaseballFieldSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import {
  type Canvas2D,
  deg,
  fillDisc,
  linePx,
  makeCanvas,
  mergeParts,
  mulberry32,
  speckle,
  strokeLine,
  type TextureSize,
  toTexture,
  useBuilt,
} from "./venue-utils";

const B = VENUE_DIMS.baseball;
const LIFT = VENUE_DIMS.surfaceLift;
const GRASS_A = "#0f5a2a";
const GRASS_B = "#0c4d24";
const DIRT = "#6b4b2c";
const CHALK = "#f4f6f8";
const WEDGE_A0 = Math.PI / 4;
const WEDGE_A1 = (3 * Math.PI) / 4;
const ON_DECK: [number, number][] = [
  [6.5, -1],
  [-6.5, -1],
];

type Built = {
  fieldMap: THREE.CanvasTexture;
  bases: THREE.BufferGeometry | null;
};

function paintField(c: Canvas2D, spec: BaseballFieldSpec, k: number) {
  const { ctx, w, h } = c;
  const R = spec.fenceRadius;
  const d = spec.baseDistance;
  const px = (x: number) => w / 2 + x * k;
  const pz = (z: number) => h / 2 + z * k;
  const rand = mulberry32(0xbb);
  ctx.clearRect(0, 0, w, h);

  // Grass quarter-disc with mowing arcs and a dirt warning track at the fence.
  const wedge = new Path2D();
  wedge.moveTo(px(0), pz(0));
  wedge.arc(px(0), pz(0), R * k, WEDGE_A0, WEDGE_A1);
  wedge.closePath();
  ctx.fillStyle = GRASS_A;
  ctx.fill(wedge);
  const rings = 9;
  const rIn = R - B.warningTrack;
  for (let i = 1; i < rings; i += 2) {
    const r0 = (rIn * i) / rings;
    const r1 = (rIn * (i + 1)) / rings;
    ctx.beginPath();
    ctx.arc(px(0), pz(0), r1 * k, WEDGE_A0, WEDGE_A1);
    ctx.arc(px(0), pz(0), r0 * k, WEDGE_A1, WEDGE_A0, true);
    ctx.closePath();
    ctx.fillStyle = GRASS_B;
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(px(0), pz(0), R * k, WEDGE_A0, WEDGE_A1);
  ctx.arc(px(0), pz(0), rIn * k, WEDGE_A1, WEDGE_A0, true);
  ctx.closePath();
  ctx.fillStyle = DIRT;
  ctx.fill();
  ctx.save();
  ctx.clip(wedge);
  speckle(c, 0.03, 0.07, "#1c6e38", rand);
  speckle(c, 0.01, 0.1, "#062e14", rand);
  ctx.restore();

  // Dirt diamond (home, first, second, third), grass infield inside it.
  const hd = d / Math.SQRT2;
  const square = new Path2D();
  square.moveTo(px(0), pz(0));
  square.lineTo(px(-hd), pz(hd));
  square.lineTo(px(0), pz(2 * hd));
  square.lineTo(px(hd), pz(hd));
  square.closePath();
  ctx.fillStyle = DIRT;
  ctx.fill(square);
  const hi = (d - 2 * B.pathWidth) / Math.SQRT2;
  ctx.beginPath();
  ctx.moveTo(px(0), pz(hd - hi));
  ctx.lineTo(px(-hi), pz(hd));
  ctx.lineTo(px(0), pz(hd + hi));
  ctx.lineTo(px(hi), pz(hd));
  ctx.closePath();
  ctx.fillStyle = GRASS_A;
  ctx.fill();
  fillDisc(ctx, px(0), pz(0), B.homeDirtRadius * k, DIRT);
  fillDisc(ctx, px(0), pz(spec.moundDistance), B.moundRadius * k, DIRT);
  for (const [x, z] of ON_DECK) fillDisc(ctx, px(x), pz(z), 1.5 * k, DIRT);
  ctx.save();
  ctx.clip(square);
  speckle(c, 0.03, 0.09, "#8a6640", rand);
  speckle(c, 0.015, 0.1, "#4a3119", rand);
  ctx.restore();

  // Chalk: foul lines to the fence, batter's boxes, catcher's box, on-deck rings.
  ctx.strokeStyle = CHALK;
  ctx.lineCap = "butt";
  ctx.lineWidth = linePx(0.1, k);
  for (const t of [1, -1]) strokeLine(ctx, px(0), pz(0), px(t * R * Math.SQRT1_2), pz(R * Math.SQRT1_2));
  ctx.lineWidth = linePx(0.06, k);
  for (const t of [1, -1]) ctx.strokeRect(px(t > 0 ? 0.366 : -1.586), pz(-0.7), 1.22 * k, 1.83 * k);
  ctx.strokeRect(px(-0.55), pz(-2.44), 1.1 * k, 1.74 * k);
  for (const [x, z] of ON_DECK) {
    ctx.beginPath();
    ctx.arc(px(x), pz(z), 0.76 * k, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** Bases at first, second and third (edges along the base paths), the home
 *  plate pentagon (tip at the origin, flat edge toward the mound) and the
 *  pitcher's rubber on top of the mound — one white geometry. */
function basesGeometry(spec: BaseballFieldSpec): THREE.BufferGeometry | null {
  const hd = spec.baseDistance / Math.SQRT2;
  const y = LIFT + 0.04;
  const parts: THREE.BufferGeometry[] = [];
  for (const [x, z] of [
    [-hd, hd],
    [0, 2 * hd],
    [hd, hd],
  ]) {
    parts.push(new THREE.BoxGeometry(0.38, 0.08, 0.38).rotateY(Math.PI / 4).translate(x, y, z));
  }
  // ShapeGeometry lies in XY; rotateX(−90°) maps shape (x, y) → world (x, −y).
  const plate = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(-0.216, -0.216),
    new THREE.Vector2(-0.216, -0.432),
    new THREE.Vector2(0.216, -0.432),
    new THREE.Vector2(0.216, -0.216),
  ]);
  parts.push(new THREE.ShapeGeometry(plate).rotateX(-Math.PI / 2).translate(0, LIFT + 0.02, 0));
  parts.push(new THREE.BoxGeometry(0.61, 0.02, 0.15).translate(0, LIFT + B.moundHeight + 0.01, spec.moundDistance));
  return mergeParts(parts);
}

function build(spec: BaseballFieldSpec, size: TextureSize, anisotropy: number): Built | null {
  const side = 2 * spec.fenceRadius + 4;
  const c = makeCanvas(size, size);
  if (!c) return null;
  paintField(c, spec, size / side);
  return { fieldMap: toTexture(c, { anisotropy }), bases: basesGeometry(spec) };
}

export function BaseballField({ spec, textureSize = 2048 }: { spec: BaseballFieldSpec; textureSize?: TextureSize }) {
  const b = useBuilt(spec, build, textureSize);
  if (!b) return null;
  const side = 2 * spec.fenceRadius + 4;
  return (
    <group position={spec.home} rotation-y={deg(spec.bisectorYaw)}>
      <mesh rotation-x={-Math.PI / 2} position-y={LIFT}>
        <planeGeometry args={[side, side]} />
        <meshStandardMaterial map={b.fieldMap} alphaTest={0.5} roughness={0.95} metalness={0} />
      </mesh>
      <mesh position={[0, LIFT + B.moundHeight / 2 - 0.01, spec.moundDistance]}>
        <cylinderGeometry args={[0.9, B.moundRadius, B.moundHeight, 24]} />
        <meshStandardMaterial color={DIRT} roughness={1} metalness={0} />
      </mesh>
      {b.bases && (
        <mesh geometry={b.bases}>
          <meshStandardMaterial color="#f4f6f8" emissive="#dfe6ee" emissiveIntensity={0.25} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}
