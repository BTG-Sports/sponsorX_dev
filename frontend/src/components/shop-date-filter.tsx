"use client";

import { DateRangePicker } from "@/components/date-range-picker";
import { useListNav } from "@/components/server-pager";
import { fmtDay, parseDay } from "@/lib/day-range";

/* --------------------------------------------------------------------------
   Shop — the "Dates" filter (P1-ART-23 Task 13, spec §7.8; review
   2026-10-12): the house calendar popover (components/date-range-picker.tsx,
   never the browser's native date input) bound to `?availableFrom` /
   `?availableUntil`, inside the page's <ServerList>. No Apply button — a
   pick writes both keys in ONE URL update, same as every other instant
   filter on the Stadium Board.

   One click picks a single day (from = until = that day: "available on
   it"); a second click widens it into a range; "Any dates" clears both. A
   URL value that isn't a real day is shown as no filter (the page already
   names it under "Not applied").
   -------------------------------------------------------------------------- */

export function ShopDateFilter({ availableFrom, availableUntil }: { availableFrom: string; availableUntil: string }) {
  const { set } = useListNav();
  const from = parseDay(availableFrom);
  const until = parseDay(availableUntil);
  /* A one-sided window (an older link) still reads as what it filters. */
  const oneSided = from && !until ? `From ${fmtDay(from)}` : !from && until ? `Until ${fmtDay(until)}` : undefined;
  return (
    <DateRangePicker
      from={from ?? until}
      to={from && until && until >= from ? until : null}
      onChange={(f, t) => set({ availableFrom: f, availableUntil: f === null ? null : (t ?? f) })}
      tone="sponsor"
      label="Available dates"
      allLabel="Any dates"
      triggerText={oneSided}
    />
  );
}
