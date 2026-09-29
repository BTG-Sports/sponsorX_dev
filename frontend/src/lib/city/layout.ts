/* --------------------------------------------------------------------------
   Cyberpunk city — the site plan (P1-ART-09).

   One boulevard runs north (−Z) from a plaza to a skyscraper. The three sports
   venues sit on alternating sides; city blocks fill the other frontages; a
   seeded generator fills the rest of the site with skyline. Everything is a
   Placement (see types.ts) resolved against kit-manifest.json bounds, and
   tests/city-layout.test.ts proves nothing overlaps outside authored kits.

   Units: metres, Y-up, +X east, −Z north. Yaw: degrees about +Y, three.js
   convention — local −X (the storefront kit's shop face) turns to face:
     yaw 0 → −X (west)   yaw 180 → +X (east)   yaw 90 → +Z (south)   yaw −90 → −Z (north)
   Ground tiles are 4 × 4 m with the pivot on the +X/−Z corner.
   Design: docs/superpowers/specs/2026-09-29-landing-cyberpunk-city-design.md
   -------------------------------------------------------------------------- */
import manifestJson from "./kit-manifest.json";
import { intersects, worldAabb } from "./collision";
import { inTier, type Tier } from "./palette";
import { venueBoxes } from "./venue-boxes";
import type {
  BaseballFieldSpec,
  BasketballCourtSpec,
  Bounds,
  CableSpec,
  CityLayout,
  GantryScreenSpec,
  KitManifest,
  Landmark,
  Layer,
  PedestalSpec,
  Placement,
  SkyscraperSpec,
  SoccerPitchSpec,
  Vec3,
  VenueSpec,
} from "./types";

export const manifest = manifestJson as unknown as KitManifest;

export const SITE: Bounds = { min: [-200, -5, -340], max: [200, 220, 140] };

/* ============================== helpers ==================================== */

const DEG = Math.PI / 180;
const scaleVec = (s: number | Vec3): Vec3 => (typeof s === "number" ? [s, s, s] : s);

function bounds(mesh: string): Bounds {
  const m = manifest.meshes[mesh];
  if (!m) throw new Error(`layout: unknown kit mesh "${mesh}"`);
  return { min: m.min, max: m.max };
}

interface PlaceOpts {
  id: string;
  mesh: string;
  yaw?: number;
  scale?: number | Vec3;
  /** World Y the object's lowest point rests on (default 0). */
  floor?: number;
  layer?: Layer;
  zone: string;
  kit?: string;
  lod?: "near" | "far";
}

/** Place a kit mesh so the centre of its (scaled, rotated) footprint lands on
 *  (cx, cz) and its lowest point rests on `floor`. */
function centerOn(cx: number, cz: number, o: PlaceOpts): Placement {
  const b = bounds(o.mesh);
  const s = scaleVec(o.scale ?? 1);
  const yaw = o.yaw ?? 0;
  const cxL = ((b.min[0] + b.max[0]) / 2) * s[0];
  const czL = ((b.min[2] + b.max[2]) / 2) * s[2];
  const minY = b.min[1] * s[1];
  const c = Math.cos(yaw * DEG);
  const sn = Math.sin(yaw * DEG);
  return {
    id: o.id,
    mesh: o.mesh,
    position: [cx - (cxL * c + czL * sn), (o.floor ?? 0) - minY, cz - (-cxL * sn + czL * c)],
    yaw,
    scale: o.scale ?? 1,
    layer: o.layer ?? "prop",
    zone: o.zone,
    kit: o.kit,
    lod: o.lod,
  };
}

/** Place a kit mesh by its own pivot (used for kits whose parts share one pivot). */
function atPivot(x: number, z: number, o: PlaceOpts & { y?: number }): Placement {
  const b = bounds(o.mesh);
  const s = scaleVec(o.scale ?? 1);
  const y = o.y ?? (o.floor ?? 0) - b.min[1] * s[1];
  return {
    id: o.id,
    mesh: o.mesh,
    position: [x, y, z],
    yaw: o.yaw ?? 0,
    scale: o.scale ?? 1,
    layer: o.layer ?? "structure",
    zone: o.zone,
    kit: o.kit,
    lod: o.lod,
  };
}

/** Yaw that turns local +Z toward the world direction (dx, dz). */
const yawToward = (dx: number, dz: number): number => Math.atan2(dx, dz) / DEG;

/** Height of a mesh's roof above the floor it stands on (full Y extent × scale). */
export const roofY = (mesh: string, scale = 1): number => {
  const b = bounds(mesh);
  return (b.max[1] - b.min[1]) * scale;
};

/** 4 m tile grid covering [x0, x1) × [z0, z1). Tile pivot is the +X/−Z corner. */
function tileGrid(mesh: string, x0: number, x1: number, z0: number, z1: number, zone: string, prefix: string): Placement[] {
  const out: Placement[] = [];
  for (let x = x0; x < x1; x += 4) {
    for (let z = z0; z < z1; z += 4) {
      out.push({
        id: `${prefix}:${x},${z}`,
        mesh,
        position: [x + 4, 0, z],
        yaw: 0,
        scale: 1,
        layer: "ground",
        zone,
      });
    }
  }
  return out;
}

