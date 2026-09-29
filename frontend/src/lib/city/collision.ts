/* --------------------------------------------------------------------------
   Cyberpunk city — collision math (P1-ART-09). Pure, unit-tested.

   Every Placement becomes a world-space AABB: local bounds (from the manifest,
   or the placement's own `box`) → scaled → rotated by yaw about +Y → the
   rotated corners' extent → translated. "No overlapping objects" is then a
   pairwise test with four exemptions, all explicit:
     1. ground tiles may sit under anything (but never under each other);
     2. a venue surface (court, pitch, diamond) lies on the ground and may
        have objects standing on it, but never another surface;
     3. placements that share a `kit` id may interpenetrate;
     4. boxes may touch: intersection depth ≤ EPSILON is not an overlap.
   -------------------------------------------------------------------------- */
import type { Bounds, KitManifest, Placement, Vec3 } from "./types";

/** Touching (or numerically grazing) faces are not overlaps. */
export const EPSILON = 0.02;

export function localBounds(p: Placement, manifest: KitManifest): Bounds {
  if (p.mesh.startsWith("box:")) {
    if (!p.box) throw new Error(`Placement ${p.id}: box mesh "${p.mesh}" needs bounds`);
    return p.box;
  }
  const m = manifest.meshes[p.mesh];
  if (!m) throw new Error(`Placement ${p.id}: unknown kit mesh "${p.mesh}"`);
  return { min: m.min, max: m.max };
}

const scaleVec = (s: number | Vec3): Vec3 => (typeof s === "number" ? [s, s, s] : s);

/** World-space axis-aligned bounds of a placement. */
export function worldAabb(p: Placement, manifest: KitManifest): Bounds {
  const { min, max } = localBounds(p, manifest);
  const s = scaleVec(p.scale);
  const rad = (p.yaw * Math.PI) / 180;
  const c = Math.cos(rad);
  const sn = Math.sin(rad);
  const out: Bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const lx = x * s[0];
        const ly = y * s[1];
        const lz = z * s[2];
        // three.js rotation about +Y: x' = x cos + z sin ; z' = −x sin + z cos
        const wx = lx * c + lz * sn + p.position[0];
        const wy = ly + p.position[1];
        const wz = -lx * sn + lz * c + p.position[2];
        out.min = [Math.min(out.min[0], wx), Math.min(out.min[1], wy), Math.min(out.min[2], wz)];
        out.max = [Math.max(out.max[0], wx), Math.max(out.max[1], wy), Math.max(out.max[2], wz)];
      }
    }
  }
  return out;
}

/** Intersection depth on the axis where the boxes overlap least (≤ 0 → disjoint). */
export function overlapDepth(a: Bounds, b: Bounds): number {
  let depth = Infinity;
  for (let i = 0; i < 3; i++) {
    const d = Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]);
    if (d < depth) depth = d;
  }
  return depth;
}

export function intersects(a: Bounds, b: Bounds, epsilon = EPSILON): boolean {
  return overlapDepth(a, b) > epsilon;
}

export function contains(outer: Bounds, inner: Bounds, epsilon = EPSILON): boolean {
  for (let i = 0; i < 3; i++) {
    if (inner.min[i] < outer.min[i] - epsilon) return false;
    if (inner.max[i] > outer.max[i] + epsilon) return false;
  }
  return true;
}

/** Should these two placements be allowed to overlap? */
export function exempt(a: Placement, b: Placement): boolean {
  if (a.kit && a.kit === b.kit) return true;
  const ag = a.layer === "ground";
  const bg = b.layer === "ground";
  // ground under a non-ground object is fine; ground over ground is not
  if (ag || bg) return ag !== bg;
  const as = a.layer === "surface";
  const bs = b.layer === "surface";
  // a surface under a non-surface object is fine; surface over surface is not
  if (as || bs) return as !== bs;
  return false;
}

export interface Overlap {
  a: string;
  b: string;
  depth: number;
}

/** Every disallowed pairwise overlap. Uses a uniform grid so 3,000 boxes stay
 *  cheap; correctness does not depend on the cell size. */
export function findOverlaps(placements: Placement[], manifest: KitManifest, epsilon = EPSILON): Overlap[] {
  const boxes = placements.map((p) => worldAabb(p, manifest));
  const CELL = 16;
  const grid = new Map<string, number[]>();
  const key = (x: number, z: number) => `${x},${z}`;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const x0 = Math.floor(b.min[0] / CELL);
    const x1 = Math.floor(b.max[0] / CELL);
    const z0 = Math.floor(b.min[2] / CELL);
    const z1 = Math.floor(b.max[2] / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = key(x, z);
        const list = grid.get(k);
        if (list) list.push(i);
        else grid.set(k, [i]);
      }
    }
  }
  const seen = new Set<string>();
  const out: Overlap[] = [];
  for (const list of grid.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ia = list[i];
        const ib = list[j];
        const pairKey = ia < ib ? `${ia}:${ib}` : `${ib}:${ia}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const pa = placements[ia];
        const pb = placements[ib];
        if (exempt(pa, pb)) continue;
        const depth = overlapDepth(boxes[ia], boxes[ib]);
        if (depth > epsilon) out.push({ a: pa.id, b: pb.id, depth: +depth.toFixed(3) });
      }
    }
  }
  return out.sort((x, y) => y.depth - x.depth);
}

/** Placements whose box leaves the site. */
export function outsideSite(placements: Placement[], manifest: KitManifest, site: Bounds): string[] {
  return placements.filter((p) => !contains(site, worldAabb(p, manifest))).map((p) => p.id);
}
