import { z } from "./zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";
import { INVENTORY_KINDS } from "../domain/inventory";
import { LISTING_STATES } from "../domain/listing-rules";
import { LOGO_TYPES } from "../domain/branding";

/* --------------------------------------------------------------------------
   Phase 2 Sprint 2–3 on the wire — inventory (2S2-BE-01), the team roster
   (2S2-BE-04), listings (2S3-BE-01), formal offers (2S2-BE-03) and tenant
   branding (2S7-BE-01). Business rules live in the domain; these shapes are
   what a request may carry. None of them names an owner: the owner is always
   the caller.
   -------------------------------------------------------------------------- */

const category = z.enum(BRAND_CATEGORIES);
const when = z.iso.datetime().transform((s) => new Date(s));

const PackageRules = z
  .object({ minQuantity: z.number().int().min(1).optional(), maxQuantity: z.number().int().min(1).optional(), bundleOnly: z.boolean().optional(), exclusive: z.boolean().optional(), requiresApproval: z.boolean().optional() })
  .strict();

const inventoryFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  kind: z.enum(INVENTORY_KINDS),
  jobId: z.string().min(1).nullable().optional(),
  priceCents: z.number().int().min(100).max(100_000_000),
  quantity: z.number().int().min(0).nullable().optional(),
  availableFrom: when.nullable().optional(),
  availableUntil: when.nullable().optional(),
  categories: z.array(category).max(25).optional(),
  restrictedCategories: z.array(category).max(25).optional(),
  packageRules: PackageRules.optional(),
  active: z.boolean().optional(),
  /* 2S3-BE-02 — a PACKAGE's contents: the owner's own items, one unit or more of each. */
  components: z.array(z.object({ itemId: z.string().min(1), quantity: z.number().int().min(1).max(100) }).strict()).max(10).optional(),
};

export const InventoryItemInput = z.object(inventoryFields).strict().meta({
  id: "InventoryItemInput", description: "An item the caller sells — priced by them. The owner is the caller (athlete, or team manager for the team).",
});
export const InventoryItemPatch = z.object(inventoryFields).partial().strict().meta({
  id: "InventoryItemPatch", description: "Price and quantity cannot change while a listing of the item is published — pause it first.",
});

export const RosterAthleteInput = z
  .object({
    legalName: z.string().trim().min(1).max(200),
    displayName: z.string().trim().min(1).max(100),
    email: z.email().max(320),
    sport: z.string().trim().min(1).max(60),
    position: z.string().max(60).nullable().optional(),
    gradYear: z.number().int().min(1990).max(2100).nullable().optional(),
    birthDate: z.iso.date().transform((s) => new Date(s)).nullable().optional(),
    ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).nullable().optional(),
    teamShareBps: z.number().int().min(0).max(10_000).nullable().optional(),
  })
  .strict()
  .meta({ id: "RosterAthleteInput", description: "An athlete joining the manager's roster, with an account to claim by email." });
export const TeamShareInput = z
  .object({ teamShareBps: z.number().int().min(0).max(10_000).nullable() })
  .meta({ id: "TeamShareInput", description: "The team's share of this athlete's earnings, in basis points." });

const listingFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(8000).nullable().optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  publishAt: when.nullable().optional(),
};
export const ListingInput = z
  .object({ inventoryItemId: z.string().min(1), ...listingFields })
  .strict()
  .meta({ id: "ListingInput", description: "A listing on one of the property's items, or a roster athlete's. Starts DRAFT." });
export const ListingPatch = z.object(listingFields).partial().strict().meta({ id: "ListingPatch", description: "Only while DRAFT or PAUSED." });
export const ListingTransitionInput = z
  .object({ to: z.enum(["PAUSED", "PUBLISHED", "ARCHIVED"]) })
  .meta({ id: "ListingTransitionInput", description: "Pause, resume (re-checks governance) or archive. Publishing a draft is BTG's approval, never this." });
export const ListingDecisionInput = z
  .object({ decision: z.enum(["APPROVE", "REQUEST_CHANGES"]), notes: z.string().max(4000).nullable().optional() })
  .meta({ id: "ListingDecisionInput", description: "BTG's decision on a submitted listing; REQUEST_CHANGES needs notes." });
export const ListingState = z.enum(LISTING_STATES).meta({ id: "ListingState" });

export const OfferInput = z
  .object({
    campaignId: z.string().min(1),
    athleteId: z.string().min(1),
    jobId: z.string().min(1),
    inventoryItemId: z.string().min(1).nullable().optional(),
    brief: z.string().trim().min(1).max(8000),
    compensation: z.number().int().min(1),
    sellPrice: z.number().int().min(1),
    deliverables: z.array(z.object({ title: z.string().trim().min(1).max(200), dueDate: when }).strict()).min(1).max(20),
    usageRights: z.string().trim().min(1).max(2000),
    exclusivityDays: z.number().int().min(0).max(730).nullable().optional(),
    disclosures: z.array(z.string().trim().min(1).max(100)).max(10),
    expiresAt: when,
  })
  .strict()
  .meta({ id: "OfferInput", description: "A formal offer: brief, pay, deliverables, usage rights, exclusivity, disclosures (2S2-BE-03)." });
export const OfferResponseInput = z
  .object({
    decision: z.enum(["ACCEPT", "DECLINE"]),
    termsHashShown: z.string().length(64).optional(),
    agreementId: z.string().min(1).optional(),
    bodyHashShown: z.string().length(64).optional(),
  })
  .meta({ id: "OfferResponseInput", description: "ACCEPT needs the terms hash shown and the agreement shown; it freezes the terms and schedules the deliverables." });