/* ---- chain-link fence runs: posts and panels abut, never interpenetrate --- */

const FENCE_PANEL_LEN = 2.808; // SM_Fence local Z extent
const FENCE_PANEL_H = 1.957;
const FENCE_POST_W = 0.125; // SM_Fence_Post footprint
const FENCE_POST_H = 2.11;

interface FenceOpts {
  rows?: number;
  zone: string;
  kit?: string;
  closed?: boolean;
}

/** Fence along a polyline. A post at every vertex (angle post at interior
 *  vertices), interior posts between panels, panels scaled along their length
 *  to fill each segment exactly. Rows stack (row k rests on row k−1's top). */
function fencePath(name: string, pts: [number, number][], o: FenceOpts): Placement[] {
  const out: Placement[] = [];
  const rows = o.rows ?? 1;
  const verts = o.closed ? [...pts, pts[0]] : pts;
  let n = 0;
  const post = (x: number, z: number, yaw: number, angle: boolean) => {
    for (let r = 0; r < rows; r++) {
      out.push(
        centerOn(x, z, {
          id: `${name}:post${n}:r${r}`,
          mesh: angle ? "SM_Fence_Post_Angle" : "SM_Fence_Post",
          yaw,
          floor: r * FENCE_POST_H,
          layer: "structure",
          zone: o.zone,
          kit: o.kit,
        }),
      );
    }
    n++;
  };
  for (let i = 0; i < verts.length - 1; i++) {
    const [ax, az] = verts[i];
    const [bx, bz] = verts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / L;
    const dz = (bz - az) / L;
    const yaw = yawToward(dx, dz);
    const panels = Math.max(1, Math.round((L - FENCE_POST_W) / (FENCE_PANEL_LEN + FENCE_POST_W)));
    const len = (L - (panels + 1) * FENCE_POST_W) / panels;
    const pitch = len + FENCE_POST_W;
    const isFirst = i === 0;
    // start post (vertex): angle post at interior vertices of the path
    if (isFirst || !o.closed || true) post(ax + dx * (FENCE_POST_W / 2), az + dz * (FENCE_POST_W / 2), yaw, !isFirst || !!o.closed);
    for (let j = 0; j < panels; j++) {
      const t = FENCE_POST_W + len / 2 + j * pitch;
      for (let r = 0; r < rows; r++) {
        out.push(
          centerOn(ax + dx * t, az + dz * t, {
            id: `${name}:panel${i}.${j}:r${r}`,
            mesh: "SM_Fence",
            yaw,
            scale: [1, 1, len / FENCE_PANEL_LEN],
            floor: r * FENCE_PANEL_H,
            layer: "structure",
            zone: o.zone,
            kit: o.kit,
          }),
        );
      }
      if (j < panels - 1) {
        const tp = FENCE_POST_W + len + j * pitch + FENCE_POST_W / 2;
        post(ax + dx * tp, az + dz * tp, yaw, false);
      }
    }
    const last = i === verts.length - 2;
    if (last && !o.closed) post(bx - dx * (FENCE_POST_W / 2), bz - dz * (FENCE_POST_W / 2), yaw, false);
  }
  return out;
}

/** Fence along a circular arc (degrees, XZ plane, x = cos, z = sin). Curved
 *  runs are one authored assembly (kit) because rotated thin boxes inflate. */
function fenceArc(name: string, cx: number, cz: number, r: number, a0: number, a1: number, o: FenceOpts): Placement[] {
  const arcLen = Math.abs(a1 - a0) * DEG * r;
  const segs = Math.max(2, Math.round(arcLen / (FENCE_PANEL_LEN + FENCE_POST_W)));
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (a0 + ((a1 - a0) * i) / segs) * DEG;
    pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
  }
  return fencePath(name, pts, { ...o, kit: o.kit ?? `fence-arc:${name}` });
}

/* ---- deterministic randomness for the city fill ---------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================== zones ====================================== */

/** Reserved rectangles (x0, x1, z0, z1): nothing generated may enter them. */
export const ZONES = {
  plaza: [-64, 64, -4, 90],
  boulevard: [-12, 12, -196, 8],
  basketballLot: [-56, -12, -48, -4],
  stripA: [12, 76, -56, -4],
  soccerLot: [12, 64, -108, -56],
  blockB: [-80, -12, -108, -56],
  baseballLot: [-72, -12, -176, -116],
  blockC: [12, 76, -176, -116],
  forecourt: [-32, 32, -196, -176],
  skyscraper: [-68, 68, -262, -196],
} as const satisfies Record<string, readonly [number, number, number, number]>;

/* ============================== the plan =================================== */

function ground(): Placement[] {
  return [
    ...tileGrid("SM_Module_4x4_06", -8, 8, -176, 8, "boulevard", "road"),
    ...tileGrid("SM_Park_Pavement", -12, -8, -176, 8, "boulevard", "walk-w"),
    ...tileGrid("SM_Park_Pavement", 8, 12, -176, 8, "boulevard", "walk-e"),
    ...tileGrid("SM_Park_Pavement", -28, 28, 8, 48, "plaza", "plaza"),
    ...tileGrid("SM_Park_Pavement", -28, -12, -4, 8, "plaza", "plaza-sw"),
    ...tileGrid("SM_Park_Pavement", 12, 28, -4, 8, "plaza", "plaza-se"),
    ...tileGrid("SM_Park_Pavement", -32, 32, -196, -176, "forecourt", "fore"),
    ...tileGrid("SM_Gravel_Pavement", -56, -12, -48, -4, "basketball", "lot-bb"),
    ...tileGrid("SM_Gravel_Pavement", 12, 64, -108, -56, "soccer", "lot-sc"),
    ...tileGrid("SM_Gravel_Pavement", -72, -12, -176, -116, "baseball", "lot-bs"),
  ];
}

