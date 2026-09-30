/* --------------------------------------------------------------------------
   City assets (P1-ART-09 / P1-ART-11) — the files the scene loads, with
   their sizes on disk.

   One list, three readers: kit-instances.tsx (the GLB it draws),
   city-scene.tsx (the HDR it lights with) and city-backdrop.tsx (what the
   loading screen streams first, city-preload.ts). This module imports
   nothing from three, so the backdrop — which sits in the poster-only
   bundle — can read it.

   `estimate` is the size committed under public/; it is only used when a
   response carries no Content-Length. Refresh it when scripts/city-kit
   re-exports the files.
   -------------------------------------------------------------------------- */
import type { Tier } from "./palette";

export interface PreloadFile {
  url: string;
  /** Known size on disk, used when the response carries no Content-Length. */
  estimate: number;
}

export const KIT_URL: Record<Tier, string> = {
  desktop: "/models/city/city-kit.glb",
  lite: "/models/city/city-kit-lite.glb",
};

export const ENV_URL = "/textures/city/env.hdr";

const KIT_BYTES: Record<Tier, number> = { desktop: 6_508_624, lite: 2_865_200 };
const ENV_BYTES = 1_521_214;

/** Everything the loading screen waits for before the scene mounts. */
export function cityFiles(tier: Tier): PreloadFile[] {
  return [
    { url: KIT_URL[tier], estimate: KIT_BYTES[tier] },
    { url: ENV_URL, estimate: ENV_BYTES },
  ];
}
