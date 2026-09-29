import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

// Importing ./zod first is load-bearing: it applies the `.openapi()` extension
// that registry.register() depends on. See src/contracts/zod.ts.
import { z } from "./zod";
import { PageMeta, PageQuery, ProblemDetails, Provenance } from "./common";
import {
  BrandCategory,
  BriefState,
  BriefTransitionInput,
  CampaignBriefInput,
  CampaignFromBriefInput,
  CampaignState,
  CampaignTransitionInput,
  EligibleAthlete,
  InvitationInput,
  InvitationResponseInput,
  InviteState,
  OrderState,
  AthleteRateInput,
  AthleteTierInput,
  CampaignOrderInput,
  OrderTransitionInput,
  OrderAcceptanceInput,
} from "./campaign";
import {
  CreativeAssetInput,
  CreativeUploadInput,
  DeliverableState,
  MarkPublishedInput,
  RevisionRequestInput,
} from "./deliverable";
import {
  RewardClaimInput,
  RewardEligibility,
  RewardEventType,
  RewardFunnel,
  RewardInput,
  RewardState,
  RewardTokenInput,
  RewardTransitionInput,
  TrackingCode,
  TrackingDestination,
  TrackingLinkInput,
} from "./reward";
import {
  EarningAdjustmentInput,
  EarningBreakdown,
  EarningState,
  EarningTransitionInput,
} from "./earning";
import {
  MediaValue, MetricBreakdown, MetricEntryInput, MetricSource,
  SourcedTotals, SponsorReport,
} from "./metric";
import { Invoice, PaymentStatus, ZohoInvoiceWebhook } from "./invoice";
import { InquiryInput, ZohoCrmNotification } from "./zoho";
import {
  AdSaleInput,
  AdSlotInput,
  EditionConditionsInput,
  EditionEventInput,
  EditionInput,
  EditionTransitionInput,
  PublicationInput,
} from "./edition";
import {
  AssignStudentInput,
  PointsInput,
  ProspectDecisionInput,
  ProspectInput,
  StudentApplicationInput,
  StudentGuardianInput,
  StudentInput,
  StudentTransitionInput,
} from "./student";
import {
  AssetCampaignInput,
  ClaimInput,
  ContentRightInput,
  ContributionInput,
  EditionAssetInput,
  FeaturedAthleteInput,
  RosterInput,
  SubjectConsentInput,
} from "./rights";
import {
  BrandingInput, InventoryItemInput, InventoryItemPatch, ListingDecisionInput, ListingInput, ListingPatch,
  ListingTransitionInput, LogoUploadInput, OfferInput, OfferResponseInput, RosterAthleteInput, TeamShareInput,
  CartLineInput, CartLinePatch, RestrictionInput, SponsorCategoriesInput,
  MarketplaceOrderDecisionInput, MarketplaceOrderTransitionInput, PlaceOrderInput,
  CommissionRuleInput, CommissionRuleRevision, CommissionPreviewInput,
} from "./marketplace";
import { NotificationPreferenceInput } from "./notification-preferences";
import { OnboardingDecisionInput, OnboardingDocumentInput, OnboardingStartInput, OnboardingStepInput } from "./onboarding";
import {
  AgreementAcceptanceInput,
  GuardianInput,
  GuardianReadiness,
  GuardianRelationship,
} from "./guardian";
import {
  ApplicantView,
  ApplicationDecisionNotes,
  ApplicationSubmissionReceipt,
  AthleteApplicationPatch,
  ApplicationReviewDecision,
  ApproveApplicationInput,
  AthleteApplicationInput,
  AthleteApplicationReview,
  AthleteApplicationSummary,
  AthleteState,
  SocialAccount,
  SocialAccountIntake,
} from "./athlete";

/**
 * The contracts registry (P2-BE-07 — §38, Addendum A2, Guide §02).
 *
 * Schema-first, one direction only: Zod is the single source of truth, and
 * `openapi.json` is generated from it. The spec is never hand-written, because a
 * hand-written spec drifts from the code the moment anyone is in a hurry — and
 * §8's API Service Account consumes this on equal terms with our own portals,
 * so drift is someone else's outage.
 *
 * Registering a contract here is what puts it in the published spec. Domain
 * contracts arrive with the milestone that builds their endpoints (B1 onwards),
 * against the real Prisma models from P2-BE-02.
 */
export const registry = new OpenAPIRegistry();

// --- shared components -----------------------------------------------------

registry.register("ProblemDetails", ProblemDetails);
registry.register("PageQuery", PageQuery);
registry.register("PageMeta", PageMeta);
registry.register("Provenance", Provenance);

// --- athlete onboarding (P3-BE-01, §11) ---------------------------------

registry.register("AthleteState", AthleteState);
registry.register("SocialAccount", SocialAccount);
registry.register("SocialAccountIntake", SocialAccountIntake);
registry.register("AthleteApplicationInput", AthleteApplicationInput);
registry.register("AthleteApplicationReview", AthleteApplicationReview);

// --- application review (P3-BE-07, §13, §23) -----------------------------

registry.register("ApplicationReviewDecision", ApplicationReviewDecision);
registry.register("ApproveApplicationInput", ApproveApplicationInput);
registry.register("ApplicationDecisionNotes", ApplicationDecisionNotes);
registry.register("AthleteApplicationSummary", AthleteApplicationSummary);

// --- public intake (P3-BE-13, §11) ---------------------------------------

registry.register("AthleteApplicationPatch", AthleteApplicationPatch);
registry.register("ApplicationSubmissionReceipt", ApplicationSubmissionReceipt);
registry.register("ApplicantView", ApplicantView);

// --- guardians and agreements (P3-BE-14, §4, §12, §37) -------------------

registry.register("GuardianRelationship", GuardianRelationship);
registry.register("GuardianInput", GuardianInput);
registry.register("GuardianReadiness", GuardianReadiness);
registry.register("AgreementAcceptanceInput", AgreementAcceptanceInput);

// --- briefs, campaigns and invitations (P4-BE-02..06, §21, §26) ----------

