/* --------------------------------------------------------------------------
   What they may see — P2-BE-04, Guide §04 and §09.

   Moved from frontend/src/server on 2026-09-21 with the rest of authorisation:
   the API is reached by the portals, by §8's service account and by INFINEX
   alike, so the check has to live where the data is (Addendum B).

   `actor.ts` answers who is asking. This answers what that actor may reach,
   and it does so in two layers that are deliberately separate:

     1. **The policy** — `authz-policy.ts`, a transcription of the agreed RBAC
        matrix. Settled now, complete, testable without a database.
     2. **The filter** — turning a scope token into a Prisma `where` fragment.
        That needs to know each model's shape, so a builder lands with the
        milestone that first queries the model rather than being guessed now.

   Splitting them is the point. Writing thirty speculative `where` fragments
   for models nothing queries yet would be authorisation code whose
   correctness nobody can check, and wrong authorisation code is worse than
   absent authorisation code because it looks like protection.

   **Deny is the default, and it fails closed twice.** A resource with no
   policy row denies. A resource whose builder has not been written throws
   rather than returning an empty filter — an empty filter is `{}`, which in
   Prisma means *every row in the table*. That single mistake is the most
   plausible way to leak a whole tenant, so the type system and the runtime
   both refuse it.
   -------------------------------------------------------------------------- */

import type { Actor } from "./actor";
import { ForbiddenError } from "./errors";
import { scopeFor, type Action, type Resource, type Scope } from "./policy";
import { sellerCanSell } from "../domain/listing-rules";

export { type Action, type Resource, type Scope };

/**
 * Throw unless the actor may perform this action on this resource at all.
 *
 * This is the coarse gate — "may a PROPERTY_MGR read earnings" — and is what
 * a portal layout or a route handler calls before doing anything. It does not
 * decide *which rows*; `whereFor()` does that.
 */
export function assertAllowed(
  actor: Actor,
  resource: Resource,
  action: Action,
): Scope {
  const scope = scopeFor(actor.roles, resource, action);
  if (scope === "deny" || scope === "deferred") {
    throw new ForbiddenError(resource, action);
  }
  return scope;
}

/**
 * Throw unless the actor reaches this resource across the tenant.
 *
 * SOME ACTIONS ARE NOT DISTINGUISHED BY THEIR VERB. An athlete holds
 * `invitation.write` — for their own invitation, so they can accept or
 * decline — and BTG holds it across the tenant to *make* offers. Both are
 * "write", so `assertAllowed` alone cannot tell the two acts apart, and an
 * athlete passed the check that was supposed to stop them inviting
 * themselves (found in review, P4-BE-04).
 *
 * The matrix already separates them, and it does it by **scope**: a
 * self-scoped role holds `own` or `ward`, a BTG role holds `own-tenant` or
 * `any`. So where one verb covers two different acts, this is what the
 * BTG-side one asks for.
 *
 * Use it for an act performed *about* someone rather than *by* them:
 * inviting an athlete, verifying a guardian, scoring an athlete. Not for
 * accepting your own invitation or editing your own profile — those are the
 * `own` scope working as intended.
 */
export function assertTenantWide(
  actor: Actor,
  resource: Resource,
  action: Action,
): Scope {
  const scope = assertAllowed(actor, resource, action);
  if (scope !== "any" && scope !== "own-tenant") {
    throw new ForbiddenError(resource, action);
  }
  return scope;
}

/** Non-throwing form, for deciding whether to render a link or a tab. */
export function can(
  actor: Actor,
  resource: Resource,
  action: Action,
): boolean {
  const scope = scopeFor(actor.roles, resource, action);
  return scope !== "deny" && scope !== "deferred";
}

/**
 * A filter that matches nothing.
 *
 * Never `{}`. In Prisma an empty `where` matches every row, so "no
 * restriction" and "no access" would be the same object — the difference
 * between showing one tenant's data and showing all of it.
 */
export const MATCHES_NOTHING = { id: { in: [] as string[] } } as const;

