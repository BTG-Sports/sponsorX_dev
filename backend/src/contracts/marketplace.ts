import { z } from "./zod";

import { BRAND_CATEGORIES } from "../domain/brand-categories";
import { INVENTORY_KINDS } from "../domain/inventory";
import { LISTING_STATES } from "../domain/listing-rules";
import { ORG_TYPES } from "../domain/onboarding-rules";
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
  .meta({ id: "ListingInput", description: "A listing on one of the property's items, or a roster athlete's — or, from an approved athlete with no team, on one of their own items (2S3-BE-05). Starts DRAFT." });
export const ListingPatch = z.object(listingFields).partial().strict().meta({ id: "ListingPatch", description: "Only while DRAFT, PAUSED or held for BTG (PENDING_APPROVAL — the edit takes it back to DRAFT, to submit again)." });
export const ListingTransitionInput = z
  .object({ to: z.enum(["PAUSED", "PUBLISHED", "ARCHIVED"]) })
  .meta({ id: "ListingTransitionInput", description: "Pause, resume or archive. Resuming runs the same automatic path as submitting (2S3-BE-06): live when the checks pass and nothing is flagged, else held for BTG; a listing BTG paused always goes back to BTG." });
export const ListingDecisionInput = z
  .object({ decision: z.enum(["APPROVE", "REQUEST_CHANGES", "REJECT"]), notes: z.string().max(4000).nullable().optional() })
  .meta({ id: "ListingDecisionInput", description: "BTG's decision on a listing held for it (2S3-BE-06): APPROVE publishes it; REQUEST_CHANGES sends it back to DRAFT; REJECT ends it. REQUEST_CHANGES and REJECT need notes — the seller is emailed them." });
export const ListingBtgActionInput = z
  .object({ action: z.enum(["PAUSE", "END", "RESUME"]), reason: z.string().trim().max(2000).nullable().optional() })
  .strict()
  .meta({ id: "ListingBtgActionInput", description: "BTG pauses or ends a live listing (END also takes a paused one), with a reason the seller is emailed — PAUSE and END need it; or puts a listing BTG paused back live (RESUME — every check re-run: restricted words or the seller's standing hold it for BTG instead) (2S3-BE-06)." });
export const ListingState = z.enum(LISTING_STATES).meta({ id: "ListingState" });
/** 2S3-FE-04 — BTG's "Live listings" tab, a page at a time. */
export const LISTINGS_LIVE_PAGE_SIZE = 25;
export const LiveListingsQuery = z
  .object({ page: z.coerce.number().int().min(1).max(10_000).optional() })
  .strict()
  .meta({ id: "LiveListingsQuery", description: `1-based page of ${LISTINGS_LIVE_PAGE_SIZE}, newest live first (default 1).` });

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
/* 2S2-FE-03 — editing a DRAFT: any term but whose offer it is (campaign,
   athlete). Merged over the row; the domain asks the whole draft again. */
export const OfferPatch = OfferInput.omit({ campaignId: true, athleteId: true })
  .partial()
  .strict()
  .meta({ id: "OfferPatch", description: "Edit a DRAFT offer: any of its terms except the campaign and the athlete. The merged draft must clear every check drafting does (terms, item, exclusivity, restrictions, floor, budget)." });
export const OfferKeepInput = z
  .object({ note: z.string().trim().min(1).max(2000).describe("BTG's reply to the athlete — why the offer stands") })
  .strict()
  .meta({ id: "OfferKeepInput", description: "Answer a change request by keeping the offer as it is, with a reply to the athlete (2S2-FE-03)." });
/* 2S2-FE-03 — BTG's offer form, live: the checks a draft will be asked,
   answered without refusing (GET /campaigns/:id/offer-checks), and the
   athletes it can be made to (GET /offers/athletes). Every field optional —
   the form asks as it is filled in. */
const cents = z.coerce.number().int().min(0).max(100_000_000);
export const OfferChecksQuery = z
  .object({
    athleteId: z.string().min(1).optional(),
    jobId: z.string().min(1).optional(),
    inventoryItemId: z.string().min(1).optional(),
    compensation: cents.optional(),
    sellPrice: cents.optional(),
  })
  .strict()
  .meta({ id: "OfferChecksQuery", description: "The draft so far: athlete, job, item and the two prices in cents. Each check runs once its inputs are present." });
/* P4-BE-08 — the new-offer form, filled in from the records that decide
   each field (GET /campaigns/:id/offer-draft). Both ids are optional HERE so
   the campaign is asked first — another tenant's campaign answers 404, not
   400; the domain refuses a draft missing either (422). */
export const OfferDraftQuery = z
  .object({
    athleteId: z.string().min(1).max(64).optional(),
    jobId: z.string().min(1).max(64).optional(),
  })
  .strict()
  .meta({ id: "OfferDraftQuery", description: "The athlete and the NIL job to draft an offer for — both required to draft." });
const OFFER_DRAFT_FIELDS = ["brief", "compensation", "sellPrice", "deliverables", "usageRights", "exclusivityDays", "disclosures", "expiresAt"] as const;
export const OfferDraft = z
  .object({
    campaignId: z.string(),
    athlete: z.object({
      id: z.string(), name: z.string(), minor: z.boolean(), guardianAnswers: z.boolean(),
      age: z.int().nullable(), guardianName: z.string().nullable(),
    }),
    job: z.object({ id: z.string(), name: z.string() }),
    offer: OfferInput.describe("The draft as POST /offers takes it — sent unchanged, it passes every check drafting asks (budget aside: what the campaign has left is the form's check)."),
    sources: z.object(Object.fromEntries(OFFER_DRAFT_FIELDS.map((k) => [k, z.string()])) as Record<(typeof OFFER_DRAFT_FIELDS)[number], z.ZodString>)
      .describe("Per field, in plain words, where its value came from."),
  })
  .meta({ id: "OfferDraft", description: "A new offer filled in for BTG to check and send (P4-BE-08). Creates nothing." });