registry.register("BrandCategory", BrandCategory);
registry.register("BriefState", BriefState);
registry.register("CampaignState", CampaignState);
registry.register("InviteState", InviteState);
registry.register("CampaignBriefInput", CampaignBriefInput);
registry.register("BriefTransitionInput", BriefTransitionInput);
registry.register("CampaignFromBriefInput", CampaignFromBriefInput);
registry.register("CampaignTransitionInput", CampaignTransitionInput);
registry.register("InvitationInput", InvitationInput);
registry.register("InvitationResponseInput", InvitationResponseInput);
registry.register("EligibleAthlete", EligibleAthlete);

// --- rate cards and campaign orders (P3-BE-09, P5-BE-01, P5-BE-02) ------

registry.register("OrderState", OrderState);
registry.register("AthleteTierInput", AthleteTierInput);
registry.register("AthleteRateInput", AthleteRateInput);
registry.register("CampaignOrderInput", CampaignOrderInput);
registry.register("OrderTransitionInput", OrderTransitionInput);
registry.register("OrderAcceptanceInput", OrderAcceptanceInput);

// --- deliverables and creative assets (P5-BE-05, P5-BE-06, P5-BE-08) ----

registry.register("DeliverableState", DeliverableState);
registry.register("RevisionRequestInput", RevisionRequestInput);
registry.register("MarkPublishedInput", MarkPublishedInput);
registry.register("CreativeUploadInput", CreativeUploadInput);
registry.register("CreativeAssetInput", CreativeAssetInput);

// --- the fan funnel and tracking links (P6-BE-01..04, P6-BE-07) ---------

registry.register("RewardState", RewardState);
registry.register("RewardEventType", RewardEventType);
registry.register("RewardEligibility", RewardEligibility);
registry.register("RewardInput", RewardInput);
registry.register("RewardTransitionInput", RewardTransitionInput);
registry.register("RewardTokenInput", RewardTokenInput);
registry.register("RewardClaimInput", RewardClaimInput);
registry.register("RewardFunnel", RewardFunnel);
registry.register("TrackingLinkInput", TrackingLinkInput);
registry.register("TrackingDestination", TrackingDestination);
registry.register("TrackingCode", TrackingCode);

// --- earnings (P7-BE-01, P7-BE-03) -------------------------------------

registry.register("EarningState", EarningState);
registry.register("EarningTransitionInput", EarningTransitionInput);
registry.register("EarningAdjustmentInput", EarningAdjustmentInput);
registry.register("EarningBreakdown", EarningBreakdown);

// --- metrics and the sponsor report (P7-DATA-01, P7-BE-05, §22) --------

registry.register("MetricSource", MetricSource);
registry.register("SourcedTotals", SourcedTotals);
registry.register("MetricBreakdown", MetricBreakdown);
registry.register("MetricEntryInput", MetricEntryInput);
registry.register("MediaValue", MediaValue);
registry.register("SponsorReport", SponsorReport);

// --- invoices mirrored from Zoho (P7-BE-04, §18) -----------------------

registry.register("ZohoInvoiceWebhook", ZohoInvoiceWebhook);
registry.register("Invoice", Invoice);
registry.register("PaymentStatus", PaymentStatus);

// --- paths — P8-PMO-01 ----------------------------------------------------
//
// "openapi.json is complete, generated from Zod contracts, and covers every
// /api/v1 endpoint." One row per mounted route. The request body is the SAME
// Zod schema the handler parses, so the spec cannot describe a body the code
// would refuse. A response references a contract where one exists; where a
// handler returns a domain shape with no contract yet, it is documented as a
// JSON object rather than invented.
//
// `tests/openapi.coverage.test.ts` walks the live Express app and fails if a
// mounted route is missing here, or if a row here has no route behind it —
// so adding an endpoint without documenting it breaks the build.

type Method = "get" | "post" | "put" | "patch" | "delete";
type Row = {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  /** false for the public routes (fan funnel, intake, webhook, discovery). */
  auth?: boolean;
  body?: z.ZodType;
  query?: z.ZodObject;
  status?: 200 | 201 | 202;
  response?: z.ZodType;
};

const json = (schema: z.ZodType) => ({ content: { "application/json": { schema } } });
const anyObject = z.object({}).catchall(z.unknown()).describe("A JSON object — this endpoint has no response contract yet.");
const list = (key: string, item: z.ZodType) => z.object({ [key]: z.array(item) });
const problem = { description: "Problem details (RFC 9457).", ...json(ProblemDetails) };

