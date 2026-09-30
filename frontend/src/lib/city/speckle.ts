/* --------------------------------------------------------------------------
   Speckle grain as pixel data (P1-ART-09 / P1-ART-11).

   The venues' painted surfaces carry a deterministic speckle. It used to be
   drawn one `fillRect` per dot — 126 000 rects for a 2048² surface at
   density 0.03 — and the GPU process took seconds to rasterise that op list
   for the four venues; every WebGL command behind it on the same channel
   (the shader links, the first frame) waited, and the landing page hung.
   Writing the dots into an RGBA buffer and compositing it with one image op
   costs milliseconds. This module is the pure part; venue-utils.ts owns the
   canvas side.
   -------------------------------------------------------------------------- */

export type Rgb = readonly [number, number, number];

/** Write `n` opaque dots of `rgb`, each `size` px square, at seeded random
 *  positions into an RGBA buffer of `w`×`h`. Dots at the right and bottom
 *  edges are clipped, never wrapped. Consumes two `rand()` values per dot. */
export function paintSpeckle(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  n: number,
  rgb: Rgb,
  size: number,
  rand: () => number,
): void {
  const [r, g, b] = rgb;
  const s = Math.max(1, Math.floor(size));
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    const xEnd = Math.min(w, x + s);
    const yEnd = Math.min(h, y + s);
    for (let py = y; py < yEnd; py++) {
      let idx = (py * w + x) * 4;
      for (let px = x; px < xEnd; px++) {
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
        idx += 4;
      }
    }
  }
}

/** `#rgb` / `#rrggbb` → [r, g, b]; null for anything else. */
export function parseHex(color: string): Rgb | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  let hex = m[1];
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const v = parseInt(hex, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** How many `size`-px dots cover the same area as `n` dots of `dot` px, so a
 *  caller's density survives the rounding of the dot to whole pixels. */
export function dotsForCoverage(n: number, dot: number, size: number): number {
  return Math.floor((n * dot * dot) / (size * size));
}