export const OfferAthletesQuery = z
  .object({ q: z.string().trim().max(80).optional() })
  .strict()
  .meta({ id: "OfferAthletesQuery", description: "A name to search for; empty lists the first athletes by name." });
export const OfferResponseInput = z
  .object({
    /* 2S2-FE-03 — REQUEST_CHANGE neither accepts nor declines: the offer
       stays SENT and the note is routed to the campaign manager(s). */
    decision: z.enum(["ACCEPT", "DECLINE", "REQUEST_CHANGE"]),
    note: z.string().trim().min(1).max(2000).describe("REQUEST_CHANGE only — what the athlete wants changed").optional(),
    termsHashShown: z.string().length(64).optional(),
    agreementId: z.string().min(1).optional(),
    /* The agreement's own fingerprint form ("sha256:<hex>"), as campaign.ts and
       guardian.ts take it — a 64-char rule refused every real agreement. */
    bodyHashShown: z.string().min(1).describe("Hash of the agreement text as rendered to the signer").optional(),
  })
  .meta({ id: "OfferResponseInput", description: "ACCEPT needs the terms hash shown and the agreement shown; it freezes the terms and schedules the deliverables. REQUEST_CHANGE needs a note; the offer stays SENT." });

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
/* 2S4-FE-02 — the contract gate. The acceptance and the billing contact are
   optional on the wire so their absence is the domain's 422 ("accept the
   terms first"), not a bare 400; placeOrder refuses without either. */
export const OrderBillingContact = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.email().max(320),
    reference: z.string().trim().max(100).nullable().optional().describe("PO number or the sponsor's own reference — never a card or bank number"),
  })
  .strict()
  .meta({ id: "OrderBillingContact", description: "Who BTG bills for this order — a snapshot kept on the order. No card or bank numbers." });
export const PlaceOrderInput = z
  .object({
    reservationId: z.string().min(1),
    agreementId: z.string().min(1).describe("The MARKETPLACE_ORDER agreement checkout showed (GET /reservations/:id → checkout.terms.id)").optional(),
    /* The agreement's own fingerprint form ("sha256:<hex>"), as offers take it. */
    bodyHashShown: z.string().min(1).max(200).describe("Hash of the order terms as rendered to the sponsor").optional(),
    billing: OrderBillingContact.optional(),
  })
  .strict()
  .meta({ id: "PlaceOrderInput", description: "The live hold to turn into an order, with the sponsor's acceptance of the order terms and the billing contact they confirmed — 422 without either." });
export const MarketplaceOrderDecisionInput = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), notes: z.string().max(4000).nullable().optional() })
  .meta({ id: "MarketplaceOrderDecisionInput", description: "BTG's decision on an order held for approval; REJECT needs notes and releases the stock." });
/* 2S4-BE-10 — BTG recording a payment made another way. */
export const ManualPaymentInput = z
  .object({
    method: z.enum(["BANK_TRANSFER", "CHEQUE", "OTHER"]),
    reference: z.string().trim().max(200).describe("The payment's reference — required; never a card or bank number"),
    receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("The date the money arrived, YYYY-MM-DD — not in the future"),
  })
  .strict()
  .meta({ id: "ManualPaymentInput", description: "How a payment made outside the card provider arrived. Required to mark an order PAID by hand (BTG admin and Finance only)." });
export const MarketplaceOrderTransitionInput = z
  .object({
    to: z.enum(["AWAITING_PAYMENT", "PAID", "IN_DELIVERY", "FULFILLED", "CLOSED", "CANCELLED", "REFUNDED"]),
    /* Optional on the wire so its absence is the domain's 422 ("give the reference"), not a bare 400. */
    payment: ManualPaymentInput.optional(),
  })
  .strict()
  .meta({ id: "MarketplaceOrderTransitionInput", description: "Payment and delivery states (staff), or CANCELLED before payment (the sponsor). APPROVED is never a transition. PAID by hand needs `payment` (method, reference, date received) and BTG admin or Finance." });

/* 2S4-BE-09 — the seller's answer to an order a listing of theirs asks to approve. */
export const SellerApprovalDecisionInput = z
  .object({
    decision: z.enum(["ACCEPT", "DECLINE"]),
    reason: z.string().trim().max(2000).nullable().optional().describe("Why — required to decline; the sponsor reads it"),
  })
  .strict()
  .meta({ id: "SellerApprovalDecisionInput", description: "The seller accepts the order, or declines it with a reason the sponsor reads — within 48 hours of it being placed." });

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
      /* Every organisation type, AGENCY included (2S1-BE-08). */
      propertyKind: z.enum(ORG_TYPES).nullable().optional(),
      propertyId: z.string().min(1).nullable().optional(),
      athleteItem: z.boolean().optional(),
      /* 2S3-BE-05 — sold by an athlete with no team: the athlete is the only payee, no team share. */
      independentAthlete: z.boolean().optional(),
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