const PATHS: Row[] = [
  // discovery
  { method: "get", path: "/", tag: "Meta", summary: "API root — service name and version.", auth: false },
  { method: "get", path: "/openapi.json", tag: "Meta", summary: "This specification, generated from the Zod contracts.", auth: false },
  { method: "get", path: "/me", tag: "Identity", summary: "The caller's resolved actor: tenant, roles and linked records." },
  { method: "get", path: "/me/notification-preferences", tag: "Identity", summary: "Which events reach the caller, per channel — muted or delivered (2S6-BE-02)." },
  { method: "put", path: "/me/notification-preferences", tag: "Identity", summary: "Mute or unmute one channel for one event type; the worker honours it at send time.", body: NotificationPreferenceInput },

  // applications — public intake (P3-BE-13)
  { method: "post", path: "/applications/intake", tag: "Applications", summary: "Apply to the Athlete Network.", auth: false, body: AthleteApplicationInput, status: 201, response: ApplicationSubmissionReceipt },
  { method: "get", path: "/applications/intake/mine", tag: "Applications", summary: "An applicant reads their own application by signed link.", auth: false, query: z.object({ token: z.string() }), response: ApplicantView },
  { method: "patch", path: "/applications/intake/mine", tag: "Applications", summary: "An applicant edits their own application by signed link.", auth: false, query: z.object({ token: z.string() }), body: AthleteApplicationPatch, response: ApplicantView },
  // applications — review (P3-BE-07)
  { method: "get", path: "/applications", tag: "Applications", summary: "The review queue.", query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().optional(), state: AthleteState.optional() }) },
  { method: "get", path: "/applications/{id}", tag: "Applications", summary: "One application, as the review queue shows it.", response: AthleteApplicationSummary },
  { method: "post", path: "/applications/{id}/begin-review", tag: "Applications", summary: "Move an application into review." },
  { method: "post", path: "/applications/{id}/approve", tag: "Applications", summary: "Approve an application. Creates the athlete's login, and a linked guardian's (P3-BE-15); the response's login field says whether each can now sign in.", body: ApproveApplicationInput },
  { method: "post", path: "/applications/{id}/request-changes", tag: "Applications", summary: "Send an application back with required changes.", body: ApplicationDecisionNotes },
  { method: "post", path: "/applications/{id}/activate", tag: "Applications", summary: "Activate an approved athlete." },
  { method: "post", path: "/applications/{id}/reject", tag: "Applications", summary: "Reject an application, with reasons.", body: ApplicationDecisionNotes },

  // athletes, guardians, agreements (P3-BE-03, P3-BE-14)
  { method: "get", path: "/athletes/me", tag: "Athletes", summary: "The signed-in athlete's own profile — §11 fields, socials with provenance, and the section counts the §24 completion meter derives from." },
  { method: "put", path: "/athletes/{id}/tier", tag: "Athletes", summary: "Set an athlete's pricing tier.", body: AthleteTierInput },
  { method: "post", path: "/athletes/{id}/rates", tag: "Athletes", summary: "Set an athlete's rate for a NIL job.", body: AthleteRateInput, status: 201 },
  { method: "get", path: "/athletes/{id}/rates", tag: "Athletes", summary: "An athlete's rate card." },
  { method: "post", path: "/athletes/{id}/guardian", tag: "Athletes", summary: "Link a guardian to a minor athlete.", body: GuardianInput, status: 201 },
  { method: "put", path: "/athletes/{id}/socials", tag: "Athletes", summary: "Replace an athlete's social accounts.", body: z.object({ socials: z.array(SocialAccount).max(4) }) },
  { method: "get", path: "/athletes/{id}/guardian-readiness", tag: "Athletes", summary: "Whether the guardian gate is satisfied today.", response: GuardianReadiness },
  { method: "get", path: "/athletes/{id}/metrics", tag: "Metrics", summary: "An athlete's metrics, by provenance label.", response: MetricBreakdown },
  { method: "post", path: "/guardians/{id}/verify", tag: "Athletes", summary: "BTG attests a guardian's identity." },
  { method: "post", path: "/agreements/accept", tag: "Athletes", summary: "Accept an agreement version (click-wrap).", body: AgreementAcceptanceInput, status: 201 },

  // briefs, campaigns, invitations, orders (B3, B4)
  { method: "post", path: "/briefs", tag: "Campaigns", summary: "A sponsor submits a brief.", body: CampaignBriefInput, status: 201 },
  { method: "post", path: "/briefs/{id}/transition", tag: "Campaigns", summary: "Move a brief through its states.", body: BriefTransitionInput },
  { method: "get", path: "/briefs/{id}/eligible-athletes", tag: "Campaigns", summary: "The matching shortlist for a brief.", query: z.object({ limit: z.coerce.number().int().optional() }), response: list("athletes", EligibleAthlete) },
  { method: "post", path: "/briefs/{id}/campaign", tag: "Campaigns", summary: "Create a campaign from a qualified brief.", body: CampaignFromBriefInput, status: 201 },
  { method: "post", path: "/campaigns/{id}/transition", tag: "Campaigns", summary: "Move a campaign through its states.", body: CampaignTransitionInput },
  { method: "post", path: "/campaigns/{id}/launch", tag: "Campaigns", summary: "Launch a campaign." },
  { method: "post", path: "/campaigns/{id}/invitations", tag: "Campaigns", summary: "Invite an athlete to a campaign.", body: InvitationInput, status: 201 },
  { method: "post", path: "/invitations/{id}/respond", tag: "Campaigns", summary: "An athlete accepts or declines an invitation.", body: InvitationResponseInput },
  { method: "post", path: "/campaigns/{id}/orders", tag: "Orders", summary: "Create a Campaign Order.", body: CampaignOrderInput, status: 201 },
  { method: "patch", path: "/orders/{id}", tag: "Orders", summary: "Edit a draft Campaign Order.", body: CampaignOrderInput.partial() },
  { method: "post", path: "/orders/{id}/transition", tag: "Orders", summary: "Move a Campaign Order through its states.", body: OrderTransitionInput },
  { method: "post", path: "/orders/{id}/accept", tag: "Orders", summary: "An athlete (or guardian) accepts a Campaign Order.", body: OrderAcceptanceInput, status: 201 },

  // deliverables and creative (B5)
  { method: "post", path: "/deliverables/{id}/submit", tag: "Deliverables", summary: "Submit a draft." },
  { method: "post", path: "/deliverables/{id}/btg-review", tag: "Deliverables", summary: "BTG starts content review." },
  { method: "post", path: "/deliverables/{id}/sponsor-review", tag: "Deliverables", summary: "Send to the sponsor for approval." },
  { method: "post", path: "/deliverables/{id}/revision", tag: "Deliverables", summary: "Request a revision, with a reason.", body: RevisionRequestInput },
  { method: "post", path: "/deliverables/{id}/approve", tag: "Deliverables", summary: "Approve a deliverable." },
  { method: "post", path: "/deliverables/{id}/published", tag: "Deliverables", summary: "Mark published, with the live URL.", body: MarkPublishedInput },
  { method: "post", path: "/deliverables/{id}/verify", tag: "Deliverables", summary: "BTG verifies the published post." },
  { method: "post", path: "/deliverables/{id}/uploads", tag: "Deliverables", summary: "Presign a direct-to-R2 upload.", body: CreativeUploadInput, status: 201 },
  { method: "post", path: "/deliverables/{id}/assets", tag: "Deliverables", summary: "Register an uploaded creative asset.", body: CreativeAssetInput, status: 201 },
  { method: "post", path: "/deliverables/{id}/metrics", tag: "Metrics", summary: "Record a metric entry, with its provenance.", body: MetricEntryInput, status: 201 },
  { method: "get", path: "/deliverables/{id}/metrics", tag: "Metrics", summary: "A deliverable's metrics, by provenance label.", response: MetricBreakdown },
  { method: "post", path: "/deliverables/{id}/tracking-link", tag: "Tracking", summary: "Create the deliverable's tracking link.", body: TrackingLinkInput, status: 201 },

  // rewards and tracking (B6)
  { method: "post", path: "/campaigns/{id}/rewards", tag: "Rewards", summary: "Create a reward.", body: RewardInput, status: 201 },
  { method: "post", path: "/rewards/{id}/transition", tag: "Rewards", summary: "Move a reward through its states.", body: RewardTransitionInput },
  { method: "post", path: "/rewards/{id}/tokens", tag: "Rewards", summary: "Issue reward tokens (QR codes).", body: RewardTokenInput, status: 201 },
  { method: "get", path: "/rewards/{id}/funnel", tag: "Rewards", summary: "Scan / landing / claim / redeem counts — aggregate only.", response: RewardFunnel },
  { method: "get", path: "/campaigns/{id}/leads", tag: "Rewards", summary: "Fans who ticked the separate 'the sponsor may contact me' box and have not withdrawn — the only route returning a fan's address (2S6-BE-03)." },
  { method: "get", path: "/campaigns/{id}/tracking-codes", tag: "Tracking", summary: "A campaign's tracking codes.", response: list("codes", TrackingCode) },
  { method: "get", path: "/tracking-links/{id}/clicks", tag: "Tracking", summary: "Click counts for a tracking link." },
  { method: "get", path: "/public/tracking/{code}", tag: "Public", summary: "Resolve a tracking code to its destination.", auth: false, response: TrackingDestination },
  { method: "post", path: "/public/tracking/{code}/click", tag: "Public", summary: "Record a click.", auth: false, status: 202 },
  { method: "get", path: "/public/rewards/{token}", tag: "Public", summary: "What the fan's page shows — state (incl. EXHAUSTED once no unit is left for this code), offer, eligibility, landing copy, consent wording, this code's hold (QA-09) and redemptions. Writes nothing (P6-FE-02, P6-BE-08).", auth: false },
  { method: "get", path: "/audit-log", tag: "Audit", summary: "The critical-mutation history, newest first, filterable by entity, record, actor and action; keyset-paged, read-only (P8-FE-02)." },
  { method: "get", path: "/operations/integration-health", tag: "Operations", summary: "Dependencies, Zoho sync state, inbound webhook deliveries (no payloads) and outbox / worker queue health for the caller's tenant (P8-FE-01)." },
  { method: "get", path: "/operations/analytics", tag: "Operations", summary: "The analytics story for the last ?days= (7/30/90): the four-event funnel, daily claims/redemptions, scan locations, offers, and per-athlete performance by provenance — recomputed from rows (P6-FE-03, P7-FE-04)." },
  { method: "get", path: "/earnings", tag: "Earnings", summary: "Earnings the caller may read — status only, no bank or tax fields; amounts, sponsor price/commission and the Zoho invoice reconciliation each only where §7.1 allows (P7-FE-01, P7-FE-02)." },
  { method: "get", path: "/rewards", tag: "Rewards", summary: "Rewards the caller may read, with the four-event funnel per reward and the current fan consent line (P6-FE-01)." },
  { method: "get", path: "/rewards/{id}", tag: "Rewards", summary: "One reward with its per-athlete tokens — token strings only for roles that write rewards (P6-FE-01)." },
  { method: "get", path: "/reward-tokens/{id}/qr-url", tag: "Rewards", summary: "A short-lived, audited signed read of a token's QR PNG (P6-BE-06) for printing." },
  { method: "get", path: "/deliverables", tag: "Deliverables", summary: "Deliverables the caller may read, soonest due first; ?state= and ?campaignId= narrow. An open revision request is derived from the audit log (P5-FE-02)." },
  { method: "get", path: "/deliverables/{id}", tag: "Deliverables", summary: "One deliverable with its creative versions (P5-FE-03)." },
  { method: "get", path: "/deliverables/{id}/assets/{version}/url", tag: "Deliverables", summary: "A short-lived, audited signed read of one creative version from the private bucket (P5-FE-04)." },
  { method: "get", path: "/orders/{id}", tag: "Orders", summary: "One Campaign Order: frozen terms, guardian readiness, and the current agreement body — served only if it still matches its issued hash (P5-FE-01)." },
  { method: "get", path: "/campaigns/{id}/ops", tag: "Operations", summary: "One campaign's operations board (§9 screen 9): per-athlete acceptance, delivery, overdue and verified views; health by the delivery-health rule (P5-FE-05)." },
  { method: "get", path: "/campaigns", tag: "Campaigns", summary: "The campaign portfolio the caller may read — state, package, athletes, delivery; money only where §7.1 allows (P4-FE-05)." },
  { method: "get", path: "/briefs", tag: "Campaigns", summary: "Briefs the caller may read, newest first; ?state= narrows (P4-FE-02)." },
  { method: "get", path: "/briefs/{id}", tag: "Campaigns", summary: "One brief with its package and campaign; its invitations for a caller who reads them — athlete pay only where §7.1 allows (P4-FE-03)." },
  { method: "get", path: "/invitations", tag: "Campaigns", summary: "The athlete's invitation inbox — own invitations, all five states, newest first (P4-FE-04)." },
  { method: "get", path: "/public/catalogue/packages", tag: "Catalogue", summary: "The §7 package price list for the public marketing site — sponsor prices only, never athlete pay (P3-FE-05).", auth: false },
  { method: "get", path: "/catalogue/packages", tag: "Catalogue", summary: "The §7 packages at sponsor prices — never athlete pay (P4-FE-01)." },
  // SponsorX NEXT — editions and ad inventory (Stage 9 Batch A)
  { method: "post", path: "/publications", tag: "Editions", summary: "Create a masthead — a school's (propertyId) or the regional one (null) (P9-BE-02).", body: PublicationInput, status: 201 },
  { method: "post", path: "/publications/{id}/editions", tag: "Editions", summary: "Create an edition in PLANNING (P9-BE-02).", body: EditionInput, status: 201 },
  { method: "get", path: "/editions", tag: "Editions", summary: "Editions in the caller's scope, with inventory counts, committed revenue and the digital rights gap (P9-FE-03)." },
  { method: "get", path: "/editions/{id}", tag: "Editions", summary: "An edition, with its production conditions and state." },
  { method: "get", path: "/editions/{id}/ledger", tag: "Editions", summary: "The inventory ledger: each slot's page, state, value and — for campaign readers — buyer (P9-FE-04)." },
  { method: "get", path: "/editions/{id}/sale-candidates", tag: "Editions", summary: "DRAFT campaigns whose package promises positions, and whether this edition can still honour each (P9-FE-03). The sale re-checks." },
  { method: "post", path: "/editions/{id}/conditions", tag: "Editions", summary: "Set contentReady. rightsCleared is computed from the rights ledger and revenueMet from sales — neither is typed in." , body: EditionConditionsInput },
  { method: "post", path: "/editions/{id}/transition", tag: "Editions", summary: "Move an edition through its states; closing freezes revenue and computes the split (P9-BE-02, -06).", body: EditionTransitionInput },
  { method: "post", path: "/editions/{id}/slots", tag: "Editions", summary: "Add a sellable position. One back cover and one presenting sponsor per edition, enforced by Postgres (P9-BE-03).", body: AdSlotInput, status: 201 },
  { method: "get", path: "/editions/{id}/slots", tag: "Editions", summary: "The edition's inventory — open and sold (P9-BE-03)." },
  { method: "post", path: "/editions/{id}/sales", tag: "Editions", summary: "Sell a campaign the positions its package includes — all or nothing; never after close (P9-BE-03, -09).", body: AdSaleInput, status: 201 },
  { method: "get", path: "/editions/{id}/splits", tag: "Editions", summary: "The four-way revenue split, computed at close. Never Earning (P9-BE-06)." },
  { method: "get", path: "/public/editions/{school}/{id}", tag: "Public", summary: "The free digital edition — published editions only; masthead, rights-cleared contents with display-name bylines, and the sponsors who bought positions. Never a price (P9-FE-07).", auth: false },
  { method: "post", path: "/public/editions/{id}/events", tag: "Public", summary: "A reader scanned (print) or tapped (digital) in a published edition (P9-BE-12).", auth: false, body: EditionEventInput, status: 201 },
  // SponsorX NEXT — students (Stage 9 Batch B)
  { method: "post", path: "/students", tag: "Students", summary: "Add a student to a school (staff, or that school's advisor). Lands DRAFT (P9-BE-04).", body: StudentInput, status: 201 },
  { method: "get", path: "/students", tag: "Students", summary: "Students the caller may see — an advisor sees their school's only." },
  { method: "get", path: "/students/{id}", tag: "Students", summary: "One student." },
  { method: "post", path: "/students/{id}/transition", tag: "Students", summary: "Submit (the student) or review (the advisor). A minor reaches ACTIVE only with a verified guardian (P9-BE-04).", body: StudentTransitionInput },
  { method: "post", path: "/students/{id}/guardian", tag: "Students", summary: "Link a guardian to a minor student — the Guardian model, reused, unverified until BTG verifies.", body: StudentGuardianInput, status: 201 },
  { method: "post", path: "/students/{id}/code", tag: "Students", summary: "Issue the student's one sales code (BTG) (P9-BE-07).", status: 201 },
  { method: "get", path: "/students/{id}/code", tag: "Students", summary: "The student's sales code." },
  { method: "get", path: "/students/{id}/sales", tag: "Students", summary: "The student's attributed sales — immutable rows (P9-BE-13)." },
  { method: "get", path: "/students/{id}/points", tag: "Students", summary: "Point accruals and balance. No money, no redemption (P9-BE-15)." },
  { method: "post", path: "/students/{id}/points", tag: "Students", summary: "Accrue points for published work (BTG) (P9-BE-15).", body: PointsInput, status: 201 },
  { method: "post", path: "/students/{id}/prospects", tag: "Students", summary: "A student brings a business in (§5.6).", body: ProspectInput, status: 201 },
  { method: "get", path: "/students/{id}/prospects", tag: "Students", summary: "The student's prospects and their decisions." },
  { method: "post", path: "/prospects/{id}/decision", tag: "Students", summary: "Sponsor Acceptance Check — a rejection carries a reason, notifies the student, costs no credit (P9-BE-13).", body: ProspectDecisionInput },
  { method: "post", path: "/sponsors/{id}/assigned-student", tag: "Students", summary: "Hand an account to another student. Touches assignedStudentId only (P9-BE-13).", body: AssignStudentInput },
  { method: "post", path: "/public/students/applications", tag: "Public", summary: "The public student application — lands SUBMITTED for the school's advisor.", auth: false, body: StudentApplicationInput, status: 201 },
  { method: "get", path: "/public/s/{code}", tag: "Public", summary: "Resolve a student's sales code: display name and school only (P9-BE-07, P9-SEC-01).", auth: false },
  // SponsorX NEXT — rights, featured athletes, DMV pools (Stage 9 Batch C)
  { method: "post", path: "/editions/{id}/assets", tag: "Rights", summary: "Add a content item to an edition (P9-BE-10).", body: EditionAssetInput, status: 201 },
  { method: "get", path: "/editions/{id}/assets", tag: "Rights", summary: "The edition's content and each item's rights." },
  { method: "get", path: "/editions/{id}/rights-ledger", tag: "Rights", summary: "Every asset with its grants and evidence, and which the production gate would refuse — digital on the publish target, print on the print date (P9-FE-09)." },
  { method: "post", path: "/edition-assets/{id}/rights", tag: "Rights", summary: "Grant a right — consent or licence, digital and print separate, commercial reuse never defaulted (P9-BE-10).", body: ContentRightInput, status: 201 },
  { method: "post", path: "/edition-assets/{id}/campaign", tag: "Rights", summary: "Use content in a sponsor's campaign — only with a commercial grant (P9-BE-10).", body: AssetCampaignInput },
  { method: "post", path: "/consents", tag: "Rights", summary: "Record consent for a subject with no login — a featured athlete, or a minor via their verified guardian (P9-BE-11).", body: SubjectConsentInput, status: 201 },
  { method: "post", path: "/featured-athletes", tag: "Rights", summary: "Editorial features an athlete: FEATURED, read-only, no rates, no invitations (P9-BE-11).", body: FeaturedAthleteInput, status: 201 },
  { method: "get", path: "/claims", tag: "Rights", summary: "Claims on featured profiles the caller may review." },
  { method: "post", path: "/claims/{id}/verify", tag: "Rights", summary: "The school verifies a claim (roster match + advisor) — the profile enters review (P9-BE-11)." },
  { method: "post", path: "/claims/{id}/reject", tag: "Rights", summary: "Reject a claim." },
  { method: "post", path: "/properties/{id}/roster", tag: "Rights", summary: "A school supplies its roster: names and graduation years (P9-BE-11).", body: RosterInput, status: 201 },
  { method: "post", path: "/editions/{id}/contributions", tag: "Rights", summary: "Record a student's content contribution in units (P9-BE-14).", body: ContributionInput, status: 201 },
  { method: "get", path: "/editions/{id}/school-pools", tag: "Rights", summary: "A regional edition's SALES and CONTENT school pools, resolved by formula (P9-BE-14)." },
  { method: "get", path: "/public/athletes/{slug}", tag: "Public", summary: "A featured or active athlete's public profile — no legal name, contact, age or GPA (P9-BE-11).", auth: false },
  { method: "post", path: "/public/athletes/{slug}/claim", tag: "Public", summary: "'That's me' — claim a featured profile (P9-BE-11).", auth: false, body: ClaimInput, status: 201 },
  // Phase 2 Sprint 1 — external property onboarding
  { method: "post", path: "/public/onboarding", tag: "Public", summary: "An organisation starts onboarding; returns its resume token (2S1-BE-01).", auth: false, body: OnboardingStartInput, status: 201 },
  { method: "get", path: "/public/onboarding/{token}", tag: "Public", summary: "The application so far, what is still missing, and the terms to accept.", auth: false },
  { method: "patch", path: "/public/onboarding/{token}", tag: "Public", summary: "Save one wizard step — organisation, contacts, business, payout, agreements.", auth: false, body: OnboardingStepInput },
  { method: "post", path: "/public/onboarding/{token}/submit", tag: "Public", summary: "Submit for BTG review — refused with the missing fields while incomplete.", auth: false },
  { method: "get", path: "/onboarding", tag: "Onboarding", summary: "BTG's verification queue — PENDING_REVIEW by default (2S1-BE-03)." },
  { method: "get", path: "/onboarding/{id}", tag: "Onboarding", summary: "One application, with what is missing." },
  { method: "post", path: "/onboarding/{id}/decision", tag: "Onboarding", summary: "Approve (creates the Property, grants listing access), request changes, reject, suspend, reinstate — audited (2S1-BE-03).", body: OnboardingDecisionInput },
  { method: "post", path: "/public/onboarding/{token}/documents", tag: "Public", summary: "A private-bucket upload grant for one verification document — never a read (2S1-BE-02).", auth: false, body: OnboardingDocumentInput, status: 201 },
  { method: "post", path: "/public/onboarding/{token}/documents/{documentId}/confirm", tag: "Public", summary: "Confirm an upload; attached only once the object is found in the private bucket.", auth: false },
  { method: "get", path: "/onboarding/{id}/documents", tag: "Onboarding", summary: "An application's verification documents, each with an audited 15-minute read (2S1-BE-02)." },
  // Phase 2 Sprint 2–3 — inventory, team roster, listings, offers, branding
  { method: "get", path: "/inventory", tag: "Marketplace", summary: "Inventory the caller may see: their own, their team's, or (BTG) the tenants it operates (2S2-BE-01)." },
  { method: "post", path: "/inventory", tag: "Marketplace", summary: "The caller adds an item they sell, priced by them.", body: InventoryItemInput, status: 201 },
  { method: "get", path: "/inventory/{id}", tag: "Marketplace", summary: "One inventory item." },
  { method: "patch", path: "/inventory/{id}", tag: "Marketplace", summary: "Edit or reprice an item — refused while a listing of it is published.", body: InventoryItemPatch },
  { method: "get", path: "/team/roster", tag: "Marketplace", summary: "The manager's roster, each athlete's inventory, and the team's own (2S2-BE-04)." },
  { method: "post", path: "/team/roster", tag: "Marketplace", summary: "Add an athlete to the roster, with an account to claim.", body: RosterAthleteInput, status: 201 },
  { method: "patch", path: "/team/roster/{id}", tag: "Marketplace", summary: "Set the team's revenue share on one roster athlete.", body: TeamShareInput },
  { method: "get", path: "/listings", tag: "Marketplace", summary: "Listings in scope — the property's own, or (BTG) the approval queue of the tenants it operates (2S3-BE-01)." },
  { method: "post", path: "/listings", tag: "Marketplace", summary: "A verified property creates a DRAFT listing on one of its items.", body: ListingInput, status: 201 },
  { method: "get", path: "/listings/{id}", tag: "Marketplace", summary: "One listing, with whatever still blocks publishing it." },
  { method: "patch", path: "/listings/{id}", tag: "Marketplace", summary: "Edit wording, visibility or schedule — DRAFT or PAUSED only.", body: ListingPatch },
  { method: "post", path: "/listings/{id}/submit", tag: "Marketplace", summary: "Submit for BTG approval — refused, with the list, while governance fails." },
  { method: "post", path: "/listings/{id}/transition", tag: "Marketplace", summary: "Pause, resume or archive.", body: ListingTransitionInput },
  { method: "post", path: "/listings/{id}/decision", tag: "Marketplace", summary: "BTG approves (publishes) or requests changes — the only road to PUBLISHED.", body: ListingDecisionInput },
  { method: "get", path: "/offers", tag: "Marketplace", summary: "Formal offers in scope — BTG's in its tenant, or the athlete's own (2S2-BE-03)." },
  { method: "post", path: "/offers", tag: "Marketplace", summary: "BTG drafts an offer on a campaign; it must clear the floor and fit the budget.", body: OfferInput, status: 201 },
  { method: "get", path: "/offers/{id}", tag: "Marketplace", summary: "One offer." },
  { method: "post", path: "/offers/{id}/send", tag: "Marketplace", summary: "Send — the terms are hashed and fixed from here." },
  { method: "post", path: "/offers/{id}/withdraw", tag: "Marketplace", summary: "BTG takes an unanswered offer back." },
  { method: "post", path: "/offers/{id}/respond", tag: "Marketplace", summary: "The athlete accepts (freezes the terms, creates the order and schedules its deliverables) or declines.", body: OfferResponseInput },
  { method: "get", path: "/branding", tag: "Marketplace", summary: "The caller's tenant branding — what its portal and reports render (2S7-BE-01)." },
  { method: "put", path: "/branding", tag: "Marketplace", summary: "Set the tenant's name, logo, colours, report footer and requested domain.", body: BrandingInput },
  { method: "post", path: "/branding/logo", tag: "Marketplace", summary: "A public-bucket upload grant for a new logo (PNG or JPEG, ≤1 MB).", body: LogoUploadInput, status: 201 },
  // Phase 2 batch 4 — restrictions, sponsor categories, search, cart
  { method: "get", path: "/restrictions", tag: "Marketplace", summary: "Brand restrictions in scope — the caller's, their team's, or (staff) the tenants they reach (2S2-BE-02)." },
  { method: "post", path: "/restrictions", tag: "Marketplace", summary: "A category an athlete or team will not be sold to, for a date range.", body: RestrictionInput, status: 201 },
  { method: "delete", path: "/restrictions/{id}", tag: "Marketplace", summary: "Remove a restriction — never one an accepted offer's exclusivity wrote." },
  { method: "put", path: "/sponsors/{id}/categories", tag: "Marketplace", summary: "BTG sets the brand categories a sponsor sells in — what every restriction is checked against.", body: SponsorCategoriesInput },
  { method: "get", path: "/marketplace/search", tag: "Marketplace", summary: "Live listings visible to this sponsor, filtered — two sponsors see different catalogues (2S3-BE-04)." },
  { method: "get", path: "/cart", tag: "Marketplace", summary: "The sponsor's open cart, or null once it has expired (2S4-BE-01)." },
  { method: "post", path: "/cart", tag: "Marketplace", summary: "Open the sponsor's cart, or return the open one.", status: 201 },
  { method: "post", path: "/cart/lines", tag: "Marketplace", summary: "Add a listing — refused with reasons unless available, unconflicted and at its price (2S3-BE-03).", body: CartLineInput, status: 201 },
  { method: "patch", path: "/cart/lines/{id}", tag: "Marketplace", summary: "Change a line's quantity or dates — checked again.", body: CartLinePatch },
  { method: "delete", path: "/cart/lines/{id}", tag: "Marketplace", summary: "Remove a line." },
  // Phase 2 batch 5 — reservations and marketplace orders
  { method: "post", path: "/cart/reserve", tag: "Marketplace", summary: "Hold every line of the cart for 15 minutes, all or nothing — the stock drops until it is placed, released or lapses (2S4-BE-02).", status: 201 },
  { method: "get", path: "/reservations/{id}", tag: "Marketplace", summary: "One hold — EXPIRED as soon as its time is up." },
  { method: "post", path: "/reservations/{id}/release", tag: "Marketplace", summary: "Let go of a hold; the stock returns at once." },
  { method: "get", path: "/marketplace-orders", tag: "Marketplace", summary: "Marketplace orders in scope — the sponsor's own, or (BTG) the approval queue (2S4-BE-03)." },
  { method: "post", path: "/marketplace-orders", tag: "Marketplace", summary: "Turn a live hold into an order; policy approves it or holds it for BTG (2S4-BE-05).", body: PlaceOrderInput, status: 201 },
  { method: "get", path: "/marketplace-orders/{id}", tag: "Marketplace", summary: "One order, its lines and figures." },
  { method: "post", path: "/marketplace-orders/{id}/decision", tag: "Marketplace", summary: "BTG approves (contracts the stock) or rejects (cancels, releases it).", body: MarketplaceOrderDecisionInput },
  { method: "post", path: "/marketplace-orders/{id}/transition", tag: "Marketplace", summary: "Payment and delivery states, or a cancellation before payment — by the state machine.", body: MarketplaceOrderTransitionInput },
  // Phase 2 batch 6 — commission, the frozen breakdown, the ledger, property analytics
  { method: "get", path: "/commission-rules", tag: "Marketplace", summary: "Commission rules and every version of them (2S5-BE-01)." },
  { method: "post", path: "/commission-rules", tag: "Marketplace", summary: "A new commission rule — version 1.", body: CommissionRuleInput, status: 201 },
  { method: "post", path: "/commission-rules/{id}/revise", tag: "Marketplace", summary: "Edit a rule: a new version from now. Contracted orders are never touched.", body: CommissionRuleRevision, status: 201 },
  { method: "post", path: "/commission-rules/preview", tag: "Marketplace", summary: "Preview the split of a sample order under the rules in effect — and with an unsaved rule (2S5-FE-01). Writes nothing.", body: CommissionPreviewInput },
  { method: "get", path: "/marketplace-orders/{id}/financials", tag: "Marketplace", summary: "The order's breakdown, frozen at contract time with the rule versions that made it (2S4-BE-04)." },
  { method: "get", path: "/team/ledger", tag: "Marketplace", summary: "The property's dashboard: booked, reversed, paid and pending — reconciling exactly (2S5-BE-02)." },
  { method: "get", path: "/team/analytics", tag: "Marketplace", summary: "Revenue, sell-through, completion, sponsor mix and payout trends — from the ledger and order records (2S7-DATA-01)." },
  { method: "get", path: "/properties/mine", tag: "Properties", summary: "The property this account manages — a NEXT school is kind SCHOOL (P9-OPS-01). 404 when not linked." },
  { method: "get", path: "/catalogue/jobs", tag: "Catalogue", summary: "The NIL job catalogue at sponsor price bands — never base pay (P4-FE-01)." },
  { method: "post", path: "/public/rewards/{token}/scan", tag: "Public", summary: "A fan scanned the QR.", auth: false, status: 201 },
  { method: "post", path: "/public/rewards/{token}/landing", tag: "Public", summary: "The fan's reward page rendered.", auth: false, status: 201 },
  { method: "post", path: "/public/rewards/{token}/claim", tag: "Public", summary: "A fan claims the reward (email optional, consent versioned). On a capped reward the claim reserves one unit for the code until `heldUntil` (claim time + the reward's reserveMinutes); 410 when none is left to reserve (QA-09).", auth: false, body: RewardClaimInput, status: 201 },
  { method: "post", path: "/public/rewards/{token}/redeem", tag: "Public", summary: "Redeem at the till — a used single-use code is 409 (checked first); multi-use codes redeem repeatedly; within the cap (410) a code holding a claim's reservation always redeems. Decided in one database call under a row lock (P6-BE-08, QA pass 5); 503 when saturated.", auth: false, status: 201 },
  { method: "post", path: "/public/unsubscribe/{token}", tag: "Public", summary: "A fan withdraws consent — one tap, no login (P6-SEC-03).", auth: false, response: z.object({ withdrawn: z.boolean() }) },

  // money, metrics, reporting (B7)
  { method: "get", path: "/earnings/{id}", tag: "Earnings", summary: "One earning, with its adjustments.", response: EarningBreakdown },
  { method: "post", path: "/earnings/{id}/transition", tag: "Earnings", summary: "Move an earning through its states.", body: EarningTransitionInput },
  { method: "post", path: "/earnings/{id}/adjustment", tag: "Earnings", summary: "Adjust an earning, with a mandatory reason.", body: EarningAdjustmentInput },
  { method: "get", path: "/campaigns/{id}/metrics", tag: "Metrics", summary: "A campaign's metrics, by provenance label.", response: MetricBreakdown },
  { method: "post", path: "/campaigns/{id}/report/render", tag: "Metrics", summary: "Queue a server-rendered file of the sponsor report on the worker (2S7-BE-02). Also queued automatically when a campaign completes.", status: 202 },
  { method: "get", path: "/campaigns/{id}/report/files", tag: "Metrics", summary: "Rendered report files, each with an audited, time-limited private download link (2S7-BE-02)." },
  { method: "get", path: "/campaigns/{id}/report", tag: "Metrics", summary: "The sponsor report (screen 12) — every number labelled.", response: SponsorReport },
  { method: "get", path: "/campaigns/{id}/invoices", tag: "Invoices", summary: "The Zoho invoice mirror — BTG admin and the invoiced sponsor only.", response: list("invoices", Invoice) },
  { method: "get", path: "/campaigns/{id}/payment-status", tag: "Invoices", summary: "Paid, invoiced and outstanding.", response: PaymentStatus },
  { method: "get", path: "/operations/delivery-health", tag: "Operations", summary: "Delivery health across live campaigns.", query: z.object({ under: z.enum(["true", "false"]).optional() }) },
  { method: "get", path: "/operations/network-metrics", tag: "Operations", summary: "Network-wide metrics." },
  { method: "get", path: "/operations/job-economics", tag: "Operations", summary: "Economics by NIL job." },

  // Zoho inbound (P7-BE-04)
  { method: "post", path: "/webhooks/zoho/invoice", tag: "Webhooks", summary: "Zoho Books invoice webhook — shared-secret signed, queued.", auth: false, body: ZohoInvoiceWebhook, status: 202 },
  { method: "post", path: "/webhooks/zoho/crm", tag: "Webhooks", summary: "Zoho CRM Notifications API callback — channel-token verified, recorded, queued; never calls Zoho (P8-INT-03).", auth: false, body: ZohoCrmNotification, status: 202 },

  // Sponsor enquiries (P8-INT-06)
  { method: "post", path: "/public/inquiries", tag: "Public", summary: "A prospective sponsor asks to talk — becomes a Zoho Lead.", auth: false, body: InquiryInput, status: 201, response: z.object({ id: z.string(), received: z.boolean() }) },
];