/** Roof height of an apartment block at the 1.5 scale used along the boulevard. */
const APT_ROOF = roofY("SM_Building_04", 1.5);

const PEDESTAL: PedestalSpec = {
  kind: "pedestal",
  center: [0, 0, 28],
  tiers: [
    { radius: 3.2, height: 0.4 },
    { radius: 2.4, height: 0.4 },
    { radius: 1.6, height: 0.6 },
  ],
};

function plaza(): Placement[] {
  const out: Placement[] = [];
  const zone = "plaza";
  // trees at the four corners
  out.push(centerOn(-21, 41, { id: "plaza:tree:sw", mesh: "SM_Tree1", zone, layer: "structure", yaw: 20 }));
  out.push(centerOn(21, 41, { id: "plaza:tree:se", mesh: "SM_Tree1", zone, layer: "structure", yaw: 200 }));
  out.push(centerOn(-21, 15, { id: "plaza:tree:nw", mesh: "SM_Tree2", zone, layer: "structure", yaw: 110 }));
  out.push(centerOn(21, 15, { id: "plaza:tree:ne", mesh: "SM_Tree2", zone, layer: "structure", yaw: 290 }));
  // ring of eight street lights facing the pedestal
  for (let k = 0; k < 8; k++) {
    const a = k * 45 * DEG;
    const x = 14 * Math.cos(a);
    const z = 28 + 14 * Math.sin(a);
    out.push(centerOn(x, z, { id: `plaza:light${k}`, mesh: "SM_Street_Light_02", yaw: yawToward(-Math.cos(a), -Math.sin(a)), zone }));
  }
  // benches in facing pairs on the diagonals
  let b = 0;
  for (const deg of [45, 135, 225, 315]) {
    const a = deg * DEG;
    const tx = -Math.sin(a);
    const tz = Math.cos(a);
    for (const off of [-1.7, 1.7]) {
      const x = 9 * Math.cos(a) + tx * off;
      const z = 28 + 9 * Math.sin(a) + tz * off;
      out.push(centerOn(x, z, { id: `plaza:bench${b++}`, mesh: "SM_Bench_01", yaw: yawToward(tx, tz), zone }));
    }
  }
  // holo billboards and hologram pylons
  out.push(centerOn(-8, 44, { id: "plaza:billboard:w", mesh: "SM_Standing_Billboard", zone, yaw: 180 }));
  out.push(centerOn(8, 44, { id: "plaza:billboard:e", mesh: "SM_Standing_Billboard", zone, yaw: 180 }));
  const pylons: [number, number, number][] = [
    [-18, 28, 0],
    [18, 28, 180],
    [-10, 46, -90],
    [10, 46, -90],
  ];
  pylons.forEach(([x, z, yaw], i) => {
    out.push(centerOn(x, z, { id: `plaza:pylon${i}`, mesh: "SM_Steel_Column", zone, layer: "structure" }));
    out.push(centerOn(x, z, { id: `plaza:holo${i}`, mesh: "SM_Hologram_Poster", zone, yaw, scale: 3, floor: 3.55 }));
  });
  // gate pair marking the boulevard mouth (portal spans across X)
  out.push(centerOn(-13, 6, { id: "plaza:gate:w", mesh: "SM_Big_Gate_03", zone, layer: "structure", yaw: 90 }));
  out.push(centerOn(13, 6, { id: "plaza:gate:e", mesh: "SM_Big_Gate_03", zone, layer: "structure", yaw: 90 }));
  // planters near the gates (clear of the tree canopies)
  for (const [x, z] of [
    [-14.5, 9.5],
    [14.5, 9.5],
    [-26, 28],
    [26, 28],
  ] as const) {
    out.push(centerOn(x, z, { id: `plaza:pot:${x},${z}`, mesh: "SM_Flower_Pot_01", zone }));
  }
  // storefront kits flanking the plaza, shop faces toward it
  out.push(...storefrontKit("plaza-w", -36.06, 33, 180, { props: true, base: 2, top: 2, zone }));
  out.push(...storefrontKit("plaza-e", 36.06, 23, 0, { props: true, base: 3, top: 3, zone }));
  // backdrop behind the plaza (south), fronts facing it
  out.push(...storefrontKit("plaza-s", 4.86, 62, -90, { props: true, base: 4, top: 4, zone }));
  out.push(centerOn(-28, 64, { id: "plaza:apt:sw", mesh: "SM_Building_04", scale: 1.5, zone, layer: "structure", yaw: 0 }));
  out.push(centerOn(28, 64, { id: "plaza:apt:se", mesh: "SM_Building_04", scale: 1.5, zone, layer: "structure", yaw: 180 }));
  out.push(...roofDressing("plaza:apt:sw", -28, 64, APT_ROOF, 12, 9, zone, 1));
  out.push(...roofDressing("plaza:apt:se", 28, 64, APT_ROOF, 12, 9, zone, 2));
  return out;
}

