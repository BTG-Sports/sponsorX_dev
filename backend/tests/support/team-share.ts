import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * POL-BE-03 — the athlete agrees the share their team asked for at "Add
 * athlete", as POST /me/team/share-changes/{id}/respond would. For suites
 * whose subject is the money, not the asking (phase2-team-share tests that).
 */
export async function agreeTeamShare(prisma: PrismaClient, athleteId: string): Promise<void> {
  const row = await prisma.teamShareChange.findFirstOrThrow({ where: { athleteId, state: "PENDING" }, select: { id: true, toBps: true } });
  await prisma.$transaction([
    prisma.athlete.update({ where: { id: athleteId }, data: { teamShareBps: row.toBps } }),
    prisma.teamShareChange.update({ where: { id: row.id }, data: { state: "ACCEPTED", decidedAt: new Date() } }),
  ]);
}
