"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — basketball court (P1-ART-09).

   One venue, five draw calls: the acrylic surface (court plus a 2 m apron,
   FIBA markings in accent orange drawn on a colour canvas and again on a
   black emissive canvas so the lines bloom), both hoops' poles and arms
   merged, both backboards merged (one translucent canvas texture), both rims
   merged (emissive orange tori) and both nets as one LineSegments. The hoop
   at local +X is built once and the other is the same geometry rotated 180°
   about the court centre. `hoopInset` is the rim centre's distance from the
   baseline; the three-point and restricted-area arcs are centred on it.

   Local frame: length along +X, width along Z, centre at the origin; the
   <group> applies the spec's centre and yaw. Collision boxes for this come
   from lib/city/venue-boxes.ts, which shares VENUE_DIMS with this file.
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { BasketballCourtSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import {
  BRAND,
  type Canvas2D,
  deg,
  lineGeometry,
  linePx,
  makeCanvas,
  mergeParts,
  mirrored,
  mulberry32,
  speckle,
  strokeLine,
  type TextureSize,
  toTexture,
  useBuilt,
} from "./venue-utils";

const D = VENUE_DIMS.basketball;
const LIFT = VENUE_DIMS.surfaceLift;
const LINE_WIDTH = 0.05;
const KEY_DEPTH = 5.8;
const KEY_WIDTH = 4.9;
const CIRCLE_R = 1.8;
const THREE_POINT_R = 6.75;
const THREE_POINT_SIDE_GAP = 0.9;
const RESTRICTED_R = 1.25;

type Built = {
  surfaceMap: THREE.CanvasTexture;
  surfaceGlow: THREE.CanvasTexture;
  boardMap: THREE.CanvasTexture;
  boardGlow: THREE.CanvasTexture;
  posts: THREE.BufferGeometry | null;
  boards: THREE.BufferGeometry | null;
  rims: THREE.BufferGeometry | null;
  nets: THREE.BufferGeometry;
};

/** Court markings. `color` paints the acrylic and tints under the lines;
 *  `glow` paints only the lines on black for the emissive map. */
function paintSurface(c: Canvas2D, spec: BasketballCourtSpec, k: number, layer: "color" | "glow") {
  const { ctx, w, h } = c;
  const L = spec.length;
  const W = spec.width;
  const px = (x: number) => w / 2 + x * k;
  const pz = (z: number) => h / 2 + z * k;

  if (layer === "color") {
    ctx.fillStyle = "#10131b"; // apron
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#141a2a"; // acrylic
    ctx.fillRect(px(-L / 2), pz(-W / 2), L * k, W * k);
    const rand = mulberry32(0x5b);
    speckle(c, 0.02, 0.1, "#2a3350", rand);
    speckle(c, 0.01, 0.14, "#090b11", rand);
    ctx.fillStyle = "rgba(249,122,31,0.10)";
    for (const s of [1, -1]) ctx.fillRect(px(Math.min((s * L) / 2, s * (L / 2 - KEY_DEPTH))), pz(-KEY_WIDTH / 2), KEY_DEPTH * k, KEY_WIDTH * k);
    ctx.beginPath();
    ctx.arc(px(0), pz(0), CIRCLE_R * k, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
  }

  ctx.strokeStyle = BRAND.orange;
  ctx.lineWidth = linePx(LINE_WIDTH, k);
  ctx.lineCap = "butt";
  ctx.strokeRect(px(-L / 2), pz(-W / 2), L * k, W * k);
  strokeLine(ctx, px(0), pz(-W / 2), px(0), pz(W / 2));
  ctx.beginPath();
  ctx.arc(px(0), pz(0), CIRCLE_R * k, 0, Math.PI * 2);
  ctx.stroke();

  for (const s of [1, -1]) {
    const baseline = (s * L) / 2;
    const ftLine = s * (L / 2 - KEY_DEPTH);
    const basket = s * (L / 2 - spec.hoopInset);
    // key and the free-throw semicircle on the court-centre side. Canvas arcs
    // sweep clockwise on screen; the far end draws anticlockwise so both
    // semicircles bulge toward the centre.
    ctx.strokeRect(px(Math.min(baseline, ftLine)), pz(-KEY_WIDTH / 2), KEY_DEPTH * k, KEY_WIDTH * k);
    ctx.beginPath();
    ctx.arc(px(ftLine), pz(0), CIRCLE_R * k, Math.PI / 2, -Math.PI / 2, s < 0);
    ctx.stroke();
    // three-point arc joined to straight segments 0.9 m in from the sidelines
    const dz = W / 2 - THREE_POINT_SIDE_GAP;
    if (dz < THREE_POINT_R) {
      const dx = Math.sqrt(THREE_POINT_R * THREE_POINT_R - dz * dz);
      ctx.beginPath();
      ctx.arc(px(basket), pz(0), THREE_POINT_R * k, Math.atan2(dz, -s * dx), Math.atan2(-dz, -s * dx), s < 0);
      ctx.stroke();
      for (const t of [1, -1]) strokeLine(ctx, px(baseline), pz(t * dz), px(basket - s * dx), pz(t * dz));
    }
    // restricted area under the basket
    ctx.beginPath();
    ctx.arc(px(basket), pz(0), RESTRICTED_R * k, Math.PI / 2, -Math.PI / 2, s < 0);
    ctx.stroke();
    for (const t of [1, -1]) strokeLine(ctx, px(basket), pz(t * RESTRICTED_R), px(basket + s * 0.375), pz(t * RESTRICTED_R));
  }
}

/** Backboard: translucent white with the orange target rectangle whose bottom
 *  edge sits at rim height, and an orange border. `glow` = emissive layer. */
function paintBoard(c: Canvas2D, glow: boolean) {
  const { ctx, w, h } = c;
  const k = w / D.boardWidth;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = glow ? "#000000" : "rgba(205,216,232,0.55)";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = BRAND.orange;
  ctx.lineWidth = Math.max(3, LINE_WIDTH * k);
  const lw = ctx.lineWidth;
  ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
  const iw = 0.59 * k;
  const ih = 0.45 * k;
  const bottom = h - (D.rimHeight - D.boardBottom) * k;
  ctx.strokeRect(w / 2 - iw / 2, bottom - ih, iw, ih);
}

/** The hoop at local +X, facing the court centre. */
function hoopParts(spec: BasketballCourtSpec) {
  const xRim = spec.length / 2 - spec.hoopInset;
  const xBoard = xRim + D.boardOffset;
  const xPole = xBoard + D.armLength;
  const armY = D.poleHeight - 0.1;
  const pole = new THREE.CylinderGeometry(D.poleRadius, D.poleRadius, D.poleHeight, 12).translate(xPole, D.poleHeight / 2, 0);
  const arm = new THREE.CylinderGeometry(0.05, 0.05, D.armLength, 8)
    .rotateZ(Math.PI / 2)
    .translate((xPole + xBoard) / 2, armY, 0);
  const board = new THREE.PlaneGeometry(D.boardWidth, D.boardHeight)
    .rotateY(-Math.PI / 2)
    .translate(xBoard, D.boardBottom + D.boardHeight / 2, 0);
  const rim = new THREE.TorusGeometry(D.rimRadius, 0.02, 8, 32)
    .rotateX(Math.PI / 2)
    .translate(xRim, D.rimHeight, 0);
  return { pole, arm, board, rim };
}

/** Both nets as line segments: a zig-zag of two rows of strands from the rim
 *  to a narrower bottom ring. */
function netLines(spec: BasketballCourtSpec): number[] {
  const pts: number[] = [];
  const n = 12;
  const yTop = D.rimHeight;
  const yMid = yTop - 0.2;
  const yBot = yTop - 0.42;
  const rMid = 0.19;
  const rBot = 0.13;
  for (const s of [1, -1]) {
    const xRim = s * (spec.length / 2 - spec.hoopInset);
    const P = (r: number, y: number, a: number) => [xRim + r * Math.cos(a), y, r * Math.sin(a)];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const am = a0 + Math.PI / n;
      const am1 = a1 + Math.PI / n;
      pts.push(...P(D.rimRadius, yTop, a0), ...P(rMid, yMid, am));
      pts.push(...P(D.rimRadius, yTop, a1), ...P(rMid, yMid, am));
      pts.push(...P(rMid, yMid, am), ...P(rBot, yBot, a1));
      pts.push(...P(rMid, yMid, am1), ...P(rBot, yBot, a1));
      pts.push(...P(rBot, yBot, a0), ...P(rBot, yBot, a1));
    }
  }
  return pts;
}

function build(spec: BasketballCourtSpec, size: TextureSize, anisotropy: number): Built | null {
  const surfaceW = spec.length + 2 * D.apron;
  const surfaceD = spec.width + 2 * D.apron;
  const k = size / Math.max(surfaceW, surfaceD);
  const color = makeCanvas(surfaceW * k, surfaceD * k);
  const glow = makeCanvas(surfaceW * k, surfaceD * k);
  const bw = Math.min(512, size / 4);
  const board = makeCanvas(bw, (bw * D.boardHeight) / D.boardWidth);
  const boardGlow = makeCanvas(bw, (bw * D.boardHeight) / D.boardWidth);
  if (!color || !glow || !board || !boardGlow) return null;
  paintSurface(color, spec, k, "color");
  paintSurface(glow, spec, k, "glow");
  paintBoard(board, false);
  paintBoard(boardGlow, true);

  const a = hoopParts(spec);
  return {
    surfaceMap: toTexture(color, { anisotropy }),
    surfaceGlow: toTexture(glow, { anisotropy }),
    boardMap: toTexture(board, { anisotropy }),
    boardGlow: toTexture(boardGlow, { anisotropy }),
    posts: mergeParts([a.pole, a.arm, mirrored(a.pole), mirrored(a.arm)]),
    boards: mergeParts([a.board, mirrored(a.board)]),
    rims: mergeParts([a.rim, mirrored(a.rim)]),
    nets: lineGeometry(netLines(spec)),
  };
}

export function BasketballCourt({ spec, textureSize = 2048 }: { spec: BasketballCourtSpec; textureSize?: TextureSize }) {
  const b = useBuilt(spec, build, textureSize);
  if (!b) return null;
  return (
    <group position={spec.center} rotation-y={deg(spec.yaw)}>
      <mesh rotation-x={-Math.PI / 2} position-y={LIFT}>
        <planeGeometry args={[spec.length + 2 * D.apron, spec.width + 2 * D.apron]} />
        <meshStandardMaterial
          map={b.surfaceMap}
          emissiveMap={b.surfaceGlow}
          emissive="#ffffff"
          emissiveIntensity={2.5}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      {b.posts && (
        <mesh geometry={b.posts}>
          <meshStandardMaterial color="#2b2f38" metalness={0.6} roughness={0.5} />
        </mesh>
      )}
      {b.boards && (
        <mesh geometry={b.boards}>
          <meshStandardMaterial
            map={b.boardMap}
            emissiveMap={b.boardGlow}
            emissive="#ffffff"
            emissiveIntensity={1.6}
            transparent
            opacity={0.9}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.25}
            metalness={0.05}
          />
        </mesh>
      )}
      {b.rims && (
        <mesh geometry={b.rims}>
          <meshStandardMaterial color={BRAND.orange} emissive={BRAND.orange} emissiveIntensity={2} roughness={0.4} metalness={0.3} />
        </mesh>
      )}
      <lineSegments geometry={b.nets}>
        <lineBasicMaterial color="#d8dee8" transparent opacity={0.8} />
      </lineSegments>
    </group>
  );
}