interface KitOpts {
  props?: boolean;
  base: 1 | 2 | 3 | 4;
  top: 1 | 2 | 3 | 4;
  zone: string;
}

/** The Leartes storefront kit: base, front, tops and props share one pivot. */
function storefrontKit(name: string, x: number, z: number, yaw: number, o: KitOpts): Placement[] {
  const kit = `storefront:${name}`;
  const common = { yaw, zone: o.zone, kit, layer: "structure" as Layer, floor: 0 };
  const out: Placement[] = [
    atPivot(x, z, { ...common, id: `${kit}:base`, mesh: `SM_Building03_Base_0${o.base}`, y: 0 }),
    atPivot(x, z, { ...common, id: `${kit}:front`, mesh: "SM_Building03_Front_01", y: 0 }),
    atPivot(x, z, { ...common, id: `${kit}:top`, mesh: `SM_Building03_Top_0${o.top}`, y: 0 }),
  ];
  if (o.props) out.push(atPivot(x, z, { ...common, id: `${kit}:props`, mesh: "SM_Building03_Props", y: 0 }));
  return out;
}

/** Vents, AC units and a mast on a flat roof of half-extents (hx, hz). */
function roofDressing(name: string, cx: number, cz: number, roofY: number, hx: number, hz: number, zone: string, variant: number): Placement[] {
  const out: Placement[] = [];
  const o = (id: string, mesh: string, dx: number, dz: number, yaw = 0, scale: number | Vec3 = 1) =>
    out.push(centerOn(cx + dx, cz + dz, { id: `${name}:roof:${id}`, mesh, yaw, scale, floor: roofY, zone }));
  const m = Math.min(hx, hz);
  if (variant % 2 === 0) o("vent1", "SM_Vents_01", -m * 0.25, -m * 0.3, 90);
  else o("vent2", "SM_Vents_02", 0, -m * 0.35, 0);
  o("ac1", "SM_AC_Unit_01", m * 0.45, m * 0.4);
  o("ac2", "SM_AC_Unit_02", m * 0.45, m * 0.15, 90);
  o("mast", variant % 3 === 0 ? "SM_Tower_01" : variant % 3 === 1 ? "SM_Tower_02" : "SM_Tower_03", -m * 0.55, m * 0.45);
  if (variant % 2 === 1) o("power", "SM_PowerUnit_01", -m * 0.1, m * 0.55, 180);
  return out;
}

const BASKETBALL: BasketballCourtSpec = { kind: "basketball", center: [-34, 0, -26], length: 28, width: 15, yaw: 0, hoopInset: 1.575 };
const SOCCER: SoccerPitchSpec = { kind: "soccer", center: [38, 0, -82], length: 40, width: 20, yaw: 0, goalWidth: 3, goalHeight: 2 };
const BASEBALL: BaseballFieldSpec = {
  kind: "baseball",
  home: [-22, 0, -126],
  bisectorYaw: -135, // direction (sin, cos) = (−0.71, −0.71): toward −X and −Z
  baseDistance: 27.43,
  moundDistance: 18.44,
  fenceRadius: 50,
  backstopRadius: 7,
};

function basketballLot(): Placement[] {
  const zone = "basketball";
  const out: Placement[] = [];
  // 4 m fence (two rows) around the lot, gate on the street side (x = −13, z −28…−24)
  out.push(
    ...fencePath(
      "bb-fence",
      [
        [-13, -24],
        [-13, -5],
        [-55, -5],
        [-55, -47],
        [-13, -47],
        [-13, -28],
      ],
      { rows: 2, zone },
    ),
  );
  // floodlight masts at the apron corners, arms toward the court
  const masts: [number, number][] = [
    [-51.5, -37.5],
    [-51.5, -14.5],
    [-16.5, -37.5],
    [-16.5, -14.5],
  ];
  masts.forEach(([x, z], i) =>
    out.push(centerOn(x, z, { id: `bb:mast${i}`, mesh: "SM_Street_Light_02", scale: 2, yaw: yawToward(-34 - x, -26 - z), zone, layer: "structure" })),
  );
  // benches along the north fence, vending machines by the gate
  [-46, -40, -28, -22].forEach((x, i) => out.push(centerOn(x, -45.3, { id: `bb:bench${i}`, mesh: "SM_Bench_01", yaw: 90, zone })));
  out.push(centerOn(-15.6, -30.8, { id: "bb:vend0", mesh: "SM_Vending_Machine", yaw: 90, zone }));
  out.push(centerOn(-15.6, -21.2, { id: "bb:vend1", mesh: "SM_Vending_Machine", yaw: 90, zone }));
  out.push(centerOn(-14.2, -34.2, { id: "bb:trash", mesh: "SM_TrashBin_02_Combined", zone }));
  return out;
}

