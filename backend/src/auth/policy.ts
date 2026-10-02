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

/** §8's twelve roles plus SponsorX NEXT's two (P9-BE-05, matrix §15.1),
 *  matching the Prisma `Role` enum exactly. */
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
  | "SERVICE"
  | "STUDENT"
  | "ADVISOR";

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
  "STUDENT",
  "ADVISOR",
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
  /* Phase 2 (2S3-BE-01): the actor's own tenant AND every outside tenant it
     operates (Tenant.operatorTenantId) — how BTG reviews an approved
     organisation's inventory and listings without reaching anything else of
     theirs. Only marketplace resources use it. */
  | "operated"
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
  | "athleteProfileChange"
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
  | "webhookDelivery"
  | "inquiry"
  | "syncTask"
  | "publication"
  | "edition"
  | "adSlot"
  | "revenueSplit"
  | "editionEvent"
  | "student"
  | "studentCode"
  | "saleAttribution"
  | "studentPoints"
  | "studentProspect"
  | "editionAsset"
  | "editionArtwork"
  | "contentRight"
  | "rosterEntry"
  | "athleteClaim"
  | "contentContribution"
  | "schoolPoolAllocation"
  | "propertyOnboarding"
  | "notificationPreference"
  | "inventoryItem"
  | "teamMember"
  | "listing"
  | "offer"
  | "tenantBranding"
  | "brandRestriction"
  | "cart"
  | "reservation"
  | "marketplaceOrder"
  | "commissionRule"
  | "orderFinancials"
  | "ledgerEntry"
  | "payoutAccount"
  | "restrictedWord"
  | "orderDelivery"
  | "orderSellerApproval"
  | "refundDue"
  | "teamInvitation"
  | "accountClosure"
  | "guardianHandoff"
  | "signupRules";

