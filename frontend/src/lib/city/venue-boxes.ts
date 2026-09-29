/* --------------------------------------------------------------------------
   Cyberpunk city — venue collision boxes (P1-ART-09). Pure, no three.js.

   The procedural venues (components/city/venues/*) are not kit meshes, so the
   layout's no-overlap test cannot measure them from the manifest. This module
   is the other half of each venue component's contract: for a venue spec it
   returns the `box:` placements that bound what the component actually
   renders, expressed in the venue's own frame (position = the spec's anchor,
   yaw = the spec's yaw) so `collision.worldAabb` rotates them exactly as the
   component's <group> does.

   Flat surfaces (court, turf, field, home dirt) are on the `surface` layer,
   which the collision test treats like ground: things may stand on them (a
   fence on the warning track, a mast on the apron), but a surface may not
   lie over another surface. Solid parts (hoops, goals, the pedestal, the
   crown ring and light, the gantry) are on the `venue` layer.

   Every box of one venue carries the same `kit` id (`venueKit(spec)`): the
   collision test reads a shared kit as "authored together, may
   interpenetrate" — the hoop stands on the court, the beam sits on the gantry
   posts. A layout that wants a kit placement to interpenetrate a venue (a
   statue on the pedestal) gives that placement the same kit.

   The dimensions the boxes and the renderers share live in VENUE_DIMS so the
   two cannot drift; the renderers import them from here.
   -------------------------------------------------------------------------- */
import type {
  BaseballFieldSpec,
  BasketballCourtSpec,
  Bounds,
  GantryScreenSpec,
  Layer,
  PedestalSpec,
  Placement,
  SkyscraperSpec,
  SoccerPitchSpec,
  Vec3,
  VenueSpec,
} from "./types";

export const VENUE_DIMS = {
  /** Surfaces float this far above the kit ground tiles (whose tops are y = 0). */
  surfaceLift: 0.02,
  /** Nominal thickness of a flat surface's collision box. */
  surfaceThickness: 0.05,
  basketball: {
    apron: 2,
    rimHeight: 3.05,
    rimRadius: 0.225,
    boardWidth: 1.8,
    boardHeight: 1.05,
    boardBottom: 2.9,
    /** Rim centre sits this far in front of the backboard. */
    boardOffset: 0.15,
    armLength: 1.2,
    poleRadius: 0.09,
    poleHeight: 3.6,
  },
  soccer: {
    runoff: 1,
    /** Shallower than the run-off so the goal (plus post radius) stays inside
     *  the surface box — the layout can then fence to the surface's edge. */
    goalDepth: 0.9,
    postRadius: 0.06,
    flagHeight: 1.5,
  },
  baseball: {
    homeDirtRadius: 4,
    moundRadius: 2.7,
    moundHeight: 0.25,
    pathWidth: 1.2,
    warningTrack: 3,
  },
  pedestal: {
    ringGap: 0.05,
    ringTube: 0.03,
    daisHeight: 0.6,
    daisInset: 0.15,
    /** The rotating hologram "X" above the dais: overall size (width and
     *  height of the letter), bar depth, and the gap above the dais top. */
    hologramSize: 2.6,
    hologramDepth: 0.4,
    hologramLift: 0.9,
  },
  skyscraper: {
    crownRadius: 13,
    crownTube: 0.25,
    /** The kit tower's AABB top is exactly base.y + height, so the crown ring
     *  and the warning light sit above it, clear of the tower's box. */
    crownRise: 0.6,
    lightRadius: 0.5,
    lightRise: 2.0,
  },
  gantry: {
    postSize: 0.6,
    beamSize: 0.5,
    /** Frame bar width around the screen. */
    frame: 0.15,
    /** Total depth of the screen assembly (frame + front and back faces). */
    screenDepth: 0.3,
    hangerSize: 0.2,
  },
} as const;

const fmt = (n: number) => String(Math.round(n * 10) / 10);

function anchor(spec: VenueSpec): Vec3 {
  switch (spec.kind) {
    case "baseball":
      return spec.home;
    case "skyscraper":
      return spec.base;
    default:
      return spec.center;
  }
}

/** Stable id shared by every box of one venue. Placements that must touch or
 *  sit inside the venue (its kit tower, a statue on the pedestal) use it as
 *  their `kit` so the collision test exempts the pair. */
export function venueKit(spec: VenueSpec): string {
  const [x, , z] = anchor(spec);
  return `venue:${spec.kind}:${fmt(x)},${fmt(z)}`;
}