function soccerLot(): Placement[] {
  const zone = "soccer";
  const out: Placement[] = [];
  out.push(
    ...fencePath(
      "sc-fence",
      [
        [13, -84],
        [13, -107],
        [63, -107],
        [63, -57],
        [13, -57],
        [13, -80],
      ],
      { rows: 2, zone },
    ),
  );
  const masts: [number, number][] = [
    [15.5, -94.5],
    [15.5, -69.5],
    [60.5, -94.5],
    [60.5, -69.5],
  ];
  masts.forEach(([x, z], i) =>
    out.push(centerOn(x, z, { id: `sc:mast${i}`, mesh: "SM_Street_Light_02", scale: 2, yaw: yawToward(38 - x, -82 - z), zone, layer: "structure" })),
  );
  [24, 32, 44, 52].forEach((x, i) => out.push(centerOn(x, -105.3, { id: `sc:bench${i}`, mesh: "SM_Bench_02", yaw: 90, zone })));
  out.push(centerOn(15.6, -87.2, { id: "sc:vend0", mesh: "SM_Vending_Machine", yaw: -90, zone }));
  out.push(centerOn(15.4, -77.6, { id: "sc:trash", mesh: "SM_TrashBin_02_Combined", zone }));
  return out;
}

function baseballLot(): Placement[] {
  const zone = "baseball";
  const out: Placement[] = [];
  const [hx, , hz] = BASEBALL.home;
  // outfield fence: quarter arc from −X (180°) round to −Z (270°), two rows
  out.push(...fenceArc("bs-outfield", hx, hz, BASEBALL.fenceRadius, 180, 270, { rows: 2, zone }));
  // backstop behind home: arc from +X (0°) to +Z (90°), three rows
  out.push(...fenceArc("bs-backstop", hx, hz, BASEBALL.backstopRadius, 0, 90, { rows: 3, zone }));
  // low fences along the foul lines (one row), leaving the home area open
  out.push(...fencePath("bs-line1", [[hx + 3, hz - 5], [hx + 3, hz - 48]], { rows: 1, zone }));
  out.push(...fencePath("bs-line3", [[hx - 5, hz + 3], [hx - 48, hz + 3]], { rows: 1, zone }));
  // foul poles at the arc ends, just outside the field
  out.push(centerOn(hx - 50, hz + 1.4, { id: "bs:pole:left", mesh: "SM_Tower_02", zone, layer: "structure" }));
  out.push(centerOn(hx + 1.4, hz - 50, { id: "bs:pole:right", mesh: "SM_Tower_02", zone, layer: "structure" }));
  // dugout benches on the street side of the first-base line
  out.push(centerOn(-16, -136, { id: "bs:bench0", mesh: "SM_Bench_02", yaw: 0, zone }));
  out.push(centerOn(-16, -142, { id: "bs:bench1", mesh: "SM_Bench_02", yaw: 0, zone }));
  out.push(centerOn(-16, -148, { id: "bs:vend0", mesh: "SM_Vending_Machine", yaw: 0, zone }));
  // floodlights behind the backstop corners and at the arc ends
  out.push(centerOn(-14.5, -118.5, { id: "bs:mast0", mesh: "SM_Street_Light_02", scale: 2, yaw: yawToward(-1, -1), zone, layer: "structure" }));
  out.push(centerOn(-62, -170, { id: "bs:mast1", mesh: "SM_Street_Light_02", scale: 2, yaw: yawToward(1, 1), zone, layer: "structure" }));
  out.push(centerOn(-68, -160, { id: "bs:mast2", mesh: "SM_Street_Light_02", scale: 2, yaw: yawToward(1, 0.75), zone, layer: "structure" }));
  return out;
}

/** Noodle kiosk: base lifted to the ground, top on the base, holograms above. */
function kiosk(name: string, x: number, z: number, zone: string): Placement[] {
  const kit = `kiosk:${name}`;
  const out: Placement[] = [
    atPivot(x, z, { id: `${kit}:base`, mesh: "SM_Noodle_Base", zone, kit, floor: 0 }),
    atPivot(x - 3.5, z - 0.8, { id: `${kit}:top`, mesh: "SM_Noodle_Top", zone, kit, floor: 2.49 }),
    centerOn(x, z + 3.2, { id: `${kit}:stool0`, mesh: "SM_Stool", zone, kit }),
    centerOn(x - 1.6, z + 3.2, { id: `${kit}:stool1`, mesh: "SM_Stool", zone, kit }),
    centerOn(x + 1.6, z + 3.2, { id: `${kit}:stool2`, mesh: "SM_Stool", zone, kit }),
    centerOn(x, z - 1.8, { id: `${kit}:holo-noodle`, mesh: "SM_Hologram_Noodle", zone, kit, floor: 7.0 }),
    centerOn(x, z - 1.8, { id: `${kit}:holo-burger`, mesh: "SM_Hologram_Burger", zone, kit, floor: 8.6, scale: 0.6 }),
  ];
  return out;
}

