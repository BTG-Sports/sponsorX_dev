import { describe, expect, it } from "vitest";

import {
  coverRadius,
  growFrames,
  holePolygon,
  insideX,
  isSitePath,
  routeLabel,
  xPoints,
  xPolygon,
} from "../src/lib/page-transition";

/* P1-ART-12 — the page transition. The X must really cover the screen
   before the route swaps (or the swap shows through a notch), every
   keyframe must have the same point count (or the browser cannot
   interpolate the clip-path), and only public-site moves get it. */

describe("isSitePath", () => {
  it("covers the home and the public pages", () => {
    for (const p of ["/", "/packages", "/join", "/next/about", "/athletes/jordan", "/s/abc"]) {
      expect(isSitePath(p)).toBe(true);
    }
  });

  it("leaves sign-in, the portals and look-alike prefixes alone", () => {
    for (const p of ["/login", "/portal/sponsor", "/r/xyz", "/sponsors", "/joined", "/print/x"]) {
      expect(isSitePath(p)).toBe(false);
    }
  });
});

describe("routeLabel", () => {
  it("names the nav destinations as the nav does", () => {
    expect(routeLabel("/")).toBe("Home");
    expect(routeLabel("/packages")).toBe("For Sponsors");
    expect(routeLabel("/join")).toBe("For Athletes");
    expect(routeLabel("/next/about")).toBe("SponsorX NEXT");
  });

  it("falls back to the brand", () => {
    expect(routeLabel("/unknown")).toBe("SponsorX");
  });
});

describe("the X", () => {
  it("has twelve points, centred", () => {
    const pts = xPoints(100, 50, 40);
    expect(pts).toHaveLength(12);
    const mx = pts.reduce((s, p) => s + p[0], 0) / 12;
    const my = pts.reduce((s, p) => s + p[1], 0) / 12;
    expect(mx).toBeCloseTo(100, 6);
    expect(my).toBeCloseTo(50, 6);
  });

  it("collapses to its centre at zero size", () => {
    for (const [x, y] of xPoints(10, 20, 0, 1)) {
      expect(x).toBeCloseTo(10, 9);
      expect(y).toBeCloseTo(20, 9);
    }
  });

  it("has notches — the axis points past the apex are outside", () => {
    expect(insideX(0, 0, 0, 0, 100)).toBe(true);
    expect(insideX(90, 0, 0, 0, 100)).toBe(false);
    expect(insideX(80, 80, 0, 0, 100)).toBe(true);
  });

  const viewports: Array<[number, number]> = [
    [1440, 900],
    [390, 844],
    [2560, 1080],
  ];

  it.each(viewports)("at coverRadius covers every point of a %ix%i viewport from any click", (w, h) => {
    const clicks: Array<[number, number]> = [
      [0, 0],
      [w, h],
      [w / 2, h / 2],
      [w * 0.9, 20],
      [15, h * 0.7],
    ];
    for (const [cx, cy] of clicks) {
      const r = coverRadius(cx, cy, w, h);
      for (let i = 0; i <= 24; i++) {
        for (let j = 0; j <= 24; j++) {
          expect(insideX((w * i) / 24, (h * j) / 24, cx, cy, r)).toBe(true);
        }
      }
    }
  });
});

describe("clip-path strings", () => {
  const count = (s: string) => (s.match(/px \d|px -\d/g) ?? []).length;

  it("keeps one point count across every grow keyframe", () => {
    const frames = growFrames(300, 200, 900, Math.PI / 4, xPolygon);
    expect(frames[0].offset).toBe(0);
    expect(frames.at(-1)?.offset).toBe(1);
    const counts = new Set(frames.map((f) => count(String(f.clipPath))));
    expect(counts.size).toBe(1);
  });

  it("keeps one point count across every hole keyframe, and is evenodd", () => {
    const frames = growFrames(720, 450, 2000, 0, (p) => holePolygon(1440, 900, p));
    const counts = new Set(frames.map((f) => count(String(f.clipPath))));
    expect(counts.size).toBe(1);
    expect(String(frames[0].clipPath)).toMatch(/^polygon\(evenodd, /);
  });
});
