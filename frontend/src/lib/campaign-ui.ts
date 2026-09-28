import type { campaignRoster } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign operations helpers (2026-09-14 redesign of /admin/campaigns/[id]).
   Pure data + copy maps shared by the server page and the RosterOps island —
   no React, so the island's bundle stays small and the page can compute the
   pacing story on the server.
   -------------------------------------------------------------------------- */

export type RosterRow = (typeof campaignRoster)[number];

/** Fixture performance series points are spaced roughly two weeks apart. */
export const SERIES_STEP_DAYS = 14;

/* -------------------------------------------------------- order-state copy */

export const ORDER_TONE: Record<string, "accent" | "warn" | "danger"> = {
  ACCEPTED: "accent",
  SENT: "warn",
  DECLINED: "danger",
};

export const ORDER_COPY: Record<string, string> = {
  ACCEPTED: "Accepted",
  SENT: "Invitation sent",
  DECLINED: "Declined",
};

/** Plain-English meaning of each roster flag — §9.9 names these two flags
 *  explicitly; "Replacement needed" is the declined-order follow-up. */
export const FLAG_HINTS: Record<string, string> = {
  "Under-delivering":
    "Fewer deliverables have published than the schedule calls for by now.",
  "Awaiting acceptance":
    "The Campaign Order was sent, but the athlete hasn't accepted it yet.",
  "Replacement needed":
    "The athlete declined this order — the slot needs a new match.",
  /* P5-FE-05 — live only: BTG's move between invite and signature. */
  "Order not drafted":
    "The athlete accepted the invitation — BTG drafts and sends the Campaign Order next.",
};

/* ------------------------------------------------------------- pacing math */

export type PaceBand = "delivered" | "ahead" | "close" | "behind";

export const PACE_COPY: Record<PaceBand, { label: string; tone: "accent" | "warn" | "danger" }> = {
  delivered: { label: "Target delivered", tone: "accent" },
  ahead: { label: "On pace", tone: "accent" },
  close: { label: "Slightly behind", tone: "warn" },
  behind: { label: "Behind pace", tone: "danger" },
};

/** "8,369" → "8.4K" — finer than the axis-tick compact(), because a daily
 *  rate rounded to whole thousands would hide the on-pace/behind margin. */
export const fmtRate = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${Math.round(n)}`;

/**
 * The pacing story in numbers: recent daily rate (last two series points) vs
 * the rate still needed, and where the campaign lands if the recent rate
 * holds. Derived from verified series data — label computed values as such.
 */
export function paceFor(
  c: { viewsDelivered: number; viewsTarget: number; daysRemaining: number },
  series: { a: number }[],
) {
  const last = series[series.length - 1]?.a ?? c.viewsDelivered;
  const prev = series[series.length - 2]?.a ?? 0;
  const recentPerDay = Math.max(0, Math.round((last - prev) / SERIES_STEP_DAYS));
  const remaining = Math.max(0, c.viewsTarget - c.viewsDelivered);
  const neededPerDay =
    c.daysRemaining > 0 ? Math.round(remaining / c.daysRemaining) : remaining;
  const projectedTotal = Math.round(
    c.viewsDelivered + recentPerDay * c.daysRemaining,
  );
  const pct = Math.round((c.viewsDelivered / c.viewsTarget) * 100);
  const ratio = neededPerDay <= 0 ? Infinity : recentPerDay / neededPerDay;
  const band: PaceBand =
    remaining <= 0
      ? "delivered"
      : ratio >= 1
        ? "ahead"
        : ratio >= 0.75
          ? "close"
          : "behind";
  return { pct, remaining, neededPerDay, recentPerDay, projectedTotal, band };
}

/** Dashed projection tail for the AreaChart: the recent rate carried forward
 *  in ~two-week steps until the campaign ends. */
export function paceProjection(
  c: { viewsDelivered: number; daysRemaining: number },
  recentPerDay: number,
) {
  if (c.daysRemaining <= 0) return [];
  const steps = Math.max(1, Math.round(c.daysRemaining / SERIES_STEP_DAYS));
  return Array.from({ length: steps }, (_, i) => {
    const isEnd = i === steps - 1;
    const days = isEnd ? c.daysRemaining : (i + 1) * SERIES_STEP_DAYS;
    return {
      label: isEnd ? "end" : `+${(i + 1) * 2}w`,
      a: Math.round(c.viewsDelivered + recentPerDay * days),
    };
  });
}