function stripA(): Placement[] {
  const zone = "stripA";
  const out: Placement[] = [];
  out.push(...storefrontKit("A1", 18.06, -18, 0, { props: true, base: 1, top: 1, zone }));
  out.push(...storefrontKit("A2", 18.06, -46, 0, { props: true, base: 2, top: 2, zone }));
  out.push(...kiosk("A", 16.5, -34, zone));
  out.push(centerOn(58, -26, { id: "A:apt", mesh: "SM_Building_04", scale: 1.5, yaw: 0, zone, layer: "structure" }));
  out.push(...roofDressing("A:apt", 58, -26, APT_ROOF, 12, 9, zone, 3));
  // neon signs hung 3 cm off the shop faces
  out.push(centerOn(11.91, -16, { id: "A1:sign", mesh: "SM_Sign_04", yaw: 0, zone, floor: 3.8 }));
  out.push(centerOn(11.91, -44, { id: "A2:sign", mesh: "SM_Sign_04", yaw: 0, zone, floor: 3.8 }));
  out.push(centerOn(11.3, -10, { id: "A1:atm", mesh: "SM_ATM", yaw: 90, zone }));
  return out;
}

function blockB(): Placement[] {
  const zone = "blockB";
  const out: Placement[] = [];
  out.push(centerOn(-26.5, -68, { id: "B1:apt", mesh: "SM_Building_04", scale: 1.5, yaw: 180, zone, layer: "structure" }));
  out.push(centerOn(-26.5, -96, { id: "B2:apt", mesh: "SM_Building_04", scale: 1.5, yaw: 0, zone, layer: "structure" }));
  out.push(...roofDressing("B1", -26.5, -68, APT_ROOF, 12, 9, zone, 4));
  out.push(...roofDressing("B2", -26.5, -96, APT_ROOF, 12, 9, zone, 5));
  out.push(...storefrontKit("B3", -50, -78, 180, { props: true, base: 3, top: 3, zone }));
  // alley clutter between the blocks
  out.push(centerOn(-15, -82.5, { id: "B:crate0", mesh: "SM_Crate_01", yaw: 20, zone }));
  out.push(centerOn(-16.2, -82.4, { id: "B:crate1", mesh: "SM_Crate_03", yaw: 65, zone }));
  out.push(centerOn(-14.6, -80.6, { id: "B:barrel", mesh: "SM_Barrel", zone }));
  out.push(centerOn(-18, -83, { id: "B:barrier", mesh: "SM_Barrier_01", yaw: 90, zone }));
  return out;
}

function blockC(): Placement[] {
  const zone = "blockC";
  const out: Placement[] = [];
  out.push(centerOn(20, -146, { id: "C:tower", mesh: "SM_Building_02", yaw: 0, zone, layer: "structure" }));
  out.push(centerOn(20.5, -146, { id: "C:tower:mast", mesh: "SM_Tower_01", floor: roofY("SM_Building_02"), zone }));
  out.push(...storefrontKit("C1", 18.06, -128, 0, { props: true, base: 4, top: 4, zone }));
  out.push(...storefrontKit("C2", 18.06, -172, 0, { props: false, base: 1, top: 2, zone }));
  out.push(centerOn(58, -160, { id: "C:apt", mesh: "SM_Building_04", scale: 1.5, yaw: 90, zone, layer: "structure" }));
  out.push(...roofDressing("C:apt", 58, -160, APT_ROOF, 9, 12, zone, 6));
  out.push(centerOn(11.91, -126, { id: "C1:sign", mesh: "SM_Sign_04", yaw: 0, zone, floor: 3.8 }));
  out.push(centerOn(11.91, -170, { id: "C2:sign", mesh: "SM_Sign_04", yaw: 0, zone, floor: 3.8 }));
  out.push(centerOn(11.3, -158, { id: "C:vend", mesh: "SM_Vending_Machine", yaw: -90, zone }));
  return out;
}

const GANTRY: GantryScreenSpec = { kind: "gantry", center: [0, 0, -182], span: 20, yaw: 0, postHeight: 14, screen: { width: 16, height: 6, bottomY: 8 } };
const SKYSCRAPER_SCALE = 3.4;
const SKYSCRAPER: SkyscraperSpec = { kind: "skyscraper", base: [0, 0, -226], height: roofY("SM_Building_02", SKYSCRAPER_SCALE) };
const FLANK_ROOF = roofY("SM_Building_02", 2);

function forecourtAndTower(): Placement[] {
  const out: Placement[] = [];
  const zone = "forecourt";
  out.push(centerOn(-13, -178, { id: "fore:gate:w", mesh: "SM_Big_Gate_03", zone, layer: "structure", yaw: 90 }));
  out.push(centerOn(13, -178, { id: "fore:gate:e", mesh: "SM_Big_Gate_03", zone, layer: "structure", yaw: 90 }));
  for (const [x, z] of [
    [-20, -180],
    [20, -180],
    [-20, -190],
    [20, -190],
  ] as const) {
    out.push(centerOn(x, z, { id: `fore:light:${x},${z}`, mesh: "SM_Street_Light_01", yaw: x < 0 ? 90 : -90, zone }));
  }
  [-26, 26].forEach((x) => {
    out.push(centerOn(x, -184, { id: `fore:bench:${x}a`, mesh: "SM_Bench_01", yaw: 0, zone }));
    out.push(centerOn(x, -190, { id: `fore:bench:${x}b`, mesh: "SM_Bench_01", yaw: 0, zone }));
  });
  for (const [x, z] of [
    [-8, -190],
    [8, -190],
    [-29, -178],
    [29, -178],
  ] as const) {
    out.push(centerOn(x, z, { id: `fore:pot:${x},${z}`, mesh: "SM_Flower_Pot_02", zone }));
  }
  out.push(centerOn(0, -193, { id: "fore:billboard", mesh: "SM_Standing_Billboard", zone, yaw: 0 }));

  const tz = "skyscraper";
  out.push(centerOn(0, -226, { id: "sky:tower", mesh: "SM_Building_02", scale: SKYSCRAPER_SCALE, yaw: 0, zone: tz, layer: "structure" }));
  out.push(centerOn(-52, -232, { id: "sky:flank:w", mesh: "SM_Building_02", scale: 2, yaw: 15, zone: tz, layer: "structure" }));
  out.push(centerOn(52, -238, { id: "sky:flank:e", mesh: "SM_Building_02", scale: 2, yaw: -20, zone: tz, layer: "structure" }));
  out.push(centerOn(-52, -232, { id: "sky:flank:w:mast", mesh: "SM_Tower_03", scale: 1.5, floor: FLANK_ROOF, zone: tz }));
  out.push(centerOn(52, -238, { id: "sky:flank:e:mast", mesh: "SM_Tower_02", scale: 1.5, floor: FLANK_ROOF, zone: tz }));
  return out;
}