export const RESOURCES: readonly Resource[] = [
  "tenant",
  "user",
  "sponsor",
  "sponsorContact",
  "athleteApplication",
  "athlete",
  "athleteSocialAccount",
  "athleteProfileChange",
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
  "inquiry",
  "syncTask",
  "publication",
  "edition",
  "adSlot",
  "revenueSplit",
  "editionEvent",
  "student",
  "studentCode",
  "saleAttribution",
  "studentPoints",
  "studentProspect",
  "editionAsset",
  "editionArtwork",
  "contentRight",
  "rosterEntry",
  "athleteClaim",
  "contentContribution",
  "schoolPoolAllocation",
  "propertyOnboarding",
  "notificationPreference",
  "inventoryItem",
  "teamMember",
  "listing",
  "offer",
  "tenantBranding",
  "brandRestriction",
  "cart",
  "reservation",
  "marketplaceOrder",
  "commissionRule",
  "orderFinancials",
  "ledgerEntry",
  "payoutAccount",
  "restrictedWord",
  "orderDelivery",
  "orderSellerApproval",
  "refundDue",
  "teamInvitation",
  "accountClosure",
  "guardianHandoff",
  "signupRules",
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

  /* P3-BE-16 — an approved athlete's proposed profile edits (matrix §5).
     Write is "propose" (the athlete, or a guardian for a ward); approve is
     the reviewer's decision, held by the same roles that approve
     applications. Nobody else has a reason to read what an athlete wants
     to change before BTG has agreed to it. */
  athleteProfileChange: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
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

  /* Phase 2 (2S5-BE-04 / 2S5-BE-05, matrix §21): a payee requests its own
     available balance (write); BTG admin and Finance approve or send it
     back (approve). Money moves only through the provider adapter. */
  payout: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant", "own-tenant"),
    ATHLETE: rwa("own", "own"),
    GUARDIAN: rwa("ward"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
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

  /* §11, added 2026-09-24 (P8-INT-06, P8-SEC-01). A prospective sponsor's
     enquiry. It is CREATED by the public /public/inquiries route, which has
     no actor — like /join — so the write cells here are staff and the sync
     account only. Sales reads; qualifying the lead is done in Zoho.
     2S1-BE-05 (2026-09-30): it is also the request BTG reviews — `approve`
     is the decision that opens the sponsor's account (or declines), for
     BTG_ADMIN and SALES in their own tenant. */
  inquiry: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", undefined, "own-tenant"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  /* §11, added 2026-09-24 (P8-INT-01, P8-SEC-01). A CRM task SponsorX
     raised — follow-up, approval, renewal. Raised by the domain inside the
     transition that causes it; worked in Zoho. Staff who act on the loop read
     it; the sync account writes its Zoho id and status back. */
  syncTask: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant"),
    SERVICE: rwa("own-tenant", "own-tenant"),
  },

  /* §15.3 SponsorX NEXT — publication domain (P9-BE-02/03/06/12, 2026-09-25).
     Transcribed for the roles that exist today. The ADVISOR and STUDENT rows
     arrive with those roles in P9-BE-05; until then neither exists to hold
     them, and the default is deny. */
  publication: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own-property"),
  },
  edition: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own-property"),
  },
  /* SALES sells against the inventory; setting a price or a slot's sold
     state is the sale itself, which runs through the domain. */
  adSlot: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", "own-tenant"),
    /* A student sells against this inventory and must see what is open; they
       never set a price or mark a slot sold. */
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own-property"),
  },
  /* Publishing economics: finance's, never an advisor's or a student's. */
  revenueSplit: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant", "own-tenant"),
  },
  /* Written by the public edition pages, never by a user. A sponsor's view
     is the aggregate in their campaign report (metricAggregate), which is
     how §15.3's "own-campaign (aggregate)" is honoured — an EditionEvent
     row names a slot by string, so there is no join to scope it by. */
  editionEvent: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own-property"),
  },

  /* §15.2 SponsorX NEXT — student domain (P9-BE-05, 2026-09-25). */
  student: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    /* The school's advisor reviews its students — editorial and custodial,
       one school only. */
    ADVISOR: rwa("own-property", "own-property", "own-property"),
    /* Own profile; the review (approve) is never the applicant's. */
    STUDENT: rwa("own", "own"),
    GUARDIAN: rwa("ward", "ward"),
  },
  /* Attribution and points are WRITTEN BY THE SYSTEM, not by the person
     they credit — that is what keeps a sales figure evidence rather than a
     claim. A student reads their own and never another's. */
  studentCode: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own"),
    GUARDIAN: rwa("ward"),
  },
  saleAttribution: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own"),
    GUARDIAN: rwa("ward"),
  },
  studentPoints: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own"),
    GUARDIAN: rwa("ward"),
  },
  /* A business a student brings in (§5.6 Sponsor Acceptance Check). The
     student submits it; commercial operations — BTG, SALES — decide it. Not
     in the matrix text before 2026-09-25; added there with this row. */
  studentProspect: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    SALES: rwa("own-tenant", "own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own", "own"),
  },

  /* §15.3 SponsorX NEXT — rights (P9-BE-10, 2026-09-25). An edition's content
     items and the one ledger that says what may be done with each. Rights
     are explicit and checked before publication; an advisor approves what
     students publish but does not make rights decisions — read-only here. */
  editionAsset: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own-property"),
  },
  /* P9-BE-16 — a sold slot's ad artwork on the approval board (matrix §15.3,
     added 2026-10-02). The same desk as deliverables: BTG_ADMIN and
     CAMPAIGN_MGR run the BTG steps (`write`, tenant-wide); the BUYING
     sponsor uploads its own artwork (`write`, own-campaign) and is the only
     role that signs it off (`approve`, own-campaign) — no staff role holds
     approve, so BTG cannot sign off for an advertiser. Same EditionAsset
     rows as `editionAsset`; this resource is the reach through the slot's
     campaign, which the sponsor needs and `editionAsset` does not give. */
  editionArtwork: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    SPONSOR_ADMIN: rwa("own-campaign", "own-campaign", "own-campaign"),
    SPONSOR_ANALYST: rwa("own-campaign"),
  },
  contentRight: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own"),
  },
  /* P9-BE-11 — the claim flow. The school supplies its roster and its
     advisor verifies a claim (`approve`); BTG can do either. The roster is
     a list of the school's students — nobody else reads it. */
  rosterEntry: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property", "own-property"),
  },
  athleteClaim: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant", undefined, "own-tenant"),
    ADVISOR: rwa("own-property", undefined, "own-property"),
  },
  /* P9-BE-14 — content contribution units and the school pools they
     resolve. Written by BTG (the formula computes the pools); publishing
     economics stay off a student's and an advisor's screen except their own
     school's contribution record. */
  contentContribution: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    ADVISOR: rwa("own-property"),
    STUDENT: rwa("own"),
  },
  schoolPoolAllocation: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
  },

  /* Phase 2 Sprint 1 (2S1-BE-01, -03) — an outside organisation's onboarding.
     The applicant has no role at all: it reaches its own application by a
     signed resume token on the public routes, never through this matrix.
     Reviewing is BTG's — the verification queue and every decision. */
  propertyOnboarding: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
  },

  /* Phase 2 (2S6-BE-02) — which events reach a user, on which channel.
     Personal to every account and to nobody else: no role, not even
     SUPER_ADMIN, reads or sets another person's (matrix §17). */
  notificationPreference: Object.fromEntries(ROLES.map((r) => [r, rwa("own", "own")])) as RolePolicy,

  /* Phase 2 Sprint 2–3 (matrix §18). Outside parties price their own
     inventory; BTG reads the tenants it operates and approves their
     listings, but does not set an outside party's prices. */
  inventoryItem: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("operated"),
    CAMPAIGN_MGR: rwa("operated"),
    /* An athlete's own items; a team manager reads the team's and its
       roster's, and writes the team's own. */
    ATHLETE: rwa("own", "own"),
    PROPERTY_MGR: rwa("own-property", "own"),
  },
  /* A team's roster — the athletes on it and their revenue share. */
  teamMember: {
    SUPER_ADMIN: rwa("any", "any"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
  },
  listing: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("operated", undefined, "operated"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
    /* Reads every listing of their items; writes (2S3-BE-05) only the ones
       they sell themselves, as an approved athlete with no team. */
    ATHLETE: rwa("own", "own"),
    /* 2S3-BE-04 — a sponsor's catalogue: PUBLISHED, PUBLIC, live listings of
       approved properties in the marketplace its tenant operates. */
    SPONSOR_ADMIN: rwa("catalog"),
    SPONSOR_ANALYST: rwa("catalog"),
  },
  /* A formal offer is BTG's to make, on a campaign in its tenant, and the
     athlete's to accept or decline. Sponsors see the order it becomes. */
  offer: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("own-tenant", "own-tenant"),
    SALES: rwa("own-tenant"),
    ATHLETE: rwa("own", "own"),
  },
  /* Everyone in a tenant sees its branding; BTG sets BTG's, and an outside
     organisation's manager sets its own tenant's ("own" — never BTG's). */
  tenantBranding: {
    ...Object.fromEntries(ROLES.map((r) => [r, rwa("own-tenant")])),
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    PROPERTY_MGR: rwa("own-tenant", "own"),
  } as RolePolicy,

  /* Phase 2 batch 4 (matrix §19). A restriction belongs to an athlete or a
     team; the owner and BTG manage it. */
  brandRestriction: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("operated", "operated"),
    NETWORK_MGR: rwa("own-tenant", "own-tenant"),
    CAMPAIGN_MGR: rwa("operated"),
    ATHLETE: rwa("own", "own"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
  },
  /* A sponsor's cart: its own organisation's, and nobody else's. */
  cart: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
  },

  /* Phase 2 batch 5 (matrix §20). A hold is the sponsor's own; BTG reads. */
  reservation: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
  },
  /* The marketplace order: the sponsor places and may cancel it; BTG
     approves (approve) and moves it through payment and delivery (write);
     Finance reads and records payment states. */
  marketplaceOrder: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
  },

  /* Phase 2 batch 6 (matrix §21) — the money side. Commission rules and the
     frozen breakdown are the margin: BTG and Finance only. A property reads
     its own ledger entries, an athlete theirs; nobody writes an entry — the
     ledger is written by the order's own transitions. */
  /* Writing rules is BTG admin's alone (programme owner, 2026-09-28: "only
     admin"); Finance reads them to reconcile. */
  commissionRule: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant"),
  },
  orderFinancials: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
  },
  ledgerEntry: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
    PROPERTY_MGR: rwa("own-property"),
    ATHLETE: rwa("own"),
  },

  /* 2S5-INT-03 — where a payee is paid. The payee sets it up (on the
     provider's page); BTG and Finance see its status to approve payouts. */
  payoutAccount: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
    ATHLETE: rwa("own", "own"),
  },

  /* 2S1-BE-18 — BTG's restricted-words list: BTG admins keep it. A match
     only routes an item to review, so nobody else needs to see the list. */
  restrictedWord: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
  },

  /* 2S4-BE-06 / -07 / -08 (matrix §22) — a contracted order line as its
     sellers see it, and its delivery. The team (own-property) and the athlete
     whose item it is (own) read their own sold lines — each with their own
     share only, never the order's other lines, the other party's share or
     BTG's commission — and mark them delivered (write). The buying sponsor
     reads its lines and confirms or reports a problem (write, own-sponsor).
     BTG admin resolves problems (approve); Finance reads. */
  orderDelivery: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
    ATHLETE: rwa("own", "own"),
    SPONSOR_ADMIN: rwa("own-sponsor", "own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
  },
  /* 2S4-BE-09 (matrix §24) — a seller's answer to an order a listing of
     theirs asks to approve. The seller — the team's manager (own-property)
     or the independent athlete, or the guardian acting for a minor (own) —
     reads and answers their own, in their own tenant: only the lines it
     covers, never the order. The buying sponsor and BTG read it (to follow
     the order); nobody else answers for the seller, BTG included. */
  orderSellerApproval: {
    SUPER_ADMIN: rwa("any"),
    BTG_ADMIN: rwa("own-tenant"),
    FINANCE: rwa("own-tenant"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
    ATHLETE: rwa("own", "own"),
    SPONSOR_ADMIN: rwa("own-sponsor"),
    SPONSOR_ANALYST: rwa("own-sponsor"),
  },
  /* 2S4-BE-13 (matrix §25) — refunds to send. Money owed back to a sponsor,
     one row per refund of a paid order, in the order's books. BTG admin and
     Finance read the "Refunds to send" list and mark a refund sent by hand
     (write); nobody approves. Nobody else reaches the list: the sponsor
     reads each refund's state on its own order (marketplaceOrder /
     orderDelivery), never the list, a method or a reference. */
  refundDue: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    FINANCE: rwa("own-tenant", "own-tenant"),
  },
  /* 2S2-BE-05 (matrix §22) — a team invites an athlete already on SponsorX.
     The team's manager sends and withdraws; the athlete accepts or declines
     their own. Nobody else reads an invitation. */
  teamInvitation: {
    SUPER_ADMIN: rwa("any", "any"),
    PROPERTY_MGR: rwa("own-property", "own-property"),
    ATHLETE: rwa("own", "own"),
  },
  /* 2S1-BE-13 — closed accounts (matrix §23). Closing your OWN account is
     authorised through the account's own resource (athlete / guardian /
     property write at `own`), and coming back is the emailed link; this
     resource is BTG's view of closures and its answer to a rejected
     account's request to come back. Nobody else reads it. */
  accountClosure: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant", "own-tenant"),
  },

  /* 2S1-BE-15 — a request to become a minor's guardian (matrix §23). It is
     CREATED only by the new guardian on the public request page (no actor).
     The current guardian reads and answers requests for their own ward
     (`ward`); the athlete follows its status (`own`) and can never answer;
     BTG reads (a dispute is decided by hand, through support), and — when
     "BTG staff confirm minors" is on — confirms or declines a handed-off
     request (approve). */
  guardianHandoff: {
    SUPER_ADMIN: rwa("any", "any", "any"),
    BTG_ADMIN: rwa("own-tenant", undefined, "own-tenant"),
    GUARDIAN: rwa("ward", "ward"),
    ATHLETE: rwa("own"),
  },

  /* 2S1-BE-10 / -12 — the rules automatic sign-up approval reads: the
     age-of-majority table by place, and "BTG staff confirm minors before
     approval". BTG admins keep them; the network manager, who works the
     sign-ups they decide, may read them. */
  signupRules: {
    SUPER_ADMIN: rwa("any", "any"),
    BTG_ADMIN: rwa("own-tenant", "own-tenant"),
    NETWORK_MGR: rwa("own-tenant"),
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
  operated: 85,
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
