"use client";

import { useEffect } from "react";

/* --------------------------------------------------------------------------
   StagePortals (P1-ART-18) — while a portal on the stage is mounted, <body>
   carries `.sx-ops` too, so everything portaled to the body (the desks'
   drawers and dialogs, the user menu, the mobile nav) inherits the stage's
   fixed-dark tokens — a Frost user would otherwise get a light drawer over
   the night stage. Removed on unmount, so the public site and the other
   portals are untouched.

   P1-ART-25 — the Finance portal's Vault is two classes, `sx-ops sx-vault`
   (the ops chrome's structure, re-skinned): both go on <body>, so a dialog
   or the phone menu opened there is gold on bank green too. Split into
   single tokens first — classList.add throws on a token with a space.
   -------------------------------------------------------------------------- */

export function StagePortals({ className = "sx-ops" }: { /** The stage's class(es) — `sx-ops` (admin), `sx-arena` (athlete, P1-ART-22), `sx-stadium` (sponsor, P1-ART-23) or `sx-ops sx-vault` (finance, P1-ART-25). */ className?: string }) {
  useEffect(() => {
    const classes = className.split(/\s+/).filter(Boolean);
    document.body.classList.add(...classes);
    return () => document.body.classList.remove(...classes);
  }, [className]);
  return null;
}
