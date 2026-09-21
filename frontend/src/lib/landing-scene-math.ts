/* --------------------------------------------------------------------------
   Landing 3D scroll math (P1-ART-08). Pure functions mapping overall scroll
   progress (0..1) to the active chapter and the spin-and-swap morph state.
   Kept framework-free and unit-tested; the three.js loop reads these each frame.
   -------------------------------------------------------------------------- */
import { SECTION_COUNT } from "./landing-chapters";

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

export interface ChapterAt {
  index: number;
  local: number;
}

/** Map overall scroll progress 0..1 to the active chapter index and the local
 *  progress 0..1 inside that chapter. */
export function chapterAt(progress: number): ChapterAt {
  const p = clamp01(progress);
  const span = 1 / SECTION_COUNT;
  let index = Math.floor(p / span);
  if (index >= SECTION_COUNT) index = SECTION_COUNT - 1;
  const local = clamp01((p - index * span) / span);
  return { index, local };
}

/** Fraction of a chapter, at its tail, over which the spin-and-swap runs. */
export const MORPH_BAND = 0.3;

export interface MorphState {
  from: number;
  to: number;
  t: number;
}

/** Spin-and-swap progress: 0 until the trailing band, then 0..1 into the next
 *  chapter's ball. The final chapter never morphs forward. */
export function morphState(progress: number): MorphState {
  const { index, local } = chapterAt(progress);
  const isLast = index >= SECTION_COUNT - 1;
  if (isLast || local < 1 - MORPH_BAND) return { from: index, to: index, t: 0 };
  const t = clamp01((local - (1 - MORPH_BAND)) / MORPH_BAND);
  return { from: index, to: index + 1, t };
}