function boulevardFurniture(): { placements: Placement[]; cables: CableSpec[] } {
  const zone = "boulevard";
  const out: Placement[] = [];
  // street lights every 12 m, alternating sides, arms toward the road
  for (let z = 2; z >= -170; z -= 12) out.push(centerOn(-10.5, z, { id: `blvd:light:w:${z}`, mesh: "SM_Street_Light_02", yaw: 90, zone }));
  for (let z = -4; z >= -172; z -= 12) out.push(centerOn(10.5, z, { id: `blvd:light:e:${z}`, mesh: "SM_Street_Light_02", yaw: -90, zone }));
  // manholes on the carriageway (thin props on the tiles)
  for (let z = -12; z >= -168; z -= 40) out.push(centerOn(-3, z, { id: `blvd:manhole:${z}`, mesh: "SM_Sewer_Cover_01", zone, floor: 0.001 }));
  // parked bikes against the kerb
  out.push(centerOn(7, -60, { id: "blvd:bike0", mesh: "SM_Motorbike", yaw: 90, zone }));
  out.push(centerOn(-7, -140, { id: "blvd:bike1", mesh: "SM_Motorbike", yaw: -90, zone }));
  // sidewalk clutter at block corners
  out.push(centerOn(11.4, -6, { id: "blvd:bin:a", mesh: "SM_TrashBin_02_Combined", zone }));
  out.push(centerOn(-11.4, -52, { id: "blvd:bin:b", mesh: "SM_TrashBin_02_Combined", zone }));
  out.push(centerOn(11.4, -114.6, { id: "blvd:bin:c", mesh: "SM_TrashBin_02_Combined", zone }));
  out.push(centerOn(-11.5, -110, { id: "blvd:box0", mesh: "SM_Box_01", yaw: 30, zone }));
  out.push(centerOn(-11.4, -111.2, { id: "blvd:crate", mesh: "SM_Crate_03", yaw: 10, zone }));
  out.push(centerOn(11.5, -54.5, { id: "blvd:barrier0", mesh: "SM_Barrier_02", yaw: 0, zone }));
  out.push(centerOn(11.5, -52.6, { id: "blvd:barrier1", mesh: "SM_Barrier_04", zone }));
  // utility poles with cables strung to the building faces across the road
  const cables: CableSpec[] = [];
  const runs: { z: number; poleX: number; faceX: number; faceY: number }[] = [
    { z: -20, poleX: -10.6, faceX: 12.0, faceY: 9.0 },
    { z: -44, poleX: -10.6, faceX: 12.0, faceY: 9.4 },
    { z: -66, poleX: 10.6, faceX: -12.5, faceY: 9.2 },
    { z: -98, poleX: 10.6, faceX: -12.5, faceY: 9.6 },
    { z: -126, poleX: -10.6, faceX: 12.0, faceY: 9.0 },
    { z: -168, poleX: -10.6, faceX: 12.0, faceY: 9.3 },
  ];
  runs.forEach((r, i) => {
    out.push(centerOn(r.poleX, r.z, { id: `blvd:pole${i}`, mesh: "SM_Tower_02", zone, layer: "structure" }));
    cables.push({ kind: "cable", id: `cable${i}`, from: [r.poleX, 10.4, r.z], to: [r.faceX, r.faceY, r.z], sag: 1.2 });
  });
  // drones hovering above the boulevard and the venues
  const drones: [number, number, number, number][] = [
    [-3, 18, -30, 20],
    [4, 22, -75, 200],
    [-5, 20, -120, 90],
    [2, 25, -150, 310],
    [-30, 21, -26, 45],
    [38, 19, -82, 135],
  ];
  drones.forEach(([x, y, z, yaw], i) => out.push(centerOn(x, z, { id: `air:drone${i}`, mesh: "SM_Drone", yaw, floor: y, layer: "air", zone: "air" })));
  return { placements: out, cables };
}

/* ============================== city fill ================================== */

const RESERVED: [number, number, number, number][] = Object.values(ZONES).map((r) => [...r] as [number, number, number, number]);

