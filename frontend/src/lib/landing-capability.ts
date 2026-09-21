/* --------------------------------------------------------------------------
   Landing scene capability gate (P1-ART-08). Decides whether the 3D scene may
   run at all. The decision is a pure function (unit-tested); the DOM probe that
   feeds it is a thin, SSR-guarded helper.
   -------------------------------------------------------------------------- */

export interface Capability {
  webgl: boolean;
  reducedMotion: boolean;
  /** touch device with low hardware concurrency — take the light/no-scene path. */
  coarseLowPerf: boolean;
  /** any coarse-pointer (touch) device — used to cap DPR even when it renders. */
  coarse?: boolean;
}

/** Pure decision — unit tested. */
export function shouldRenderScene(cap: Capability): boolean {
  return cap.webgl && !cap.reducedMotion && !cap.coarseLowPerf;
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
  const cores = navigator.hardwareConcurrency ?? 4;
  return { webgl, reducedMotion, coarse, coarseLowPerf: coarse && cores <= 4 };
}
