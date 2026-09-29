"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — five-a-side soccer pitch (P1-ART-09).

   Four draw calls: the turf (pitch plus 1 m run-off; mowing stripes across
   the width, grain, futsal markings in white on a colour canvas and on a
   half-resolution black emissive canvas for a slight glow), both goal frames
   plus the four corner-flag poles merged into one white geometry, both goals'
   nets merged into one translucent geometry tiled with a small mesh texture,
   and the four orange pennants as one geometry. The goal at local +X is built
   once; the other is the same geometry rotated 180° about the pitch centre.

   Markings are the futsal set the design asks for: boundary, halfway line,
   centre circle r 3 and spot, six-metre D areas (a 6 m arc from each post
   joined by a straight), penalty marks at 6 m and 10 m, and corner arcs.

   Local frame: length along +X, width along Z, centre at the origin; the
   <group> applies the spec's centre and yaw. Collision boxes come from
   lib/city/venue-boxes.ts, which shares VENUE_DIMS with this file.
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { SoccerPitchSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import {
  BRAND,
  type Canvas2D,
  deg,
  fillDisc,
  linePx,
  makeCanvas,
  mergeParts,
  mirrored,
  mulberry32,
  speckle,
  strokeLine,
  type TextureSize,
  tileUvs,
  toTexture,
  useBuilt,
} from "./venue-utils";

const S = VENUE_DIMS.soccer;
const LIFT = VENUE_DIMS.surfaceLift;
const LINE_WIDTH = 0.08;
const CIRCLE_R = 3;
const D_AREA_R = 6;
const PENALTY_MARKS = [6, 10];
const CORNER_ARC_R = 0.25;
const NET_CELL = 0.12;
const GRASS_A = "#0f5a2a";
const GRASS_B = "#0c4d24";

type Built = {
  turfMap: THREE.CanvasTexture;
  turfGlow: THREE.CanvasTexture;
  netMap: THREE.CanvasTexture;
  frames: THREE.BufferGeometry | null;
  nets: THREE.BufferGeometry | null;
  pennants: THREE.BufferGeometry;
};

function paintTurf(c: Canvas2D, spec: SoccerPitchSpec, k: number, layer: "color" | "glow") {
  const { ctx, w, h } = c;
  const L = spec.length;
  const W = spec.width;
  const gw = spec.goalWidth;
  const px = (x: number) => w / 2 + x * k;
  const pz = (z: number) => h / 2 + z * k;

  if (layer === "color") {
    const stripes = 10;
    const sw = w / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? GRASS_A : GRASS_B;
      ctx.fillRect(i * sw, 0, sw + 1, h);
    }
    const rand = mulberry32(0x50);
    speckle(c, 0.03, 0.06, "#1c6e38", rand);
    speckle(c, 0.01, 0.08, "#073a1a", rand);
    ctx.strokeStyle = "rgba(240,245,240,0.92)";
    ctx.fillStyle = "rgba(240,245,240,0.92)";
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
  }

  ctx.lineWidth = linePx(LINE_WIDTH, k);
  ctx.lineCap = "butt";
  ctx.strokeRect(px(-L / 2), pz(-W / 2), L * k, W * k);
  strokeLine(ctx, px(0), pz(-W / 2), px(0), pz(W / 2));
  ctx.beginPath();
  ctx.arc(px(0), pz(0), CIRCLE_R * k, 0, Math.PI * 2);
  ctx.stroke();
  fillDisc(ctx, px(0), pz(0), 0.12 * k, ctx.fillStyle as string);

  for (const s of [1, -1]) {
    const goalLine = (s * L) / 2;
    // six-metre D: an arc round each post, joined by a straight 6 m out.
    // Canvas arcs sweep clockwise on screen; the far end sweeps the other way.
    ctx.beginPath();
    ctx.arc(px(goalLine), pz(gw / 2), D_AREA_R * k, Math.PI / 2, s > 0 ? Math.PI : 0, s < 0);
    ctx.lineTo(px(s * (L / 2 - D_AREA_R)), pz(-gw / 2));
    ctx.arc(px(goalLine), pz(-gw / 2), D_AREA_R * k, s > 0 ? Math.PI : 0, s > 0 ? 1.5 * Math.PI : -Math.PI / 2, s < 0);
    ctx.stroke();
    for (const d of PENALTY_MARKS) if (d < L / 2 - CIRCLE_R) fillDisc(ctx, px(s * (L / 2 - d)), pz(0), 0.12 * k, ctx.fillStyle as string);
    for (const t of [1, -1]) {
      const start = s > 0 ? (t > 0 ? Math.PI : Math.PI / 2) : t > 0 ? 1.5 * Math.PI : 0;
      ctx.beginPath();
      ctx.arc(px(goalLine), pz((t * W) / 2), CORNER_ARC_R * k, start, start + Math.PI / 2);
      ctx.stroke();
    }
  }
}

/** One cell of goal netting; tiles every NET_CELL metres via RepeatWrapping. */
function paintNet(c: Canvas2D) {
  const { ctx, w, h } = c;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = Math.max(2, w / 24);
  ctx.strokeRect(0, 0, w, h);
}

/** The goal at local +X: posts, crossbar, two back stanchions, a back bar,
 *  two depth bars, and the four net panels (UVs scaled to tile the mesh). */
