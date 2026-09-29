import { describe, expect, it } from "vitest";
import { findOverlaps, outsideSite, worldAabb } from "@/lib/city/collision";
import { authoredPlacements, FILL_COUNT, FILL_SEED, generateFill, getCityLayout, LANDMARKS, manifest, SITE, VENUES, ZONES } from "@/lib/city/layout";
import { PALETTE } from "@/lib/city/palette";
import type { BaseballFieldSpec, BasketballCourtSpec, PedestalSpec, Placement, SkyscraperSpec, SoccerPitchSpec } from "@/lib/city/types";

/* --------------------------------------------------------------------------
   The cyberpunk city site plan (P1-ART-09) — "no overlapping objects" is a
   test, not a promise. Every placement (hand-authored, procedural venue box
   and seeded fill) is boxed from the measured kit bounds and checked pairwise.
   -------------------------------------------------------------------------- */

const describeOverlaps = (ps: Placement[]) =>
  findOverlaps(ps, manifest)
    .slice(0, 25)
    .map((o) => `${o.a} × ${o.b} (${o.depth} m)`)
    .join("\n");

describe("authored placements", () => {
  const authored = authoredPlacements();

  it("exist in quantity and have unique ids", () => {
    expect(authored.length).toBeGreaterThan(1500);
    const ids = new Set(authored.map((p) => p.id));
    expect(ids.size).toBe(authored.length);
  });

  it("use only palette meshes (or procedural boxes)", () => {
    const bad = authored.filter((p) => !p.mesh.startsWith("box:") && !PALETTE[p.mesh]);
    expect(bad.map((p) => `${p.id}:${p.mesh}`)).toEqual([]);
  });

  it("do not overlap outside authored kits", () => {
    const overlaps = findOverlaps(authored, manifest);
    expect(overlaps, describeOverlaps(authored)).toEqual([]);
  });

  it("stay inside the site", () => {
    expect(outsideSite(authored, manifest, SITE)).toEqual([]);
  });

  it("ground tiles tile the road and lots without gaps or double cover", () => {
    const tiles = authored.filter((p) => p.layer === "ground");
    const road = tiles.filter((p) => p.id.startsWith("road:"));
    expect(road.length).toBe(4 * 46);
    const keys = new Set(tiles.map((p) => `${p.mesh}:${p.position[0]},${p.position[2]}`));
    expect(keys.size).toBe(tiles.length);
  });

  it("keeps every structure above ground level", () => {
    const sunk = authored.filter((p) => p.layer !== "ground" && worldAabb(p, manifest).min[1] < -0.65);
    expect(sunk.map((p) => p.id)).toEqual([]);
  });
});

