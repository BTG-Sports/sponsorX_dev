/* --------------------------------------------------------------------------
   Cyberpunk city — the drone flight (P1-ART-09, scroll fly-through).

   Pure data + math, unit-tested. The camera's whole journey is one number,
   `progress` in 0..1, written by the scroll track (flight-store.ts) and read
   by the camera rig (components/city/flight-rig.tsx) every frame.

   The route is a list of KNOTS in world metres (three.js Y-up, +X east, −Z
   north — the same frame as layout.ts). Some knots are STOPS: the five
   waypoints the brief names, in order — plaza, basketball court, soccer
   field, baseball field, skyscraper. The rest only shape the path (a lift
   over the plaza gate, for instance) and the drone never slows for them.

   Two centripetal Catmull-Rom splines run through the knots — one for the
   camera position, one for the point it looks at — so both the path and the
   gaze sweep smoothly instead of snapping between framings. Scroll progress
   is split evenly between consecutive stops, and inside each leg the spline
   parameter is eased (smoothstep) so the drone decelerates into a stop,
   hovers and accelerates out. The 2D overlay for a stop is fully visible
   inside a small plateau around that stop's progress and fades to nothing
   a little further out (`stopWeight`), which is why the leg's middle shows
   only the city.

   The first stop is the header viewpoint the page always had — at
   progress 0 the camera is exactly that pose, by construction (a Catmull-Rom
   passes through its knots).
   -------------------------------------------------------------------------- */
import { CatmullRomCurve3, Vector3 } from "three";

import type { Vec3 } from "./types";

export interface Knot {
  position: Vec3;
  /** Where the camera looks while at this knot. */
  target: Vec3;
  /** Set on the five waypoints; the id keys the overlay (`#how-it-works` etc.). */
  stop?: string;
}

/** Ordered flight knots. Stops carry the section id the overlay uses. */
export const KNOTS: readonly Knot[] = [
  // 1 · Pedestal plaza — the fixed header viewpoint, unchanged: low over the
  //     paving south-east of the pedestal, looking up at the hologram.
  { stop: "plaza", position: [4.2, 1.35, 41], target: [0, 3.4, 28] },
  // lift-off: rise past the east side of the hologram (it spans x ±1.4 at
  // y 3.6–6.2), then over the plaza toward the north gates (x ±13, z 6)
  { position: [5.5, 5.5, 30], target: [0, 4, 20] },
  { position: [-1, 10, 14], target: [-12, 2, -8] },
  // 2 · Basketball court (centre −34, −26) — hover over the boulevard's west
  //     kerb, looking down across the lot. The kit's own drones hover over
  //     the boulevard at y 18–25, so the route stays under them.
  { stop: "basketball", position: [-8, 13, -4], target: [-34, 0.5, -26] },
  // 3 · Soccer field (centre 38, −82) — bank east and climb a little.
  { stop: "soccer", position: [10, 15, -58], target: [38, 0.5, -82] },
  // 4 · Baseball field (home plate −22, −126; the diamond runs south-west)
  { stop: "baseball", position: [0, 18, -100], target: [-40, 0, -144] },
  // descent: swoop down the boulevard, gaze already settling on the
  // forecourt screen so the wordmark grows as the drone drops
  { position: [3, 9, -134], target: [0, 8, -182] },
  // 5 · Skyscraper — low over the boulevard, two metres up, tilted up at the
  //     "SPONSORX" wordmark on the gantry screen (z −182, 8–14 m up, facing
  //     the plaza) with the tower (base 0, −226; 128 m) rising behind it.
  //     Aimed at the screen's foot so the wordmark sits in the upper half of
  //     the frame, clear of the closing CTA panel along the bottom.
  { stop: "skyscraper", position: [0, 2, -160], target: [0, 8, -182] },
];

export interface Stop {
  id: string;
  /** Index into KNOTS. */
  knot: number;
  /** Scroll progress at which the drone hovers here (0..1). */
  progress: number;
}

/** The waypoints, with the progress each one sits at (evenly spaced). */
export const STOPS: readonly Stop[] = (() => {
  const idx = KNOTS.map((k, i) => (k.stop ? i : -1)).filter((i) => i >= 0);
  return idx.map((knot, i) => ({ id: KNOTS[knot].stop as string, knot, progress: i / (idx.length - 1) }));
})();

/** Half-width of the band (in progress units) where a stop's overlay is
 *  fully visible, and where it has faded out completely. */
export const STOP_PLATEAU = 0.03;
export const STOP_FADE = 0.09;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

/** Overlay visibility for the stop at `stopProgress`: 1 on the plateau,
 *  easing to 0 by the fade radius, 0 beyond. */
export function stopWeight(progress: number, stopProgress: number): number {
  const d = Math.abs(progress - stopProgress);
  if (d <= STOP_PLATEAU) return 1;
  if (d >= STOP_FADE) return 0;
  return 1 - smoothstep((d - STOP_PLATEAU) / (STOP_FADE - STOP_PLATEAU));
}

/** Scroll progress → spline parameter (0..1 over the knot list). Progress is
 *  split evenly between stops; each leg is eased so the drone dwells at a
 *  stop and moves fastest mid-leg. Intermediate (non-stop) knots inside a leg
 *  only bend the path. */
export function progressToParam(progress: number): number {
  const p = clamp01(progress);
  const last = KNOTS.length - 1;
  for (let i = 0; i < STOPS.length - 1; i++) {
    const a = STOPS[i];
    const b = STOPS[i + 1];
    if (p <= b.progress) {
      const s = (p - a.progress) / (b.progress - a.progress);
      const ta = a.knot / last;
      const tb = b.knot / last;
      return ta + smoothstep(s) * (tb - ta);
    }
  }
  return 1;
}

const toV3 = (v: Vec3) => new Vector3(v[0], v[1], v[2]);

/** The two splines. Centripetal parameterisation never loops or cusps
 *  between unevenly spaced knots. */
export const PATH = new CatmullRomCurve3(KNOTS.map((k) => toV3(k.position)), false, "centripetal");
export const GAZE = new CatmullRomCurve3(KNOTS.map((k) => toV3(k.target)), false, "centripetal");

export interface FlightPose {
  position: Vector3;
  target: Vector3;
  /** Unit direction of travel along the path (for banking). */
  tangent: Vector3;
}

/** Sample the flight at a scroll progress. Pass an existing pose to fill in
 *  place — the camera rig calls this every frame and must not allocate. */
export function sampleFlight(progress: number, out?: FlightPose): FlightPose {
  const pose = out ?? { position: new Vector3(), target: new Vector3(), tangent: new Vector3() };
  const t = progressToParam(progress);
  PATH.getPoint(t, pose.position);
  GAZE.getPoint(t, pose.target);
  PATH.getTangent(t, pose.tangent);
  return pose;
}

/** Stop id for a location hash (`#how-it-works` → "basketball"), or null. */
export function stopForHash(hash: string): Stop | null {
  const id = hash.replace(/^#/, "");
  const section = SECTION_TO_STOP[id];
  return STOPS.find((s) => s.id === (section ?? id)) ?? null;
}

/** The page's section anchors, kept so existing nav links land on a stop. */
export const SECTION_TO_STOP: Record<string, string> = {
  "how-it-works": "basketball",
  "for-sponsors": "soccer",
  "for-athletes": "baseball",
  start: "skyscraper",
};
