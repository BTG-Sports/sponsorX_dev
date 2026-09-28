"use client";

import { useSyncExternalStore } from "react";

/* --------------------------------------------------------------------------
   true in the browser after hydration, false during the server render.

   For anything that touches `document` at render time — a createPortal onto
   document.body above all. A drawer that opens on load (?new=1) used to call
   createPortal on the server, which threw "document is not defined" and
   dropped the whole page to client rendering (frontend audit, 2026-09-28).
   useSyncExternalStore gives the server snapshot (false) during hydration
   and the client snapshot (true) after, without a set-state-in-effect.
   -------------------------------------------------------------------------- */

const noSubscribe = () => () => {};

export function useMounted(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
