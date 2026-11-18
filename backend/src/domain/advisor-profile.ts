/**
 * POL-BE-103 — a school advisor's own Profile page.
 *
 * Only an ADVISOR's own login reaches it, for the one school their login is
 * linked to (`propertyId`); every other role is refused. It shows:
 *
 *   - the advisor's own name, job title and phone (theirs to set, at once,
 *     audited) and email (Clerk's — read only);
 *   - their school's name and kind (BTG's to change — the page says so), its
 *     email domain, and how many names are on its roster and when the roster
 *     last changed.
 *
 * The email domain and the roster are changed through their existing routes
 * (PUT /properties/{id}/email-domain, POST /properties/{id}/roster), with the
 * free-mail refusal they already have. An advisor's name, once set, is what
 * their students see on their own profile (POL-BE-101) beside the email.
 */
import { prisma } from "../db/client";
import { audit } from "../db/audit";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";

export class AdvisorProfileError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "AdvisorProfileError";
    this.status = status;
  }
}

/** The caller's own advisor login and school — or 403 for any other caller. */
function ownAdvisor(actor: Actor, action: "read" | "write") {
  if (!actor.roles.includes("ADVISOR") || !actor.propertyId || !actor.userId) throw new ForbiddenError("user", action);
  return { tenantId: actor.tenantId, propertyId: actor.propertyId, userId: actor.userId };
}

/** GET /advisor/profile */
export async function advisorProfile(actor: Actor) {
  const own = ownAdvisor(actor, "read");
  const [me, school, roster] = await Promise.all([
    prisma.user.findFirst({ where: { id: own.userId, tenantId: own.tenantId }, select: { email: true, fullName: true, jobTitle: true, phone: true } }),
    prisma.property.findFirst({ where: { id: own.propertyId, tenantId: own.tenantId }, select: { id: true, name: true, kind: true, emailDomain: true } }),
    prisma.rosterEntry.aggregate({ where: { tenantId: own.tenantId, propertyId: own.propertyId }, _count: { _all: true }, _max: { createdAt: true } }),
  ]);
  if (!me || !school) throw new ForbiddenError("user", "read");
  return {
    me: { name: me.fullName, jobTitle: me.jobTitle, phone: me.phone, email: me.email, signIn: "CLERK" as const },
    school: {
      id: school.id,
      name: school.name,
      kind: school.kind,
      /** The school's name and kind are BTG's to change. */
      managedBy: "BTG" as const,
      emailDomain: school.emailDomain,
      roster: { count: roster._count._all, lastUpdatedAt: roster._max.createdAt?.toISOString() ?? null },
    },
    editable: ["name", "jobTitle", "phone"] as const,
  };
}

/** PATCH /advisor/profile — the advisor's own name, job title and phone; null clears one. */
export async function updateAdvisorProfile(actor: Actor, input: Partial<{ name: string | null; jobTitle: string | null; phone: string | null }>) {
  const own = ownAdvisor(actor, "write");
  const data = {
    ...(input.name !== undefined ? { fullName: input.name } : {}),
    ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
  };
  if (Object.keys(data).length === 0) throw new AdvisorProfileError("Nothing to change.");
  await prisma.$transaction(async (tx) => {
    const before = await tx.user.findFirst({
      where: { id: own.userId, tenantId: own.tenantId }, select: { id: true, fullName: true, jobTitle: true, phone: true },
    });
    if (!before) throw new ForbiddenError("user", "write");
    const was = Object.fromEntries(Object.keys(data).map((k) => [k, before[k as keyof typeof data]]));
    if (Object.entries(data).every(([k, v]) => was[k] === v)) return;
    /* tenant-scope: the caller's own login, loaded above by id and tenant. */
    await tx.user.update({ where: { id: before.id }, data, select: { id: true } });
    await audit(tx, actor, "advisor.profileUpdate", "User", before.id, { before: was, after: data });
  });
  return advisorProfile(actor);
}
