/**
 * A team invites an athlete already on SponsorX — 2S2-BE-05.
 *
 * "A team invites an existing approved athlete with a proposed share; the
 * athlete accepts or declines (nobody is linked without agreeing). Either
 * side can end the link; past orders keep their split. 'Add a new athlete'
 * stays for players not yet on SponsorX."
 *
 * The programme owner's rules (2026-10-01) replace one clause: joining does
 * NOT end the athlete's own listings. The existing rule applies instead
 * (listing-rules.ts `sellerCanSell`): a roster athlete's items are listed by
 * the team, so the athlete's own listings simply stop selling while they are
 * on it, and sell again when they leave. Its mirror applies on leaving: the
 * team's live listings of the athlete's items are paused, and cannot go live
 * again while the athlete is not on the team (`governanceProblems`).
 *
 * THE LINK is Athlete.propertyId + teamShareBps, exactly what "Add athlete"
 * sets — so the roster, the inventory, the listings and the split all treat an
 * invited athlete as a roster athlete. The athlete keeps their own tenant
 * (usually the marketplace operator's), which the team scopes reach by the
 * link itself (scope.ts `teamMember`, `inventoryItem`, `listing`).
 *
 * PAST ORDERS keep their split: the breakdown and the ledger were frozen at
 * contract time (ledger.ts), and each sold line keeps naming the team and the
 * athlete it was sold by (OrderLineDelivery), whoever is on the roster later.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { assertMayCommit } from "./guardian-acts";
import { ForbiddenError } from "../auth/errors";
import { send } from "../lib/email";
import { SELLING_ATHLETE_STATES } from "./listing-rules";

type Tx = Prisma.TransactionClient;

export class TeamInvitationError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "TeamInvitationError";
    this.status = status;
  }
}

const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;
/** "20%" from 2000 bps. Pure. */
export const sharePct = (bps: number) => `${Math.round(bps) / 100}%`;

function teamOf(actor: Actor, action: "read" | "write"): string {
  const scope = assertAllowed(actor, "teamInvitation", action);
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("teamInvitation", action);
  return actor.propertyId;
}

function athleteOf(actor: Actor, action: "read" | "write"): string {
  const scope = assertAllowed(actor, "teamInvitation", action);
  if (scope !== "own" || !actor.athleteId) throw new ForbiddenError("teamInvitation", action);
  return actor.athleteId;
}

function assertShare(bps: unknown): asserts bps is number {
  if (typeof bps !== "number" || !Number.isInteger(bps) || bps < 0 || bps > 10_000) {
    throw new TeamInvitationError("teamShareBps is basis points: a whole number from 0 to 10000.", 422);
  }
}

/** The tenants an athlete the team may invite can be in: its own, and the marketplace that operates it. */
async function marketplaceTenants(tenantId: string): Promise<string[]> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { operatorTenantId: true } });
  return [tenantId, ...(t?.operatorTenantId ? [t.operatorTenantId] : [])];
}

/**
 * Who invites an athlete already on SponsorX: a team, or an agency (2S1-BE-08:
 * "roster and agreed share like a team"). A school, event, media or virtual
 * property keeps "Add athlete" for its own people.
 */
export const INVITING_KINDS: readonly string[] = ["TEAM", "AGENCY"];

/** The team's own property, as an invitation names it — approved, and a kind that invites. */
async function teamProperty(db: Tx | typeof prisma, actor: Actor, propertyId: string) {
  const p = await db.property.findFirst({
    where: { tenantId: actor.tenantId, id: propertyId }, select: { id: true, name: true, kind: true, city: true, stateCode: true, listingAccessAt: true },
  });
  if (!p) throw new ForbiddenError("teamInvitation", "read");
  if (!INVITING_KINDS.includes(p.kind)) throw new TeamInvitationError("Only a team or an agency invites athletes already on SponsorX. Use Add athlete for your own people.");
  if (!p.listingAccessAt) throw new TeamInvitationError("Only a team BTG has approved can invite athletes.");
  return p;
}

/* ── the team's side ───────────────────────────────────────────────────── */

/**
 * Athletes the team could invite: approved, on no team, in the team's own
 * marketplace — found by name. Public-profile fields only (no email, no
 * date of birth), and nothing without a search of at least two letters.
 */