/* ── Phase 2 batch 4 — restrictions, search, cart ─────────────────────── */
export const RestrictionInput = z
  .object({
    athleteId: z.string().min(1).nullable().optional(),
    propertyId: z.string().min(1).nullable().optional(),
    category,
    type: z.enum(["PROHIBITED", "LEAGUE_RULE", "SCHOOL_POLICY"]),
    startsOn: when.nullable().optional(),
    endsOn: when.nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .strict()
  .meta({ id: "RestrictionInput", description: "A category an athlete or team will not be sold to, for a date range (open-ended when an end is null). EXCLUSIVITY is written by accepted offers only." });
export const SponsorCategoriesInput = z
  .object({ categories: z.array(category).max(10) })
  .meta({ id: "SponsorCategoriesInput", description: "The brand categories a sponsor sells in — set by BTG." });
const num = z.coerce.number().int().min(0);
export const SearchQuery = z
  .object({
    q: z.string().max(200).optional(), kind: z.enum(INVENTORY_KINDS).optional(), category: category.optional(),
    sport: z.string().max(60).optional(), stateCode: z.string().length(2).optional(),
    minPrice: num.optional(), maxPrice: num.optional(),
    availableFrom: when.optional(), availableUntil: when.optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .meta({ id: "SearchQuery" });
export const CartLineInput = z
  .object({ listingId: z.string().min(1), quantity: z.number().int().min(1).max(1000), startsOn: when, endsOn: when })
  .strict()
  .meta({ id: "CartLineInput", description: "One listing, how many, and for which dates — checked for availability, conflict and price on every write." });
export const CartLinePatch = z
  .object({ quantity: z.number().int().min(1).max(1000).optional(), startsOn: when.optional(), endsOn: when.optional() })
  .strict()
  .meta({ id: "CartLinePatch" });

/* ── Phase 2 batch 5 — reservations and marketplace orders ─────────── */
export const PlaceOrderInput = z
  .object({ reservationId: z.string().min(1) })
  .meta({ id: "PlaceOrderInput", description: "The live hold to turn into an order." });
export const MarketplaceOrderDecisionInput = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), notes: z.string().max(4000).nullable().optional() })
  .meta({ id: "MarketplaceOrderDecisionInput", description: "BTG's decision on an order held for approval; REJECT needs notes and releases the stock." });
export const MarketplaceOrderTransitionInput = z
  .object({ to: z.enum(["AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED"]) })
  .meta({ id: "MarketplaceOrderTransitionInput", description: "Payment and delivery states (staff), or CANCELLED before payment (the sponsor). APPROVED is never a transition." });

/* ── Phase 2 batch 6 — commission rules ─────────────────────────────── */
export const CommissionRuleInput = z
  .object({
    kind: z.enum(["PLATFORM_FEE", "MANAGEMENT_FEE", "PROCESSING", "REFERRAL", "RESERVE", "TEAM_SHARE"]),
    scope: z.enum(["GLOBAL", "PROPERTY_KIND", "PROPERTY", "SPONSOR"]),
    scopeRef: z.string().min(1).max(100).nullable().optional(),
    bps: z.number().int().min(0).max(10_000),
    fixedCents: z.number().int().min(0).max(1_000_000).optional(),
    priority: z.number().int().min(-1000).max(1000),
    effectiveFrom: when.optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict()
  .meta({ id: "CommissionRuleInput", description: "One commission rule, version 1. The highest-priority matching rule in effect applies (ledger design §3)." });
export const CommissionRuleRevision = z
  .object({ bps: z.number().int().min(0).max(10_000).optional(), fixedCents: z.number().int().min(0).max(1_000_000).optional(), priority: z.number().int().min(-1000).max(1000).optional(), note: z.string().max(500).nullable().optional() })
  .strict()
  .meta({ id: "CommissionRuleRevision", description: "An edit is a new version from now; the old version's window closes. Contracted orders are untouched." });

export const CommissionPreviewInput = z
  .object({
    sponsorId: z.string().min(1).nullable().optional(),
    lines: z.array(z.object({
      label: z.string().max(80).optional(),
      grossCents: z.number().int().min(1).max(100_000_000),
      propertyKind: z.enum(["TEAM", "SCHOOL", "EVENT", "MEDIA", "VIRTUAL"]).nullable().optional(),
      propertyId: z.string().min(1).nullable().optional(),
      athleteItem: z.boolean().optional(),
      teamShareBps: z.number().int().min(0).max(10_000).nullable().optional(),
    }).strict()).min(1).max(20),
    draft: CommissionRuleInput.omit({ effectiveFrom: true, note: true }).nullable().optional(),
  })
  .strict()
  .meta({ id: "CommissionPreviewInput", description: "A sample order, and optionally an unsaved rule, to preview the split against (2S5-FE-01). Writes nothing." });

const hexColour = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const BrandingInput = z
  .object({
    displayName: z.string().max(120).nullable().optional(),
    logoKey: z.string().max(300).nullable().optional(),
    primaryColor: hexColour.nullable().optional(),
    accentColor: hexColour.nullable().optional(),
    reportFooter: z.string().max(500).nullable().optional(),
    customDomain: z.string().max(253).nullable().optional(),
  })
  .strict()
  .meta({ id: "BrandingInput", description: "The tenant's own name, logo, colours, report footer and requested custom domain (2S7-BE-01)." });
export const LogoUploadInput = z
  .object({ contentType: z.enum(Object.keys(LOGO_TYPES) as [keyof typeof LOGO_TYPES]), bytes: z.number().int().min(1).max(1024 * 1024) })
  .meta({ id: "LogoUploadInput", description: "PNG or JPEG, up to 1 MB — to the public bucket." });
