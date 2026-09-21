/* --------------------------------------------------------------------------
   Landing 3D scroll journey — chapter configuration (P1-ART-08).

   The public home page is six pinned sections; a centered ball spins-and-swaps
   through four sports, then collapses into the SponsorX "X". This is the single
   source of truth for which ball / environment / accent each section uses.
   Design: docs/superpowers/specs/2026-09-22-landing-3d-scrollytelling-design.md
   -------------------------------------------------------------------------- */

export type Accent = "blue" | "orange";
export type ChapterKind = "hero" | "sport" | "finale";

export interface Chapter {
  id: string;
  index: number;
  kind: ChapterKind;
  /** glTF filename under /models/landing, or null for the procedural hero orb. */
  ball: string | null;
  /** glTF environment hero-prop filename, or null (hero/finale are procedural). */
  env: string | null;
  accent: Accent;
  /** football only: animate sphere → prolate as it forms. */
  squash?: boolean;
}

export const CHAPTERS: Chapter[] = [
  { id: "hero",       index: 0, kind: "hero",   ball: null,                  env: null,                         accent: "blue" },
  { id: "soccer",     index: 1, kind: "sport",  ball: "ball-soccer.glb",     env: "env-soccer-goal.glb",        accent: "blue" },
  { id: "basketball", index: 2, kind: "sport",  ball: "ball-basketball.glb", env: "env-basketball-hoop.glb",    accent: "orange" },
  { id: "baseball",   index: 3, kind: "sport",  ball: "ball-baseball.glb",   env: "env-baseball-set.glb",       accent: "blue" },
  { id: "football",   index: 4, kind: "sport",  ball: "ball-football.glb",   env: "env-football-goalposts.glb", accent: "orange", squash: true },
  { id: "finale",     index: 5, kind: "finale", ball: "brand-x.glb",         env: null,                         accent: "orange" },
];

export const SECTION_COUNT = CHAPTERS.length;

export function chapterById(id: string): Chapter {
  const c = CHAPTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown chapter: ${id}`);
  return c;
}