export async function invitableAthletes(actor: Actor, q: string | undefined) {
  const propertyId = teamOf(actor, "write");
  await teamProperty(prisma, actor, propertyId);
  const term = q?.trim() ?? "";
  if (term.length < 2) return { athletes: [] };
  const tenants = await marketplaceTenants(actor.tenantId);
  const athletes = await prisma.athlete.findMany({
    where: {
      tenantId: { in: tenants }, state: { in: SELLING_ATHLETE_STATES as never[] }, propertyId: null,
      OR: [{ displayName: { contains: term, mode: "insensitive" } }, { legalName: { contains: term, mode: "insensitive" } }],
    },
    select: { id: true, displayName: true, sport: true, position: true, school: true, city: true, stateCode: true },
    orderBy: { displayName: "asc" },
    take: 20,
  });
  const pending = await prisma.teamInvitation.findMany({
    where: { ...whereFor(actor, "teamInvitation", "read"), propertyId, state: "PENDING", athleteId: { in: athletes.map((a) => a.id) } },
    select: { athleteId: true },
  });
  const invited = new Set(pending.map((p) => p.athleteId));
  return { athletes: athletes.map((a) => ({ ...a, invited: invited.has(a.id) })) };
}

const INVITE_SELECT = {
  id: true, propertyId: true, athleteId: true, athleteTenantId: true, teamShareBps: true, state: true, invitedBy: true,
  decidedAt: true, createdAt: true,
} as const;

/** The team's invitations — open ones first, then the latest answered. */
export async function teamInvitations(actor: Actor) {
  const propertyId = teamOf(actor, "read");
  const rows = await prisma.teamInvitation.findMany({
    where: { ...whereFor(actor, "teamInvitation", "read"), propertyId }, select: INVITE_SELECT, orderBy: { createdAt: "desc" }, take: 100,
  });
  const athletes = await prisma.athlete.findMany({
    /* tenant-scope: the athletes this team's own invitations (loaded through whereFor) name, each in the tenant the invitation records. */
    where: { OR: rows.map((r) => ({ id: r.athleteId, tenantId: r.athleteTenantId })) },
    select: { id: true, displayName: true, sport: true },
  });
  const name = new Map(athletes.map((a) => [a.id, a]));
  const view = rows.map((r) => ({ ...r, athlete: { id: r.athleteId, displayName: name.get(r.athleteId)?.displayName ?? "Athlete", sport: name.get(r.athleteId)?.sport ?? null } }));
  return { invitations: [...view.filter((v) => v.state === "PENDING"), ...view.filter((v) => v.state !== "PENDING")] };
}

