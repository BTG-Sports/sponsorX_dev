import { describe, expect, it } from "vitest";

import { worldAabb } from "../src/lib/city/collision";
import type {
  BaseballFieldSpec,
  BasketballCourtSpec,
  Bounds,
  GantryScreenSpec,
  KitManifest,
  PedestalSpec,
  Placement,
  SkyscraperSpec,
  SoccerPitchSpec,
  Vec3,
  VenueSpec,
} from "../src/lib/city/types";
import { VENUE_DIMS, venueBoxes, venueKit } from "../src/lib/city/venue-boxes";

/* P1-ART-09 — the procedural venues are boxed for the layout's no-overlap
   test. These samples are the design spec's site plan values. */

const EMPTY_MANIFEST: KitManifest = { units: "meters", axes: "three.js Y-up", meshes: {}, materials: {} };

const basketball: BasketballCourtSpec = { kind: "basketball", center: [-34, 0, -26], length: 28, width: 15, yaw: 0, hoopInset: 1.575 };
const soccer: SoccerPitchSpec = { kind: "soccer", center: [38, 0, -82], length: 40, width: 20, yaw: 0, goalWidth: 3, goalHeight: 2 };
const baseball: BaseballFieldSpec = {
  kind: "baseball",
  home: [-22, 0, -126],
  bisectorYaw: -135,
  baseDistance: 27.43,
  moundDistance: 18.44,
  fenceRadius: 50,
  backstopRadius: 7,
};
const pedestal: PedestalSpec = {
  kind: "pedestal",
  center: [0, 0, 28],
  tiers: [
    { radius: 3.2, height: 0.5 },
    { radius: 2.4, height: 0.5 },
    { radius: 1.6, height: 0.4 },
  ],
};
const skyscraper: SkyscraperSpec = { kind: "skyscraper", base: [0, 0, -226], height: 128 };
const gantry: GantryScreenSpec = {
  kind: "gantry",
  center: [0, 0, -186],
  span: 20,
  yaw: 0,
  postHeight: 12,
  screen: { width: 16, height: 5, bottomY: 6 },
};

const ALL: VenueSpec[] = [basketball, soccer, baseball, pedestal, skyscraper, gantry];

const world = (p: Placement): Bounds => worldAabb(p, EMPTY_MANIFEST);
const dims = (b: Bounds): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const insideXZ = (inner: Bounds, outer: Bounds, eps = 1e-6) =>
  inner.min[0] >= outer.min[0] - eps && inner.max[0] <= outer.max[0] + eps && inner.min[2] >= outer.min[2] - eps && inner.max[2] <= outer.max[2] + eps;
const containsPoint = (b: Bounds, [x, y, z]: Vec3, eps = 1e-6) =>
  x >= b.min[0] - eps && x <= b.max[0] + eps && y >= b.min[1] - eps && y <= b.max[1] + eps && z >= b.min[2] - eps && z <= b.max[2] + eps;
const byPart = (boxes: Placement[], part: string) => {
  const p = boxes.find((b) => b.id.endsWith(`:${part}`));
  if (!p) throw new Error(`no box for ${part}`);
  return p;
};

describe("venueBoxes — every kind", () => {
  it.each(ALL.map((s) => [s.kind, s] as const))("%s boxes are well-formed venue-layer box placements", (kind, spec) => {
    const boxes = venueBoxes(spec);
    expect(boxes.length).toBeGreaterThan(0);
    const kit = venueKit(spec);
    const ids = new Set<string>();
    for (const p of boxes) {
      expect(p.mesh.startsWith("box:")).toBe(true);
      // flat painted ground is `surface` (things may stand on it); solids are `venue`
      const flat = /:(surface|field|home)$/.test(p.id);
      expect(p.layer, p.id).toBe(flat ? "surface" : "venue");
      expect(p.zone).toBe(kind);
      expect(p.kit).toBe(kit);
      expect(p.id.startsWith(`venue:${kind}:`)).toBe(true);
      expect(ids.has(p.id), `duplicate id ${p.id}`).toBe(false);
      ids.add(p.id);
      expect(p.box).toBeDefined();
      for (const d of dims(p.box!)) expect(d).toBeGreaterThan(0);
      for (const d of dims(world(p))) expect(d).toBeGreaterThan(0);
    }
  });

  it("venueKit is stable per spec and distinct per anchor", () => {
    expect(venueKit(basketball)).toBe(venueKit({ ...basketball }));
    expect(venueKit(basketball)).not.toBe(venueKit({ ...basketball, center: [-34, 0, -27] }));
    expect(venueKit(basketball)).toBe("venue:basketball:-34,-26");
    expect(venueKit(baseball)).toBe("venue:baseball:-22,-126");
  });
});