/**
 * Turn a scope token into a `where` fragment for a resource.
 *
 * Only resources something actually queries have a builder. Everything else
 * throws `ScopeNotImplementedError`, loudly and at the call site, so the
 * milestone that first needs a model is forced to write its filter with the
 * model's real shape in front of it.
 */
export class ScopeNotImplementedError extends Error {
  readonly status = 500;
  constructor(resource: Resource, scope: Scope) {
    super(
      `No scope filter is implemented for ${resource} at scope "${scope}". ` +
        `Add one in src/server/scope.ts alongside the query that needs it — ` +
        `the policy in authz-policy.ts already allows this, only the filter ` +
        `is missing.`,
    );
    this.name = "ScopeNotImplementedError";
  }
}

/** A Prisma `where` fragment. Loose by necessity: one function serves many
 *  models, and each model's delegate narrows it at the call site. */
type Where = Record<string, unknown>;

type Builder = (actor: Actor, scope: Scope, action?: Action) => Where;

/**
 * Tenant scoping, which sits above everything else (matrix §2).
 *
 * Every model that carries `tenantId` gets this for free. `any` is the only
 * scope that crosses the boundary, and only SUPER_ADMIN holds it.
 */
function tenantScoped(actor: Actor, scope: Scope): Where {
  switch (scope) {
    case "any":
      return {};
    case "catalog":
      /* A published catalogue is cross-tenant by design — the shop window,
         not tenant data. */
      return {};
    case "own-tenant":
      return { tenantId: actor.tenantId };
    default:
      return MATCHES_NOTHING;
  }
}

/**
 * Phase 2 (2S3-BE-01) — the actor's own tenant and every outside tenant it
 * operates. Expressed through the row's `tenant` relation, so it is one
 * query and needs no list of ids.
 */
function operated(actor: Actor): Where {
  return { OR: [{ tenantId: actor.tenantId }, { tenant: { operatorTenantId: actor.tenantId } }] };
}

/** NEXT publication-domain rows: tenant-wide for staff, the actor's school
 *  for `own-property` (an ADVISOR's, or a STUDENT's own school). */
function nextByProperty(actor: Actor, scope: Scope, bySchool: (propertyId: string) => Where): Where {
  if (scope === "own-property") {
    return actor.propertyId ? { tenantId: actor.tenantId, ...bySchool(actor.propertyId) } : MATCHES_NOTHING;
  }
  return tenantScoped(actor, scope);
}

function studentScope(actor: Actor, scope: Scope): Where {
  switch (scope) {
    case "any":
      return {};
    case "own-tenant":
      return { tenantId: actor.tenantId };
    case "own":
      return actor.studentId ? { tenantId: actor.tenantId, id: actor.studentId } : MATCHES_NOTHING;
    case "own-property":
      return actor.propertyId ? { tenantId: actor.tenantId, propertyId: actor.propertyId } : MATCHES_NOTHING;
    case "ward":
      return actor.guardianId ? { tenantId: actor.tenantId, guardianId: actor.guardianId } : MATCHES_NOTHING;
    default:
      return MATCHES_NOTHING;
  }
}

function throughStudent(actor: Actor, scope: Scope): Where {
  if (scope === "any") return {};
  if (scope === "own-tenant") return { tenantId: actor.tenantId };
  const inner = studentScope(actor, scope);
  if (inner === MATCHES_NOTHING) return MATCHES_NOTHING;
  return { tenantId: actor.tenantId, student: { is: inner } };
}

/**
 * Builders for the resources that are queried today.
 *
 * `user` is the only one so far: the mirror in `identity.ts` is the single
 * database read the application performs. As each B-milestone wires a model,
 * it adds its builder here — `athlete` with B1, `campaign` with B3, and so on.
 */
