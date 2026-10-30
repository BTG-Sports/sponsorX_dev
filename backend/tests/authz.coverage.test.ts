import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACTIONS, POLICY, RESOURCES, ROLES, scopeForRole, type Resource } from "../src/auth/policy";

/* --------------------------------------------------------------------------
   P8-SEC-01 — the authorisation matrix is complete.

   "Every resource added across Phases 3–7 has its rows." Stated as a test
   rather than a review: every model in the Prisma schema must either be
   governed by a matrix resource, or be declared here as system-internal with
   the reason nothing reaches it through the API. A model added tomorrow with
   neither fails this file — which is the only way "complete" stays true
   after the day it was checked.

   It runs in `npm test`, which CI runs on every pull request.
   -------------------------------------------------------------------------- */

const SCHEMA = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const MODELS = [...SCHEMA.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);

/** Which matrix resource governs each model. */
const GOVERNED_BY: Record<string, Resource> = {
  Tenant: "tenant",
  /* POL-BE-36 — BTG's payments switch. */
  PaymentSwitch: "paymentSwitch",
  User: "user",
  Property: "property",
  Guardian: "guardian",
  /* One model, two resources: the application and the approved athlete are
     the same row at different states (matrix §5). */
  Athlete: "athlete",
  AthleteSocial: "athleteSocialAccount",
  /* P3-BE-16 — a proposed edit, governed like the row it would change. */
  AthleteProfileChange: "athleteProfileChange",
  AthleteScore: "athleteScore",
  NilJob: "nilJob",
  AthleteRate: "athleteRate",
  SponsorPackage: "sponsorPackage",
  Sponsor: "sponsor",
  SponsorContact: "sponsorContact",
  CampaignBrief: "campaignBrief",
  Campaign: "campaign",
  /* P4-BE-12 — who automatic staffing skipped: read on BTG's campaign detail, written only by the system. */
  CampaignStaffingSkip: "campaign",
  CampaignInvite: "invitation",
  CampaignOrder: "campaignOrder",
  Deliverable: "deliverable",
  CreativeAsset: "creativeAsset",
  MetricDaily: "metricAggregate",
  TrackingLink: "trackingLink",
  LinkEvent: "metricEvent",
  Reward: "reward",
  RewardToken: "qrCode",
  RewardEvent: "rewardEvent",
  Earning: "earning",
  Agreement: "agreement",
  AgreementAcceptance: "agreement",
  CampaignInvoice: "invoice",
  WebhookDelivery: "webhookDelivery",
  ZohoReconciliation: "integrationConnection",
  Inquiry: "inquiry",
  /* 2S1-BE-17 — a sponsor's proof of business is its request's. */
  InquiryDocument: "inquiry",
  /* 2S1-BE-09 / -10 — an athlete's or guardian's identity documents are read
     through their sign-up (athleteApplication / guardian, tenant-wide only). */
  AccountDocument: "athleteApplication",
  /* 2S1-BE-12 — the age-of-majority table is one of the sign-up rules. */
  AgeOfMajority: "signupRules",
  SyncTask: "syncTask",
  AuditLog: "auditLog",
  Publication: "publication",
  Edition: "edition",
  AdSlot: "adSlot",
  RevenueSplit: "revenueSplit",
  /* P9-BE-18 — a masthead's rate card prices its slots: read with the slots, kept by BTG admin (publication write). */
  EditionRateCard: "adSlot",
  /* P9-BE-18 — the ad sales the system held for SALES: read by SALES and BTG (adSlot write, tenant-wide), written only by the system. */
  AdSaleHold: "adSlot",
  /* P9-BE-19 — the sales an edition's cancellation undid: written by the cancellation, read only by the invoice ingest to match a late payment to a refund; nothing reaches it through the API but Finance's refund rows. */
  CancelledAdSale: "refundDue",
  /* 2S5-INT-01/-03, 2S5-BE-04/-05 — a card payment is the order's; a payout
     line is its payout's. */
  PayoutAccount: "payoutAccount",
  RestrictedWord: "restrictedWord",
  /* 2S4-BE-06 / -07 — a sold line as its sellers see it, and its delivery. */
  OrderLineDelivery: "orderDelivery",
  /* 2S4-BE-09 — a seller's answer to an order a listing of theirs asks to approve. */
  OrderSellerApproval: "orderSellerApproval",
  /* 2S4-BE-10 — a Zoho Books invoice for a marketplace order is the order's (as a card attempt is). */
  MarketplaceOrderInvoice: "marketplaceOrder",
  /* 2S4-BE-13 — money owed back to a sponsor: Finance's "Refunds to send". */
  RefundDue: "refundDue",
  /* 3S2-BE-02/03 — a stored suggested price, and a BTG admin's override of it: read by BTG admins, campaign managers and Sales; the override written by BTG admins. */
  PricingRecommendation: "pricingRecommendation",
  PricingOverride: "pricingRecommendation",
  /* 3S3-BE-02 — a brief's ranking runs, their scores, and its shortlist: read by the matching desk and Sales; the shortlist saved by the desk. */
  MatchRun: "briefMatch",
  MatchScore: "briefMatch",
  BriefShortlist: "briefMatch",
  /* 3S4 — an active campaign's pacing, forecasts and risk alerts: read by the campaign desk and Sales; written by the worker. */
  CampaignPacing: "campaignForecast",
  CampaignForecast: "campaignForecast",
  CampaignForecastAlert: "campaignForecast",
  MakeGoodShortfall: "makeGood",
  MakeGoodOption: "makeGood",
  Scenario: "scenario",
  Anomaly: "anomaly",
  AnomalyScan: "anomaly",
  ModelVersion: "modelRegistry",
  FeatureFlag: "modelRegistry",
  BacktestRun: "modelRegistry",
  AttributionPartner: "attribution",
  AttributionDelivery: "attribution",
  PartnerSaleAttribution: "attribution",
  VirtualWorld: "virtualWorld",
  VirtualZone: "virtualWorld",
  VirtualPlacement: "virtualWorld",
  PlacementWindow: "virtualWorld",
  VirtualAsset: "virtualWorld",
  CreativeDeployment: "virtualWorld",
  /* 4S0-SEC-01 — INFINEX machine credentials and the game clients registered for a world. */
  InfinexCredential: "infinexCredential",
  InfinexClient: "infinexClient",
  /* 4S4-BE-01 / 4S4-DATA-01 — raw INFINEX telemetry. */
  VirtualEventRaw: "virtualEvent",
  /* P8-BE-03 — a concern raised about a deal, and the documents the athlete sends for it. */
  DealDispute: "dealDispute",
  DealDisputeDocument: "dealDispute",
  /* 2S5-INT-02 — the payment provider's events: written by the signed webhook and the worker, read by BTG admin and Finance. */
  PaymentEvent: "paymentEvent",
  /* 2S5-BE-03 — a refund the provider reported: its record, read with the events. A dispute: BTG support's. */
  PaymentRefund: "paymentEvent",
  PaymentDispute: "paymentDispute",
  /* 2S4-BE-11 — a delivery problem's exchange is part of its line's delivery. */
  DeliveryIssue: "orderDelivery",
  /* 2S2-BE-05 — a team's invitation to an athlete already on SponsorX. */
  TeamInvitation: "teamInvitation",
  /* POL-BE-03 — a team's request to change its share: asked through the roster (teamMember), answered on the athlete's side of teamInvitation. */
  TeamShareChange: "teamInvitation",
  Payout: "payout",
  PayoutLine: "payout",
  PaymentAttempt: "marketplaceOrder",
  EditionEvent: "editionEvent",
  Student: "student",
  StudentCode: "studentCode",
  SalesAttribution: "saleAttribution",
  StudentPointAccrual: "studentPoints",
  StudentProspect: "studentProspect",
  EditionAsset: "editionAsset",
  ContentRight: "contentRight",
  RosterEntry: "rosterEntry",
  AthleteClaim: "athleteClaim",
  ContentContribution: "contentContribution",
  SchoolPoolAllocation: "schoolPoolAllocation",
  ReportFile: "sponsorReport",
  PropertyOnboarding: "propertyOnboarding",
  /* 2S1-BE-02 — a verification document is part of its onboarding: the
     applicant reaches it by resume token, BTG through propertyOnboarding. */
  OnboardingDocument: "propertyOnboarding",
  NotificationPreference: "notificationPreference",
  InventoryItem: "inventoryItem",
  Listing: "listing",
  Offer: "offer",
  /* 2S2-FE-03 — written through the offer's own write (the athlete's answer). */
  OfferChangeRequest: "offer",
  TenantBranding: "tenantBranding",
  BrandRestriction: "brandRestriction",
  /* A commitment is the item's own ledger of what is spoken for — read by
     the availability check, written by the purchase that commits it. */
  InventoryCommitment: "inventoryItem",
  Cart: "cart",
  CartLine: "cart",
  /* A package's contents are part of the item. */
  BundleComponent: "inventoryItem",
  Reservation: "reservation",
  MarketplaceOrder: "marketplaceOrder",
  MarketplaceOrderLine: "marketplaceOrder",
  CommissionRule: "commissionRule",
  OrderLineFinancials: "orderFinancials",
  LedgerEntry: "ledgerEntry",
  /* 2S1-BE-13 — closed accounts; 2S1-BE-15 — a guardian handoff and its documents. */
  AccountClosure: "accountClosure",
  ClosureRequest: "accountClosure",
  GuardianHandoff: "guardianHandoff",
  GuardianHandoffDocument: "guardianHandoff",
  /* 2S1-BE-16 — written by the public contact form; 2S0-SEC-01 — read by
     BTG's support desk, which opens each attachment through an audited link
     instead of receiving it by email. */
  SupportMessage: "supportMessage",
  SupportAttachment: "supportMessage",
};