interface BoxArgs {
  kit: string;
  part: string;
  mesh: string;
  position: Vec3;
  yaw: number;
  zone: VenueSpec["kind"];
  min: Vec3;
  max: Vec3;
  /** `surface` for flat painted ground, `venue` (default) for solid parts. */
  layer?: Layer;
}

function box(a: BoxArgs): Placement {
  const b: Bounds = { min: a.min, max: a.max };
  return {
    id: `${a.kit}:${a.part}`,
    mesh: `box:${a.mesh}`,
    position: a.position,
    yaw: a.yaw,
    scale: 1,
    layer: a.layer ?? "venue",
    kit: a.kit,
    zone: a.zone,
    box: b,
  };
}

function basketball(spec: BasketballCourtSpec): Placement[] {
  const D = VENUE_DIMS.basketball;
  const kit = venueKit(spec);
  const base = { kit, position: spec.center, yaw: spec.yaw, zone: spec.kind } as const;
  const hx = spec.length / 2 + D.apron;
  const hz = spec.width / 2 + D.apron;
  const out: Placement[] = [
    box({ ...base, part: "surface", mesh: "basketball-surface", layer: "surface", min: [-hx, 0, -hz], max: [hx, VENUE_DIMS.surfaceThickness, hz] }),
  ];
  const top = Math.max(D.boardBottom + D.boardHeight, D.poleHeight);
  const hw = Math.max(D.boardWidth / 2, 1);
  for (const [s, name] of [
    [1, "a"],
    [-1, "b"],
  ] as const) {
    const xRim = s * (spec.length / 2 - spec.hoopInset);
    const inner = xRim - s * D.rimRadius;
    const outer = xRim + s * (D.boardOffset + D.armLength + D.poleRadius);
    out.push(
      box({
        ...base,
        part: `hoop-${name}`,
        mesh: "basketball-hoop",
        min: [Math.min(inner, outer), 0, -hw],
        max: [Math.max(inner, outer), top, hw],
      }),
    );
  }
  return out;
}

function soccer(spec: SoccerPitchSpec): Placement[] {
  const D = VENUE_DIMS.soccer;
  const kit = venueKit(spec);
  const base = { kit, position: spec.center, yaw: spec.yaw, zone: spec.kind } as const;
  const hx = spec.length / 2 + D.runoff;
  const hz = spec.width / 2 + D.runoff;
  const out: Placement[] = [
    box({ ...base, part: "surface", mesh: "soccer-surface", layer: "surface", min: [-hx, 0, -hz], max: [hx, VENUE_DIMS.surfaceThickness, hz] }),
  ];
  for (const [s, name] of [
    [1, "a"],
    [-1, "b"],
  ] as const) {
    const front = s * (spec.length / 2 - D.postRadius);
    const back = s * (spec.length / 2 + D.goalDepth + D.postRadius);
    const hw = spec.goalWidth / 2 + D.postRadius;
    out.push(
      box({
        ...base,
        part: `goal-${name}`,
        mesh: "soccer-goal",
        min: [Math.min(front, back), 0, -hw],
        max: [Math.max(front, back), spec.goalHeight + D.postRadius, hw],
      }),
    );
  }
  return out;
}

/** World-axis direction of a kit yaw: θ ⇒ (sin θ, cos θ) in (x, z). */
const yawDir = (deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
};

function baseball(spec: BaseballFieldSpec): Placement[] {
  const D = VENUE_DIMS.baseball;
  const kit = venueKit(spec);
  // bisectorYaw follows the kit convention: yaw θ is the world direction
  // (sin θ, 0, cos θ), i.e. the venue's local +Z after a three.js rotation-y.
  // The grass is the quarter-disc ±45° about it. The collision test compares
  // world AABBs, and the AABB of a 45°-rotated box would swallow the
  // neighbouring blocks, so both boxes are emitted world-aligned (yaw 0):
  //  - `field`: the sector's exact bounds — its tip, its two radius ends and
  //    whichever axis directions it contains;
  //  - `home`: the dirt circle round the plate, its own box, because folding
  //    it into the field's AABB would push that box past the foul lines
  //    along their whole length.
  // Both are `surface`, so the fence rows and masts standing on the lot
  // inside the field's AABB are not overlaps.
  const base = { kit, position: spec.home, yaw: 0, zone: spec.kind, layer: "surface" } as const;
  const thick = VENUE_DIMS.surfaceThickness;
  const R = spec.fenceRadius;
  const r0 = D.homeDirtRadius;
  const pts: [number, number][] = [[0, 0]];
  for (const edge of [-45, 45]) {
    const [x, z] = yawDir(spec.bisectorYaw + edge);
    pts.push([x * R, z * R]);
  }
  for (const axis of [0, 90, 180, 270]) {
    const delta = ((((axis - spec.bisectorYaw) % 360) + 540) % 360) - 180;
    if (Math.abs(delta) <= 45) {
      const [x, z] = yawDir(axis);
      pts.push([x * R, z * R]);
    }
  }
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  return [
    box({ ...base, part: "field", mesh: "baseball-field", min: [Math.min(...xs), 0, Math.min(...zs)], max: [Math.max(...xs), thick, Math.max(...zs)] }),
    box({ ...base, part: "home", mesh: "baseball-home", min: [-r0, 0, -r0], max: [r0, thick, r0] }),
  ];
}

