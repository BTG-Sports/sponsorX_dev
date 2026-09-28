/**
 * A team's roster — 2S2-BE-04.
 *
 * "Teams and programs hold rosters, property inventory, users and revenue
 * shares — a layer above individual athletes." A team is an approved
 * property (2S1-BE-04) in its own tenant; its roster is the athletes linked
 * to that Property. The manager adds them — each becomes an Athlete in the
 * team's tenant with an account to sign in to (claimed by email, like every
 * provisioned user) — and sets the team's revenue share on each.
 *
 * Roster athletes start APPROVED rather than going through BTG's athlete
 * application: BTG verified the organisation, and the organisation vouches
 * for its own roster. Minors still need a verified guardian before any paid
 * work is accepted — that gate is on acceptance, and does not move.
 *
 * "A team manager can see their roster and the inventory belonging to it, and
 * nobody else's": every read is `whereFor(teamMember | inventoryItem)` under
 * the manager's own property, in their own tenant.
 */
import { randomBytes } from "node:crypto";

import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { assertAllowed, whereFor } from "../auth/scope";
import { ForbiddenError } from "../auth/errors";

export class TeamError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "TeamError";
    this.status = status;
  }
}

export type RosterAthleteInput = {
  legalName: string;
  displayName: string;
  email: string;
  sport: string;
  position?: string | null;
  gradYear?: number | null;
  birthDate?: Date | null;
  ageBand?: "UNDER_16" | "16_17" | "18_PLUS" | null;
  teamShareBps?: number | null;
};

const ITEM = {
  id: true, title: true, kind: true, priceCents: true, quantity: true, availableFrom: true, availableUntil: true,
  active: true, version: true,
} as const;

function managedProperty(actor: Actor, action: "read" | "write"): string {
  const scope = assertAllowed(actor, "teamMember", action);
  if (scope !== "own-property" || !actor.propertyId) throw new ForbiddenError("teamMember", action);
  return actor.propertyId;
}

function assertShare(bps: number | null | undefined) {
  if (bps != null && (!Number.isInteger(bps) || bps < 0 || bps > 10_000)) {
    throw new TeamError("teamShareBps is basis points: a whole number from 0 to 10000.");
  }
}

/** The roster, each athlete's own inventory, and the team's own inventory. */
export async function teamRoster(actor: Actor) {
  const propertyId = managedProperty(actor, "read");
  const [property, athletes, teamItems] = await Promise.all([
    prisma.property.findFirst({ where: { tenantId: actor.tenantId, id: propertyId }, select: { id: true, name: true, kind: true } }),
    prisma.athlete.findMany({
      where: whereFor(actor, "teamMember", "read"),
      select: {
        id: true, displayName: true, legalName: true, sport: true, position: true, gradYear: true, state: true, teamShareBps: true,
        inventory: { where: { tenantId: actor.tenantId }, select: ITEM, orderBy: { createdAt: "asc" } },
      },
      orderBy: { displayName: "asc" },
    }),
    prisma.inventoryItem.findMany({
      where: { ...whereFor(actor, "inventoryItem", "read"), propertyId }, select: ITEM, orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!property) throw new ForbiddenError("teamMember", "read");
  return { property, athletes, inventory: teamItems };
}

/** Add an athlete to the roster, with an account to claim. */
export async function addRosterAthlete(actor: Actor, input: RosterAthleteInput) {
  const propertyId = managedProperty(actor, "write");
  assertShare(input.teamShareBps);
  const email = input.email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    const property = await tx.property.findFirst({ where: { tenantId: actor.tenantId, id: propertyId }, select: { id: true } });
    if (!property) throw new ForbiddenError("teamMember", "write");
    const existing = await tx.user.findFirst({
      /* tenant-scope: identity is global — a sign-in is claimed by email across every tenant, so uniqueness is checked across them. */
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) throw new TeamError(`${email} already has a SponsorX account.`, 409);

    const base = input.displayName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "athlete";
    const athlete = await tx.athlete.create({
      data: {
        tenantId: actor.tenantId, propertyId, slug: `${base}-${randomBytes(3).toString("hex")}`,
        legalName: input.legalName.trim(), displayName: input.displayName.trim(), email, sport: input.sport.trim(),
        position: input.position?.trim() || null, gradYear: input.gradYear ?? null, birthDate: input.birthDate ?? null,
        ageBand: input.ageBand ?? null, state: "APPROVED", teamShareBps: input.teamShareBps ?? null,
      },
      select: { id: true, displayName: true, state: true, teamShareBps: true },
    });
    const user = await tx.user.create({
      data: {
        tenantId: actor.tenantId, email, roles: ["ATHLETE"], athleteId: athlete.id,
        clerkId: `invite:${randomBytes(12).toString("hex")}`,
      },
      select: { id: true },
    });
    await audit(tx, actor, "team.addAthlete", "Athlete", athlete.id, {
      after: { propertyId, userId: user.id, teamShareBps: athlete.teamShareBps, state: athlete.state },
    });
    return athlete;
  });
}

/** Set the team's share of one roster athlete's earnings. */
export async function setTeamShare(actor: Actor, athleteId: string, teamShareBps: number | null) {
  managedProperty(actor, "write");
  assertShare(teamShareBps);
  return prisma.$transaction(async (tx) => {
    const athlete = await tx.athlete.findFirst({
      where: { ...whereFor(actor, "teamMember", "write"), id: athleteId }, select: { id: true, teamShareBps: true },
    });
    if (!athlete) throw new ForbiddenError("teamMember", "write");
    const updated = await tx.athlete.update({
      where: { id: athlete.id }, data: { teamShareBps }, select: { id: true, displayName: true, teamShareBps: true },
    });
    await audit(tx, actor, "team.setShare", "Athlete", athleteId, {
      before: { teamShareBps: athlete.teamShareBps }, after: { teamShareBps },
    });
    return updated;
  });
}

