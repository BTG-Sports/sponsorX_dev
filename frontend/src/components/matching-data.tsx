"use client";

import { createContext, useContext } from "react";
import { FIXTURE_MATCH, type MatchData } from "@/lib/matching";

/* --------------------------------------------------------------------------
   The Matching Studio's data, as context (P4-FE-02). The studio and its
   compare / review / conflict panes used to read lib/matching's module
   constants directly, which welded the whole screen to one fixture brief.
   They now read whatever MatchData the page resolved — the fixture bundle
   for the demo, a real brief's roster for a signed-in BTG desk. The default
   is the fixture bundle, so a pane rendered outside a provider still works.
   -------------------------------------------------------------------------- */

export const MatchContext = createContext<MatchData>(FIXTURE_MATCH);

export function useMatch(): MatchData {
  return useContext(MatchContext);
}