function pedestal(spec: PedestalSpec): Placement[] {
  if (spec.tiers.length === 0) return [];
  const D = VENUE_DIMS.pedestal;
  const kit = venueKit(spec);
  const rMax = Math.max(...spec.tiers.map((t) => t.radius)) + D.ringGap + D.ringTube;
  const height = spec.tiers.reduce((sum, t) => sum + t.height, 0) + D.daisHeight;
  // The hologram rotates about +Y, so its footprint is the disc swept by the
  // letter's half-width, and its box is that disc's square plus a margin.
  const hr = D.hologramSize / 2 + 0.1;
  const hy0 = height + D.hologramLift;
  const base = { kit, position: spec.center, yaw: 0, zone: spec.kind } as const;
  return [
    box({ ...base, part: "body", mesh: "pedestal", min: [-rMax, 0, -rMax], max: [rMax, height, rMax] }),
    box({ ...base, part: "hologram", mesh: "pedestal-hologram", min: [-hr, hy0, -hr], max: [hr, hy0 + D.hologramSize, hr] }),
  ];
}

function skyscraper(spec: SkyscraperSpec): Placement[] {
  const D = VENUE_DIMS.skyscraper;
  const kit = venueKit(spec);
  const base = { kit, position: spec.base, yaw: 0, zone: spec.kind } as const;
  const h = spec.height;
  const r = D.crownRadius + D.crownTube;
  const ringY = h + D.crownRise;
  const lightY = h + D.lightRise;
  const lr = D.lightRadius;
  return [
    box({ ...base, part: "crown-ring", mesh: "skyscraper-crown", min: [-r, ringY - D.crownTube, -r], max: [r, ringY + D.crownTube, r] }),
    box({ ...base, part: "warning-light", mesh: "skyscraper-light", min: [-lr, lightY - lr, -lr], max: [lr, lightY + lr, lr] }),
  ];
}

function gantry(spec: GantryScreenSpec): Placement[] {
  const D = VENUE_DIMS.gantry;
  const kit = venueKit(spec);
  const base = { kit, position: spec.center, yaw: spec.yaw, zone: spec.kind } as const;
  const hp = D.postSize / 2;
  const hb = D.beamSize / 2;
  const { width, height, bottomY } = spec.screen;
  const out: Placement[] = [];
  for (const [s, name] of [
    [1, "a"],
    [-1, "b"],
  ] as const) {
    const x = (s * spec.span) / 2;
    out.push(box({ ...base, part: `post-${name}`, mesh: "gantry-post", min: [x - hp, 0, -hp], max: [x + hp, spec.postHeight, hp] }));
  }
  out.push(
    box({
      ...base,
      part: "beam",
      mesh: "gantry-beam",
      min: [-spec.span / 2 - hp, spec.postHeight - hb, -hb],
      max: [spec.span / 2 + hp, spec.postHeight + hb, hb],
    }),
  );
  // The screen box includes its frame and, when the screen hangs below the
  // beam, the two hangers that bridge the gap.
  const screenTop = bottomY + height + D.frame;
  const beamBottom = spec.postHeight - hb;
  const top = beamBottom - screenTop > 0.05 ? beamBottom : screenTop;
  out.push(
    box({
      ...base,
      part: "screen",
      mesh: "gantry-screen",
      min: [-width / 2 - D.frame, bottomY - D.frame, -D.screenDepth / 2],
      max: [width / 2 + D.frame, top, D.screenDepth / 2],
    }),
  );
  return out;
}

/** Collision boxes for everything a venue component renders, as `box:`
 *  placements on the `venue` layer, zone = the venue kind. */
export function venueBoxes(spec: VenueSpec): Placement[] {
  switch (spec.kind) {
    case "basketball":
      return basketball(spec);
    case "soccer":
      return soccer(spec);
    case "baseball":
      return baseball(spec);
    case "pedestal":
      return pedestal(spec);
    case "skyscraper":
      return skyscraper(spec);
    case "gantry":
      return gantry(spec);
  }
}
