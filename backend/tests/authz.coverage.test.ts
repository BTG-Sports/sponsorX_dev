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

   It runs in `npm test`, which CI runs on every push and pull request.
   -------------------------------------------------------------------------- */

const SCHEMA = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
const MODELS = [...SCHEMA.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);

/** Which matrix resource governs each model. */
const GOVERNED_BY: Record<string, Resource> = {
  Tenant: "tenant",
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
  SyncTask: "syncTask",
  AuditLog: "auditLog",
  Publication: "publication",
  Edition: "edition",
  AdSlot: "adSlot",
  RevenueSplit: "revenueSplit",
  /* 2S5-INT-01/-03, 2S5-BE-04/-05 — a card payment is the order's; a payout
     line is its payout's. */
  PayoutAccount: "payoutAccount",
  RestrictedWord: "restrictedWord",
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
};

/** Models no API path reads or writes, and why. */
const SYSTEM_INTERNAL: Record<string, string> = {
  OutboxJob: "the job queue — written inside domain transactions, drained by the worker",
  EmailSendLog: "the worker's idempotency ledger for sent email",
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

  /* Since 2026-10-01 CI runs once a day on main (and by hand), not on every
     push — the account ran out of Actions minutes. The suite must still run
     there, and the nightly deploy must still wait for it. */
  it("runs in CI nightly on main, by hand, and before every automatic deploy", () => {
    const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
    expect(ci).toMatch(/on:\s*\n\s*schedule:\s*\n\s*- cron:/);
    expect(ci).toContain("workflow_dispatch:");
    expect(ci).toContain("npm run test -w @sponsorx/backend");
    const deploy = readFileSync(new URL("../../.github/workflows/deploy-daily.yml", import.meta.url), "utf8");
    expect(deploy).toMatch(/workflow_run:\s*\n\s*workflows: \[CI\]/);
    expect(deploy).toContain("conclusion == 'success'");
  });
});
