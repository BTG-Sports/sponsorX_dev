/* --------------------------------------------------------------------------
   2S2-FE-05 — team invitations and leaving a team (Claude Design
   TeamInvite.dc.html: invite · joined · leave), and the team's side on the
   roster page.

   LIVE since 2S2-BE-05:
     athlete  GET  /me/team                           membership + invitations waiting
              POST /team-invitations/:id/respond      { decision: ACCEPT | DECLINE }
              POST /me/team/leave
     team     GET  /team/invitations                  open first, then answered
              GET  /team/invitations/candidates?q=    approved athletes with no team
              POST /team/invitations                  { athleteId, teamShareBps }
              POST /team-invitations/:id/withdraw
              POST /team/roster/:athleteId/remove

   The agreed rules (programme owner, 2026-10-01): a team invites an
   existing athlete, the athlete accepts the share, and either side can
   leave or remove. Joining does NOT end the athlete's own listings — they
   stop selling while the athlete is on the team, and the team lists their
   items. Orders already placed carry on and pay as before.
   -------------------------------------------------------------------------- */

export type ApiTeamPlace = { name: string; city: string };

export type ApiTeamInvitation = {
  id: string;
  team: ApiTeamPlace;
  /** The team's share of what's left after BTG's fees and card processing, in basis points. */
  teamShareBps: number;
  invitedAt: string;
  state: "PENDING" | "ACCEPTED" | "DECLINED" | "WITHDRAWN";
};

export type ApiTeamMembership = {
  teamId: string;
  team: ApiTeamPlace;
  teamShareBps: number | null;
  joinedAt: string;
};

export type ApiMyTeam = { membership: ApiTeamMembership | null; invitations: ApiTeamInvitation[] };

/** The team's side: one invitation it sent (GET /team/invitations). */
export type ApiSentInvitation = {
  id: string;
  athleteId: string;
  teamShareBps: number;
  state: ApiTeamInvitation["state"];
  createdAt: string;
  decidedAt: string | null;
  athlete: { id: string; displayName: string; sport: string | null };
};

/** An athlete the team could invite (GET /team/invitations/candidates). */
export type ApiInvitableAthlete = {
  id: string;
  displayName: string;
  sport: string;
  position: string | null;
  school: string | null;
  city: string | null;
  stateCode: string | null;
  invited: boolean;
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

/* The design's own worked example: a $1,000 order (2 sessions × $500) and
   $244.71 of BTG fees and card processing — an illustration of the share,
   labelled as an example on screen, never a quote. */
export const EXAMPLE_ORDER = { label: "2 sessions × $500 = $1,000 order", orderCents: 100_000, feesCents: 24_471 } as const;

/** "Waiting for an answer" / "Joined" / … — the team's view of what it sent. */
export function sentState(s: ApiSentInvitation["state"]): { label: string; tone: "warn" | "accent" | "neutral" } {
  switch (s) {
    case "PENDING": return { label: "Waiting for an answer", tone: "warn" };
    case "ACCEPTED": return { label: "Joined", tone: "accent" };
    case "DECLINED": return { label: "Declined", tone: "neutral" };
    case "WITHDRAWN": return { label: "Withdrawn", tone: "neutral" };
  }
}

/** A percentage typed by the team → basis points, or why it isn't one. */
export function parseInviteShare(raw: string): { ok: true; bps: number } | { ok: false; message: string } {
  const v = raw.trim().replace(/%$/, "");
  if (!v) return { ok: false, message: "Set the team's share — the athlete accepts it." };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, message: "A share from 0 to 100%." };
  const bps = Math.round(n * 100);
  return { ok: true, bps };
}

/** Words for a refused team write, from the API's error body. */
export function teamRefusal(status: number, body: unknown, fallback: string): string {
  if (status === 403) return "That isn't yours to change.";
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}
