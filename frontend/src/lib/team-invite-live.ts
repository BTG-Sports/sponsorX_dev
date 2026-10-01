/* --------------------------------------------------------------------------
   2S2-FE-05 — the athlete's Team page (Claude Design TeamInvite.dc.html:
   invite · joined · leave).

   SCAFFOLD. Accepting, declining and leaving a team are 2S2-BE-05 — not
   built — and no read tells the athlete their team today: GET /me carries
   the user's own propertyId (a team manager's link, null for an athlete),
   and GET /athletes/me selects no team. So both views render from the
   samples below, typed like the read 2S2-BE-05 is expected to add.

   The agreed rules (programme owner, 2026-10-01): a team invites an
   existing athlete, the athlete accepts the share, and either side can
   leave or remove. Joining does NOT end the athlete's own listings — that
   was never agreed; the screens say only that orders already placed carry
   on and pay as before.
   -------------------------------------------------------------------------- */

/** Why every team action is off — the title on each disabled control. */
export const TEAM_WAITING = "Goes live with 2S2-BE-05 (joining and leaving a team) — nothing is sent yet.";

export type ApiTeamInvitation = {
  id: string;
  team: { name: string; city: string };
  /** The team's share of what's left after BTG's fees and card processing, in basis points. */
  teamShareBps: number;
  invitedAt: string;
  state: "WAITING" | "ACCEPTED" | "DECLINED";
};

export type ApiTeamMembership = {
  team: { name: string; city: string };
  teamShareBps: number;
  joinedAt: string;
};

/** "20%" from 2000 bps. */
export function sharePct(bps: number): string {
  return `${Math.round(bps) / 100}%`;
}

/** What the athlete keeps of the remainder: 2000 bps → "80%". */
export function keepPct(bps: number): string {
  return sharePct(10_000 - bps);
}

export function teamInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The worked split on an order, from its fee total: the remainder after
 * BTG's fees and card processing, the team's share of it, and the rest to
 * the athlete. The team's share rounds down and the athlete takes the
 * cent, so the three always add up to the order.
 */
export function splitExample(orderCents: number, feesCents: number, teamShareBps: number) {
  const remainder = orderCents - feesCents;
  const team = Math.floor((remainder * teamShareBps) / 10_000);
  return { orderCents, feesCents, teamCents: team, athleteCents: remainder - team };
}

/* -------------------------------------------------------------- samples */

/* The design's own figures: a $1,000 order (2 sessions × $500), $244.71 of
   BTG fees and card processing, a 20% team share — $151.05 to the Westfield
   Hawks and $604.24 to Riley. A labelled sample, not a quote. */
export const SAMPLE_ORDER = { label: "2 sessions × $500 = $1,000 order", orderCents: 100_000, feesCents: 24_471 } as const;

export const SAMPLE_INVITATION: ApiTeamInvitation = {
  id: "inv-westfield-hawks",
  team: { name: "Westfield Hawks", city: "Laurel, MD" },
  teamShareBps: 2000,
  invitedAt: "2026-09-29T15:00:00.000Z",
  state: "WAITING",
};

export const SAMPLE_MEMBERSHIP: ApiTeamMembership = {
  team: { name: "Westfield Hawks", city: "Laurel, MD" },
  teamShareBps: 2000,
  joinedAt: "2026-09-21T12:00:00.000Z",
};