describe("basketball court", () => {
  it("has a surface of length+4 × width+4 and two hoops inside it", () => {
    const boxes = venueBoxes(basketball);
    expect(boxes).toHaveLength(3);
    const surface = world(byPart(boxes, "surface"));
    expect(dims(surface)[0]).toBeCloseTo(32, 6);
    expect(dims(surface)[2]).toBeCloseTo(19, 6);
    expect(dims(surface)[1]).toBeCloseTo(VENUE_DIMS.surfaceThickness, 6);
    for (const part of ["hoop-a", "hoop-b"]) {
      const hoop = world(byPart(boxes, part));
      expect(insideXZ(hoop, surface), part).toBe(true);
      expect(hoop.max[1]).toBeGreaterThanOrEqual(VENUE_DIMS.basketball.boardBottom + VENUE_DIMS.basketball.boardHeight);
      expect(dims(hoop)[2]).toBeCloseTo(2, 6);
    }
    // Hoops are at opposite ends, each spanning rim → pole.
    const a = world(byPart(boxes, "hoop-a"));
    const b = world(byPart(boxes, "hoop-b"));
    expect(a.min[0]).toBeGreaterThan(basketball.center[0]);
    expect(b.max[0]).toBeLessThan(basketball.center[0]);
    const rimX = basketball.center[0] + basketball.length / 2 - basketball.hoopInset;
    expect(containsPoint(a, [rimX, VENUE_DIMS.basketball.rimHeight, basketball.center[2]])).toBe(true);
  });

  it("rotates with the court's yaw", () => {
    const boxes = venueBoxes({ ...basketball, yaw: 90 });
    const surface = world(byPart(boxes, "surface"));
    // long axis now runs north–south
    expect(dims(surface)[0]).toBeCloseTo(19, 6);
    expect(dims(surface)[2]).toBeCloseTo(32, 6);
    for (const part of ["hoop-a", "hoop-b"]) expect(insideXZ(world(byPart(boxes, part)), surface), part).toBe(true);
  });
});

describe("soccer pitch", () => {
  it("has a turf of length+2 × width+2 and two goals at the ends", () => {
    const boxes = venueBoxes(soccer);
    expect(boxes).toHaveLength(3);
    const turf = world(byPart(boxes, "surface"));
    expect(dims(turf)[0]).toBeCloseTo(42, 6);
    expect(dims(turf)[2]).toBeCloseTo(22, 6);
    for (const part of ["goal-a", "goal-b"]) {
      const goal = world(byPart(boxes, part));
      expect(insideXZ(goal, turf), part).toBe(true);
      expect(goal.max[1]).toBeGreaterThanOrEqual(soccer.goalHeight);
      expect(dims(goal)[2]).toBeGreaterThanOrEqual(soccer.goalWidth);
      expect(dims(goal)[0]).toBeGreaterThanOrEqual(VENUE_DIMS.soccer.goalDepth);
    }
    const a = world(byPart(boxes, "goal-a"));
    // goal-a straddles the +X goal line
    expect(a.min[0]).toBeLessThan(soccer.center[0] + soccer.length / 2);
    expect(a.max[0]).toBeGreaterThan(soccer.center[0] + soccer.length / 2);
  });
});

