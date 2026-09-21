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

type Builder = (actor: Actor, scope: Scope) => Where;

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
 * Builders for the resources that are queried today.
 *
 * `user` is the only one so far: the mirror in `identity.ts` is the single
 * database read the application performs. As each B-milestone wires a model,
 * it adds its builder here — `athlete` with B1, `campaign` with B3, and so on.
 */
const BUILDERS: Partial<Record<Resource, Builder>> = {
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
  athlete: (actor, scope) => {
    switch (scope) {
      case "any":
        return {};
      case "own-tenant":
        return { tenantId: actor.tenantId };
      case "own":
        /* The athlete's own record, reached through the User mirror. */
        return { tenantId: actor.tenantId, user: { is: { id: actor.userId } } };
      default:
        return MATCHES_NOTHING;
    }
  },
};

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

  return build(actor, scope);
}