describe("venues", () => {
  const byKind = <T extends { kind: string }>(kind: T["kind"]) => VENUES.find((v) => v.kind === kind) as unknown as T;

  it("has the pedestal at the exact centre of the plaza", () => {
    const p = byKind<PedestalSpec>("pedestal");
    const [x0, x1, z0, z1] = [-28, 28, 8, 48];
    expect(p.center[0]).toBe((x0 + x1) / 2);
    expect(p.center[2]).toBe((z0 + z1) / 2);
    expect(p.tiers.length).toBe(3);
    expect(p.tiers[0].radius).toBeGreaterThan(p.tiers[2].radius);
  });

  it("has a regulation basketball court inside its lot", () => {
    const c = byKind<BasketballCourtSpec>("basketball");
    expect([c.length, c.width]).toEqual([28, 15]);
    const [x0, x1, z0, z1] = ZONES.basketballLot;
    expect(c.center[0] - c.length / 2).toBeGreaterThan(x0 + 2);
    expect(c.center[0] + c.length / 2).toBeLessThan(x1 - 2);
    expect(c.center[2] - c.width / 2).toBeGreaterThan(z0 + 2);
    expect(c.center[2] + c.width / 2).toBeLessThan(z1 - 2);
  });

  it("has a five-a-side soccer pitch inside its lot", () => {
    const s = byKind<SoccerPitchSpec>("soccer");
    expect([s.length, s.width]).toEqual([40, 20]);
    const [x0, x1, z0, z1] = ZONES.soccerLot;
    expect(s.center[0] - s.length / 2).toBeGreaterThan(x0 + 2);
    expect(s.center[0] + s.length / 2).toBeLessThan(x1 - 2);
    expect(s.center[2] - s.width / 2).toBeGreaterThan(z0 + 2);
    expect(s.center[2] + s.width / 2).toBeLessThan(z1 - 2);
  });

  it("has a real-distance baseball field whose outfield arc fits the lot", () => {
    const b = byKind<BaseballFieldSpec>("baseball");
    expect(b.baseDistance).toBeCloseTo(27.43, 2);
    expect(b.moundDistance).toBeCloseTo(18.44, 2);
    const [x0, x1, z0, z1] = ZONES.baseballLot;
    // bisector toward −X/−Z: the arc ends land on the lot's west and north edges
    expect(b.home[0] - b.fenceRadius).toBeGreaterThanOrEqual(x0);
    expect(b.home[2] - b.fenceRadius).toBeGreaterThanOrEqual(z0);
    expect(b.home[0]).toBeLessThan(x1);
    expect(b.home[2]).toBeLessThan(z1);
    expect(b.bisectorYaw).toBe(-135);
  });

  it("has a skyscraper over 100 m tall at the end of the boulevard", () => {
    const s = byKind<SkyscraperSpec>("skyscraper");
    expect(s.height).toBeGreaterThan(100);
    const tower = authoredPlacements().find((p) => p.id === "sky:tower")!;
    const box = worldAabb(tower, manifest);
    expect(box.max[1] - box.min[1]).toBeGreaterThan(100);
    expect(Math.abs(s.base[0])).toBeLessThan(0.01);
  });

  it("exports the five landmark anchors", () => {
    expect(Object.keys(LANDMARKS).sort()).toEqual(["baseball", "basketball", "plaza", "skyscraper", "soccer"]);
  });
});

describe("city fill", () => {
  it("is deterministic and reaches its count", () => {
    const a = generateFill(FILL_SEED, FILL_COUNT.desktop);
    const b = generateFill(FILL_SEED, FILL_COUNT.desktop);
    expect(a).toEqual(b);
    const buildings = a.filter((p) => !p.id.includes(":ac") && !p.id.includes(":vent"));
    expect(buildings.length).toBeGreaterThanOrEqual(FILL_COUNT.desktop * 0.85);
  });

  it("never enters a reserved zone", () => {
    const fill = generateFill(FILL_SEED, FILL_COUNT.desktop);
    const rects = Object.values(ZONES);
    const inside = fill.filter((p) => {
      const b = worldAabb(p, manifest);
      return rects.some(([x0, x1, z0, z1]) => b.max[0] > x0 && b.min[0] < x1 && b.max[2] > z0 && b.min[2] < z1);
    });
    expect(inside.map((p) => p.id)).toEqual([]);
  });
});

describe("full layouts", () => {
  for (const tier of ["desktop", "lite"] as const) {
    it(`${tier}: no overlaps, inside the site, palette-only, ids unique`, () => {
      const layout = getCityLayout(tier);
      const ps = layout.placements;
      expect(new Set(ps.map((p) => p.id)).size).toBe(ps.length);
      expect(ps.filter((p) => !p.mesh.startsWith("box:") && !PALETTE[p.mesh]).map((p) => p.id)).toEqual([]);
      if (tier === "lite") {
        expect(ps.filter((p) => !p.mesh.startsWith("box:") && !PALETTE[p.mesh].tiers.includes("lite")).map((p) => p.id)).toEqual([]);
      }
      expect(findOverlaps(ps, manifest), describeOverlaps(ps)).toEqual([]);
      expect(outsideSite(ps, manifest, SITE)).toEqual([]);
      expect(layout.cables.length).toBeGreaterThan(0);
      expect(layout.venues.length).toBe(6);
    });
  }
});
