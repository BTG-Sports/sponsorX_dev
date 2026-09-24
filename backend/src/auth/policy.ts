/* --------------------------------------------------------------------------
   The authorisation matrix, as data — P2-BE-04, §8, §26, Guide §09.

   This file is a transcription of `documentation/SponsorX-RBAC-Matrix.md`
   v1.0. It is deliberately *only* data: no Prisma, no queries, no imports that
   could drift. That is what lets `P2-SEC-01` assert the whole matrix in a unit
   test without a database, and what lets a reviewer diff this against the
   document line by line.

   **If the document and this file disagree, the document is right** — fix the
   transcription here rather than re-deciding the policy in code. The document
   is the §38 deliverable that was agreed on 2026-09-14.

   WHAT A SCOPE TOKEN MEANS. The matrix records *what a role may reach*, not
   merely whether it may act — so a cell is a reach, not a boolean. Turning a
   token into a database filter is `scope.ts`'s job, and deliberately separate:
   the policy is settled now, while the query shapes arrive with the features
   that need them.

   DEFAULT IS DENY, STRUCTURALLY. `scopeFor()` returns `"deny"` for any
   resource, role or action not written here, so a new model is unreachable
   until someone adds a row. A missing entry is never an accident that grants
   access.

   NOT IN SCOPE HERE: the field-level rules in §7.1 and §7.2 of the matrix —
   `campaign.budget` hidden from athletes, `nilJob.athleteBasePay` hidden from
   sponsors, and the rest. Those are row-blind and belong to `P2-SEC-02`. Row
   scoping is the easy half; the roadmap is explicit that the field rules are
   where the real leak is.
   -------------------------------------------------------------------------- */

/** §8's twelve roles, matching the Prisma `Role` enum exactly. */
export type Role =
  | "SUPER_ADMIN"
  | "BTG_ADMIN"
  | "SALES"
  | "CAMPAIGN_MGR"
  | "NETWORK_MGR"
  | "FINANCE"
  | "ATHLETE"
  | "GUARDIAN"
  | "PROPERTY_MGR"
  | "SPONSOR_ADMIN"
  | "SPONSOR_ANALYST"
  | "SERVICE";

export const ROLES: readonly Role[] = [
  "SUPER_ADMIN",
  "BTG_ADMIN",
  "SALES",
  "CAMPAIGN_MGR",
  "NETWORK_MGR",
  "FINANCE",
  "ATHLETE",
  "GUARDIAN",
  "PROPERTY_MGR",
  "SPONSOR_ADMIN",
  "SPONSOR_ANALYST",
  "SERVICE",
] as const;

export type Action = "read" | "write" | "approve";
export const ACTIONS: readonly Action[] = ["read", "write", "approve"] as const;

/**
 * What a role may reach. These are the matrix's own cell values.
 *
 * `deferred` is not in the document as a token — it marks the three cells the
 * matrix leaves to decisions D1 and D3 in its §12. It resolves to a denial,
 * because the matrix's stated default is deny and widening later is safe where
 * narrowing later is a regression someone has already built on.
 */
export type Scope =
  | "any"
  | "own-tenant"
  | "own"
  | "own-sponsor"
  | "own-campaign"
  | "own-property"
  | "ward"
  | "ward-assigned"
  | "assigned"
  | "catalog"
  | "deferred"
  | "deny";

export type Resource =
  | "tenant"
  | "user"
  | "sponsor"
  | "sponsorContact"
  | "athleteApplication"
  | "athlete"
  | "athleteSocialAccount"
  | "athleteScore"
  | "guardian"
  | "property"
  | "nilJob"
  | "athleteRate"
  | "sponsorPackage"
  | "campaignBrief"
  | "campaign"
  | "invitation"
  | "campaignOrder"
  | "deliverable"
  | "creativeAsset"
  | "agreement"
  | "trackingLink"
  | "reward"
  | "qrCode"
  | "rewardEvent"
  | "metricEvent"
  | "metricAggregate"
  | "earning"
  | "payout"
  | "invoice"
  | "sponsorReport"
  | "auditLog"
  | "integrationConnection"
  | "webhookDelivery";

