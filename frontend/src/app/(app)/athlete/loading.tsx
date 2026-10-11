import { ArenaGhost } from "@/components/arena-stage";

/* The arena's own loading screen (P1-ART-22): ghost plates where the title,
   the KPI row and the first panels land, so a page never flashes the generic
   portal skeleton before the arena. */
export default function Loading() {
  return <ArenaGhost label="Loading your arena" />;
}
