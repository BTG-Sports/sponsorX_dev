import { describe, expect, it } from "vitest";
import { contains, exempt, findOverlaps, intersects, overlapDepth, outsideSite, worldAabb } from "@/lib/city/collision";
import type { KitManifest, Placement } from "@/lib/city/types";

/* --------------------------------------------------------------------------
   Collision math for the cyberpunk city layout (P1-ART-09): rotated/scaled
   bounds, the touching tolerance, the two exemptions, and the grid sweep.
   -------------------------------------------------------------------------- */

const manifest = {
  units: "m",
  axes: "y-up",
  materials: {},
  meshes: {
    // a 2 (x) × 1 (y) × 4 (z) block whose pivot sits on the +X/−Z corner, like the kit's tiles
    tile: { file: "tile.fbx", dims: [4, 0.14, 4], min: [-4, -0.14, 0], max: [0, 0, 4], tris: 2, materials: [] },
    // a 2 × 1 × 4 block centred on its pivot
    slab: { file: "slab.fbx", dims: [2, 1, 4], min: [-1, 0, -2], max: [1, 1, 2], tris: 12, materials: [] },
    // a thin 0.1 × 2 × 3 panel
    panel: { file: "panel.fbx", dims: [0.1, 2, 3], min: [-0.05, 0, -1.5], max: [0.05, 2, 1.5], tris: 2, materials: [] },
  },
} satisfies KitManifest;

const place = (id: string, mesh: string, position: [number, number, number], yaw = 0, extra: Partial<Placement> = {}): Placement => ({
  id,
  mesh,
  position,
  yaw,
  scale: 1,
  layer: "structure",
  zone: "test",
  ...extra,
});

describe("worldAabb", () => {
  it("translates unrotated local bounds", () => {
    const b = worldAabb(place("a", "slab", [10, 0, -5]), manifest);
    expect(b.min).toEqual([9, 0, -7]);
    expect(b.max).toEqual([11, 1, -3]);
  });

  it("rotates by yaw about +Y (three.js convention: local +Z → world +X at 90°)", () => {
    const b = worldAabb(place("a", "slab", [0, 0, 0], 90), manifest);
    // the 4 m axis now lies along X, the 2 m axis along Z
    expect(b.min[0]).toBeCloseTo(-2, 6);
    expect(b.max[0]).toBeCloseTo(2, 6);
    expect(b.min[2]).toBeCloseTo(-1, 6);
    expect(b.max[2]).toBeCloseTo(1, 6);
  });

  it("applies uniform and per-axis scale before rotation", () => {
    const u = worldAabb(place("u", "slab", [0, 0, 0], 0, { scale: 2 }), manifest);
    expect(u.max).toEqual([2, 2, 4]);
    const v = worldAabb(place("v", "panel", [0, 0, 0], 90, { scale: [1, 1, 2] }), manifest);
    expect(v.min[0]).toBeCloseTo(-3, 6);
    expect(v.max[0]).toBeCloseTo(3, 6);
  });

  it("uses the placement's own box for procedural meshes and rejects one without", () => {
    const b = worldAabb(place("b", "box:thing", [1, 2, 3], 0, { box: { min: [-1, 0, -1], max: [1, 3, 1] } }), manifest);
    expect(b.min).toEqual([0, 2, 2]);
    expect(b.max).toEqual([2, 5, 4]);
    expect(() => worldAabb(place("c", "box:naked", [0, 0, 0]), manifest)).toThrow(/needs bounds/);
    expect(() => worldAabb(place("d", "nope", [0, 0, 0]), manifest)).toThrow(/unknown kit mesh/);
  });
});

describe("intersects / overlapDepth / contains", () => {
  const a = { min: [0, 0, 0] as [number, number, number], max: [2, 2, 2] as [number, number, number] };
  it("treats touching faces as not overlapping", () => {
    const b = { min: [2, 0, 0] as [number, number, number], max: [4, 2, 2] as [number, number, number] };
    expect(overlapDepth(a, b)).toBe(0);
    expect(intersects(a, b)).toBe(false);
  });
  it("tolerates grazing within EPSILON but not beyond", () => {
    const graze = { min: [1.99, 0, 0] as [number, number, number], max: [4, 2, 2] as [number, number, number] };
    expect(intersects(a, graze)).toBe(false);
    const deep = { min: [1.9, 0, 0] as [number, number, number], max: [4, 2, 2] as [number, number, number] };
    expect(intersects(a, deep)).toBe(true);
    expect(overlapDepth(a, deep)).toBeCloseTo(0.1, 6);
  });
  it("is disjoint when separated on any single axis", () => {
    const above = { min: [0, 5, 0] as [number, number, number], max: [2, 6, 2] as [number, number, number] };
    expect(intersects(a, above)).toBe(false);
  });
  it("contains", () => {
    expect(contains(a, { min: [0.5, 0.5, 0.5], max: [1, 1, 1] })).toBe(true);
    expect(contains(a, { min: [0.5, 0.5, 0.5], max: [3, 1, 1] })).toBe(false);
  });
});