describe("baseball field", () => {
  const R = baseball.fenceRadius;
  const r0 = VENUE_DIMS.baseball.homeDirtRadius;
  // kit yaw convention: yaw θ is the world direction (sin θ, 0, cos θ)
  const dirFrom = (yaw: number) => (deg: number): Vec3 => {
    const r = ((yaw + deg) * Math.PI) / 180;
    return [Math.sin(r), 0, Math.cos(r)];
  };
  const anyContains = (boxes: Placement[], p: Vec3) => boxes.some((b) => containsPoint(world(b), p));

  it("boxes the grass sector and the home circle as world-aligned surfaces", () => {
    const boxes = venueBoxes(baseball);
    expect(boxes).toHaveLength(2);
    const field = world(byPart(boxes, "field"));
    const home = world(byPart(boxes, "home"));
    const [hx, , hz] = baseball.home;
    const dir = dirFrom(baseball.bisectorYaw);
    const at = (d: Vec3, t: number): Vec3 => [hx + d[0] * t, 0.01, hz + d[2] * t];
    // the plan: bisector −135° runs toward −X,−Z; foul lines along −Z and −X
    expect(dir(0)[0]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(dir(0)[2]).toBeCloseTo(-Math.SQRT1_2, 6);
    expect(dir(-45)[2]).toBeCloseTo(-1, 6);
    expect(dir(45)[0]).toBeCloseTo(-1, 6);
    // both are flat surfaces things may stand on (fences, masts), not solids
    for (const b of boxes) {
      expect(b.layer).toBe("surface");
      expect(b.yaw).toBe(0);
    }
    // second base, the fence on the bisector and the foul-line ends are inside
    expect(containsPoint(field, at(dir(0), baseball.baseDistance * Math.SQRT2))).toBe(true);
    expect(containsPoint(field, at(dir(0), baseball.moundDistance))).toBe(true);
    expect(containsPoint(field, at(dir(0), R))).toBe(true);
    expect(containsPoint(field, at(dir(45), 0.99 * R))).toBe(true);
    expect(containsPoint(field, at(dir(-45), 0.99 * R))).toBe(true);
    // the home circle is its own box; beyond it nothing is boxed
    expect(containsPoint(home, at(dir(180), r0 * 0.9))).toBe(true);
    expect(containsPoint(field, at(dir(180), r0 * 0.9))).toBe(false);
    expect(anyContains(boxes, at(dir(180), 10))).toBe(false);
    expect(dims(home)).toEqual([2 * r0, VENUE_DIMS.surfaceThickness, 2 * r0]);
    // world-aligned and tight: foul lines along −X and −Z, so the sector's
    // bounds are exactly [hx−R, hx] × [hz−R, hz]
    expect(field.min[0]).toBeCloseTo(hx - R, 6);
    expect(field.max[0]).toBeCloseTo(hx, 6);
    expect(field.min[2]).toBeCloseTo(hz - R, 6);
    expect(field.max[2]).toBeCloseTo(hz, 6);
    // so the boulevard (x ≥ −12) and block B (z ≥ −108) stay clear
    for (const b of boxes) {
      expect(world(b).max[0]).toBeLessThan(-12);
      expect(world(b).max[2]).toBeLessThan(-108);
    }
  });

  it("includes an axis direction the sector contains (bisector due north)", () => {
    const north: BaseballFieldSpec = { ...baseball, bisectorYaw: 180 };
    const field = world(byPart(venueBoxes(north), "field"));
    const [hx, , hz] = north.home;
    // −Z is inside the sector, so the box reaches the full R north, the tip
    // at home, and R·sin 45° either side
    expect(field.min[2]).toBeCloseTo(hz - R, 6);
    expect(field.max[2]).toBeCloseTo(hz, 6);
    expect(field.min[0]).toBeCloseTo(hx - R * Math.SQRT1_2, 6);
    expect(field.max[0]).toBeCloseTo(hx + R * Math.SQRT1_2, 6);
  });
});

describe("pedestal", () => {
  it("is one box covering the widest tier's ring and the full stack plus dais", () => {
    const boxes = venueBoxes(pedestal);
    expect(boxes).toHaveLength(1);
    const d = dims(world(boxes[0]));
    const rMax = 3.2 + VENUE_DIMS.pedestal.ringGap + VENUE_DIMS.pedestal.ringTube;
    expect(d[0]).toBeCloseTo(2 * rMax, 6);
    expect(d[2]).toBeCloseTo(2 * rMax, 6);
    expect(d[1]).toBeCloseTo(1.4 + VENUE_DIMS.pedestal.daisHeight, 6);
    expect(world(boxes[0]).min[1]).toBeCloseTo(pedestal.center[1], 6);
  });

  it("renders nothing for an empty tier list", () => {
    expect(venueBoxes({ ...pedestal, tiers: [] })).toEqual([]);
  });
});

describe("skyscraper extras", () => {
  it("boxes the crown ring and the warning light, both above the tower's top", () => {
    const boxes = venueBoxes(skyscraper);
    expect(boxes).toHaveLength(2);
    const D = VENUE_DIMS.skyscraper;
    const towerTop = skyscraper.base[1] + skyscraper.height;
    const ring = world(byPart(boxes, "crown-ring"));
    expect((ring.min[1] + ring.max[1]) / 2).toBeCloseTo(towerTop + D.crownRise, 6);
    expect(ring.min[1]).toBeGreaterThan(towerTop);
    expect(dims(ring)[0]).toBeCloseTo(2 * (D.crownRadius + D.crownTube), 6);
    expect(dims(ring)[2]).toBeCloseTo(2 * (D.crownRadius + D.crownTube), 6);
    const light = world(byPart(boxes, "warning-light"));
    expect((light.min[1] + light.max[1]) / 2).toBeCloseTo(towerTop + D.lightRise, 6);
    expect(light.min[1]).toBeGreaterThan(ring.max[1]);
    expect(dims(light)[0]).toBeCloseTo(2 * D.lightRadius, 6);
    expect((light.min[0] + light.max[0]) / 2).toBeCloseTo(skyscraper.base[0], 6);
    expect((light.min[2] + light.max[2]) / 2).toBeCloseTo(skyscraper.base[2], 6);
  });
});

describe("gantry screen", () => {
  it("boxes two posts, the beam and the screen, screen above the posts' feet", () => {
    const boxes = venueBoxes(gantry);
    expect(boxes).toHaveLength(4);
    const D = VENUE_DIMS.gantry;
    const postA = world(byPart(boxes, "post-a"));
    const postB = world(byPart(boxes, "post-b"));
    expect((postA.min[0] + postA.max[0]) / 2).toBeCloseTo(gantry.center[0] + gantry.span / 2, 6);
    expect((postB.min[0] + postB.max[0]) / 2).toBeCloseTo(gantry.center[0] - gantry.span / 2, 6);
    expect(dims(postA)[1]).toBeCloseTo(gantry.postHeight, 6);
    const beam = world(byPart(boxes, "beam"));
    expect((beam.min[1] + beam.max[1]) / 2).toBeCloseTo(gantry.postHeight, 6);
    expect(beam.min[0]).toBeLessThanOrEqual(postB.min[0]);
    expect(beam.max[0]).toBeGreaterThanOrEqual(postA.max[0]);
    const screen = world(byPart(boxes, "screen"));
    expect(screen.min[1]).toBeGreaterThan(postA.min[1]);
    expect(screen.min[1]).toBeCloseTo(gantry.screen.bottomY - D.frame, 6);
    expect(dims(screen)[0]).toBeCloseTo(gantry.screen.width + 2 * D.frame, 6);
    // the screen hangs 1.75 m under the beam here, so the box reaches the beam
    expect(screen.max[1]).toBeCloseTo(gantry.postHeight - D.beamSize / 2, 6);
    // and stays between the posts
    expect(screen.min[0]).toBeGreaterThan(postB.max[0]);
    expect(screen.max[0]).toBeLessThan(postA.min[0]);
  });

  it("keeps the screen box to the screen when it hangs inside the beam", () => {
    const tall = { ...gantry, screen: { width: 16, height: 5, bottomY: 7 } };
    const screen = world(byPart(venueBoxes(tall), "screen"));
    expect(screen.max[1]).toBeCloseTo(12 + VENUE_DIMS.gantry.frame, 6);
  });
});
