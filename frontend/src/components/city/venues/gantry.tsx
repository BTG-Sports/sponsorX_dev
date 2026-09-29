"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — hologram gantry screen (P1-ART-09).

   Three draw calls: the steel (two posts, the beam across them, the frame
   round the screen and, when the screen hangs below the beam, two hangers)
   merged into one dark-metal geometry; the screen's front face, a plane with
   a canvas wordmark — "SPONSORX" in primary blue over near-black with a thin
   accent-orange underline, a faint grid and scanlines — used as both the
   colour map and the emissive map so it blooms; and a plain dark back face.

   Local frame: span along X, the screen faces local +Z, centre at ground
   level between the posts; the <group> applies the spec's centre and yaw.
   Collision boxes: lib/city/venue-boxes.ts (shares VENUE_DIMS).
   -------------------------------------------------------------------------- */
import * as THREE from "three";

import type { GantryScreenSpec } from "@/lib/city/types";
import { VENUE_DIMS } from "@/lib/city/venue-boxes";

import { BRAND, type Canvas2D, deg, makeCanvas, mergeParts, strokeLine, type TextureSize, toTexture, useBuilt } from "./venue-utils";

const G = VENUE_DIMS.gantry;
const FRAME_DEPTH = 0.2;
const FACE_OFFSET = FRAME_DEPTH / 2 + 0.005;
const WORDMARK = "SPONSORX";
const FONT_FAMILY = 'Poppins, "Segoe UI", Arial, sans-serif';

type Built = {
  screenMap: THREE.CanvasTexture;
  frame: THREE.BufferGeometry | null;
};

function paintScreen(c: Canvas2D) {
  const { ctx, w, h } = c;
  ctx.fillStyle = BRAND.ink;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
  glow.addColorStop(0, "rgba(46,155,245,0.22)");
  glow.addColorStop(1, "rgba(46,155,245,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(46,155,245,0.07)";
  ctx.lineWidth = 1;
  const cell = Math.max(24, Math.round(w / 32));
  for (let x = 0; x <= w; x += cell) strokeLine(ctx, x + 0.5, 0, x + 0.5, h);
  for (let y = 0; y <= h; y += cell) strokeLine(ctx, 0, y + 0.5, w, y + 0.5);

  // Wordmark: 220 px at the 2048 × 640 reference, scaled to fit 80 % width.
  let fontSize = Math.round(h * 0.34);
  const setFont = () => {
    ctx.font = `700 ${fontSize}px ${FONT_FAMILY}`;
    ctx.letterSpacing = `${Math.round(fontSize * 0.08)}px`;
  };
  setFont();
  const maxWidth = w * 0.8;
  const measured = ctx.measureText(WORDMARK).width;
  if (measured > maxWidth) {
    fontSize = Math.floor((fontSize * maxWidth) / measured);
    setFont();
  }
  const textWidth = ctx.measureText(WORDMARK).width;
  const spacing = Math.round(fontSize * 0.08);
  const textY = h * 0.46;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(46,155,245,0.9)";
  ctx.shadowBlur = fontSize * 0.25;
  ctx.fillStyle = BRAND.blue;
  ctx.fillText(WORDMARK, w / 2 + spacing / 2, textY);
  ctx.shadowBlur = 0;
  const underline = Math.max(3, Math.round(h * 0.012));
  ctx.fillStyle = BRAND.orange;
  ctx.fillRect(w / 2 - textWidth / 2, textY + fontSize * 0.5 + underline * 1.5, textWidth, underline);

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
}

function frameGeometry(spec: GantryScreenSpec): THREE.BufferGeometry | null {
  const { width, height, bottomY } = spec.screen;
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) parts.push(new THREE.BoxGeometry(G.postSize, spec.postHeight, G.postSize).translate((s * spec.span) / 2, spec.postHeight / 2, 0));
  parts.push(new THREE.BoxGeometry(spec.span + G.postSize, G.beamSize, G.beamSize).translate(0, spec.postHeight, 0));
  const f = G.frame;
  const cy = bottomY + height / 2;
  parts.push(new THREE.BoxGeometry(width + 2 * f, f, FRAME_DEPTH).translate(0, bottomY - f / 2, 0));
  parts.push(new THREE.BoxGeometry(width + 2 * f, f, FRAME_DEPTH).translate(0, bottomY + height + f / 2, 0));
  for (const s of [1, -1]) parts.push(new THREE.BoxGeometry(f, height + 2 * f, FRAME_DEPTH).translate(s * (width / 2 + f / 2), cy, 0));
  const beamBottom = spec.postHeight - G.beamSize / 2;
  const screenTop = bottomY + height + f;
  const gap = beamBottom - screenTop;
  if (gap > 0.05) for (const s of [1, -1]) parts.push(new THREE.BoxGeometry(G.hangerSize, gap, G.hangerSize).translate(s * (width / 2 - 0.6), screenTop + gap / 2, 0));
  return mergeParts(parts);
}

function build(spec: GantryScreenSpec, size: TextureSize, anisotropy: number): Built | null {
  const { width, height } = spec.screen;
  const h = Math.min(size, Math.max(64, Math.round((size * height) / width)));
  const c = makeCanvas(size, h);
  if (!c) return null;
  paintScreen(c);
  return { screenMap: toTexture(c, { anisotropy }), frame: frameGeometry(spec) };
}

export function GantryScreen({ spec, textureSize = 2048 }: { spec: GantryScreenSpec; textureSize?: TextureSize }) {
  const b = useBuilt(spec, build, textureSize);
  if (!b) return null;
  const { width, height, bottomY } = spec.screen;
  const cy = bottomY + height / 2;
  return (
    <group position={spec.center} rotation-y={deg(spec.yaw)}>
      {b.frame && (
        <mesh geometry={b.frame}>
          <meshStandardMaterial color="#262a33" metalness={0.7} roughness={0.45} />
        </mesh>
      )}
      <mesh position={[0, cy, FACE_OFFSET]}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial map={b.screenMap} emissiveMap={b.screenMap} emissive="#ffffff" emissiveIntensity={2} roughness={0.35} metalness={0} />
      </mesh>
      <mesh position={[0, cy, -FACE_OFFSET]} rotation-y={Math.PI}>
        <planeGeometry args={[width, height]} />
        <meshStandardMaterial color="#0d1016" roughness={0.8} metalness={0.3} />
      </mesh>
    </group>
  );
}