describe("exempt", () => {
  it("allows ground under anything but not ground over ground", () => {
    const g1 = place("g1", "tile", [0, 0, 0], 0, { layer: "ground" });
    const g2 = place("g2", "tile", [0, 0, 0], 0, { layer: "ground" });
    const s = place("s", "slab", [0, 0, 0]);
    expect(exempt(g1, s)).toBe(true);
    expect(exempt(s, g1)).toBe(true);
    expect(exempt(g1, g2)).toBe(false);
  });
  it("lets objects stand on a venue surface, keeps surfaces off each other, and surfaces on ground", () => {
    const court = place("court", "slab", [0, 0, 0], 0, { layer: "surface" });
    const pitch = place("pitch", "slab", [0, 0, 0], 0, { layer: "surface" });
    const hoop = place("hoop", "slab", [0, 0, 0]);
    const bench = place("bench", "slab", [0, 0, 0], 0, { layer: "prop" });
    const tile = place("tile", "tile", [0, 0, 0], 0, { layer: "ground" });
    expect(exempt(court, hoop)).toBe(true);
    expect(exempt(bench, court)).toBe(true);
    expect(exempt(court, tile)).toBe(true);
    expect(exempt(court, pitch)).toBe(false);
  });

  it("allows parts of the same kit, not different kits", () => {
    const a = place("a", "slab", [0, 0, 0], 0, { kit: "k" });
    const b = place("b", "slab", [0, 0, 0], 0, { kit: "k" });
    const c = place("c", "slab", [0, 0, 0], 0, { kit: "other" });
    expect(exempt(a, b)).toBe(true);
    expect(exempt(a, c)).toBe(false);
  });
});

describe("findOverlaps", () => {
  it("reports interpenetrating structures, deepest first, and nothing for a clean grid", () => {
    const clean = [place("a", "slab", [0, 0, 0]), place("b", "slab", [2, 0, 0]), place("c", "slab", [0, 0, 4])];
    expect(findOverlaps(clean, manifest)).toEqual([]);
    const dirty = [...clean, place("d", "slab", [0.5, 0, 0]), place("e", "slab", [1.9, 0, 0])];
    const found = findOverlaps(dirty, manifest);
    expect(found.map((o) => `${o.a}-${o.b}`)).toContain("a-d");
    expect(found[0].depth).toBeGreaterThanOrEqual(found[found.length - 1].depth);
  });

  it("finds pairs that straddle grid cells (large objects)", () => {
    const big = place("big", "slab", [0, 0, 0], 0, { scale: 20 }); // 40 × 20 × 80
    const small = place("small", "panel", [15, 3, 30]);
    expect(findOverlaps([big, small], manifest).length).toBe(1);
  });

  it("does not double-report a pair seen in several cells", () => {
    const a = place("a", "slab", [0, 0, 0], 0, { scale: 10 });
    const b = place("b", "slab", [1, 0, 1], 0, { scale: 10 });
    expect(findOverlaps([a, b], manifest).length).toBe(1);
  });

  it("honours the exemptions", () => {
    const tile = place("t", "tile", [4, 0, 0], 0, { layer: "ground" });
    const slab = place("s", "slab", [2, 0, 2]);
    const k1 = place("k1", "slab", [50, 0, 50], 0, { kit: "kit" });
    const k2 = place("k2", "slab", [50.5, 0, 50], 0, { kit: "kit" });
    expect(findOverlaps([tile, slab, k1, k2], manifest)).toEqual([]);
  });
});

describe("outsideSite", () => {
  it("lists placements whose box leaves the site", () => {
    const site = { min: [-10, -1, -10] as [number, number, number], max: [10, 10, 10] as [number, number, number] };
    const inside = place("in", "slab", [0, 0, 0]);
    const out = place("out", "slab", [9.5, 0, 0]);
    expect(outsideSite([inside, out], manifest, site)).toEqual(["out"]);
  });
});
