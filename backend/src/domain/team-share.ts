/**
 * A team's share goes up only with the athlete's yes — POL-BE-03.
 *
 * The polish review found that a team could raise its share of any athlete it
 * added directly, minors included, with one click and without telling them;
 * only invited athletes (2S2-BE-05) were protected. Now, however the athlete
 * joined:
 *
 *   · a RAISE, a clear back to BTG's standard share (null — it may be higher),
 *     and the share typed at "Add athlete" are each a TeamShareChange the
 *     athlete answers. Athlete.teamShareBps changes only when it is accepted;
 *     until then the share stays where it was (for a new athlete: none, so
 *     BTG's standard team share applies);
 *   · a LOWER share applies at once, and ends any request still open;
 *   · a minor's request is accepted by the guardian (their login acting for
 *     the ward), never the minor's own login, and by nobody during the
 *     coming-of-age pause — the same rule as joining a team (assertMayCommit);
 *   · the athlete, and their guardian while the guardian acts for them, are
 *     emailed either way; the team hears the answer.
 *
 * One open request per athlete: a newer one replaces it. Leaving or being
 * removed from the team lapses it (endLink).
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { send } from "../lib/email";
import { guardianControls } from "./guardian-rules";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

const appUrl = (path: string) => `${env.APP_URL.replace(/\/+$/, "")}${path}`;

export const SHARE_CHANGE_SELECT = {
  id: true, propertyId: true, athleteId: true, fromBps: true, toBps: true, state: true, createdAt: true, decidedAt: true,
} as const;

/** "20%" from 2000 bps, or BTG's standard share for none. Pure. */
export const shareText = (bps: number | null) => (bps === null ? "BTG's standard team share" : `${Math.round(bps) / 100}%`);

/**
 * Does moving the team's share from `from` to `to` need the athlete's yes?
 * Anything that can raise it does: a higher share, setting one where none was
 * (BTG's standard share applied, which may be lower), and clearing one back to
 * BTG's standard share. Zero can raise nothing. Pure.
 */
export function needsAgreement(from: number | null, to: number | null): boolean {
  if (to === from || to === 0) return false;
  return to === null || from === null || to > from;
}

/** The athlete fields the emails need. */
export const SHARE_ATHLETE_SELECT = {
  id: true, tenantId: true, displayName: true, legalName: true, email: true, teamShareBps: true, propertyId: true,
  birthDate: true, ageBand: true, majorityAge: true, guardianId: true,
  comingOfAgeStartedAt: true, comingOfAgeCompletedAt: true, comingOfAgeTerminatedAt: true,
  guardian: { select: { legalName: true, email: true } },
} as const;
type ShareAthlete = Prisma.AthleteGetPayload<{ select: typeof SHARE_ATHLETE_SELECT }>;

/** End the athlete's open request, if any. Returns how many it ended (0 or 1). */
export async function endOpenShareChange(tx: Tx, actor: Actor, athleteTenantId: string, athleteId: string, state: "WITHDRAWN" | "LAPSED", now: Date) {
  const open = await tx.teamShareChange.findFirst({
    where: { tenantId: athleteTenantId, athleteId, state: "PENDING" }, select: { id: true },
  });
  if (!open) return 0;
  /* tenant-scope: the row just found in the athlete's own tenant. */
  await tx.teamShareChange.update({ where: { id: open.id }, data: { state, decidedAt: now, decidedBy: actor.userId } });
  await audit(tx, actor, state === "WITHDRAWN" ? "teamShareChange.withdraw" : "teamShareChange.lapse", "TeamShareChange", open.id, {
    before: { state: "PENDING" }, after: { state },
  });
  return 1;
}

/** The team asks for `toBps`. Replaces an open request; the athlete (and guardian) are emailed. */
export async function askShareChange(tx: Tx, actor: Actor, athlete: ShareAthlete, team: { id: string; name: string }, toBps: number | null, now: Date) {
  await endOpenShareChange(tx, actor, athlete.tenantId, athlete.id, "WITHDRAWN", now);
  const row = await tx.teamShareChange.create({
    data: { tenantId: athlete.tenantId, propertyId: team.id, athleteId: athlete.id, fromBps: athlete.teamShareBps, toBps, requestedBy: actor.userId },
    select: SHARE_CHANGE_SELECT,
  });
  await audit(tx, actor, "teamShareChange.ask", "TeamShareChange", row.id, {
    after: { propertyId: team.id, athleteId: athlete.id, fromBps: row.fromBps, toBps: row.toBps },
  });
  await tellAthleteSide(tx, athlete, "team.shareChangeAsked", `team.shareChangeAsked:${row.id}`, (forGuardian) => ({
    teamName: team.name, from: shareText(row.fromBps), to: shareText(row.toBps), teamUrl: appUrl("/athlete/team"),
    who: forGuardian ? `${firstOf(athlete)}'s` : "your",
    answerer: forGuardian ? "you accept for them" : "you accept",
  }));
  return row;
}

/** The athlete (and guardian) are told the team lowered its share. */
export async function tellShareLowered(tx: Tx, athlete: ShareAthlete, team: { id: string; name: string }, fromBps: number | null, toBps: number, now: Date) {
  await tellAthleteSide(tx, athlete, "team.shareLowered", `team.shareLowered:${athlete.id}:${now.toISOString()}`, (forGuardian) => ({
    teamName: team.name, from: shareText(fromBps), to: shareText(toBps), teamUrl: appUrl("/athlete/team"),
    who: forGuardian ? `${firstOf(athlete)}'s` : "your",
  }));
}

const firstOf = (a: { legalName: string; displayName: string }) => (a.legalName || a.displayName).trim().split(/\s+/)[0] ?? a.displayName;

/** To the athlete's login (or the email on file), and to the guardian while the guardian acts for them. */
async function tellAthleteSide(
  tx: Tx, athlete: ShareAthlete, template: "team.shareChangeAsked" | "team.shareLowered", key: string,
  data: (forGuardian: boolean) => Record<string, string>,
) {
  const login = await tx.user.findFirst({
    /* tenant-scope: the athlete's own login, in their own tenant. */
    where: { tenantId: athlete.tenantId, athleteId: athlete.id, disabledAt: null }, select: { email: true },
  });
  const to = login?.email ?? athlete.email;
  if (to) await send(tx, athlete.tenantId, { template, to, idempotencyKey: key, data: { firstName: firstOf(athlete), ...data(false) } });
  if (athlete.guardian?.email && guardianControls(athlete)) {
    await send(tx, athlete.tenantId, {
      template, to: athlete.guardian.email, idempotencyKey: `${key}:guardian`,
      data: { firstName: athlete.guardian.legalName.trim().split(/\s+/)[0] ?? "there", ...data(true) },
    });
  }
}

/** The open requests for these athletes from this team, by athlete id — for the roster views. */
export async function openShareChanges(db: Db, propertyId: string, athleteIds: string[]) {
  if (!athleteIds.length) return new Map<string, { id: string; fromBps: number | null; toBps: number | null; askedAt: Date }>();
  const rows = await db.teamShareChange.findMany({
    /* tenant-scope: this team's own requests (by its property) for athletes the caller loaded through whereFor(teamMember). */
    where: { propertyId, athleteId: { in: athleteIds }, state: "PENDING" }, select: SHARE_CHANGE_SELECT,
  });
  return new Map(rows.map((r) => [r.athleteId, { id: r.id, fromBps: r.fromBps, toBps: r.toBps, askedAt: r.createdAt }]));
}
