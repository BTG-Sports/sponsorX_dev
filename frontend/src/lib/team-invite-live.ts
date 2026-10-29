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

   2S2-BE-05: a team invites an existing athlete, the athlete accepts the
   share, and either side can leave or remove. The athlete's own listings
   stop selling while they are on the team (the team lists their items) and
   sell again after leaving. Orders already placed carry on and pay as before.

   POL-FE-03 (POL-BE-03): a team raising its share — or clearing it back to
   BTG's standard share — is a request the athlete answers; lowering applies
   at once. `membership.shareChange` on GET /me/team is the open request,
   answered with POST /me/team/share-changes/:id/respond. A minor's own
   login sees it but can't accept: the guardian does, from their own login
   acting for the ward (the API refuses the minor with guardian_must_act).
   -------------------------------------------------------------------------- */

export type ApiTeamPlace = { name: string; city: string };

/** POL-BE-03 — the team's open request to change its share. `toBps: null` asks for BTG's standard share. */
export type ApiShareChange = { id: string; fromBps: number | null; toBps: number | null; askedAt: string };

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
  /** POL-BE-03 — a share change waiting for the athlete's (or guardian's) answer. Absent on older replies. */
  shareChange?: ApiShareChange | null;
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
  const e = (body as { error?: { code?: unknown; message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  /* A coded 403 says why (guardian_must_act — the guardian answers for a minor); only a bare one means "not yours". */
  if (status === 403 && !(typeof e?.code === "string" && e.code !== "forbidden" && typeof e?.message === "string")) return "That isn't yours to change.";
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}

/* ---------------------------------------------------------- share change */

/** A share in words: null is BTG's standard team share, which applies while none is set. */
export function shareWords(bps: number | null): string {
  return bps === null ? "BTG's standard share" : sharePct(bps);
}

/** Who is looking at the athlete's team page, as far as the share change is concerned. */
export type ShareViewer = {
  /** The minor's own login (GET /me `guardianControl`), not the guardian acting for them. */
  minor: boolean;
  /** The ward's first name when a guardian is acting for them (`actingFor`), else null. */
  ward?: string | null;
  /** The 90-day coming-of-age pause, during which nobody accepts (2S1-BE-12). */
  paused?: boolean;
};

export type ShareChangeView = {
  id: string;
  from: string;
  to: string;
  /** What the athlete keeps at the asked share; null when BTG's standard share is asked. */
  keep: string | null;
  /** 0..1 — the lane under the asked share; null when BTG's standard share is asked. */
  keepShare: number | null;
  headline: string;
  effect: string;
  askedOn: string;
  /** Accept and Decline are shown. */
  canAnswer: boolean;
  /** Why they aren't, when they aren't (the minor's own login, or the pause). */
  cannotLine: string | null;
  /** The accept dialog's title and its one sentence. */
  acceptTitle: string;
  acceptLine: string;
  /** The accept button, named for who is accepting. */
  acceptLabel: string;
};

/**
 * The team's request, in the athlete's words. A minor's own login sees it
 * but the guardian answers; a guardian acting for the ward answers for them.
 */
export function shareChangeView(c: ApiShareChange, team: string, viewer: ShareViewer): ShareChangeView {
  const from = shareWords(c.fromBps);
  const to = shareWords(c.toBps);
  const whose = viewer.ward ? `${viewer.ward}'s` : "your";
  const you = viewer.ward ? viewer.ward : "you";
  const toStandard = c.toBps === null;
  const effect = toStandard
    ? `The team would go back to BTG's standard share of what ${you} earn${viewer.ward ? "s" : ""} from here on. Nothing changes until ${you} accept${viewer.ward ? "s" : ""}; orders already placed keep their split.`
    : `From here on the ${team} would take ${to} of what's left after BTG's fees and card processing. Nothing changes until ${viewer.ward ? "you accept for them" : "you accept"}; orders already placed keep their split.`;
  const cannotLine = viewer.minor
    ? "Your guardian accepts this, from their own login. You can see it here; nothing changes until they answer."
    : viewer.paused
      ? "Nobody can accept this during the coming-of-age pause. It waits until the pause ends."
      : null;
  return {
    id: c.id,
    from,
    to,
    keep: toStandard ? null : keepPct(c.toBps!),
    keepShare: toStandard ? null : 1 - c.toBps! / 10_000,
    headline: `The ${team} ask to change their share of ${whose} earnings from ${from} to ${to}.`,
    effect,
    askedOn: joinedOn(c.askedAt),
    canAnswer: !cannotLine,
    cannotLine,
    acceptTitle: `Accept ${to} for the ${team}?`,
    acceptLine: toStandard
      ? `The ${team} go back to BTG's standard share of ${whose} earnings from here on. Orders already placed keep their split.`
      : `The ${team} take ${to} of what's left after BTG's fees on ${whose} sales from here on. Orders already placed keep their split.`,
    acceptLabel: viewer.ward ? `Accept for ${viewer.ward}` : "Accept",
  };
}