export const RESOURCES: readonly Resource[] = [
  "tenant",
  "user",
  "sponsor",
  "sponsorContact",
  "athleteApplication",
  "athlete",
  "athleteSocialAccount",
  "athleteScore",
  "guardian",
  "property",
  "nilJob",
  "athleteRate",
  "sponsorPackage",
  "campaignBrief",
  "campaign",
  "invitation",
  "campaignOrder",
  "deliverable",
  "creativeAsset",
  "agreement",
  "trackingLink",
  "reward",
  "qrCode",
  "rewardEvent",
  "metricEvent",
  "metricAggregate",
  "earning",
  "payout",
  "invoice",
  "sponsorReport",
  "auditLog",
  "integrationConnection",
  "webhookDelivery",
] as const;

type RolePolicy = Partial<Record<Role, Partial<Record<Action, Scope>>>>;

/** Shorthand so a row reads close to the document's own table. */
const rwa = (read?: Scope, write?: Scope, approve?: Scope) => ({
  ...(read ? { read } : {}),
  ...(write ? { write } : {}),
  ...(approve ? { approve } : {}),
});

/**
 * The matrix. Each entry mirrors one table in the document, in its order.
 * Absent role → denied. Absent action → denied.
 */
export const POLICY: Record<Resource, RolePolicy> = {
  /* §3 tenant */
  tenant: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
  },

  /* §3 user · role assignment. "all others: own / own (profile only)" is
     written out per role, because "all others" is not a thing code can hold. */
  user: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SALES: rwa("own", "own"),
    CAMPAIGN_MGR: rwa("own", "own"),
    NETWORK_MGR: rwa("own", "own"),
    FINANCE: rwa("own", "own"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("own", "own"),
    PROPERTY_MGR: rwa("own", "own"),
    SPONSOR_ANALYST: rwa("own", "own"),
    SERVICE: rwa("own", "own"),
  },

  /* §4 sponsor */
  sponsor: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own", "own"),
    SPONSOR_ANALYST: rwa("own"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  sponsorContact: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  /* §5 athleteApplication */
  athleteApplication: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    /* Athlete write is state-conditional (DRAFT / CHANGES_REQUESTED). The
       state guard belongs to the domain function, not to row scoping. */
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
  },

  /* Approve on `athlete` is "sets athlete status", which is what activation
     is. NETWORK_MGR does it day to day; BTG_ADMIN and SUPER_ADMIN hold it as
     superset roles, per §12 of the matrix document. The table there carried a
     dash for both until 2026-09-22 — a transcription slip that showed up as a
     403 on the activate button. */
  athlete: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    SALES: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
    PROPERTY_MGR: rwa("own-property"),
    SPONSOR_ADMIN: rwa("assigned"),
    SPONSOR_ANALYST: rwa("assigned"),
    /* SERVICE reads but explicitly may not write athletes. */
    SERVICE: rwa("own-tenant"),
  },

  athleteSocialAccount: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
    PROPERTY_MGR: rwa("own-property"),
  },

  athleteScore: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
    PROPERTY_MGR: rwa("own-property"),
  },

  guardian: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("own", "own"),
  },

  property: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    PROPERTY_MGR: rwa("own", "own"),
  },

  /* §6 commercial catalogue. "any (catalog)" is a published list, readable
     across tenants by design — it is the shop window, not tenant data. */
  nilJob: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
    ATHLETE: rwa("catalog"),
    GUARDIAN: rwa("catalog"),
    PROPERTY_MGR: rwa("catalog"),
    SPONSOR_ADMIN: rwa("catalog"),
    SPONSOR_ANALYST: rwa("catalog"),
  },

  athleteRate: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
  },

  sponsorPackage: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("catalog"),
    SPONSOR_ANALYST: rwa("catalog"),
  },

  /* §8 campaigns */
  campaignBrief: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    SPONSOR_ADMIN: rwa("own", "own"),
    SPONSOR_ANALYST: rwa("own"),
  },

  campaign: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
    /* Sponsor approves content only; it may not write the campaign. */
    SPONSOR_ADMIN: rwa("own", undefined, "own"),
    SPONSOR_ANALYST: rwa("own"),
    ATHLETE: rwa("assigned"),
    GUARDIAN: rwa("ward-assigned"),
    PROPERTY_MGR: rwa("own-property"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  invitation: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    /* Guardian write is decision D1 in the matrix's §12 — undecided, so denied
       until it is taken. */
    GUARDIAN: rwa("ward", "deferred"),
  },

  campaignOrder: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "deferred"), // D1
    /* Sponsor sees terms but not athlete pay — the field half of that is
       §7.1's `campaignOrder.compensation` rule, owned by P2-SEC-02. */
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    PROPERTY_MGR: rwa("deferred"), // D3
  },

  deliverable: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward"),
    SPONSOR_ADMIN: rwa("own-campaign", undefined, "own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    PROPERTY_MGR: rwa("own-property"),
    SERVICE: rwa("own-tenant"),
  },

  creativeAsset: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
  },

  agreement: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
    SPONSOR_ADMIN: rwa("own", "own"),
  },

  /* §9 fan funnel */
  trackingLink: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    SERVICE: rwa("own-tenant"),
  },

  reward: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    SERVICE: rwa("own-tenant"),
  },

  qrCode: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    SERVICE: rwa("own-tenant"),
  },

  /* Aggregate-only reads are a shape constraint, not a row scope — the matrix
     marks them and the reporting layer honours them. */
  rewardEvent: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    ATHLETE: rwa("own"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  metricEvent: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    PROPERTY_MGR: rwa("own-property"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  metricAggregate: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
    SPONSOR_ADMIN: rwa("own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
    PROPERTY_MGR: rwa("own-property"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  /* §10 money */
  earning: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
    PROPERTY_MGR: rwa("deferred"), // D3
  },

  payout: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant"),
    ATHLETE: rwa("own"),
    GUARDIAN: rwa("ward"),
  },

  /* Read-only mirror of Zoho Books — rows arrive from the webhook, never
     through this matrix. BTG admin and the invoiced sponsor only (decision
     2026-09-24): FINANCE, CAMPAIGN_MGR and SALES read the campaign but not
     its invoices, and an athlete never sees what the sponsor paid. */
  invoice: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own"),
    SPONSOR_ANALYST: rwa("own"),
  },

  sponsorReport: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own"),
    SPONSOR_ANALYST: rwa("own"),
    PROPERTY_MGR: rwa("own-property"),
    /* ATHLETE is an explicit deny in the document. */
  },

  /* §11 system. The audit log is append-only from the application's side:
     nobody, including SUPER_ADMIN, may write it through this path. */
  auditLog: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
  },

  integrationConnection: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  webhookDelivery: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },
};

