/**
 * POL-BE-19 — a sponsor admin adds teammates.
 *
 * A sponsor's people are `User` rows with its `sponsorId` and one of two
 * roles: SPONSOR_ADMIN (everything the sponsor may do) or SPONSOR_ANALYST
 * (read only). The policy already gave a sponsor admin `user` read and write
 * over its own sponsor (`own-sponsor`); nothing used it, so the first login
 * opened on approval was the only one a sponsor could ever have.
 *
 * AN INVITE IS A LOGIN WAITING TO BE CLAIMED — the same shape the approval
 * makes (sponsor-requests.ts): a row with a placeholder `clerkId`
 * (`invite:…`), which the first sign-in with that address claims
 * (auth/actor.ts resolveActor). Until then it is "Invited".
 *
 * Sign-in finds a row by address across the whole system, so an address
 * that already has a login (any role, any tenant) is refused rather than
 * given a second row. Removing a member switches the login off
 * (`disabledAt`) — its history stays attributed; removing an unclaimed
 * invite deletes it. An admin never changes or removes themselves, so a
 * sponsor always keeps an admin.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { assertAllowed } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";
import { send } from "../lib/email";
import { RateLimitedError } from "../lib/rate-limit";

export const SPONSOR_TEAM_ROLES = ["SPONSOR_ADMIN", "SPONSOR_ANALYST"] as const;
export type SponsorTeamRole = (typeof SPONSOR_TEAM_ROLES)[number];
export type MemberStatus = "INVITED" | "ACTIVE" | "REMOVED";

/** Invites per sponsor per hour; resends per invite per hour. */
export const INVITES_PER_HOUR = 20;
export const RESENDS_PER_HOUR = 3;

const PLACEHOLDER = "invite:";
const appUrl = () => env.APP_URL.replace(/\/+$/, "");

export class SponsorTeamError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SponsorTeamError";
    this.status = status;
  }
}

type Team = { tenantId: string; sponsorId: string; sponsorName: string; userId: string };

/** The caller's own sponsor, if they may manage its people: a sponsor admin of one sponsor. */
async function teamOf(actor: Actor): Promise<Team> {
  const scope = assertAllowed(actor, "user", "write");
  if (scope !== "own-sponsor" || !actor.sponsorId || !actor.userId) throw new ForbiddenError("user", "write");
  const sponsor = await prisma.sponsor.findFirst({
    where: { id: actor.sponsorId, tenantId: actor.tenantId },
    select: { id: true, name: true },
  });
  if (!sponsor) throw new ForbiddenError("user", "write");
  return { tenantId: actor.tenantId, sponsorId: sponsor.id, sponsorName: sponsor.name, userId: actor.userId };
}

const MEMBER = { id: true, email: true, roles: true, clerkId: true, disabledAt: true, createdAt: true } as const;
type MemberRow = { id: string; email: string; roles: string[]; clerkId: string; disabledAt: Date | null; createdAt: Date };

function statusOf(m: Pick<MemberRow, "clerkId" | "disabledAt">): MemberStatus {
  if (m.disabledAt) return "REMOVED";
  return m.clerkId.startsWith(PLACEHOLDER) ? "INVITED" : "ACTIVE";
}

function view(m: MemberRow, me: string) {
  return {
    id: m.id,
    email: m.email,
    role: (m.roles.includes("SPONSOR_ADMIN") ? "SPONSOR_ADMIN" : "SPONSOR_ANALYST") as SponsorTeamRole,
    status: statusOf(m),
    addedAt: m.createdAt.toISOString(),
    you: m.id === me,
  };
}

/** One of this sponsor's people, or 404 — never another sponsor's. */
async function memberOf(team: Team, id: string): Promise<MemberRow> {
  const m = await prisma.user.findFirst({
    where: { id, tenantId: team.tenantId, sponsorId: team.sponsorId, roles: { hasSome: [...SPONSOR_TEAM_ROLES] } },
    select: MEMBER,
  });
  if (!m) throw new SponsorTeamError("No such person on your team.", 404);
  return m;
}

function notYourself(team: Team, m: MemberRow) {
  if (m.id === team.userId) throw new SponsorTeamError("You can't change or remove yourself. Ask another admin.", 422);
}

async function underHourlyCap(team: Team, action: string, entityId: string | null, max: number, now: Date) {
  const n = await prisma.auditLog.count({
    where: {
      tenantId: team.tenantId, entity: "User", action, at: { gt: new Date(now.getTime() - 3_600_000) },
      ...(entityId ? { entityId } : { after: { path: ["sponsorId"], equals: team.sponsorId } }),
    },
  });
  if (n >= max) throw new RateLimitedError(3600);
}

async function sendInvite(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  team: Team, m: { id: string; email: string }, role: SponsorTeamRole, inviterEmail: string, key: string,
) {
  await send(tx, team.tenantId, {
    template: "sponsor.teamInvite",
    to: m.email,
    idempotencyKey: key,
    data: {
      businessName: team.sponsorName,
      inviter: inviterEmail,
      roleName: role === "SPONSOR_ADMIN" ? "an admin" : "a viewer (read only)",
      email: m.email,
      portalUrl: `${appUrl()}/sponsor`,
    },
  });
}

async function inviterEmail(team: Team): Promise<string> {
  const me = await prisma.user.findFirst({ where: { id: team.userId, tenantId: team.tenantId }, select: { email: true } });
  return me?.email ?? "your team admin";
}