const BUILDERS: Partial<Record<Resource, Builder>> = {
  /* The marketplace catalogue (P4-FE-01). Tenant rows like any other; the
     `catalog` scope resolves through tenantScoped. */
  sponsorPackage: tenantScoped,
  nilJob: tenantScoped,

  user: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return { id: actor.userId };
      case "own-sponsor":
        /* A sponsor admin reaches the users of their own sponsor org. The
           column exists on User, so this one is expressible today. */
        return { tenantId: actor.tenantId, sponsorId: { not: null } };
      default:
        return MATCHES_NOTHING;
    }
  },

  /* P9-OPS-01 — a school (or any property) and the manager who runs it.
     `own` is the property the actor's User row is linked to, and nothing
     else: a PROPERTY_MGR with no link reaches no property at all. Tenant
     stays in the conjunct, so a link forged across tenants still misses. */
  property: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.propertyId ? { tenantId: actor.tenantId, id: actor.propertyId } : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* Tenant itself has no tenantId column — it *is* the tenant. */
  tenant: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { id: actor.tenantId };
      default:
        return MATCHES_NOTHING;
    }
  },

  auditLog: tenantScoped,

  /* SponsorX NEXT (P9-BE-02/03/06/12). Staff scopes are tenant-wide; an
     ADVISOR or STUDENT reaches their own school's mastheads and everything
     under them (`own-property`, matrix §15.3) — through the publication,
     because only the publication names the school. A regional (DMV)
     publication has no school, so no advisor or student reaches it this way. */
  publication: (actor, scope) => nextByProperty(actor, scope, (p) => ({ propertyId: p })),
  edition: (actor, scope) => nextByProperty(actor, scope, (p) => ({ publication: { is: { propertyId: p } } })),
  adSlot: (actor, scope) =>
    nextByProperty(actor, scope, (p) => ({ edition: { is: { publication: { is: { propertyId: p } } } } })),
  revenueSplit: tenantScoped,
  editionEvent: (actor, scope) =>
    nextByProperty(actor, scope, (p) => ({ edition: { is: { publication: { is: { propertyId: p } } } } })),

  /* SponsorX NEXT students (P9-BE-05, matrix §15.2). `own` is the actor's
     own Student row (User.studentId); `own-property` the advisor's school;
     `ward` a guardian's children — the same three shapes as the athlete. */
  student: (actor, scope) => studentScope(actor, scope),
  /* Everything a student owns scopes through the student, so the four can
     never drift from `student`: whoever may not reach a student cannot
     reach their code, sales, points or prospects either. */
  studentCode: (actor, scope) => throughStudent(actor, scope),
  saleAttribution: (actor, scope) => throughStudent(actor, scope),
  studentPoints: (actor, scope) => throughStudent(actor, scope),
  studentProspect: (actor, scope) => throughStudent(actor, scope),

  /* SponsorX NEXT rights and claims (P9-BE-10, -11, -14). */
  editionAsset: (actor, scope) =>
    nextByProperty(actor, scope, (p) => ({ edition: { is: { publication: { is: { propertyId: p } } } } })),
  contentRight: (actor, scope) => {
    /* A student reads the rights on their OWN work — the asset they made. */
    if (scope === "own") {
      return actor.studentId ? { tenantId: actor.tenantId, asset: { is: { studentId: actor.studentId } } } : MATCHES_NOTHING;
    }
    return nextByProperty(actor, scope, (p) => ({ asset: { is: { edition: { is: { publication: { is: { propertyId: p } } } } } } }));
  },
  rosterEntry: (actor, scope) => nextByProperty(actor, scope, (p) => ({ propertyId: p })),
  /* A claim is on an athlete at a school — the advisor of THAT school. */
  athleteClaim: (actor, scope) => nextByProperty(actor, scope, (p) => ({ athlete: { is: { propertyId: p } } })),
  contentContribution: (actor, scope) => {
    if (scope === "own") {
      return actor.studentId ? { tenantId: actor.tenantId, studentId: actor.studentId } : MATCHES_NOTHING;
    }
    return nextByProperty(actor, scope, (p) => ({ propertyId: p }));
  },
  schoolPoolAllocation: tenantScoped,
  propertyOnboarding: tenantScoped,
  /* Phase 2 Sprint 2–3 — inventory, the team roster, listings, offers,
     branding (matrix §18). */
  inventoryItem: (actor, scope) => {
    switch (scope) {
      case "any": return {};
      case "operated": return operated(actor);
      case "own-property":
        return actor.propertyId
          ? { tenantId: actor.tenantId, OR: [{ propertyId: actor.propertyId }, { athlete: { propertyId: actor.propertyId } }] }
          : MATCHES_NOTHING;
      case "own":
        /* The athlete's own items, or — for a team manager — the team's own. */
        if (actor.athleteId) return { tenantId: actor.tenantId, athleteId: actor.athleteId };
        return actor.propertyId ? { tenantId: actor.tenantId, propertyId: actor.propertyId } : MATCHES_NOTHING;
      default: return MATCHES_NOTHING;
    }
  },
  /* The athletes on a team: Athlete rows linked to the manager's property. */
  teamMember: (actor, scope) => {
    if (scope === "any") return {};
    if (scope === "own-property") {
      return actor.propertyId ? { tenantId: actor.tenantId, propertyId: actor.propertyId } : MATCHES_NOTHING;
    }
    return MATCHES_NOTHING;
  },
  listing: (actor, scope, action) => {
    switch (scope) {
      case "any": return {};
      case "operated": return operated(actor);
      case "catalog":
        /* 2S3-BE-04 — what a sponsor may see: live, public listings of
           approved properties, in its own marketplace (its tenant and the
           tenants that tenant operates). Never a draft, a pause, a private
           listing, a suspended property or another marketplace. 2S3-BE-05 —
           or of an independent athlete who is still approved and still has
           no team. */
        return {
          AND: [
            operated(actor),
            { state: "PUBLISHED", visibility: "PUBLIC", item: { active: true } },
            sellerCanSell(),
            { OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
          ],
        };
      case "own-property":
        return actor.propertyId ? { tenantId: actor.tenantId, propertyId: actor.propertyId } : MATCHES_NOTHING;
      case "own":
        /* Reading: every listing of the athlete's items, their team's
           included. Writing (2S3-BE-05): only the listings they sell
           themselves — never their team's listing of their item. */
        if (!actor.athleteId) return MATCHES_NOTHING;
        return action === "read"
          ? { tenantId: actor.tenantId, item: { athleteId: actor.athleteId } }
          : { tenantId: actor.tenantId, sellerAthleteId: actor.athleteId, item: { athleteId: actor.athleteId } };
      default: return MATCHES_NOTHING;
    }
  },
  offer: (actor, scope) => {
    if (scope === "own") return actor.athleteId ? { tenantId: actor.tenantId, athleteId: actor.athleteId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  brandRestriction: (actor, scope) => {
    switch (scope) {
      case "any": return {};
      case "operated": return operated(actor);
      case "own-tenant": return { tenantId: actor.tenantId };
      case "own": return actor.athleteId ? { tenantId: actor.tenantId, athleteId: actor.athleteId } : MATCHES_NOTHING;
      case "own-property":
        return actor.propertyId
          ? { tenantId: actor.tenantId, OR: [{ propertyId: actor.propertyId }, { athlete: { propertyId: actor.propertyId } }] }
          : MATCHES_NOTHING;
      default: return MATCHES_NOTHING;
    }
  },
  cart: (actor, scope) => {
    if (scope === "own-sponsor") return actor.sponsorId ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  reservation: (actor, scope) => {
    if (scope === "own-sponsor") return actor.sponsorId ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  commissionRule: tenantScoped,
  orderFinancials: tenantScoped,
  /* The books are the operator's; a party reads its own entries by the
     party's tenant and id — never another party's, never another tenant's. */
  ledgerEntry: (actor, scope) => {
    if (scope === "own-property") {
      return actor.propertyId ? { partyTenantId: actor.tenantId, partyType: "PROPERTY", partyId: actor.propertyId } : MATCHES_NOTHING;
    }
    if (scope === "own") {
      return actor.athleteId ? { partyTenantId: actor.tenantId, partyType: "ATHLETE", partyId: actor.athleteId } : MATCHES_NOTHING;
    }
    return tenantScoped(actor, scope);
  },
  marketplaceOrder: (actor, scope) => {
    if (scope === "own-sponsor") return actor.sponsorId ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  /* 2S5-INT-03 — a payee's own payout account, in the payee's own tenant. */
  payoutAccount: (actor, scope) => {
    if (scope === "own") return actor.athleteId ? { tenantId: actor.tenantId, payeeType: "ATHLETE", payeeId: actor.athleteId } : MATCHES_NOTHING;
    if (scope === "own-property") return actor.propertyId ? { tenantId: actor.tenantId, payeeType: "PROPERTY", payeeId: actor.propertyId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  /* 2S5-BE-04 — a payout is in the operator's books (tenantId) and names its
     payee's tenant; a payee reads only its own, like its ledger entries. */
  payout: (actor, scope) => {
    if (scope === "own") return actor.athleteId ? { payeeTenantId: actor.tenantId, payeeType: "ATHLETE", payeeId: actor.athleteId } : MATCHES_NOTHING;
    if (scope === "own-property") return actor.propertyId ? { payeeTenantId: actor.tenantId, payeeType: "PROPERTY", payeeId: actor.propertyId } : MATCHES_NOTHING;
    return tenantScoped(actor, scope);
  },
  tenantBranding: (actor, scope) => {
    if (scope === "any") return {};
    if (scope === "own-tenant" || scope === "own") return { tenantId: actor.tenantId };
    return MATCHES_NOTHING;
  },

  /* 2S6-BE-02 — a user's own notification preferences, and only theirs. */
  notificationPreference: (actor, scope) =>
    scope === "own" ? { tenantId: actor.tenantId, userId: actor.userId } : MATCHES_NOTHING,

  /* 2S7-BE-02 — a rendered sponsor report (ReportFile). Staff reach the
     tenant's; a sponsor reaches the files for their own campaigns. */
  sponsorReport: (actor, scope) => {
    if (scope === "own") {
      return actor.sponsorId
        ? { tenantId: actor.tenantId, campaign: { is: { sponsorId: actor.sponsorId } } }
        : MATCHES_NOTHING;
    }
    return tenantScoped(actor, scope);
  },

  /* Added with P3-BE-01, the first task to query athletes. This is the
     pattern the file was designed for: the policy already allowed these
     scopes, only the filter was missing, and it is written now with the
     model's real columns in front of us rather than guessed months ago.

     `assigned` and `ward` are NOT implemented yet on purpose. A sponsor sees
     only athletes assigned to their campaigns, and a guardian only their
     wards — both need CampaignInvite and Guardian joins that arrive with B3
     and B1's guardian path. Leaving them to fall through to MATCHES_NOTHING
     means a sponsor currently sees no athletes at all, which is the safe
     direction to be wrong in. */
  /* Guardians are tenant data with no cross-tenant case at all — even
     SUPER_ADMIN's `any` is the only scope that leaves the tenant, and the
     matrix gives athletes and guardians only `own`/`ward`, which need the
     Athlete join that arrives with B1's wiring. */
  guardian: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        /* A guardian reads their own record. Note this is NOT enough to
           verify it — verification is BTG's attestation and goes through
           assertTenantWide (P3-BE-14). */
        return actor.guardianId
          ? { tenantId: actor.tenantId, id: actor.guardianId }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  athlete: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        /* The athlete's own record. `User.athleteId` rather than a join back
           through the mirror: one column, one index, same answer. */
        return actor.athleteId
          ? { tenantId: actor.tenantId, id: actor.athleteId }
          : MATCHES_NOTHING;
      case "ward":
        /* A guardian reaches the minors they are responsible for, and no
           others. Implemented now because P3-BE-14 exposed the guardian
           endpoints; before that it fell through to MATCHES_NOTHING. */
        return actor.guardianId
          ? { tenantId: actor.tenantId, guardianId: actor.guardianId }
          : MATCHES_NOTHING;
      case "own-property":
        /* A property manager reaches the athletes attached to their own
           property. P3-BE-02. */
        return actor.propertyId
          ? { tenantId: actor.tenantId, propertyId: actor.propertyId }
          : MATCHES_NOTHING;
      case "assigned":
        /* A SPONSOR sees ONLY ACTIVE ATHLETES ON THEIR OWN CAMPAIGNS —
           P3-BE-02's acceptance, and both halves matter.

           "Their own campaigns" keeps one sponsor out of another's roster.
           "ACTIVE" keeps them out of the pipeline: an athlete who is
           SUBMITTED, UNDER_REVIEW, REJECTED or SUSPENDED is a BTG matter, and
           a sponsor learning that a named person was rejected — or suspended
           mid-campaign — is a disclosure nobody agreed to. The state filter
           is not a tidiness nicety; it is the confidential half. */
        return actor.sponsorId
          ? {
              tenantId: actor.tenantId,
              state: "ACTIVE",
              orders: { some: { campaign: { is: { sponsorId: actor.sponsorId } } } },
            }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* Rows hanging off an athlete reuse the athlete's own reach: if you may
     not see the athlete, you may not see their numbers or their score. */
  athleteSocialAccount: (actor, scope) => nestedUnderAthlete(actor, scope),
  athleteScore: (actor, scope) => nestedUnderAthlete(actor, scope),

  /* Rates hang off an athlete exactly as socials and scores do. */
  athleteRate: (actor, scope) => nestedUnderAthlete(actor, scope),
  /* P3-BE-16 — a proposed edit hangs off the athlete it would change. */
  athleteProfileChange: (actor, scope) => nestedUnderAthlete(actor, scope),

  campaignOrder: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.athleteId
          ? { tenantId: actor.tenantId, athleteId: actor.athleteId }
          : MATCHES_NOTHING;
      case "ward":
        return actor.guardianId
          ? { tenantId: actor.tenantId, athlete: { is: { guardianId: actor.guardianId } } }
          : MATCHES_NOTHING;
      case "own-campaign":
        /* A sponsor reads the orders on their own campaigns. The field half —
           hiding `compensation` from them — is §7.1's and belongs to
           P2-SEC-02; this is the row half. */
        return actor.sponsorId
          ? { tenantId: actor.tenantId, campaign: { is: { sponsorId: actor.sponsorId } } }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* A deliverable has no athlete, sponsor or campaign column of its own — it
     hangs off the order, and the order carries all three. So every scope here
     is the matching `campaignOrder` scope expressed through `order`, which
     keeps the two from drifting: if a sponsor may not reach an order, they
     cannot reach its deliverables either.

     `own-property` is deliberately absent, exactly as it is on every other
     builder in this file. PROPERTY_MGR holds the scope in §15, but no builder
     implements it yet and `Actor` carries no propertyId; falling through to
     MATCHES_NOTHING is the safe reading until the property milestone wires
     it, and inventing a join here would be the only place in the codebase
     where that scope means something. */
  deliverable: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.athleteId
          ? { tenantId: actor.tenantId, order: { is: { athleteId: actor.athleteId } } }
          : MATCHES_NOTHING;
      case "ward":
        return actor.guardianId
          ? {
              tenantId: actor.tenantId,
              order: { is: { athlete: { is: { guardianId: actor.guardianId } } } },
            }
          : MATCHES_NOTHING;
      case "own-campaign":
        return actor.sponsorId
          ? {
              tenantId: actor.tenantId,
              order: { is: { campaign: { is: { sponsorId: actor.sponsorId } } } },
            }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* Assets reuse their deliverable's reach, for the same reason rows hanging
     off an athlete reuse the athlete's: if you may not see the work, you may
     not see the files that are the work. */
  creativeAsset: (actor, scope) => {
    const inner = BUILDERS.deliverable!(actor, scope);
    if (inner === MATCHES_NOTHING) return MATCHES_NOTHING;
    /* `any` is an empty filter; nesting it under `deliverable` would still be
       correct but pointlessly joins, so hand it back as-is. */
    if (Object.keys(inner).length === 0) return {};
    return { deliverable: { is: inner } };
  },

  /* A tracking link hangs off a deliverable, which hangs off an order — so
     every scope is the deliverable's, one level further out. Same reasoning
     as creativeAsset: if you may not see the work, you may not see what it
     earned. */
  trackingLink: (actor, scope) => {
    const inner = BUILDERS.deliverable!(actor, scope);
    if (inner === MATCHES_NOTHING) return MATCHES_NOTHING;
    if (Object.keys(inner).length === 0) return {};
    return { deliverable: { is: inner } };
  },

  /* A reward belongs to a campaign, not to an athlete — it is the sponsor's
     offer, promoted by many athletes at once, each through their OWN token.
     So an athlete's `own` reach is the rewards on which they hold a token:
     the offers they are actually handing out. It used to be the whole tenant
     (QA pass 6, P6-BE-01), which showed every athlete every reward's funnel
     and redemption counts — other athletes' performance, and sponsors'
     offers they were never on. A guardian's `ward` is the same, through
     their wards' tokens. */
  reward: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.athleteId
          ? { tenantId: actor.tenantId, tokens: { some: { athleteId: actor.athleteId } } }
          : MATCHES_NOTHING;
      case "ward":
        return actor.guardianId
          ? { tenantId: actor.tenantId, tokens: { some: { athlete: { is: { guardianId: actor.guardianId } } } } }
          : MATCHES_NOTHING;
      case "own-campaign":
        return actor.sponsorId
          ? { tenantId: actor.tenantId, campaign: { is: { sponsorId: actor.sponsorId } } }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* Events are read through their token. For BTG and the sponsor that is the
     token's reward, as above; for an athlete it is their OWN token — never
     another athlete's on the same reward (§15 matrix §10: ATHLETE reads
     `rewardEvent` at `own`). A guardian, their wards' tokens. */
  rewardEvent: (actor, scope) => {
    if (scope === "own") {
      return actor.athleteId
        ? { tenantId: actor.tenantId, token: { is: { athleteId: actor.athleteId } } }
        : MATCHES_NOTHING;
    }
    if (scope === "ward") {
      return actor.guardianId
        ? { tenantId: actor.tenantId, token: { is: { athlete: { is: { guardianId: actor.guardianId } } } } }
        : MATCHES_NOTHING;
    }
    const inner = BUILDERS.reward!(actor, scope);
    if (inner === MATCHES_NOTHING) return MATCHES_NOTHING;
    if (Object.keys(inner).length === 0) return {};
    return { token: { is: { reward: { is: inner } } } };
  },

  /* An earning carries athleteId directly, so it scopes like the athlete it
     belongs to rather than through the order. FINANCE reaches the tenant;
     an athlete reaches their own money and a guardian their wards'. */
  earning: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.athleteId
          ? { tenantId: actor.tenantId, athleteId: actor.athleteId }
          : MATCHES_NOTHING;
      case "ward":
        return actor.guardianId
          ? {
              tenantId: actor.tenantId,
              athlete: { is: { guardianId: actor.guardianId } },
            }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* A metric row hangs off a deliverable, exactly as a tracking link does. */
  metricEvent: (actor, scope) => {
    const inner = BUILDERS.deliverable!(actor, scope);
    if (inner === MATCHES_NOTHING) return MATCHES_NOTHING;
    if (Object.keys(inner).length === 0) return {};
    return { deliverable: { is: inner } };
  },

  /* Aggregates are read over the same rows; §15 marks them aggregate-only,
     which is a shape constraint the reporting layer honours rather than a
     different set of rows. */
  metricAggregate: (actor, scope) => BUILDERS.metricEvent!(actor, scope),

  campaignBrief: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        /* A sponsor's own briefs — "own" on a brief means the sponsor org's,
           not the individual user's. */
        return actor.sponsorId
          ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  campaign: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.sponsorId
          ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId }
          : MATCHES_NOTHING;
      /* `assigned` and `ward-assigned` need the invite join and arrive with
         the screens that ask for them. Falling through is the safe
         direction: an athlete currently sees no campaign rather than all. */
      default:
        return MATCHES_NOTHING;
    }
  },

  invitation: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        return actor.athleteId
          ? { tenantId: actor.tenantId, athleteId: actor.athleteId }
          : MATCHES_NOTHING;
      case "ward":
        return actor.guardianId
          ? { tenantId: actor.tenantId, athlete: { is: { guardianId: actor.guardianId } } }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  /* Added with P3-BE-07, the first task to query the review queue.

     The application and the athlete are the same row: §21's lifecycle lives
     in `Athlete.state`, and there is no separate Application model to filter.
     They are still two resources in the matrix, because they are two
     different permissions — NETWORK_MGR may *approve* an application, and
     SPONSOR_ADMIN may *read* an athlete assigned to their campaign but must
     never see an application at all. Sharing the filter while keeping the
     policy rows apart is the honest shape: same rows, different reach. */
  athleteApplication: (actor, scope) => BUILDERS.athlete!(actor, scope),

  /* Added with P4-BE-01, the first task to query sponsors.

     `own` and `own-sponsor` are the same rows here and different rows on
     `sponsorContact`: a SPONSOR_ADMIN's "own" sponsor is one organisation,
     and their "own-sponsor" contacts are that organisation's people. Both
     need `actor.sponsorId`, which is why the actor now carries it — a builder
     has no second query to find out who the caller works for.

     A sponsor user with no sponsorId matches nothing rather than everything.
     That state should not exist, and if it ever does, the safe reading of a
     broken row is that it reaches nothing. */
  sponsor: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
      case "own-sponsor":
        return actor.sponsorId
          ? { tenantId: actor.tenantId, id: actor.sponsorId }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },

  sponsorContact: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own-sponsor":
        return actor.sponsorId
          ? { tenantId: actor.tenantId, sponsorId: actor.sponsorId }
          : MATCHES_NOTHING;
      default:
        return MATCHES_NOTHING;
    }
  },
};