/** Models no API path reads or writes, and why. */
const SYSTEM_INTERNAL: Record<string, string> = {
  OutboxJob: "the job queue — written inside domain transactions, drained by the worker",
  EmailSendLog: "the worker's idempotency ledger for sent email",
  InfinexToken: "4S0-SEC-01 — a machine token's hash and expiry, looked up only by auth/machine.ts to resolve the caller; no route reads or lists them",
  ListingDigest: "the worker's record of the daily auto-published listings summary sent to each BTG tenant (2S3-BE-06) — no route reads it",
  OrderApprovalDigest: "the worker's record of the daily summary of orders approved automatically, sent to each BTG tenant (2S4-BE-09) — no route reads it",
  /* 3S1-BE-01 — written only inside domain transactions (src/domain/facts.ts). No route reads them yet: the
     intelligence reads (3S7-BE-02) will, scoped to the caller's sponsor or property, and add matrix rows then. */
  Fact: "the fact ledger — written in the same transaction as each money or delivery action; no route reads it yet (3S7-BE-02 will)",
  CampaignDaySummary: "the daily summaries kept in step with the fact ledger; no route reads them yet (3S7-BE-02 will)",
  FactCheckRun: "the nightly fact check's record (3S1-QA-01): platform-wide, written by the worker; each tenant's part is read through integration health (webhookDelivery read, BTG only)",
  PipelineRun: "the nightly pipeline's record (3S9-OPS-01): platform-wide, written by the worker, read only by /health/full as counts and times",
  Benchmark: "the benchmarks (3S1-DATA-03): derived from the fact ledger's summaries and rebuilt nightly by the worker; read by the model screen and the pricing engine when their routes land (3S8-FE-02, 3S2-BE-02)",
  FeatureSnapshot: "the daily feature snapshots (3S2-BE-01): what was known about an athlete on a day, written once by the worker; read by the pricing engine when it lands (3S2-BE-02)",
};