/** GET /sponsor/team — everyone on the sponsor's team: admins first, then by when they were added. */
export async function sponsorTeam(actor: Actor) {
  const team = await teamOf(actor);
  const rows = await prisma.user.findMany({
    where: { tenantId: team.tenantId, sponsorId: team.sponsorId, roles: { hasSome: [...SPONSOR_TEAM_ROLES] } },
    select: MEMBER,
    orderBy: { createdAt: "asc" },
  });
  const order: Record<MemberStatus, number> = { ACTIVE: 0, INVITED: 1, REMOVED: 2 };
  const members = rows.map((r) => view(r, team.userId))
    .sort((a, b) => order[a.status] - order[b.status] || (a.role === b.role ? 0 : a.role === "SPONSOR_ADMIN" ? -1 : 1));
  return { sponsorName: team.sponsorName, members };
}

/** POST /sponsor/team — invite a colleague by email, as an admin or a read-only viewer. */
export async function inviteTeammate(actor: Actor, input: { email: string; role: SponsorTeamRole }, now = new Date()) {
  const team = await teamOf(actor);
  const email = input.email.trim().toLowerCase();
  const taken = await prisma.user.findFirst({
    /* tenant-scope: sign-in finds a login by address across every tenant (auth/actor.ts), so the check must too. Only existence is read. */
    where: { email },
    select: { id: true },
  });
  if (taken) throw new SponsorTeamError("That address already has a SponsorX login. Invite a different address.");
  await underHourlyCap(team, "sponsorTeam.invite", null, INVITES_PER_HOUR, now);
  const from = await inviterEmail(team);
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        tenantId: team.tenantId, sponsorId: team.sponsorId, email, roles: [input.role],
        /* Placeholder until the first sign-in with this address claims it — never a fabricated Clerk id. */
        clerkId: `${PLACEHOLDER}${randomBytes(12).toString("hex")}`,
      },
      select: MEMBER,
    });
    await audit(tx, actor, "sponsorTeam.invite", "User", created.id, { after: { sponsorId: team.sponsorId, email, role: input.role } });
    await sendInvite(tx, team, created, input.role, from, `sponsor.teamInvite:${created.id}`);
    return created;
  });
  return view(row, team.userId);
}

/** PATCH /sponsor/team/:id — switch someone between admin and viewer. */
export async function setTeammateRole(actor: Actor, id: string, role: SponsorTeamRole) {
  const team = await teamOf(actor);
  const m = await memberOf(team, id);
  notYourself(team, m);
  if (m.disabledAt) throw new SponsorTeamError("This person has been removed from your team.");
  const before = view(m, team.userId).role;
  if (before === role) return view(m, team.userId);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      /* tenant-scope: memberOf found it within this sponsor and tenant. */
      where: { id: m.id },
      data: { roles: [role] },
      select: MEMBER,
    });
    await audit(tx, actor, "sponsorTeam.role", "User", m.id, { before: { role: before }, after: { sponsorId: team.sponsorId, role } });
    return updated;
  });
  return view(row, team.userId);
}

/** POST /sponsor/team/:id/resend — the invite again, while it is unclaimed. */
export async function resendTeamInvite(actor: Actor, id: string, now = new Date()) {
  const team = await teamOf(actor);
  const m = await memberOf(team, id);
  if (statusOf(m) !== "INVITED") throw new SponsorTeamError("Only an invite nobody has used yet can be sent again.");
  await underHourlyCap(team, "sponsorTeam.inviteResent", m.id, RESENDS_PER_HOUR, now);
  const from = await inviterEmail(team);
  const role = view(m, team.userId).role;
  await prisma.$transaction(async (tx) => {
    await audit(tx, actor, "sponsorTeam.inviteResent", "User", m.id, { after: { sponsorId: team.sponsorId, email: m.email } });
    await sendInvite(tx, team, m, role, from, `sponsor.teamInvite:${m.id}:${now.getTime()}`);
  });
  return { sent: true, email: m.email };
}

/**
 * POST /sponsor/team/:id/remove — an unused invite is cancelled (deleted); a
 * member's login is switched off, so they can't sign in, and what they did
 * stays on record.
 */
export async function removeTeammate(actor: Actor, id: string, now = new Date()) {
  const team = await teamOf(actor);
  const m = await memberOf(team, id);
  notYourself(team, m);
  const status = statusOf(m);
  if (status === "REMOVED") return view(m, team.userId);
  return prisma.$transaction(async (tx) => {
    await audit(tx, actor, "sponsorTeam.remove", "User", m.id, { before: { status, email: m.email }, after: { sponsorId: team.sponsorId, status: "REMOVED" } });
    if (status === "INVITED") {
      /* tenant-scope: memberOf found it within this sponsor and tenant; never claimed, so nothing points at it. */
      await tx.user.delete({ where: { id: m.id } });
      return { ...view(m, team.userId), status: "REMOVED" as const };
    }
    const updated = await tx.user.update({
      /* tenant-scope: memberOf found it within this sponsor and tenant. */
      where: { id: m.id },
      data: { disabledAt: now, disabledReason: `Removed from ${team.sponsorName}'s team by an admin.` },
      select: MEMBER,
    });
    return view(updated, team.userId);
  });
}
