import { describe, expect, it } from "vitest";
import { worldAabb } from "@/lib/city/collision";
import { KNOTS, progressToParam, sampleFlight, SECTION_TO_STOP, STOP_FADE, STOP_PLATEAU, stopForHash, STOPS, stopWeight } from "@/lib/city/flight";
import { getCityLayout, manifest, SITE } from "@/lib/city/layout";
import type { Bounds } from "@/lib/city/types";

/* --------------------------------------------------------------------------
   The drone route (P1-ART-09 fly-through) — the path is data, so its
   promises are tests: it starts on the header viewpoint, hovers on the five
   waypoints in the brief's order, never clips the city, and its overlays
   show only around a stop.
   -------------------------------------------------------------------------- */

const HEADER_POSITION = [4.2, 1.35, 41];
const HEADER_LOOK_AT = [0, 3.4, 28];

/** Metres of air the drone keeps around every building, prop and venue. */
const CLEARANCE = 1.5;
const MIN_ALTITUDE = 1.2;
const SAMPLES = 800;

const near = (v: { x: number; y: number; z: number }, e: number[], tol = 1e-6) =>
  Math.abs(v.x - e[0]) < tol && Math.abs(v.y - e[1]) < tol && Math.abs(v.z - e[2]) < tol;

describe("waypoints", () => {
  it("are the five in the brief, in order, evenly spaced over the scroll", () => {
    expect(STOPS.map((s) => s.id)).toEqual(["plaza", "basketball", "soccer", "baseball", "skyscraper"]);
    expect(STOPS.map((s) => s.progress)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it("start on the header viewpoint, unchanged", () => {
    const pose = sampleFlight(0);
    expect(near(pose.position, HEADER_POSITION)).toBe(true);
    expect(near(pose.target, HEADER_LOOK_AT)).toBe(true);
  });

  it("put the camera exactly on each stop's knot at its progress", () => {
    for (const s of STOPS) {
      const pose = sampleFlight(s.progress);
      expect(near(pose.position, KNOTS[s.knot].position, 1e-4), s.id).toBe(true);
      expect(near(pose.target, KNOTS[s.knot].target, 1e-4), s.id).toBe(true);
    }
  });

  it("map the page's section anchors onto stops", () => {
    for (const [section, stop] of Object.entries(SECTION_TO_STOP)) {
      expect(stopForHash(`#${section}`)?.id).toBe(stop);
    }
    expect(stopForHash("#plaza")?.id).toBe("plaza");
    expect(stopForHash("#nowhere")).toBeNull();
  });
});

describe("progress → spline parameter", () => {
  it("is monotonic and covers the whole route", () => {
    expect(progressToParam(0)).toBe(0);
    expect(progressToParam(1)).toBe(1);
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const t = progressToParam(i / 1000);
      expect(t).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
  });

  it("dwells at each stop (slowest there, fastest mid-leg)", () => {
    const speed = (p: number) => progressToParam(p + 1e-4) - progressToParam(p - 1e-4);
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i].progress;
      const b = STOPS[i + 1].progress;
      const mid = (a + b) / 2;
      expect(speed(a + 0.005)).toBeLessThan(speed(mid));
      expect(speed(b - 0.005)).toBeLessThan(speed(mid));
    }
  });
});

describe("overlay weight", () => {
  it("is 1 on the plateau, 0 past the fade, monotonic between", () => {
    expect(stopWeight(0.5, 0.5)).toBe(1);
    expect(stopWeight(0.5 + STOP_PLATEAU, 0.5)).toBe(1);
    expect(stopWeight(0.5 + STOP_FADE, 0.5)).toBe(0);
    expect(stopWeight(0.5 - STOP_FADE, 0.5)).toBe(0);
    let prev = 1;
    for (let d = STOP_PLATEAU; d <= STOP_FADE; d += 0.002) {
      const w = stopWeight(0.5 + d, 0.5);
      expect(w).toBeLessThanOrEqual(prev);
      prev = w;
    }
  });

  it("shows only one stop at a time, and none mid-leg", () => {
    for (let i = 0; i <= 400; i++) {
      const p = i / 400;
      const visible = STOPS.filter((s) => stopWeight(p, s.progress) > 0);
      expect(visible.length, `progress ${p}`).toBeLessThanOrEqual(1);
    }
    expect(STOPS.every((s) => stopWeight(s.progress + 0.125, s.progress) === 0)).toBe(true);
  });
});

describe("clearance", () => {
  const layout = getCityLayout("desktop");
  const solids: { id: string; box: Bounds }[] = layout.placements
    .filter((p) => p.layer !== "ground" && p.layer !== "surface")
    .map((p) => ({ id: p.id, box: worldAabb(p, manifest) }));

  const inside = (b: Bounds, x: number, y: number, z: number) =>
    x >= b.min[0] - CLEARANCE && x <= b.max[0] + CLEARANCE &&
    y >= b.min[1] - CLEARANCE && y <= b.max[1] + CLEARANCE &&
    z >= b.min[2] - CLEARANCE && z <= b.max[2] + CLEARANCE;

  it("keeps the drone out of every building, prop and venue, and off the ground", () => {
    const hits: string[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      const { position } = sampleFlight(p);
      const { x, y, z } = position;
      if (y < MIN_ALTITUDE) hits.push(`p=${p.toFixed(3)} altitude ${y.toFixed(2)} m`);
      for (const s of solids) {
        if (inside(s.box, x, y, z)) hits.push(`p=${p.toFixed(3)} (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) inside ${s.id}`);
      }
    }
    expect(hits.slice(0, 20), `${hits.length} clearance violations`).toEqual([]);
  });

  it("stays inside the site", () => {
    for (let i = 0; i <= SAMPLES; i++) {
      const { position } = sampleFlight(i / SAMPLES);
      expect(position.x).toBeGreaterThanOrEqual(SITE.min[0]);
      expect(position.x).toBeLessThanOrEqual(SITE.max[0]);
      expect(position.z).toBeGreaterThanOrEqual(SITE.min[2]);
      expect(position.z).toBeLessThanOrEqual(SITE.max[2]);
    }
  });
});
