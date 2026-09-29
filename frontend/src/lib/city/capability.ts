/* --------------------------------------------------------------------------
   Cyberpunk city — capability gate and tier pick (P1-ART-09).

   Decides whether the 3D backdrop may run at all, and which GLB tier it
   loads. The two decisions are pure functions (unit-tested,
   tests/city-capability.test.ts); the DOM probe that feeds them is a thin,
   SSR-guarded helper. Ported from the P1-ART-08 scrollytelling branch
   (src/lib/landing-capability.ts) with the tier pick added.
   -------------------------------------------------------------------------- */

import type { Tier } from "./palette";

export interface Capability {
  webgl: boolean;
  reducedMotion: boolean;
  /** Touch device with low hardware concurrency — take the poster-only path. */
  coarseLowPerf: boolean;
  /** Any coarse-pointer (touch) device — used to pick the lite tier. */
  coarse?: boolean;
  /** `navigator.hardwareConcurrency` (undefined when the browser hides it). */
  cores?: number;
  /** `navigator.deviceMemory` in GiB (Chromium only; undefined elsewhere). */
  deviceMemory?: number;
}

/** Pure decision — may the scene mount at all. */
export function shouldRenderScene(cap: Capability): boolean {
  return cap.webgl && !cap.reducedMotion && !cap.coarseLowPerf;
}

/** Pure decision — which kit GLB and post-processing budget to use. Lite for
 *  touch devices, ≤ 4 cores, or ≤ 4 GiB of reported memory. Unknown values
 *  never demote: a browser that hides `hardwareConcurrency` still gets the
 *  desktop kit. */
export function pickTier(cap: Capability): Tier {
  if (cap.coarse) return "lite";
  if (cap.cores !== undefined && cap.cores <= 4) return "lite";
  if (cap.deviceMemory !== undefined && cap.deviceMemory <= 4) return "lite";
  return "desktop";
}

/** Thin DOM probe (not unit-tested; guarded for SSR). */
export function detectCapability(): Capability {
  if (typeof window === "undefined") {
    return { webgl: false, reducedMotion: true, coarseLowPerf: true };
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webgl = false;
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency;
  // Non-standard (Chromium); absent from lib.dom, so read it off a loose view.
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return {
    webgl,
    reducedMotion,
    coarse,
    cores,
    deviceMemory,
    coarseLowPerf: coarse && (cores ?? 4) <= 4,
  };
}