/** Shared by the rows that belong to an athlete rather than being one. */
function nestedUnderAthlete(actor: Actor, scope: Scope): Where {
  switch (scope) {
    case "any":
      return {};
    case "own-tenant":
      return { tenantId: actor.tenantId };
    case "own":
      return actor.athleteId
        ? { tenantId: actor.tenantId, athleteId: actor.athleteId }
        : MATCHES_NOTHING;
    case "ward":
      return actor.guardianId
        ? { tenantId: actor.tenantId, athlete: { is: { guardianId: actor.guardianId } } }
        : MATCHES_NOTHING;
    default:
      return MATCHES_NOTHING;
  }
}

/**
 * The `where` fragment this actor may read for this resource, having first
 * checked they may act at all.
 *
 * Throws `ForbiddenError` when the policy denies, and
 * `ScopeNotImplementedError` when the policy allows but no filter exists yet.
 * It never returns an unrestricted `{}` by accident: that value is only
 * reachable from an explicit `any` or `catalog` branch.
 */
export function whereFor(
  actor: Actor,
  resource: Resource,
  action: Action = "read",
): Where {
  const scope = assertAllowed(actor, resource, action);

  const build = BUILDERS[resource];
  if (!build) throw new ScopeNotImplementedError(resource, scope);

  /* WRAPPED IN `AND`, AND THAT IS THE SECURITY PROPERTY (P8-SEC-02).

     Every caller spreads this into a where and then adds its own keys:
     `{ ...whereFor(actor, "campaign", "read"), id: campaignId }`. Returned
     bare, a fragment keyed on the same field is OVERWRITTEN by the caller's
     key — and several are: MATCHES_NOTHING is `{ id: { in: [] } }`, and the
     `own` scopes are `{ tenantId, id: actor.athleteId }` and the like. The
     spread turned "matches nothing" into "matches this id in any tenant",
     and "your own athlete row" into "any athlete in your tenant". The
     cross-tenant sweep (tests/tenant-isolation.test.ts) found it: a tenant-B
     athlete read tenant A's full sponsor report.

     Inside `AND`, the scope is a separate conjunct no sibling key can
     replace — `{ AND: [scope], id }` is scope ∧ id, whatever the caller
     writes beside it. */
  return { AND: [build(actor, scope, action)] };
}
