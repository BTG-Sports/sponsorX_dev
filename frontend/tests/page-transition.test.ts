import { describe, expect, it } from "vitest";

import {
  afterCover,
  coverRadius,
  growFrames,
  holePolygon,
  insideX,
  isSitePath,
  lockScroll,
  phaseDeadlineMs,
  routeLabel,
  scrollLocked,
  unlockScroll,
  xPoints,
  xPolygon,
} from "../src/lib/page-transition";

/* The three ways a transition used to strand the visitor (audit 2026-10-02). */
describe("transition safety", () => {
  const html = () => ({ style: { overflow: "" }, dataset: {} as Record<string, string | undefined> });

  /* The boot screen (landing-loader.tsx) saves html.style.overflow, sets
     "hidden", and puts the saved value back when it leaves. Replayed here
     exactly as it runs, interleaved with a link followed mid-boot. */
  it("a link followed while the boot screen is up never leaves the page locked", () => {
    const h = html();
    const bootSaved = h.style.overflow; // boot screen up
    h.style.overflow = "hidden";
    lockScroll(h); // click during boot: the transition covers
    h.style.overflow = bootSaved; // boot screen leaves first
    expect(scrollLocked(h)).toBe(true); // still covered — still locked
    unlockScroll(h); // reveal
    expect(scrollLocked(h)).toBe(false); // the old save/restore left this true for good
  });

  it("the transition's unlock never releases the boot screen's own lock", () => {
    const h = html();
    lockScroll(h);
    h.style.overflow = "hidden"; // boot screen still up
    unlockScroll(h);
    expect(scrollLocked(h)).toBe(true);
  });

  it("back pressed while the X grows: open up where the visitor is, don't push the clicked link", () => {
    expect(afterCover("/packages", "/packages")).toBe("push");
    expect(afterCover("/packages", "/")).toBe("stay");
  });

  it("cover and reveal always have a deadline past their own animation", () => {
    const t = { coverMs: 640, revealMs: 860, staggerMs: 85, titleLeadMs: 240 };
    expect(phaseDeadlineMs("cover", false, t)).toBeGreaterThan(t.coverMs + 2 * t.staggerMs);
    expect(phaseDeadlineMs("reveal", false, t)).toBeGreaterThan(t.titleLeadMs + t.revealMs + 2 * t.staggerMs);
    expect(phaseDeadlineMs("cover", true, t)).toBeGreaterThan(280);
    // …and none is long enough to feel like a hang.
    for (const p of ["cover", "reveal"] as const) expect(phaseDeadlineMs(p, false, t)).toBeLessThan(5_000);
  });
});

/* P1-ART-12 — the page transition. The X must really cover the screen
   before the route swaps (or the swap shows through a notch), every
   keyframe must have the same point count (or the browser cannot
   interpolate the clip-path), and only public-site moves get it. */

describe("isSitePath", () => {
  it("covers the home and the public pages", () => {
    for (const p of ["/", "/packages", "/join", "/next/about", "/athletes/jordan", "/s/abc", "/login"]) {
      expect(isSitePath(p)).toBe(true);
    }
  });

  it("leaves the portals and look-alike prefixes alone", () => {
    for (const p of ["/portal/sponsor", "/r/xyz", "/sponsors", "/joined", "/print/x", "/logins"]) {
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
    expect(routeLabel("/login")).toBe("Login");
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