describe("P8-SEC-01 · every model is governed by the matrix", () => {
  it("reads the schema", () => {
    expect(MODELS.length).toBeGreaterThan(30);
  });

  it.each(MODELS)("%s has matrix rows, or is declared internal", (model) => {
    const resource = GOVERNED_BY[model];
    const internal = SYSTEM_INTERNAL[model];
    expect(
      resource !== undefined || internal !== undefined,
      `${model} is in the schema but no matrix resource governs it. Add rows to ` +
        `documentation/SponsorX-RBAC-Matrix.md and src/auth/policy.ts, or declare it internal here.`,
    ).toBe(true);
    if (resource) expect(RESOURCES).toContain(resource);
  });

  it("names no model that no longer exists", () => {
    for (const model of [...Object.keys(GOVERNED_BY), ...Object.keys(SYSTEM_INTERNAL)]) {
      expect(MODELS, `${model} is mapped but not in the schema`).toContain(model);
    }
  });

  it("gives every governed resource at least one role that can read it", () => {
    for (const resource of new Set(Object.values(GOVERNED_BY))) {
      const readers = ROLES.filter((r) => scopeForRole(r, resource, "read") !== "deny");
      expect(readers.length, `${resource} has rows but nobody may read it`).toBeGreaterThan(0);
    }
  });

  it("has a POLICY entry for every resource, and every cell resolves", () => {
    for (const resource of RESOURCES) {
      expect(POLICY[resource]).toBeDefined();
      for (const role of ROLES) for (const action of ACTIONS) {
        expect(typeof scopeForRole(role, resource, action)).toBe("string");
      }
    }
  });

  it("keeps the new B8 resources BTG-side (matrix §11)", () => {
    for (const resource of ["inquiry", "syncTask"] as const) {
      for (const role of ["SPONSOR_ADMIN", "SPONSOR_ANALYST", "ATHLETE", "GUARDIAN", "PROPERTY_MGR", "FINANCE", "NETWORK_MGR"] as const) {
        for (const action of ACTIONS) expect(scopeForRole(role, resource, action)).toBe("deny");
      }
    }
  });

  /* P2-OPS-07 (2026-10-07): CI runs on every pull request again (public
     repository, free minutes), plus nightly on main and by hand. Since
     2026-10-15 a push runs it only on `main` and `main_development`: a
     working branch's pull request already checks the same commit. The
     automatic deploy still waits for a green nightly or hand-started run —
     never a push run. */
  it("runs in CI on every pull request, on pushes to main and main_development, nightly, by hand, and before every automatic deploy", () => {
    const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(ci).toMatch(/on:\s*\n\s*push:\s*\n\s*branches: \[main, main_development\]\s*\n\s*pull_request:\s*\n\s*schedule:\s*\n\s*- cron:/);
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain("name: typecheck · lint · unit · authz matrix");
    expect(ci).toContain("npm run test -w @sponsorx/backend");
    const deploy = readFileSync(new URL("../../.github/workflows/deploy-daily.yml", import.meta.url), "utf8");
    expect(deploy).toMatch(/workflow_run:\s*\n\s*workflows: \[CI\]/);
    expect(deploy).toContain("conclusion == 'success'");
    expect(deploy).toContain(`contains(fromJSON('["schedule","workflow_dispatch"]'), github.event.workflow_run.event)`);
  });
});
