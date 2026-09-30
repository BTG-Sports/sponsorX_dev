"use client";

/* --------------------------------------------------------------------------
   Cyberpunk city — shared helpers for the procedural venues (P1-ART-09).

   The venues are the parts of the environment the asset kit cannot provide:
   painted sports surfaces, hoops, goals, the plaza pedestal, the tower crown,
   the hologram gantry and the overhead cables. They share three needs:

   - canvas-drawn textures (a 2D canvas → THREE.CanvasTexture, sRGB for colour
     and emissive maps, deterministic speckle noise from a seeded PRNG so a
     venue looks the same every render and never calls Math.random() in
     render);
   - merged geometry (many small cylinders, tori, boxes → one BufferGeometry,
     one draw call);
   - lifetime: everything is built once per spec in useMemo and disposed on
     unmount, through `useBuilt`.

   MeshStandardMaterial only — no custom shaders. Emissive lines glow under
   the scene's bloom because they are drawn bright on a black emissive map.
   -------------------------------------------------------------------------- */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { dotsForCoverage, paintSpeckle, parseHex, type Rgb } from "@/lib/city/speckle";

export const BRAND = {
  blue: "#2e9bf5",
  orange: "#f97a1f",
  ink: "#0a0c10",
  white: "#eef2f6",
} as const;

/** Longest canvas edge. The desktop tier uses 2048, lite halves it. */
export type TextureSize = 1024 | 2048;

export const deg = (d: number) => (d * Math.PI) / 180;

/** Deterministic PRNG (mulberry32) so speckle noise is stable per venue. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Canvas2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/** A 2D canvas, or null on the server (no document) — callers render nothing. */
export function makeCanvas(w: number, h: number): Canvas2D | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas, ctx, w: canvas.width, h: canvas.height };
}

/** One scratch canvas the speckle layers are composed on, reused across
 *  calls (painting is sequential) and resized to the largest surface seen. */
let scratch: Canvas2D | null = null;

function scratchLayer(w: number, h: number): Canvas2D | null {
  if (scratch && scratch.w === w && scratch.h === h) return scratch;
  if (scratch) {
    scratch.canvas.width = w;
    scratch.canvas.height = h;
    scratch = { ...scratch, w, h };
    return scratch;
  }
  scratch = makeCanvas(w, h);
  return scratch;
}

/** Speckle overlay: `density` dots per pixel of `tint` at `alpha`. Respects
 *  the current clip, so callers clip to the region they want grained.
 *
 *  The dots are written into pixel data (lib/city/speckle.ts) and composited
 *  with one drawImage, never drawn one fillRect at a time: a 2048² surface
 *  at density 0.03 is 126 000 rects, the GPU process took seconds to
 *  rasterise that for the four venues, and every WebGL command behind them
 *  on the same channel — the shader links, the first frame — waited. The
 *  dot is rounded to whole pixels and the count adjusted so the covered
 *  area is what the caller asked for. */
export function speckle(c: Canvas2D, density: number, alpha: number, tint: string, rand: () => number, dot = 1.5) {
  const { ctx, w, h } = c;
  const size = Math.max(1, Math.round(dot));
  const n = dotsForCoverage(Math.floor(w * h * density), dot, size);
  if (n === 0) return;
  const layer = scratchLayer(w, h);
  if (!layer) return;
  const image = layer.ctx.createImageData(w, h);
  paintSpeckle(image.data, w, h, n, parseHex(tint) ?? resolveRgb(ctx, tint), size, rand);
  layer.ctx.putImageData(image, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

/** Any CSS colour → [r, g, b], through the canvas's own normalisation. */
function resolveRgb(ctx: CanvasRenderingContext2D, color: string): Rgb {
  const prev = ctx.fillStyle;
  ctx.fillStyle = color;
  const normalised = typeof ctx.fillStyle === "string" ? ctx.fillStyle : "#000000";
  ctx.fillStyle = prev;
  return parseHex(normalised) ?? [0, 0, 0];
}

/** Stroke width in canvas px for a line `metres` wide at `k` px/m, never
 *  thinner than 2 px so it survives mipmapping at distance. */
export const linePx = (metres: number, k: number) => Math.max(2, metres * k);

export function strokeLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function fillDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export interface TextureOpts {
  /** Colour / emissive data (default) vs. linear data. */
  srgb?: boolean;
  repeat?: [number, number];
  anisotropy?: number;
}

export function toTexture(c: Canvas2D, opts: TextureOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c.canvas);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = opts.anisotropy ?? 4;
  t.needsUpdate = true;
  return t;
}

/** Merge parts into one geometry (one draw call) and dispose the parts. Null
 *  when there is nothing to merge. */
export function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged ?? null;
}

/** The same part at the opposite end of a venue: rotated 180° about the
 *  venue's centre (a rotation, so winding and normals stay right). */
export function mirrored(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.clone().rotateY(Math.PI);
}

/** Scale a PlaneGeometry's UVs so a repeating texture tiles every `cell`
 *  metres instead of once per plane. */
export function tileUvs(g: THREE.BufferGeometry, width: number, height: number, cell: number): THREE.BufferGeometry {
  const uv = g.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * width) / cell, (uv.getY(i) * height) / cell);
  uv.needsUpdate = true;
  return g;
}

/** A LineSegments geometry from flat [x,y,z, x,y,z, …] pairs. */
export function lineGeometry(points: number[]): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return g;
}

interface Disposable {
  dispose(): void;
}

const isDisposable = (v: unknown): v is Disposable =>
  typeof v === "object" && v !== null && typeof (v as { dispose?: unknown }).dispose === "function";

/** Build a venue's textures and geometries once per spec (and texture size),
 *  clamp texture anisotropy to what the renderer supports, and dispose every
 *  disposable field on unmount or when the spec changes. Returns null on the
 *  server, where there is no canvas. `build` must be a module-level function
 *  so the memo key is stable. */
export function useBuilt<S, T extends object>(
  spec: S,
  build: (spec: S, size: TextureSize, anisotropy: number) => T | null,
  size: TextureSize = 2048,
): T | null {
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());
  const anisotropy = Math.min(4, Math.max(1, maxAnisotropy));
  const built = useMemo(
    () => (typeof document === "undefined" ? null : build(spec, size, anisotropy)),
    [spec, build, size, anisotropy],
  );
  useEffect(
    () => () => {
      if (!built) return;
      for (const v of Object.values(built as Record<string, unknown>)) if (isDisposable(v)) v.dispose();
    },
    [built],
  );
  return built;
}
