"use client";

/* "Updated 9:41 AM" (P1-ART-23) — a client island because the read time has
   to format in the *viewer's* timezone, not the server's. The server has no
   way to know that zone, so useSyncExternalStore (never subscribed — there
   is nothing to change, only a server/client snapshot to reconcile) renders
   empty server-side and the real time on the client; suppressHydrationWarning
   covers that one, expected text mismatch. */

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

export function StadiumUpdated({ iso }: { iso: string }) {
  const time = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    () => "",
  );

  return (
    <time dateTime={iso} suppressHydrationWarning>
      Updated {time}
    </time>
  );
}

/* A due date, in the viewer's own timezone (not the server's / UTC) — the
   same hydration-safe approach as StadiumUpdated above. "weekday" reads
   "Tuesday, Oct 14"; "date" reads "Oct 14, 2026". */
const DATE_FORMAT: Record<"weekday" | "date", Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "long", month: "short", day: "numeric" },
  date: { month: "short", day: "numeric", year: "numeric" },
};

export function StadiumDate({ iso, format }: { iso: string; format: "weekday" | "date" }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleDateString("en-US", DATE_FORMAT[format]),
    () => "",
  );

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {text}
    </time>
  );
}