function goalParts(spec: SoccerPitchSpec) {
  const gw = spec.goalWidth;
  const gh = spec.goalHeight;
  const r = S.postRadius;
  const xl = spec.length / 2;
  const xb = xl + S.goalDepth;
  const frame: THREE.BufferGeometry[] = [];
  for (const t of [1, -1]) {
    frame.push(new THREE.CylinderGeometry(r, r, gh, 10).translate(xl, gh / 2, (t * gw) / 2));
    frame.push(new THREE.CylinderGeometry(0.04, 0.04, gh, 8).translate(xb, gh / 2, (t * gw) / 2));
    frame.push(
      new THREE.CylinderGeometry(0.04, 0.04, S.goalDepth, 8)
        .rotateZ(Math.PI / 2)
        .translate((xl + xb) / 2, gh, (t * gw) / 2),
    );
  }
  frame.push(
    new THREE.CylinderGeometry(r, r, gw + 2 * r, 10)
      .rotateX(Math.PI / 2)
      .translate(xl, gh, 0),
  );
  frame.push(
    new THREE.CylinderGeometry(0.04, 0.04, gw, 8)
      .rotateX(Math.PI / 2)
      .translate(xb, gh, 0),
  );
  const nets: THREE.BufferGeometry[] = [
    tileUvs(new THREE.PlaneGeometry(gw, gh), gw, gh, NET_CELL)
      .rotateY(Math.PI / 2)
      .translate(xb, gh / 2, 0),
    tileUvs(new THREE.PlaneGeometry(S.goalDepth, gw), S.goalDepth, gw, NET_CELL)
      .rotateX(-Math.PI / 2)
      .translate((xl + xb) / 2, gh, 0),
  ];
  for (const t of [1, -1]) nets.push(tileUvs(new THREE.PlaneGeometry(S.goalDepth, gh), S.goalDepth, gh, NET_CELL).translate((xl + xb) / 2, gh / 2, (t * gw) / 2));
  return { frame, nets };
}

function flagPoles(spec: SoccerPitchSpec): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) for (const t of [1, -1]) out.push(new THREE.CylinderGeometry(0.02, 0.02, S.flagHeight, 6).translate((s * spec.length) / 2, S.flagHeight / 2, (t * spec.width) / 2));
  return out;
}

/** Four orange pennants, each a triangle pointing in toward the pitch. */
function pennantGeometry(spec: SoccerPitchSpec): THREE.BufferGeometry {
  const pos: number[] = [];
  const top = S.flagHeight;
  for (const s of [1, -1]) {
    for (const t of [1, -1]) {
      const cx = (s * spec.length) / 2;
      const cz = (t * spec.width) / 2;
      pos.push(cx, top, cz, cx - s * 0.4, top - 0.11, cz, cx, top - 0.22, cz);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function build(spec: SoccerPitchSpec, size: TextureSize, anisotropy: number): Built | null {
  const turfW = spec.length + 2 * S.runoff;
  const turfD = spec.width + 2 * S.runoff;
  const k = size / Math.max(turfW, turfD);
  const color = makeCanvas(turfW * k, turfD * k);
  const glow = makeCanvas((turfW * k) / 2, (turfD * k) / 2);
  const net = makeCanvas(64, 64);
  if (!color || !glow || !net) return null;
  paintTurf(color, spec, k, "color");
  paintTurf(glow, spec, k / 2, "glow");
  paintNet(net);

  const goal = goalParts(spec);
  return {
    turfMap: toTexture(color, { anisotropy }),
    turfGlow: toTexture(glow, { anisotropy }),
    netMap: toTexture(net, { repeat: [1, 1], anisotropy }),
    frames: mergeParts([...goal.frame, ...goal.frame.map(mirrored), ...flagPoles(spec)]),
    nets: mergeParts([...goal.nets, ...goal.nets.map(mirrored)]),
    pennants: pennantGeometry(spec),
  };
}

export function SoccerPitch({ spec, textureSize = 2048 }: { spec: SoccerPitchSpec; textureSize?: TextureSize }) {
  const b = useBuilt(spec, build, textureSize);
  if (!b) return null;
  return (
    <group position={spec.center} rotation-y={deg(spec.yaw)}>
      <mesh rotation-x={-Math.PI / 2} position-y={LIFT}>
        <planeGeometry args={[spec.length + 2 * S.runoff, spec.width + 2 * S.runoff]} />
        <meshStandardMaterial map={b.turfMap} emissiveMap={b.turfGlow} emissive="#ffffff" emissiveIntensity={0.7} roughness={0.9} metalness={0} />
      </mesh>
      {b.frames && (
        <mesh geometry={b.frames}>
          <meshStandardMaterial color={BRAND.white} emissive="#dfe8f2" emissiveIntensity={0.35} roughness={0.5} metalness={0.2} />
        </mesh>
      )}
      {b.nets && (
        <mesh geometry={b.nets}>
          <meshStandardMaterial
            map={b.netMap}
            color="#e6ecf2"
            transparent
            opacity={0.75}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={1}
            metalness={0}
          />
        </mesh>
      )}
      <mesh geometry={b.pennants}>
        <meshStandardMaterial color={BRAND.orange} emissive={BRAND.orange} emissiveIntensity={1.2} side={THREE.DoubleSide} roughness={0.7} />
      </mesh>
    </group>
  );
}
