"use client";

import { useEffect } from "react";

/* --------------------------------------------------------------------------
   StagePortals (P1-ART-18) — while a portal on the stage is mounted, <body>
   carries `.sx-ops` too, so everything portaled to the body (the desks'
   drawers and dialogs, the user menu, the mobile nav) inherits the stage's
   fixed-dark tokens — a Frost user would otherwise get a light drawer over
   the night stage. Removed on unmount, so the public site and the other
   portals are untouched.
   -------------------------------------------------------------------------- */

export function StagePortals({ className = "sx-ops" }: { /** The stage's class — `sx-ops` (admin) or `sx-arena` (athlete, P1-ART-22). */ className?: string }) {
  useEffect(() => {
    document.body.classList.add(className);
    return () => document.body.classList.remove(className);
  }, [className]);
  return null;
}
