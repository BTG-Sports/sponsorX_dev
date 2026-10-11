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
   "Tuesday, Oct 14"; "date" reads "Oct 14, 2026".

   `utc` — for DATE-ONLY values (a due day or an availability day, stored as
   midnight UTC). Read in a timezone west of UTC that midnight is still the
   previous evening, so the day would shift back one; formatted in UTC it is
   the day that was meant. The text is then the same on the server and in
   the browser, so it renders on the first paint with no client swap. */
const DATE_FORMAT: Record<"weekday" | "date", Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "long", month: "short", day: "numeric" },
  date: { month: "short", day: "numeric", year: "numeric" },
};

export function StadiumDate({ iso, format, utc = false }: { iso: string; format: "weekday" | "date"; utc?: boolean }) {
  const local = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleDateString("en-US", DATE_FORMAT[format]),
    () => "",
  );
  const text = utc ? new Date(iso).toLocaleDateString("en-US", { ...DATE_FORMAT[format], timeZone: "UTC" }) : local;

  return (
    <time dateTime={utc ? iso.slice(0, 10) : iso} suppressHydrationWarning={!utc}>
      {text}
    </time>
  );
}