/**
 * What this single role may reach for this resource and action.
 * Anything not written in POLICY is denied — that is the whole safety property.
 */
export function scopeForRole(
  role: Role,
  resource: Resource,
  action: Action,
): Scope {
  return POLICY[resource]?.[role]?.[action] ?? "deny";
}

/** How wide each scope is, so the widest of an actor's roles wins. */
const BREADTH: Record<Scope, number> = {
  any: 100,
  catalog: 90,
  "own-tenant": 80,
  "own-property": 60,
  "own-campaign": 50,
  "own-sponsor": 40,
  assigned: 30,
  "ward-assigned": 25,
  ward: 20,
  own: 10,
  deferred: 0,
  deny: 0,
};

/**
 * A user may hold several roles, so the effective reach is the widest one.
 *
 * Widest-wins is the correct reading of an additive matrix: holding both
 * FINANCE and ATHLETE cannot sensibly grant *less* than either alone. It is
 * also why `deferred` and `deny` both sit at zero — an undecided cell must
 * never widen anything.
 */
export function scopeFor(
  roles: readonly Role[],
  resource: Resource,
  action: Action,
): Scope {
  let best: Scope = "deny";
  let sawDeferred = false;

  for (const role of roles) {
    const candidate = scopeForRole(role, resource, action);
    if (candidate === "deferred") sawDeferred = true;
    if (BREADTH[candidate] > BREADTH[best]) best = candidate;
  }

  /* `deferred` and `deny` are both zero-breadth, so a strict comparison can
     never promote one over the other and the distinction would be lost —
     every undecided cell would report as a flat denial. Both still refuse
     access; the difference is that "awaiting decision D1" is answerable and
     "denied" is not, and whoever reads this later deserves to know which they
     are looking at. */
  if (best === "deny" && sawDeferred) return "deferred";

  return best;
}

/** Is this allowed at all? `deferred` is a denial with a reason. */
export function isAllowed(
  roles: readonly Role[],
  resource: Resource,
  action: Action,
): boolean {
  const scope = scopeFor(roles, resource, action);
  return scope !== "deny" && scope !== "deferred";
}