/** Invite an approved athlete with no team, at a proposed share. They are linked only if they accept. */
export async function inviteAthlete(actor: Actor, input: { athleteId: string; teamShareBps: number }) {
  const propertyId = teamOf(actor, "write");
  assertShare(input.teamShareBps);
  const tenants = await marketplaceTenants(actor.tenantId);
  return prisma.$transaction(async (tx) => {
    const team = await teamProperty(tx, actor, propertyId);
    const athlete = await tx.athlete.findFirst({
      where: { tenantId: { in: tenants }, id: input.athleteId },
      select: { id: true, tenantId: true, state: true, propertyId: true, displayName: true, legalName: true, email: true },
    });
    if (!athlete) throw new ForbiddenError("teamInvitation", "write");
    if (!SELLING_ATHLETE_STATES.includes(athlete.state)) throw new TeamInvitationError("Only an athlete BTG has approved can be invited.");
    if (athlete.propertyId === propertyId) throw new TeamInvitationError(`${athlete.displayName} is already on your roster.`);
    if (athlete.propertyId) throw new TeamInvitationError(`${athlete.displayName} is on another team. They can join yours after leaving it.`);
    let row;
    try {
      row = await tx.teamInvitation.create({
        data: { tenantId: actor.tenantId, propertyId, athleteId: athlete.id, athleteTenantId: athlete.tenantId, teamShareBps: input.teamShareBps, invitedBy: actor.userId },
        select: INVITE_SELECT,
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new TeamInvitationError(`${athlete.displayName} already has an open invitation from your team.`);
      throw error;
    }
    await audit(tx, actor, "teamInvitation.create", "TeamInvitation", row.id, { after: { propertyId, athleteId: athlete.id, teamShareBps: input.teamShareBps } });
    const login = await tx.user.findFirst({
      /* tenant-scope: the invited athlete's own login, in their own tenant. */
      where: { tenantId: athlete.tenantId, athleteId: athlete.id, disabledAt: null }, select: { email: true },
    });
    const to = login?.email ?? athlete.email;
    if (to) {
      await send(tx, athlete.tenantId, {
        template: "team.invited", to, idempotencyKey: `team.invited:${row.id}`,
        data: { firstName: (athlete.legalName || athlete.displayName).split(/\s+/)[0] ?? "there", teamName: team.name, share: sharePct(input.teamShareBps), teamUrl: appUrl("/athlete/team") },
      });
    }
    return { ...row, athlete: { id: athlete.id, displayName: athlete.displayName } };
  });
}

/** The team takes back an invitation nobody has answered. */
export async function withdrawInvitation(actor: Actor, id: string, now = new Date()) {
  teamOf(actor, "write");
  return prisma.$transaction(async (tx) => {
    const row = await tx.teamInvitation.findFirst({ where: { ...whereFor(actor, "teamInvitation", "write"), id }, select: INVITE_SELECT });
    if (!row) throw new ForbiddenError("teamInvitation", "write");
    if (row.state !== "PENDING") throw new TeamInvitationError(`This invitation was already ${row.state.toLowerCase()}.`);
    const updated = await tx.teamInvitation.update({
      /* tenant-scope: the row just loaded through whereFor(teamInvitation, write). */
      where: { id: row.id }, data: { state: "WITHDRAWN", decidedAt: now, decidedBy: actor.userId }, select: INVITE_SELECT,
    });
    await audit(tx, actor, "teamInvitation.withdraw", "TeamInvitation", row.id, { before: { state: "PENDING" }, after: { state: "WITHDRAWN" } });
    return updated;
  });
}

/** The team removes an athlete from its roster. Past orders carry on, at their split. */
export async function removeFromRoster(actor: Actor, athleteId: string, now = new Date()) {
  assertAllowed(actor, "teamMember", "write");
  const propertyId = teamOf(actor, "write");
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "teamMember", "write"), id: athleteId }, select: { id: true },
    });
    if (!athlete) throw new ForbiddenError("teamMember", "write");
    const ended = await endLink(tx, actor, athlete.id, propertyId, "team", now);
    return { athleteId: athlete.id, ...ended };
  });
}

/* ── the athlete's side ────────────────────────────────────────────────── */

/** The athlete's team (if any), when they joined, and the invitations waiting for them. */
export async function myTeam(actor: Actor) {
  const athleteId = athleteOf(actor, "read");
  const me = await prisma.athlete.findFirst({ where: { tenantId: actor.tenantId, id: athleteId }, select: { propertyId: true, teamShareBps: true, createdAt: true } });
  if (!me) throw new ForbiddenError("teamInvitation", "read");
  const invites = await prisma.teamInvitation.findMany({
    where: { ...whereFor(actor, "teamInvitation", "read") }, select: INVITE_SELECT, orderBy: { createdAt: "desc" }, take: 50,
  });
  const teamIds = [...new Set([...invites.map((i) => i.propertyId), ...(me.propertyId ? [me.propertyId] : [])])];
  const teams = await prisma.property.findMany({
    /* tenant-scope: the teams named by the athlete's own invitations (whereFor) and their own roster link. */
    where: { id: { in: teamIds } }, select: { id: true, name: true, city: true, stateCode: true },
  });
  const team = new Map(teams.map((t) => [t.id, { name: t.name, city: [t.city, t.stateCode].filter(Boolean).join(", ") }]));
  const joined = me.propertyId ? invites.find((i) => i.propertyId === me.propertyId && i.state === "ACCEPTED") : null;
  return {
    membership: me.propertyId
      ? { teamId: me.propertyId, team: team.get(me.propertyId) ?? { name: "Your team", city: "" }, teamShareBps: me.teamShareBps, joinedAt: joined?.decidedAt ?? me.createdAt }
      : null,
    invitations: invites
      .filter((i) => i.state === "PENDING")
      .map((i) => ({ id: i.id, team: team.get(i.propertyId) ?? { name: "A team", city: "" }, teamShareBps: i.teamShareBps, invitedAt: i.createdAt, state: i.state })),
  };
}