for (const row of PATHS) {
  const names = [...row.path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
  const status = row.status ?? 200;
  registry.registerPath({
    method: row.method,
    path: row.path,
    tags: [row.tag],
    summary: row.summary,
    ...(row.auth === false ? { security: [] } : { security: [{ bearerAuth: [] }] }),
    request: {
      ...(names.length ? { params: z.object(Object.fromEntries(names.map((n) => [n, z.string()]))) } : {}),
      ...(row.query ? { query: row.query } : {}),
      ...(row.body ? { body: { required: true, ...json(row.body) } } : {}),
    },
    responses: {
      [status]: { description: "Success.", ...json(row.response ?? anyObject) },
      ...(row.auth === false ? {} : { 401: problem, 403: problem }),
      ...(row.body || row.query ? { 400: problem } : {}),
      404: problem,
    },
  });
}

/** The documented routes, for the coverage test. */
export const DOCUMENTED_PATHS = PATHS.map((r) => `${r.method.toUpperCase()} ${r.path}`);

/**
 * Bearer auth for §8's API Service Account. Clerk issues the session for human
 * callers; the service account presents a token on the same endpoints.
 */
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// --- document --------------------------------------------------------------

/** OpenAPI version emitted. 3.1 because it aligns with JSON Schema. */
export const OPENAPI_VERSION = "3.1.0" as const;

export function buildOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: OPENAPI_VERSION,
    info: {
      title: "SponsorX API",
      version: "1.0.0",
      description:
        "Phase 1 API for the BTG SponsorX athlete sponsorship platform. Generated from Zod contracts — never hand-written. Every protected resource is tenant-scoped (§26).",
    },
    servers: [{ url: "/api/v1", description: "Phase 1 API root" }],
  });
}
