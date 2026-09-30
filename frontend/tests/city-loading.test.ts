import { describe, expect, it } from "vitest";

import {
  byteFraction,
  canFinish,
  COMPLETE_TASKS,
  easeDisplayed,
  INITIAL_TASKS,
  overallProgress,
  SCENE_MODULE_LOADED,
  TASK_WEIGHT,
} from "../src/lib/city/loading";

/* P1-ART-11 — the landing loading screen's number. It is a weighted sum of
   real tasks and must be honest: 0 at mount, 1 only when everything is
   there, and the poster path (nothing to load but the page) finishes. */

describe("overallProgress", () => {
  it("weights sum to one, so nothing done is 0 and everything done is 1", () => {
    const sum = Object.values(TASK_WEIGHT).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(overallProgress(INITIAL_TASKS)).toBe(0);
    expect(overallProgress(COMPLETE_TASKS)).toBe(1);
  });

  it("is monotone in every task", () => {
    const half = overallProgress({ assets: 0.5, scene: 0, content: 0 });
    const more = overallProgress({ assets: 0.9, scene: 0, content: 0 });
    expect(half).toBeCloseTo(TASK_WEIGHT.assets * 0.5, 10);
    expect(more).toBeGreaterThan(half);
  });

  it("never reaches 1 while the scene has not drawn", () => {
    expect(overallProgress({ assets: 1, scene: SCENE_MODULE_LOADED, content: 1 })).toBeLessThan(1);
  });

  it("clamps garbage task values", () => {
    expect(overallProgress({ assets: 2, scene: -1, content: Number.NaN })).toBeCloseTo(TASK_WEIGHT.assets, 10);
  });

  it("finishes on the poster path once the page content is in", () => {
    // The backdrop marks assets + scene complete when the scene will not run.
    expect(overallProgress({ assets: 1, scene: 1, content: 0 })).toBeCloseTo(1 - TASK_WEIGHT.content, 10);
    expect(overallProgress({ assets: 1, scene: 1, content: 1 })).toBe(1);
  });
});

describe("byteFraction", () => {
  it("is 1 with nothing to download", () => {
    expect(byteFraction([])).toBe(1);
  });

  it("weights downloads by their size", () => {
    const f = byteFraction([
      { loaded: 500, total: 1000, estimate: 1000 },
      { loaded: 0, total: 3000, estimate: 3000 },
    ]);
    expect(f).toBeCloseTo(500 / 4000, 10);
  });

  it("falls back to the estimate when there is no Content-Length", () => {
    expect(byteFraction([{ loaded: 250, estimate: 1000 }])).toBeCloseTo(0.25, 10);
  });

  it("counts a finished item as complete whatever arrived (a 404 body is tiny)", () => {
    expect(byteFraction([{ loaded: 12, estimate: 6_500_000, done: true }])).toBe(1);
  });

  it("never exceeds 1 when more bytes arrive than announced", () => {
    expect(byteFraction([{ loaded: 5000, total: 1000, estimate: 1000 }])).toBe(1);
  });
});

describe("easeDisplayed", () => {
  it("moves toward the target and never past it", () => {
    let d = 0;
    for (let i = 0; i < 200; i++) d = easeDisplayed(d, 0.6, 1 / 60);
    expect(d).toBeLessThanOrEqual(0.6);
    expect(d).toBeGreaterThan(0.55);
  });

  it("snaps to the target when the gap is tiny, so it does not stall at 99", () => {
    expect(easeDisplayed(0.998, 1, 1 / 60)).toBe(1);
  });

  it("drops instantly if the target somehow goes down", () => {
    expect(easeDisplayed(0.8, 0.5, 1 / 60)).toBe(0.5);
  });
});

describe("canFinish", () => {
  const ok = { target: 1, displayed: 1, elapsedMs: 2000, minShowMs: 1200 };

  it("leaves only when loaded, caught up, and shown long enough", () => {
    expect(canFinish(ok)).toBe(true);
    expect(canFinish({ ...ok, target: 0.99 })).toBe(false);
    expect(canFinish({ ...ok, displayed: 0.99 })).toBe(false);
    expect(canFinish({ ...ok, elapsedMs: 800 })).toBe(false);
  });
});