/** The athlete accepts (and is linked at the share they were shown) or declines. */
export async function respondToInvitation(actor: Actor, id: string, decision: "ACCEPT" | "DECLINE", now = new Date()) {
  const athleteId = athleteOf(actor, "write");
  return prisma.$transaction(async (tx) => {
    /* 2S1-BE-11 / -12 — joining a team at a share is an agreement: a minor's
       guardian accepts it for them (their login acting for the ward), never
       the minor's own login, and nobody does during the coming-of-age pause. */
    if (decision === "ACCEPT") await assertMayCommit(tx, actor, "accept");
    const row = await tx.teamInvitation.findFirst({ where: { ...whereFor(actor, "teamInvitation", "write"), id }, select: { ...INVITE_SELECT, tenantId: true } });
    if (!row) throw new ForbiddenError("teamInvitation", "write");
    if (row.state !== "PENDING") throw new TeamInvitationError(`This invitation was already ${row.state.toLowerCase()}.`);
    const team = await tx.property.findFirst({
      /* tenant-scope: the team that sent this invitation, in the tenant the invitation records. */
      where: { tenantId: row.tenantId, id: row.propertyId }, select: { id: true, name: true, listingAccessAt: true },
    });
    const me = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: athleteId }, select: { id: true, state: true, propertyId: true, displayName: true, legalName: true } });
    if (!me || !team) throw new ForbiddenError("teamInvitation", "write");
    if (decision === "ACCEPT") {
      if (me.propertyId) throw new TeamInvitationError("You're already on a team. Leave it first to join this one.");
      if (!SELLING_ATHLETE_STATES.includes(me.state)) throw new TeamInvitationError("Your account isn't approved to sell right now, so you can't join a team.");
      if (!team.listingAccessAt) throw new TeamInvitationError(`${team.name} can't take on athletes right now.`);
      /* The link, at exactly the share the athlete was shown. Guarded so two
         acceptances at once cannot both link. */
      const linked = await tx.athlete.updateMany({
        where: { tenantId: actor.tenantId, id: athleteId, propertyId: null }, data: { propertyId: row.propertyId, teamShareBps: row.teamShareBps },
      });
      if (!linked.count) throw new TeamInvitationError("You're already on a team. Leave it first to join this one.");
    }
    const updated = await tx.teamInvitation.update({
      /* tenant-scope: the row just loaded through whereFor(teamInvitation, write). */
      where: { id: row.id }, data: { state: decision === "ACCEPT" ? "ACCEPTED" : "DECLINED", decidedAt: now, decidedBy: actor.userId }, select: INVITE_SELECT,
    });
    if (decision === "ACCEPT") {
      /* Other teams' open invitations lapse: an athlete is on one team at a time. */
      await tx.teamInvitation.updateMany({
        where: { ...whereFor(actor, "teamInvitation", "write"), state: "PENDING", id: { not: row.id } }, data: { state: "DECLINED", decidedAt: now, decidedBy: actor.userId },
      });
    }
    await audit(tx, actor, decision === "ACCEPT" ? "teamInvitation.accept" : "teamInvitation.decline", "TeamInvitation", row.id, {
      before: { state: "PENDING" }, after: { state: updated.state, ...(decision === "ACCEPT" ? { propertyId: row.propertyId, teamShareBps: row.teamShareBps } : {}) },
    });
    if (decision === "ACCEPT") {
      await audit(tx, actor, "team.joinAthlete", "Athlete", athleteId, { before: { propertyId: null }, after: { propertyId: row.propertyId, teamShareBps: row.teamShareBps } });
    }
    await tellTeam(tx, row.tenantId, row.propertyId, "team.invitationAnswered", `team.invitationAnswered:${row.id}`, {
      athleteName: me.legalName || me.displayName, answer: decision === "ACCEPT" ? "accepted" : "declined", teamName: team.name,
      share: sharePct(row.teamShareBps), rosterUrl: appUrl("/property/roster"),
    });
    return updated;
  });
}

