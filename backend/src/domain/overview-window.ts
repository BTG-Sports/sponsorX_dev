/**
 * The shared window the overview reads use — P1-ART-23 (sponsor) and
 * P1-ART-25 (finance). Moved out of `sponsor-overview.ts`, which re-exports
 * these names so nothing that already imports them has to change.
 *
 * A window is [from, to), `to` = tomorrow 00:00 UTC so today counts, bucketed
 * daily, or weekly past 120 days so the chart stays legible over "all time".
 */
export const RANGES = ["7d", "30d", "90d", "all"] as const;
export type RangeKey = (typeof RANGES)[number];

export const DAY = 86_400_000;

export type Window = { key: RangeKey; from: Date; to: Date; days: number; bucket: "day" | "week"; prevFrom: Date | null };

export const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
export const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The window a range covers: [from, to), `to` = tomorrow 00:00 UTC so today counts. */
export function windowFor(key: RangeKey, now: Date, earliest: Date | null): Window {
  const to = new Date(startOfDay(now).getTime() + DAY);
  if (key === "all") {
    const from = startOfDay(earliest && earliest < now ? earliest : now);
    const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
    return { key, from, to, days, bucket: days > 120 ? "week" : "day", prevFrom: null };
  }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[key];
  const from = new Date(to.getTime() - days * DAY);
  return { key, from, to, days, bucket: "day", prevFrom: new Date(from.getTime() - days * DAY) };
}