function inReserved(b: Bounds, margin: number): boolean {
  for (const [x0, x1, z0, z1] of RESERVED) {
    if (b.max[0] + margin > x0 && b.min[0] - margin < x1 && b.max[2] + margin > z0 && b.min[2] - margin < z1) return true;
  }
  return false;
}

/** Seeded skyline and second-row fill. Deterministic for a given (seed, count). */
export function generateFill(seed: number, count: number): Placement[] {
  const rng = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
  const snap = (v: number) => Math.round(v / 4) * 4;
  const out: Placement[] = [];
  const boxes: Bounds[] = [];
  const GAP = 3;
  let tries = 0;
  while (out.length < count && tries < count * 60) {
    tries++;
    const far = rng() < 0.55;
    let x: number;
    let z: number;
    if (far) {
      x = snap(-196 + rng() * 392);
      z = snap(-336 + rng() * 472);
      if (!(Math.abs(x) >= 84 || z < -262 || z > 92)) continue;
    } else {
      x = snap(-100 + rng() * 200);
      z = snap(-200 + rng() * 290);
    }
    const yaw = pick([0, 90, 180, 270]);
    let mesh: string;
    let scale: number;
    const t = rng();
    if (far) {
      if (t < 0.4) {
        mesh = "SM_Building_02";
        scale = 1.3 + rng() * 1.3;
      } else if (t < 0.75) {
        mesh = "SM_Building_04";
        scale = 1.5 + rng() * 0.7;
      } else {
        mesh = "SM_Building03_Top_01";
        scale = 1.4 + rng() * 0.8;
      }
    } else if (t < 0.5) {
      mesh = "SM_Building_04";
      scale = 1.25 + rng() * 0.5;
    } else if (t < 0.8) {
      mesh = "SM_Building03_Top_01";
      scale = 1 + rng() * 0.4;
    } else {
      mesh = "SM_Building_02";
      scale = 1 + rng() * 0.4;
    }
    const p = centerOn(x, z, { id: `fill:${out.length}`, mesh, yaw, scale, zone: "fill", layer: "structure", lod: far ? "far" : "near" });
    const b = worldAabb(p, manifest);
    if (b.min[0] < SITE.min[0] || b.max[0] > SITE.max[0] || b.min[2] < SITE.min[2] || b.max[2] > SITE.max[2]) continue;
    if (inReserved(b, GAP)) continue;
    const grown: Bounds = { min: [b.min[0] - GAP, b.min[1], b.min[2] - GAP], max: [b.max[0] + GAP, b.max[1], b.max[2] + GAP] };
    if (boxes.some((o) => intersects(grown, o, 0))) continue;
    boxes.push(b);
    out.push(p);
    // light rooftop dressing on near apartment blocks
    if (!far && mesh === "SM_Building_04") {
      const roof = roofY(mesh, scale);
      const hx = 9.4 * scale - 2;
      const hz = 7.3 * scale - 2;
      out.push(
        centerOn(x + hx * 0.45, z - hz * 0.3, { id: `fill:${out.length - 1}:ac`, mesh: "SM_AC_Unit_01", floor: roof, zone: "fill" }),
        centerOn(x - hx * 0.45, z + hz * 0.4, { id: `fill:${out.length - 1}:vent`, mesh: "SM_Vents_02", floor: roof, yaw, zone: "fill" }),
      );
    }
  }
  return out;
}

/* ============================== assembly =================================== */

export const LANDMARKS: Record<string, Landmark> = {
  plaza: { id: "plaza", name: "Pedestal Plaza", position: [0, 0, 28], size: [56, 0, 40] },
  basketball: { id: "basketball", name: "Basketball court", position: [-34, 0, -26], size: [28, 0, 15] },
  soccer: { id: "soccer", name: "Soccer field", position: [38, 0, -82], size: [40, 0, 20] },
  baseball: { id: "baseball", name: "Baseball field (home plate)", position: [-22, 0, -126], size: [50, 0, 50], yaw: -135 },
  skyscraper: { id: "skyscraper", name: "Skyscraper", position: [0, 0, -226], size: [38, 128, 56] },
};

export const VENUES: VenueSpec[] = [PEDESTAL, BASKETBALL, SOCCER, BASEBALL, GANTRY, SKYSCRAPER];

export const FILL_SEED = 20260929;
export const FILL_COUNT: Record<Tier, number> = { desktop: 130, lite: 50 };

/** Everything authored by hand (no fill). */
export function authoredPlacements(): Placement[] {
  const blvd = boulevardFurniture();
  return [
    ...ground(),
    ...plaza(),
    ...basketballLot(),
    ...soccerLot(),
    ...baseballLot(),
    ...stripA(),
    ...blockB(),
    ...blockC(),
    ...forecourtAndTower(),
    ...blvd.placements,
    ...VENUES.flatMap(venueBoxes),
  ];
}

export function getCityLayout(tier: Tier = "desktop"): CityLayout {
  const blvd = boulevardFurniture();
  const all = [...authoredPlacements(), ...generateFill(FILL_SEED, FILL_COUNT[tier])];
  const placements = tier === "lite" ? all.filter((p) => p.mesh.startsWith("box:") || (inTier(p.mesh, "lite") && p.layer !== "air")) : all;
  return { site: SITE, placements, landmarks: LANDMARKS, venues: VENUES, cables: blvd.cables };
}