/** The athlete leaves their team. Past orders carry on, at their split. */
export async function leaveTeam(actor: Actor, now = new Date()) {
  const athleteId = athleteOf(actor, "write");
  return prisma.$transaction(async (tx) => {
    const me = await tx.athlete.findFirst({ where: { tenantId: actor.tenantId, id: athleteId }, select: { id: true, propertyId: true } });
    if (!me) throw new ForbiddenError("teamInvitation", "write");
    if (!me.propertyId) throw new TeamInvitationError("You're not on a team.");
    const ended = await endLink(tx, actor, me.id, me.propertyId, "athlete", now);
    return { athleteId: me.id, ...ended };
  });
}

/* ── ending the link, from either side ─────────────────────────────────── */

/**
 * The athlete is off the roster: no team, no share. The team's live listings
 * of their items pause (and cannot go live again while the athlete is not on
 * the team); the athlete's own listings sell again under the usual rules.
 * Orders already placed are untouched — their split was frozen when each was
 * contracted.
 */
async function endLink(tx: Tx, actor: Actor, athleteId: string, propertyId: string, by: "team" | "athlete", now: Date) {
  const athlete = await tx.athlete.findUniqueOrThrow({
    /* tenant-scope: the athlete the caller loaded through its own scope (teamMember, or the athlete's own row). */
    where: { id: athleteId }, select: { tenantId: true, displayName: true, legalName: true, email: true, teamShareBps: true },
  });
  const moved = await tx.athlete.updateMany({
    /* tenant-scope: that athlete, only while still linked to this team. */
    where: { id: athleteId, propertyId }, data: { propertyId: null, teamShareBps: null },
  });
  if (!moved.count) throw new TeamInvitationError("That athlete isn't on this team any more.");
  const live = await tx.listing.findMany({
    /* tenant-scope: the team's own listings (by its property) of this athlete's items. */
    where: { propertyId, state: "PUBLISHED", item: { athleteId } }, select: { id: true, tenantId: true },
  });
  if (live.length) {
    await tx.listing.updateMany({
      /* tenant-scope: the rows just found, by id. */
      where: { id: { in: live.map((l) => l.id) } }, data: { state: "PAUSED" },
    });
    for (const l of live) {
      await audit(tx, actor, "listing.paused", "Listing", l.id, { before: { state: "PUBLISHED" }, after: { state: "PAUSED", reason: "athlete no longer on the team" } });
    }
  }
  await audit(tx, actor, by === "team" ? "team.removeAthlete" : "team.leave", "Athlete", athleteId, {
    before: { propertyId, teamShareBps: athlete.teamShareBps }, after: { propertyId: null, teamShareBps: null, listingsPaused: live.length },
  });
  const team = await tx.property.findUniqueOrThrow({
    /* tenant-scope: the team the athlete was linked to (the caller's own property, or the athlete's own link). */
    where: { id: propertyId }, select: { tenantId: true, name: true },
  });
  const name = athlete.legalName || athlete.displayName;
  const key = `team.linkEnded:${propertyId}:${athleteId}:${now.toISOString()}`;
  if (by === "athlete") {
    await tellTeam(tx, team.tenantId, propertyId, "team.linkEnded", key, {
      athleteName: name, teamName: team.name, who: `${name} left ${team.name}.`, link: appUrl("/property/roster"),
    });
  } else {
    const login = await tx.user.findFirst({
      /* tenant-scope: the athlete's own login, in their own tenant. */
      where: { tenantId: athlete.tenantId, athleteId, disabledAt: null }, select: { email: true },
    });
    const to = login?.email ?? athlete.email;
    if (to) {
      await send(tx, athlete.tenantId, {
        template: "team.linkEnded", to, idempotencyKey: key,
        data: { firstName: name.split(/\s+/)[0] ?? "there", athleteName: name, teamName: team.name, who: `${team.name} removed you from their roster.`, link: appUrl("/athlete/team") },
      });
    }
  }
  return { listingsPaused: live.length };
}

async function tellTeam(tx: Tx, tenantId: string, propertyId: string, template: "team.invitationAnswered" | "team.linkEnded", key: string, data: Record<string, string>) {
  const managers = await tx.user.findMany({
    /* tenant-scope: the team's own managers, in its own tenant. */
    where: { tenantId, propertyId, roles: { has: "PROPERTY_MGR" }, disabledAt: null }, select: { email: true },
  });
  for (const m of managers) await send(tx, tenantId, { template, to: m.email, idempotencyKey: `${key}:${m.email.toLowerCase()}`, data });
}
