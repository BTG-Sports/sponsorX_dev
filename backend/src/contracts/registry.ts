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
import { ProfileChangeInput, ProfileChangeState } from "./profile-change";
import { CloseAccountInput, ClosureListQuery, ReactivationActionInput, ReactivationDecisionInput, ReactivationLinkInput } from "./account";
import {
  HandoffDecisionInput, HandoffDocumentInput, HandoffEmailConfirmInput, HandoffListQuery, HandoffLookupQuery, HandoffStaffDecisionInput, HandoffStartInput, HandoffSubmitInput,
} from "./guardian-handoff";
import { SupportMessageInput } from "./support";
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
  ListingTransitionInput, LogoUploadInput, OfferAthletesQuery, OfferChecksQuery, OfferInput, OfferKeepInput, OfferPatch, OfferResponseInput,
  RosterAthleteInput, TeamShareInput,
  CartLineInput, CartLinePatch, RestrictionInput, SponsorCategoriesInput,
  MarketplaceOrderDecisionInput, MarketplaceOrderTransitionInput, PlaceOrderInput,
  CommissionRuleInput, CommissionRuleRevision, CommissionPreviewInput,
} from "./marketplace";
import { NotificationPreferenceInput } from "./notification-preferences";
import {
  DeliveryProblemInput, DeliveryResolutionInput, InvitableAthletesQuery, MarkDeliveredInput, ProofUploadInput, TeamInvitationInput,
  TeamInvitationResponseInput,
} from "./delivery";
import { PayoutAccountLinkInput, PayoutDecisionInput, StandinAccountInput, StandinCheckoutInput } from "./payouts";
import { SponsorDocumentInput, SponsorEmailConfirmInput, SponsorRequestDecisionInput } from "./sponsor-requests";
import { RestrictedTextInput, RestrictedWordInput } from "./restricted-words";
import {
  OnboardingConfirmEmailInput, OnboardingDecisionInput, OnboardingDocumentInput, OnboardingStartInput, OnboardingStepInput, OrganizationDocumentInput,
} from "./onboarding";
import {
  AgeRowInput, AthleteDocumentInput, GuardianAgreementInput, GuardianDetailsInput, GuardianDocumentInput, IdDocumentInput,
  SignupRejectInput, SignupSettingsInput, SignupTokenInput,
} from "./signups";
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
registry.register("ProfileChangeInput", ProfileChangeInput);
registry.register("ProfileChangeState", ProfileChangeState);
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
  // athletes approved automatically (2S1-BE-09 / -10) — the applicant's side, by signed link
  { method: "get", path: "/applications/intake/status", tag: "Applications", summary: "The applicant's checklist: email confirmed, ID uploaded (government ID, or a school ID for a minor), their guardian's steps, what is still missing, and whether it is approved or with BTG (2S1-BE-09).", auth: false, query: z.object({ token: z.string() }) },
  { method: "post", path: "/applications/intake/confirm-email", tag: "Applications", summary: "The link from the receipt: proves the applicant reads that mailbox, then the automatic checks run. Returns the status and a fresh continuation token (2S1-BE-09).", auth: false, body: SignupTokenInput },
  { method: "post", path: "/applications/intake/confirm-email/resend", tag: "Applications", summary: "Send the confirmation email again.", auth: false, query: z.object({ token: z.string() }) },
  { method: "post", path: "/applications/intake/documents", tag: "Applications", summary: "Start uploading a government ID (or a minor's school ID): a presigned PUT to the private bucket. PDF, JPEG or PNG, at most 10 MB (2S1-BE-09).", auth: false, query: z.object({ token: z.string() }), body: AthleteDocumentInput, status: 201 },
  { method: "post", path: "/applications/intake/documents/{documentId}/confirm", tag: "Applications", summary: "Say the upload finished. Counted only if the file is there; then the automatic checks run.", auth: false, query: z.object({ token: z.string() }) },
  { method: "post", path: "/applications/intake/guardian", tag: "Applications", summary: "A minor names (or changes, until approved) their guardian, who is emailed a link to their own set-up page (2S1-BE-10).", auth: false, query: z.object({ token: z.string() }), body: GuardianInput },
  { method: "post", path: "/applications/intake/guardian/resend", tag: "Applications", summary: "Email the guardian their set-up link again.", auth: false, query: z.object({ token: z.string() }) },
  // applications — review (P3-BE-07)
  { method: "get", path: "/applications", tag: "Applications", summary: "The review queue. Cursor mode by default (?cursor, ?limit, ?state). Offset mode with ?page (1-based) and ?size (12/24/60, max 100): filtered by ?tab (review|approved|rejected|all), ?sport, ?flag (minor|aging|flagged), ?q (name, sport, region), sorted by ?sort (default oldest first, or newest); answers `page: { page, size, total, pages }` (2026-09-29).", query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().optional(), state: AthleteState.optional(), page: z.coerce.number().int().optional(), size: z.coerce.number().int().optional(), tab: z.enum(["review", "approved", "rejected", "all"]).optional(), sport: z.string().optional(), flag: z.enum(["minor", "aging", "flagged"]).optional(), q: z.string().optional(), sort: z.enum(["newest"]).optional() }) },
  { method: "get", path: "/applications/summary", tag: "Applications", summary: "The review desk's headline counts over the caller's scope — total, waiting, overdue (>48h), decided, per-tab counts and the sports on file (2026-09-29)." },
  { method: "get", path: "/applications/{id}", tag: "Applications", summary: "One application, as the review queue shows it.", response: AthleteApplicationSummary },
  { method: "post", path: "/applications/{id}/begin-review", tag: "Applications", summary: "Move an application into review." },
  { method: "post", path: "/applications/{id}/approve", tag: "Applications", summary: "Approve an application. Creates the athlete's login, and a linked guardian's (P3-BE-15); the response's login field says whether each can now sign in.", body: ApproveApplicationInput },
  { method: "post", path: "/applications/{id}/request-changes", tag: "Applications", summary: "Send an application back with required changes.", body: ApplicationDecisionNotes },
  { method: "post", path: "/applications/{id}/activate", tag: "Applications", summary: "Activate an approved athlete." },
  { method: "post", path: "/applications/{id}/reject", tag: "Applications", summary: "Reject an application, with reasons.", body: ApplicationDecisionNotes },

  // athletes, guardians, agreements (P3-BE-03, P3-BE-14)
  { method: "get", path: "/athletes/me", tag: "Athletes", summary: "The signed-in athlete's own profile — §11 fields, socials with provenance, and the section counts the §24 completion meter derives from." },
  // P3-BE-16, reshaped by 2S1-BE-14 — profile edits publish at once; sensitive ones re-run the checks
  { method: "get", path: "/athletes/me/profile-changes", tag: "Athletes", summary: "The signed-in athlete's own profile edits, newest first (at most 10): what changed, a legal name still waiting for its ID, and what the re-run checks found (2S1-BE-14)." },
  { method: "post", path: "/athletes/{id}/profile-changes", tag: "Athletes", summary: "Edit the athlete's own profile, by §11 section. Ordinary edits publish at once (no BTG step). Sensitive edits: a new date of birth re-works adulthood and a guardian is linked at once; a new legal name needs `idDocument` and waits (PENDING) for it, answering with `idUpload` (a private-bucket PUT). BTG admins are emailed for sensitive edits only. Every edit is audited (2S1-BE-14).", body: ProfileChangeInput, status: 201 },
  { method: "get", path: "/profile-changes", tag: "Athletes", summary: "BTG: sensitive profile edits (legal name, date of birth, guardian), newest first, SERVER-PAGED (?page ?size) — what New sign-ups shows (2S1-BE-14).", query: z.object({ page: z.coerce.number().int().optional(), size: z.coerce.number().int().optional() }) },
  { method: "post", path: "/profile-changes/{id}/id-document/confirm", tag: "Athletes", summary: "The athlete says the matching ID for a new legal name has uploaded. Counted only if it is in the private bucket; then the legal name is applied, audited, and BTG admins are emailed (2S1-BE-14)." },
  { method: "get", path: "/profile-changes/{id}/id-document", tag: "Athletes", summary: "BTG: a five-minute, audited link to the ID a legal-name change was matched against (2S1-BE-14)." },
  { method: "post", path: "/profile-changes/{id}/withdraw", tag: "Athletes", summary: "The athlete (or guardian) takes back a new legal name still waiting for its ID." },
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
  { method: "get", path: "/briefs/{id}/eligible-athletes", tag: "Campaigns", summary: "The matching shortlist for a brief. Paged with ?page (2026-09-29): ?size ?q (name, sport, city, state code, tier) ?sport ?tier (AthleteTier or UNTIERED) ?min (latest score; score readers only) ?sort=score|name → adds `page` and `facets: { total, tiers, sports }` over the brief's whole eligible roster.", query: z.object({ limit: z.coerce.number().int().optional(), page: z.coerce.number().int().optional(), size: z.coerce.number().int().optional(), q: z.string().optional(), sport: z.string().optional(), tier: z.enum(["EMERGING", "CREATOR", "PREMIUM", "ANCHOR", "UNTIERED"]).optional(), min: z.coerce.number().int().optional(), sort: z.enum(["score", "name"]).optional() }), response: list("athletes", EligibleAthlete) },
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
  { method: "get", path: "/public/next/schools", tag: "NEXT", summary: "The schools that have adopted SponsorX NEXT — name and place only (P1-FE-25).", auth: false },
  { method: "get", path: "/public/next/editions", tag: "NEXT", summary: "The latest published NEXT editions, for the programme landing (P1-FE-24).", auth: false },
  { method: "get", path: "/operations/board", tag: "Operations", summary: "The Operations Board's \"needs BTG action\" queue counts: applications waiting (and over 48 hours), deliverables awaiting BTG review, briefs to qualify and to match, held and disputed earnings. A queue the caller doesn't read tenant-wide is null (P7-FE-06)." },
  { method: "get", path: "/operations/integration-health", tag: "Operations", summary: "Dependencies, Zoho sync state, inbound webhook deliveries (no payloads) and outbox / worker queue health for the caller's tenant (P8-FE-01)." },
  { method: "get", path: "/operations/analytics", tag: "Operations", summary: "The analytics story for the last ?days= (7/30/90): the four-event funnel, daily claims/redemptions, scan locations, offers, and per-athlete performance by provenance — recomputed from rows (P6-FE-03, P7-FE-04)." },
  { method: "get", path: "/earnings", tag: "Earnings", summary: "Earnings the caller may read — status only, no bank or tax fields; amounts, sponsor price/commission and the Zoho invoice reconciliation each only where §7.1 allows (P7-FE-01, P7-FE-02). Two modes. Unpaged (legacy): newest 500 plus `campaigns` for invoice readers. Offset (server-paged lists): ?page ?size (default 12, max 100) ?q ?state (comma list) ?type (job name) ?jobId ?from ?to (YYYY-MM-DD, on paidAt else acceptedAt) → `page: { page, size, total, pages }`, no `campaigns`." },
  { method: "get", path: "/earnings/summary", tag: "Earnings", summary: "Aggregates over every earning the caller may read, computed in Postgres: per-state count (and amount), career raised/paid/onTheWay, paid by month for ?year=, deliverables verified/total, job names; sponsor price/commission totals only where §7.1 allows — a withheld figure is absent, never 0." },
  { method: "get", path: "/earnings/reconciliation", tag: "Earnings", summary: "Per-campaign reconciliation (contracted vs Zoho invoiced/collected vs earnings raised/paid), computed per campaign from the database, offset-paged (?page ?size); `totals` = invoiced, collected, rate and invoice aging over the whole set. BTG admin only (invoice read) — 403 otherwise." },
  { method: "get", path: "/earnings/invoices", tag: "Earnings", summary: "Sponsor invoices (Zoho Books mirror) on the reconciliation's campaign set, flat, newest issued first, offset-paged (?page ?size). BTG admin only (invoice read) — 403 otherwise." },
  { method: "get", path: "/rewards", tag: "Rewards", summary: "Rewards the caller may read, with the four-event funnel per reward and the current fan consent line (P6-FE-01). Offset mode (server-paged lists, 2026-09-29): ?page ?size (default 12, max 100) ?tab=all|live|draft|paused|ended ?campaignId ?q (offer, campaign or sponsor name) → `page: { page, size, total, pages }`, newest expiry first. Without ?page: the newest 200, ?campaignId narrows." },
  { method: "get", path: "/rewards/summary", tag: "Rewards", summary: "The rewards desk's per-tab counts, live count and SCAN / CLAIM / REDEEM totals over the caller's whole scope (?campaignId narrows), computed in the database; funnel null for callers who do not read reward events (2026-09-29)." },
  { method: "get", path: "/rewards/{id}", tag: "Rewards", summary: "One reward with its per-athlete tokens — token strings only for roles that write rewards (P6-FE-01)." },
  { method: "get", path: "/reward-tokens/{id}/qr-url", tag: "Rewards", summary: "A short-lived, audited signed read of a token's QR PNG (P6-BE-06) for printing." },
  { method: "get", path: "/deliverables", tag: "Deliverables", summary: "Deliverables the caller may read, soonest due first; ?state=, ?campaignId= and ?from=&to= (dueDate range, ISO, to exclusive) narrow. An open revision request is derived from the audit log (P5-FE-02). Offset mode with ?page (1-based) and ?size (12/24/60, max 100): also ?q (title, athlete, campaign, sponsor), ?kind (video|image, the job's format), ?tab (todo|review|done — whose move), ?sort (due|waiting|newest; default due); answers `page: { page, size, total, pages }` (2026-09-29).", query: z.object({ state: z.string().optional(), campaignId: z.string().optional(), from: z.string().optional(), to: z.string().optional(), page: z.coerce.number().int().optional(), size: z.coerce.number().int().optional(), q: z.string().optional(), kind: z.enum(["video", "image"]).optional(), tab: z.enum(["todo", "review", "done"]).optional(), sort: z.enum(["due", "waiting", "newest"]).optional() }) },
  { method: "get", path: "/deliverables/summary", tag: "Deliverables", summary: "Headline counts under the list's scope (?state=, ?campaignId=, ?from=&to= narrow): total, per-state counts, open revisions, aging (on a review desk, not sent back, latest upload over 24 whole hours ago), overdue (the athlete's move, due before today UTC), and the campaigns involved (2026-09-29).", query: z.object({ state: z.string().optional(), campaignId: z.string().optional(), from: z.string().optional(), to: z.string().optional() }) },
  { method: "get", path: "/deliverables/{id}", tag: "Deliverables", summary: "One deliverable with its creative versions (P5-FE-03)." },
  { method: "get", path: "/deliverables/{id}/assets/{version}/url", tag: "Deliverables", summary: "A short-lived, audited signed read of one creative version from the private bucket (P5-FE-04)." },
  { method: "get", path: "/orders/{id}", tag: "Orders", summary: "One Campaign Order: frozen terms, guardian readiness, and the current agreement body — served only if it still matches its issued hash (P5-FE-01)." },
  { method: "get", path: "/campaigns/{id}/ops", tag: "Operations", summary: "One campaign's operations board (§9 screen 9): per-athlete acceptance, delivery, overdue and verified views; health by the delivery-health rule (P5-FE-05)." },
  { method: "get", path: "/campaigns", tag: "Campaigns", summary: "The campaign portfolio the caller may read — state, package, athletes, delivery; money only where §7.1 allows (P4-FE-05). Two modes. Offset (server-paged lists): ?page ?size (default 12, max 100) ?q (name) ?state (comma list) ?sort=newest|name|ending → `page: { page, size, total, pages }`; ?health=true adds each row's delivery-health flags plus `healthVisible` and the flagged count `attention`; ?attention=true|false keeps only / all but the campaigns delivery health flags (403 without metricAggregate read). Keyset (aggregators): ?limit (1–100, default 100) ?cursor (opaque) → `page.hasMore` / `page.nextCursor` (QA passes 8–9)." },
  { method: "get", path: "/campaigns/summary", tag: "Campaigns", summary: "The portfolio's headline numbers over the caller's whole scope, computed in the database: total, per-state counts, active, distinct athletes, behind-pace count and the worst few; contracted / budget / invoiced / paid only where §7.1 allows (2026-09-29)." },
  { method: "get", path: "/campaigns/{id}", tag: "Campaigns", summary: "One campaign the caller may read — the portfolio row shape, money gated the same way (QA pass 7, F-5)." },
  { method: "get", path: "/briefs", tag: "Campaigns", summary: "Briefs the caller may read, newest first; ?state= narrows (P4-FE-02). Paged with ?page (2026-09-29): ?size (default 12, max 100) ?state (comma list) ?q (objective or sponsor name) ?sort=newest|oldest|desk (desk = APPROVED → CAMPAIGN_CREATED → QUALIFIED → DRAFT → CLOSED, newest first within) → `page: { page, size, total, pages }`." },
  { method: "get", path: "/briefs/{id}", tag: "Campaigns", summary: "One brief with its package and campaign; its invitations for a caller who reads them — athlete pay only where §7.1 allows (P4-FE-03)." },
  { method: "get", path: "/invitations", tag: "Campaigns", summary: "The athlete's invitation inbox — own invitations, all five states, newest first (P4-FE-04). Paged with ?page (2026-09-29): ?size ?state=open|accepted|declined|expired (open = INVITED/VIEWED not past expiry; lapsed counts as expired) ?job ?q (sponsor, campaign, job name / code) ?sort=urgency|expiry|offerDesc|offerAsc|sponsor → adds `page` and per-tab `counts`." },
  { method: "get", path: "/invitations/summary", tag: "Campaigns", summary: "The inbox's headline numbers over the caller's whole scope, computed in the database: total, open, Σ offered on open, next expiry, accepted, resolved, and the jobs present (2026-09-29)." },
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
  { method: "get", path: "/students", tag: "Students", summary: "Students the caller may see — an advisor sees their school's only. Unpaged without ?page. SERVER-PAGED with ?page ?size (default 12, max 100) ?group=waiting|approved|with|roster|closed ?q (display/legal name) → `page: { page, size, total, pages }` and `summary: { groups, all }` (groupBy; honours ?q, not ?group) (2026-09-29)." },
  { method: "get", path: "/students/{id}", tag: "Students", summary: "One student." },
  { method: "post", path: "/students/{id}/transition", tag: "Students", summary: "Submit (the student) or review (the advisor). A minor reaches ACTIVE only with a verified guardian (P9-BE-04).", body: StudentTransitionInput },
  { method: "post", path: "/students/{id}/guardian", tag: "Students", summary: "Link a guardian to a minor student — the Guardian model, reused, unverified until BTG verifies.", body: StudentGuardianInput, status: 201 },
  { method: "post", path: "/students/{id}/code", tag: "Students", summary: "Issue the student's one sales code (BTG) (P9-BE-07).", status: 201 },
  { method: "get", path: "/students/{id}/code", tag: "Students", summary: "The student's sales code." },
  { method: "get", path: "/students/{id}/sales", tag: "Students", summary: "The student's attributed sales — immutable rows (P9-BE-13). `totalCents` is the all-time _sum. ?page ?size → one page plus `page: { page, size, total, pages }` (2026-09-29)." },
  { method: "get", path: "/students/{id}/points", tag: "Students", summary: "Point accruals and balance. No money, no redemption (P9-BE-15). `balance` is the all-time _sum. ?page ?size → one page plus `page` (2026-09-29)." },
  { method: "post", path: "/students/{id}/points", tag: "Students", summary: "Accrue points for published work (BTG) (P9-BE-15).", body: PointsInput, status: 201 },
  { method: "post", path: "/students/{id}/prospects", tag: "Students", summary: "A student brings a business in (§5.6).", body: ProspectInput, status: 201 },
  { method: "get", path: "/students/{id}/prospects", tag: "Students", summary: "The student's prospects and their decisions. ?page ?size ?state (comma list) → one page, `page`, and `summary: { states: { SUBMITTED, ACCEPTED, REJECTED }, all }` (groupBy) (2026-09-29)." },
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
  { method: "get", path: "/claims", tag: "Rights", summary: "Claims on featured profiles the caller may review. ?page ?size ?state (comma list) → one page, `page`, and `summary: { open, all }` (counts) (2026-09-29)." },
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
  { method: "get", path: "/onboarding/{id}/documents", tag: "Onboarding", summary: "An application's verification documents, each with an audited 5-minute read (2S1-BE-02, 2S1-BE-06)." },
  // 2S1-BE-06 — automatic approval; BTG reviews afterwards. 2S1-BE-07 — documents after approval.
  { method: "post", path: "/public/onboarding/confirm-email", tag: "Public", summary: "The confirmation email's link: the primary contact confirms their address; the automatic checks run (2S1-BE-06).", auth: false, body: OnboardingConfirmEmailInput },
  { method: "post", path: "/public/onboarding/{token}/resend-confirmation", tag: "Public", summary: "Send the primary contact's confirmation link again (2S1-BE-06).", auth: false },
  { method: "get", path: "/onboarding/signups", tag: "Onboarding", summary: "Every submitted organisation as BTG's New sign-ups desk shows it: approved automatically, waiting with reasons, flagged, rejected (2S1-BE-06)." },
  { method: "get", path: "/onboarding/{id}/profile", tag: "Onboarding", summary: "The organisation's profile BTG's email links to: details, the checklist as approved, documents and history, activity, open decisions (2S1-BE-06)." },
  { method: "get", path: "/onboarding/{id}/documents/{documentId}", tag: "Onboarding", summary: "One verification document through a five-minute audited link (2S1-BE-06)." },
  { method: "get", path: "/property/documents", tag: "Onboarding", summary: "The organisation's own documents: what is on file, missing or expired, and each one's history (2S1-BE-07)." },
  { method: "post", path: "/property/documents", tag: "Onboarding", summary: "A private-bucket upload grant for a new or replacement document — the manager's own organisation only (2S1-BE-07).", body: OrganizationDocumentInput, status: 201 },
  { method: "post", path: "/property/documents/{documentId}/confirm", tag: "Onboarding", summary: "Confirm an upload: the earlier file is kept as history, the checklist re-runs, BTG admins are emailed (2S1-BE-07)." },
  { method: "delete", path: "/property/documents/{documentId}", tag: "Onboarding", summary: "Remove a document (kept in the history); a missing required one flags the organisation for BTG (2S1-BE-07)." },
  // Phase 2 Sprint 2–3 — inventory, team roster, listings, offers, branding
  { method: "get", path: "/inventory", tag: "Marketplace", summary: "Inventory the caller may see: their own, their team's, or (BTG) the tenants it operates (2S2-BE-01)." },
  { method: "post", path: "/inventory", tag: "Marketplace", summary: "The caller adds an item they sell, priced by them.", body: InventoryItemInput, status: 201 },
  { method: "get", path: "/inventory/{id}", tag: "Marketplace", summary: "One inventory item." },
  { method: "patch", path: "/inventory/{id}", tag: "Marketplace", summary: "Edit or reprice an item — refused while a listing of it is published.", body: InventoryItemPatch },
  { method: "get", path: "/team/roster", tag: "Marketplace", summary: "The manager's roster, each athlete's inventory, and the team's own (2S2-BE-04)." },
  { method: "get", path: "/team/athletes", tag: "Marketplace", summary: "The manager's roster, SERVER-PAGED: ?page ?size ?q (name) ?state (comma list) → one page, `page: { page, size, total, pages }` and `counts: { athletes, active }` over the whole roster. No nested inventory (2026-09-29)." },
  { method: "get", path: "/team/inventory", tag: "Marketplace", summary: "The team's own items and its roster athletes' items, SERVER-PAGED: ?page ?size ?q (title) ?active=true|false → one page with each item's `owner`, `page`, and `counts: { items, active }` (2026-09-29)." },
  { method: "post", path: "/team/roster", tag: "Marketplace", summary: "Add an athlete to the roster, with an account to claim.", body: RosterAthleteInput, status: 201 },
  { method: "patch", path: "/team/roster/{id}", tag: "Marketplace", summary: "Set the team's revenue share on one roster athlete.", body: TeamShareInput },
  { method: "get", path: "/listings", tag: "Marketplace", summary: "Listings in scope — the property's own, an athlete's (listings of their items), or (BTG) the approval queue of the tenants it operates (2S3-BE-01). Each names its `seller`: a PROPERTY or an independent ATHLETE (2S3-BE-05)." },
  { method: "post", path: "/listings", tag: "Marketplace", summary: "A verified property creates a DRAFT listing on one of its items or a roster athlete's; an approved athlete with no team creates one on their own item (2S3-BE-05). A roster athlete is refused (409) — their team lists it.", body: ListingInput, status: 201 },
  { method: "get", path: "/listings/{id}", tag: "Marketplace", summary: "One listing, with whatever still blocks publishing it." },
  { method: "patch", path: "/listings/{id}", tag: "Marketplace", summary: "Edit wording, visibility or schedule — DRAFT or PAUSED only.", body: ListingPatch },
  { method: "post", path: "/listings/{id}/submit", tag: "Marketplace", summary: "Submit for BTG approval — refused, with the list, while governance fails." },
  { method: "post", path: "/listings/{id}/transition", tag: "Marketplace", summary: "Pause, resume or archive.", body: ListingTransitionInput },
  { method: "post", path: "/listings/{id}/decision", tag: "Marketplace", summary: "BTG approves (publishes) or requests changes — the only road to PUBLISHED.", body: ListingDecisionInput },
  { method: "get", path: "/offers", tag: "Marketplace", summary: "Formal offers in scope — BTG's in its tenant, or the athlete's own (2S2-BE-03) — each with its change requests and BTG's answer to each (answer KEPT/REVISED, answerNote, answeredAt, answeredBy, revisedOfferId), and fromOfferId on a revised draft (2S2-FE-03); each names its athlete (`athlete`: name, guardianAnswers, guardianName, and age for a role that may read a date of birth) and its jobName." },
  { method: "post", path: "/offers", tag: "Marketplace", summary: "BTG drafts an offer on a campaign; it must clear the floor and fit the budget — and the pay may not be below the athlete's rate for the job (the floor GET /campaigns/{id}/offer-checks shows; 422 naming it; no rate on file, no rate floor).", body: OfferInput, status: 201 },
  { method: "get", path: "/offers/{id}", tag: "Marketplace", summary: "One offer, with its change requests (who asked, the note, when, and BTG's answer — KEPT with a reply, or REVISED into the draft revisedOfferId — 2S2-FE-03) and fromOfferId; while SENT, the agreement acceptance signs." },
  { method: "patch", path: "/offers/{id}", tag: "Marketplace", summary: "BTG edits a DRAFT offer (409 once sent): any term but the campaign and athlete, merged over the draft, which must clear every check drafting does — terms, item, exclusivity, restrictions, the athlete's rate floor, margin floor, budget (2S2-FE-03). Audited with what changed.", body: OfferPatch },
  { method: "post", path: "/offers/{id}/send", tag: "Marketplace", summary: "Send — the terms are asked again (no past-due deliverable, no lapsed expiry, pay not below the athlete's floor — their rate for the job or the item's price, 422), then hashed and fixed from here; the athlete, and a minor's guardian, are emailed the offer." },
  { method: "post", path: "/offers/{id}/withdraw", tag: "Marketplace", summary: "BTG takes an unanswered offer back." },
  { method: "post", path: "/offers/{id}/respond", tag: "Marketplace", summary: "The athlete accepts (freezes the terms, creates the order and schedules its deliverables), declines, or requests a change (a note, audited and emailed to the campaign manager(s); the offer stays SENT and answerable — 2S2-FE-03). Accept and request-change take the guardian gate for a minor.", body: OfferResponseInput },
  { method: "post", path: "/offers/{id}/change-requests/{requestId}/keep", tag: "Marketplace", summary: "BTG answers a change request by keeping the offer as it stands: the offer must be SENT and unexpired, the request its own and unanswered (409 once answered). Marks it KEPT with BTG's reply, audited, and emails the athlete (and a minor's guardian); the offer stays SENT and acceptable (2S2-FE-03).", body: OfferKeepInput },
  { method: "post", path: "/offers/{id}/revise", tag: "Marketplace", summary: "BTG answers by revising a SENT offer, in one transaction: withdraws it, copies every term into a new DRAFT (fromOfferId), marks its unanswered change requests REVISED with that draft, audits both, and tells the athlete (and a minor's guardian) a new offer is coming. Returns { withdrawn, draft } (2S2-FE-03)." },
  { method: "get", path: "/offers/athletes", tag: "Marketplace", summary: "BTG's new-offer form: the tenant's active athletes by name (?q, display or legal name; 20 at most), each with whether a guardian answers offers for them and the guardian's name; the age only for a role that may read a date of birth (2S2-FE-03).", query: OfferAthletesQuery },
  { method: "get", path: "/campaigns/{id}/offer-checks", tag: "Marketplace", summary: "BTG's new-offer form, live: the checks a draft on this campaign will be asked, answered without refusing — the athlete's floor (the item's price, else their rate for the job) and whether the pay clears it, the margin floor (sell price ≥ pay × 1.4), and the campaign's remaining budget and whether the line fits; `problems` names what saving would refuse, each { code: UNKNOWN_JOB | NOT_THEIR_ITEM | ITEM_FLOOR | RATE_FLOOR | MARGIN_FLOOR | BUDGET, message } (2S2-FE-03). Drafting, editing and sending refuse pay below the same floor (422).", query: OfferChecksQuery },
  // 2S5-INT-01 / -03, 2S5-BE-04 / -05 — payout accounts, card payments and payouts
  { method: "get", path: "/payouts/account", tag: "Payouts", summary: "The caller's payout account status (athlete or property manager): not set up, needs more information, or ready." },
  { method: "post", path: "/payouts/account/link", tag: "Payouts", summary: "A link to the payment provider's page to set up (or finish, or manage) the payout account.", body: PayoutAccountLinkInput },
  { method: "get", path: "/payouts/me", tag: "Payouts", summary: "The payee's money: requestable, held, awaiting payment, paid out; the rules for requesting; per-order detail; every payout." },
  { method: "get", path: "/restricted-words", tag: "Restricted words", summary: "BTG admins: every restricted word and phrase (active and removed), with the kinds. The tenant's list is seeded with the starter list on first use (2S1-BE-18)." },
  { method: "get", path: "/restricted-words/history", tag: "Restricted words", summary: "Who added or removed which word, and when (from the audit log)." },
  { method: "post", path: "/restricted-words", tag: "Restricted words", summary: "Add a word or phrase (or bring back a removed one). Audited.", body: RestrictedWordInput, status: 201 },
  { method: "post", path: "/restricted-words/test", tag: "Restricted words", summary: "Test text against the list: what would match, and of what kind. Disguised spellings are caught; whole words only.", body: RestrictedTextInput },
  { method: "delete", path: "/restricted-words/{id}", tag: "Restricted words", summary: "Remove a word (it is deactivated; its history stays). Audited." },
  { method: "get", path: "/sponsor-requests", tag: "Sponsor requests", summary: "BTG admin / Sales: businesses asking to sponsor, one tab at a time (?state=NEW|APPROVED|DECLINED|REJECTED, default NEW), with every tab's count (2S1-BE-05). NEW holds only what the system could not approve by itself, each with its reviewReasons (2S1-BE-17)." },
  { method: "get", path: "/sponsor-requests/{id}", tag: "Sponsor requests", summary: "One request: who is asking, what they told us, the business type, the uploaded proof of business, why it is waiting (reviewReasons) or whether it was approved automatically, and the checks that gate approval — email already in use, same-named sponsors." },
  { method: "post", path: "/sponsor-requests/{id}/decision", tag: "Sponsor requests", summary: "APPROVE opens the account — the sponsor, its primary contact and a SPONSOR_ADMIN login for the request's email — and emails a sign-in link; DECLINE emails the note. Once only (409 after). After approval, REJECT switches the sponsor's logins off and emails the note; REINSTATE switches them back on (2S1-BE-17).", body: SponsorRequestDecisionInput },
  { method: "get", path: "/sponsor-requests/{id}/documents/{documentId}", tag: "Sponsor requests", summary: "A five-minute, audited link to read one proof of business (2S1-BE-17)." },
  { method: "get", path: "/public/sponsor-requests/{token}", tag: "Public", summary: "The applicant's view of their request: confirmed email, proof uploaded, what is still missing, and whether it is with BTG (2S1-BE-17).", auth: false },
  { method: "post", path: "/public/sponsor-requests/{token}/documents", tag: "Public", summary: "Start uploading a proof of business: a presigned PUT to the private bucket (2S1-BE-17).", auth: false, body: SponsorDocumentInput, status: 201 },
  { method: "post", path: "/public/sponsor-requests/{token}/documents/{documentId}/confirm", tag: "Public", summary: "Say the upload finished. Counted only if the file is there; then the automatic checks run (2S1-BE-17).", auth: false },
  { method: "post", path: "/public/guardian-setup/open", tag: "Public", summary: "The guardian opens the link from their email: confirms their email, then the athlete's automatic checks run. Returns the set-up page's status (2S1-BE-10).", auth: false, body: SignupTokenInput },
  { method: "get", path: "/public/guardian-setup/{token}", tag: "Public", summary: "The guardian's set-up page: the athlete who named them, their details, ID and proof uploaded, the guardian agreement (version, hash, text) and whether it is accepted, and what is still missing (2S1-BE-10).", auth: false },
  { method: "patch", path: "/public/guardian-setup/{token}", tag: "Public", summary: "The guardian's details: name, relationship, phone. Refused once approved — changes then go through BTG.", auth: false, body: GuardianDetailsInput },
  { method: "post", path: "/public/guardian-setup/{token}/documents", tag: "Public", summary: "Start uploading the guardian's government ID or proof of guardianship: a presigned PUT to the private bucket (2S1-BE-10).", auth: false, body: GuardianDocumentInput, status: 201 },
  { method: "post", path: "/public/guardian-setup/{token}/documents/{documentId}/confirm", tag: "Public", summary: "Say the upload finished. Counted only if the file is there; then the checks run for every athlete this guardian looks after.", auth: false },
  { method: "post", path: "/public/guardian-setup/{token}/accept", tag: "Public", summary: "Accept the guardian agreement for this athlete, against the text shown — with the IP, user agent and time (§12). Then the checks run (2S1-BE-10).", auth: false, body: GuardianAgreementInput },
  { method: "get", path: "/public/coming-of-age/{token}", tag: "Public", summary: "The coming-of-age page: the athlete's age of majority, when the 90-day allowance ends, and whether a government ID can still take over the account (2S1-BE-12).", auth: false },
  { method: "post", path: "/public/coming-of-age/{token}/documents", tag: "Public", summary: "Start uploading the athlete's government ID: a presigned PUT to the private bucket (2S1-BE-12).", auth: false, body: IdDocumentInput, status: 201 },
  { method: "post", path: "/public/coming-of-age/{token}/documents/{documentId}/confirm", tag: "Public", summary: "Say the upload finished: control moves from the guardian to the athlete (or, within 30 days of termination, the account comes back) (2S1-BE-12).", auth: false },
  { method: "post", path: "/public/sponsor-requests/confirm-email", tag: "Public", summary: "The link from the confirmation email. Proves the contact reads that mailbox; then the automatic checks run (2S1-BE-17).", auth: false, body: SponsorEmailConfirmInput },
  { method: "get", path: "/signups", tag: "New sign-ups", summary: "BTG: every athlete and guardian the system approved or held, everyone rejected, and anyone in a place the age table doesn't know — with their reasons and flags, and the tab counts (2S1-BE-09 / -10)." },
  { method: "get", path: "/signups/athletes/{id}", tag: "New sign-ups", summary: "One athlete: details, the checks they passed (or why they are held), documents, guardian, activity, and what BTG can do." },
  { method: "get", path: "/signups/guardians/{id}", tag: "New sign-ups", summary: "One guardian: details, checks, documents, the athletes they look after, activity." },
  { method: "get", path: "/signups/athletes/{id}/documents/{documentId}", tag: "New sign-ups", summary: "A five-minute, audited link to read one of the athlete's ID documents. BTG only." },
  { method: "get", path: "/signups/guardians/{id}/documents/{documentId}", tag: "New sign-ups", summary: "A five-minute, audited link to read one of the guardian's documents. BTG only." },
  { method: "post", path: "/signups/athletes/{id}/approve", tag: "New sign-ups", summary: "Approve a sign-up the system held (a likely duplicate, the staff-confirmation setting): the same steps, by BTG." },
  { method: "post", path: "/signups/athletes/{id}/reject", tag: "New sign-ups", summary: "Reject an athlete, with a reason that is emailed. After approval: logins off, suspended, listings ended, payouts held. Their guardian is untouched.", body: SignupRejectInput },
  { method: "post", path: "/signups/athletes/{id}/reinstate", tag: "New sign-ups", summary: "Undo a rejection after approval: logins back on, active again." },
  { method: "post", path: "/signups/guardians/{id}/reject", tag: "New sign-ups", summary: "Reject a guardian — and every athlete they look after with them. The reason is emailed.", body: SignupRejectInput },
  { method: "post", path: "/signups/guardians/{id}/reinstate", tag: "New sign-ups", summary: "Reinstate a guardian, and the athletes their rejection took." },
  { method: "get", path: "/signup-rules/age-table", tag: "New sign-ups", summary: "The age of majority by place (country, or state within it) — seeded with the US states and common countries — and how many athletes live in a place it doesn't know (2S1-BE-12)." },
  { method: "put", path: "/signup-rules/age-table", tag: "New sign-ups", summary: "BTG admin: add a place or change its age. The athletes who live there are worked out again. Audited.", body: AgeRowInput },
  { method: "delete", path: "/signup-rules/age-table/{id}", tag: "New sign-ups", summary: "BTG admin: remove a place — its athletes fall back to their country's age, or 18 and flagged. Audited." },
  { method: "get", path: "/signup-rules/settings", tag: "New sign-ups", summary: "\"BTG staff confirm minors before approval\" — off unless switched on (2S1-BE-10)." },
  { method: "put", path: "/signup-rules/settings", tag: "New sign-ups", summary: "BTG admin: switch the staff-confirmation setting. Switching it off sends the minors it held through their checks again. Audited.", body: SignupSettingsInput },
  { method: "get", path: "/coming-of-age/mine", tag: "Athletes", summary: "The coming-of-age reminder for the athlete's own portal, or the guardian acting for them: age, the 90-day deadline, and (the athlete's own login) where to upload the government ID (2S1-BE-12)." },
  { method: "post", path: "/coming-of-age/send-link", tag: "Athletes", summary: "The guardian sends the athlete the link to upload their government ID (2S1-BE-12)." },
  { method: "post", path: "/payouts", tag: "Payouts", summary: "Request the whole requestable balance as a payout (one per set of books).", status: 201 },
  { method: "get", path: "/payouts", tag: "Payouts", summary: "BTG admin / Finance: payout requests by state, with counts." },
  { method: "get", path: "/payouts/{id}", tag: "Payouts", summary: "One payout: payee, orders, the payout rules checked now, the payee's account status." },
  { method: "post", path: "/payouts/{id}/decision", tag: "Payouts", summary: "Approve (hands it to the payment provider) or send back with a note.", body: PayoutDecisionInput },
  { method: "post", path: "/payouts/{id}/retry", tag: "Payouts", summary: "Send a payout the provider couldn't send back to the provider." },
  { method: "get", path: "/payments/failed", tag: "Payouts", summary: "BTG admin: orders still owing payment whose latest card payment failed — the sponsor, the amount, the provider's reason and how many tries failed (2S7-FE-02)." },
  { method: "get", path: "/marketplace-orders/{id}/payment", tag: "Payouts", summary: "Whether the order can be paid by card now, and how the last attempt went." },
  { method: "post", path: "/marketplace-orders/{id}/pay", tag: "Payouts", summary: "The sponsor starts a card payment: a link to the payment provider's secure page (SponsorX never sees the card)." },
  { method: "get", path: "/public/test-provider/details", tag: "Payouts", summary: "Staging only — what the stand-in provider's page shows for a signed link.", auth: false },
  { method: "post", path: "/public/test-provider/account", tag: "Payouts", summary: "Staging only — finish the stand-in provider's payout-account set-up.", auth: false, body: StandinAccountInput },
  { method: "post", path: "/public/test-provider/checkout", tag: "Payouts", summary: "Staging only — pay (or decline) on the stand-in provider's payment page.", auth: false, body: StandinCheckoutInput },
  { method: "get", path: "/branding", tag: "Marketplace", summary: "The caller's tenant branding — what its portal and reports render (2S7-BE-01) — and canEdit, whether the caller may change it." },
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
  { method: "get", path: "/reservations/{id}", tag: "Marketplace", summary: "One hold — EXPIRED as soon as its time is up. A live hold carries `checkout`: the order terms to accept (body + hash) and the billing contact to prefill (2S4-FE-02)." },
  { method: "post", path: "/reservations/{id}/release", tag: "Marketplace", summary: "Let go of a hold; the stock returns at once." },
  { method: "get", path: "/marketplace-orders", tag: "Marketplace", summary: "Marketplace orders in scope — the sponsor's own, or (BTG) the approval queue (2S4-BE-03)." },
  { method: "post", path: "/marketplace-orders", tag: "Marketplace", summary: "Turn a live hold into an order through the contract gate — the order terms accepted and the billing contact confirmed, or 422 (2S4-FE-02); policy approves it or holds it for BTG (2S4-BE-05).", body: PlaceOrderInput, status: 201 },
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
  // 2S4-BE-06 / -07 / -08 — sellers' orders and delivery
  { method: "get", path: "/sales", tag: "Delivery", summary: "The seller's Orders: every contracted order line the caller sells (a team's manager, or the athlete whose item it is), newest first — number, sponsor business, item, quantity, dates, delivery state, and the caller's OWN share only. The sponsor's contact appears only once paid (2S4-BE-06)." },
  { method: "get", path: "/sales/{id}", tag: "Delivery", summary: "One sold line (by order-line id), as /sales shows it." },
  { method: "post", path: "/sales/{id}/proof", tag: "Delivery", summary: "A presigned PUT for an optional delivery photo (JPEG, PNG or PDF, up to 10 MB), straight to the private bucket. Audited.", body: ProofUploadInput, status: 201 },
  { method: "post", path: "/sales/{id}/delivered", tag: "Delivery", summary: "The seller marks its own line delivered, with a note and an optional photo or link. The sponsor is emailed and has 24 hours to confirm or report a problem; silence confirms (2S4-BE-07).", body: MarkDeliveredInput },
  { method: "get", path: "/marketplace-orders/{id}/deliveries", tag: "Delivery", summary: "An order's lines and how each delivery stands — the note, the proof, the 24-hour deadline, whether the caller can still answer. No shares." },
  { method: "post", path: "/deliveries/{id}/confirm", tag: "Delivery", summary: "The buying sponsor confirms a delivered line (by order-line id). The order is delivered when all its lines are." },
  { method: "post", path: "/deliveries/{id}/problem", tag: "Delivery", summary: "The buying sponsor reports a problem, within the 24 hours. The line's payout is held until BTG resolves it; BTG and the seller are emailed.", body: DeliveryProblemInput },
  { method: "get", path: "/deliveries/{id}/proof", tag: "Delivery", summary: "A five-minute, audited link to the seller's delivery photo — for the seller, the buying sponsor and BTG." },
  { method: "get", path: "/delivery-issues", tag: "Delivery", summary: "BTG admin: problems sponsors reported, and lines whose last date has passed without being marked delivered (2S4-BE-07, 2S4-BE-08)." },
  { method: "get", path: "/delivery-issues/{id}", tag: "Delivery", summary: "One reported problem: both sides' words, the proof, the money on hold, its history." },
  { method: "post", path: "/delivery-issues/{id}/resolve", tag: "Delivery", summary: "BTG confirms the delivery (the hold ends) or refunds the line (the order's refund and ledger reversal), with a note emailed to everyone.", body: DeliveryResolutionInput },
  { method: "post", path: "/delivery-issues/{id}/remind", tag: "Delivery", summary: "BTG reminds a late seller (and their team's manager) — at most once a day per line." },
  // 2S2-BE-05 — team invitations
  { method: "get", path: "/team/invitations", tag: "Marketplace", summary: "The team's invitations to athletes already on SponsorX: open ones first, then the latest answered (2S2-BE-05)." },
  { method: "get", path: "/team/invitations/candidates", tag: "Marketplace", summary: "Approved athletes with no team in the team's marketplace, found by name (?q, two letters or more). Public-profile fields only.", query: InvitableAthletesQuery },
  { method: "post", path: "/team/invitations", tag: "Marketplace", summary: "Invite an approved athlete with no team, at a proposed share. They are emailed; nobody is linked until they accept.", body: TeamInvitationInput, status: 201 },
  { method: "post", path: "/team-invitations/{id}/withdraw", tag: "Marketplace", summary: "The team takes back an invitation nobody has answered." },
  { method: "post", path: "/team-invitations/{id}/respond", tag: "Marketplace", summary: "The athlete accepts (joins the roster at the share shown; their own listings stop selling while they are on the team) or declines.", body: TeamInvitationResponseInput },
  { method: "post", path: "/team/roster/{id}/remove", tag: "Marketplace", summary: "The team removes an athlete from its roster. Orders already placed carry on at their split; the team's live listings of the athlete's items pause." },
  { method: "get", path: "/me/team", tag: "Marketplace", summary: "The athlete's team (name, share, joined) and the invitations waiting for their answer." },
  { method: "post", path: "/me/team/leave", tag: "Marketplace", summary: "The athlete leaves their team. Orders already placed carry on at their split; the team's live listings of their items pause." },
  { method: "get", path: "/team/analytics", tag: "Marketplace", summary: "Revenue, sell-through, completion, sponsor mix and payout trends — from the ledger and order records (2S7-DATA-01)." },
  { method: "get", path: "/properties/mine", tag: "Properties", summary: "The property this account manages — a NEXT school is kind SCHOOL (P9-OPS-01). 404 when not linked." },
  { method: "get", path: "/public/properties/{slug}", tag: "Public", summary: "A property's public profile — name, kind, place, and its public adult athletes (minors counted, never named). No price, inventory or contact (P2-FE-01).", auth: false },
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
  { method: "get", path: "/operations/delivery-health", tag: "Operations", summary: "Delivery health across live campaigns. Paged with ?page (2026-09-29): ?size ?projected=true (campaigns carrying a reach projection), ending soonest first → adds `page`.", query: z.object({ under: z.enum(["true", "false"]).optional(), page: z.coerce.number().int().optional(), size: z.coerce.number().int().optional(), projected: z.enum(["true", "false"]).optional() }) },
  { method: "get", path: "/operations/network-metrics", tag: "Operations", summary: "Network-wide metrics." },
  { method: "get", path: "/operations/job-economics", tag: "Operations", summary: "Economics by NIL job." },

  // Zoho inbound (P7-BE-04)
  { method: "post", path: "/webhooks/zoho/invoice", tag: "Webhooks", summary: "Zoho Books invoice webhook — shared-secret signed, queued.", auth: false, body: ZohoInvoiceWebhook, status: 202 },
  { method: "post", path: "/webhooks/zoho/crm", tag: "Webhooks", summary: "Zoho CRM Notifications API callback — channel-token verified, recorded, queued; never calls Zoho (P8-INT-03).", auth: false, body: ZohoCrmNotification, status: 202 },

  // Sponsor enquiries (P8-INT-06)
  { method: "post", path: "/public/inquiries", tag: "Public", summary: "A prospective sponsor asks to talk — becomes a Zoho Lead and a request SponsorX can approve by itself; emails a confirmation link and returns requestToken for the proof-of-business upload (2S1-BE-17).", auth: false, body: InquiryInput, status: 201, response: z.object({ id: z.string(), received: z.boolean(), requestToken: z.string() }) },

  // 2S1-BE-13 — closing an account, 30-day retention, coming back
  { method: "post", path: "/me/close", tag: "Accounts", summary: "Close the account this login is (athlete, guardian or organization). Its logins are switched off, its published listings paused, and its files kept 30 days; the owner is emailed a reactivation link. Money already earned is still paid out.", body: CloseAccountInput },
  { method: "post", path: "/public/account/reactivation-link", tag: "Public", summary: "Email a reactivation link to the account using this address, if a closed one does. The answer is the same either way. Rate-limited by address and by mailbox (2S1-BE-13).", auth: false, body: ReactivationLinkInput, status: 202 },
  { method: "get", path: "/public/account/reactivation/{token}", tag: "Public", summary: "Where a closed account stands, by its emailed link: CLOSED_SELF (can reactivate), CLOSED_BY_BTG (can ask BTG), CLOSED_AT_AGE (ended at coming of age — the athlete's government ID brings it back, on the coming-of-age page; `comingOfAgePath` is that page for the athlete's own closure while it can), REACTIVATED or EXPIRED, with the days left (2S1-BE-13).", auth: false },
  { method: "post", path: "/public/account/reactivation/{token}", tag: "Public", summary: "REACTIVATE a self-closed account inside its 30 days (logins on, listings back, checks re-run), or REQUEST that BTG reviews a rejected one (BTG admins are emailed) (2S1-BE-13). An account ended at coming of age can do neither (the government ID brings it back).", auth: false, body: ReactivationActionInput },
  { method: "get", path: "/account-closures", tag: "Accounts", summary: "BTG: closed accounts, newest first, with each subject's own name and every tab's count; ?tab= narrows to one tab of the Closed accounts desk (?requested=true is tab=asking) (2S1-BE-13, 2S1-FE-08).", query: ClosureListQuery },
  { method: "get", path: "/account-closures/{id}", tag: "Accounts", summary: "BTG: one closure — why and by whom it closed, the request to come back and BTG's answer, and subjectHref, the account's own page where Reinstate is (2S1-FE-08). canDecline is never true for one ended at coming of age (TERMINATED) — read-only." },
  { method: "post", path: "/account-closures/{id}/reactivation-decision", tag: "Accounts", summary: "BTG declines a rejected account's request to come back, with a reason that is emailed. To bring it back, Reinstate it on its own page (2S1-BE-13).", body: ReactivationDecisionInput },

  // 2S1-BE-15 — changing a minor's guardian (the handoff)
  { method: "get", path: "/public/guardian-handoffs/lookup", tag: "Public", summary: "The new guardian identifies the athlete by the athlete's email: found (a minor with a guardian) with first names only, or not. Rate-limited (2S1-BE-15).", auth: false, query: HandoffLookupQuery },
  { method: "post", path: "/public/guardian-handoffs", tag: "Public", summary: "The new guardian starts a request — the only way a handoff starts. Emails a confirmation link; returns the request token (2S1-BE-15).", auth: false, body: HandoffStartInput, status: 201 },
  { method: "post", path: "/public/guardian-handoffs/confirm-email", tag: "Public", summary: "The link in the new guardian's confirmation email: proves the mailbox, returns the request token (2S1-BE-15).", auth: false, body: HandoffEmailConfirmInput },
  { method: "get", path: "/public/guardian-handoffs/{token}", tag: "Public", summary: "Where the request stands, and what is still needed (2S1-BE-15). Once DECLINED: declinedBy (BTG or CURRENT_GUARDIAN) and declineNote — BTG's reason as written; null for the current guardian's decline, which carries no note to the requester.", auth: false },
  { method: "post", path: "/public/guardian-handoffs/{token}/documents", tag: "Public", summary: "Start uploading the government ID (GUARDIAN_ID) or proof of guardianship (GUARDIANSHIP_PROOF): a presigned PUT to the private bucket, at most 10 MB (2S1-BE-15).", auth: false, body: HandoffDocumentInput, status: 201 },
  { method: "post", path: "/public/guardian-handoffs/{token}/documents/{documentId}/confirm", tag: "Public", summary: "Say the upload finished; counted only if the file is there (2S1-BE-15).", auth: false },
  { method: "post", path: "/public/guardian-handoffs/{token}/submit", tag: "Public", summary: "Accept the guardian agreement and send the request to the current guardian — only once the email is confirmed and both documents are in (2S1-BE-15).", auth: false, body: HandoffSubmitInput },
  { method: "get", path: "/guardian-handoffs", tag: "Guardians", summary: "Requests to take over a ward (the current guardian), or about you (the athlete), newest first (2S1-BE-15). BTG reads every request in the tenant — one being filled in too — with each group's count and the desk's detail (`staff`: age, contact details, documents, who decided); ?group= picks one tab.", query: HandoffListQuery },
  { method: "get", path: "/guardian-handoffs/{id}", tag: "Guardians", summary: "One handoff request and its three steps (2S1-BE-15); BTG reads one still being filled in too, with the desk's detail (`staff`)." },
  { method: "post", path: "/guardian-handoffs/{id}/decision", tag: "Guardians", summary: "The current guardian only: HAND_OFF switches the athlete to the new guardian in one transaction (agreed work and earned money stay put; other children unaffected) — refused if the new guardian can't sign in, and held for BTG (HANDED_OFF) when BTG staff confirm minors; DECLINE closes it and points the requester to BTG support (2S1-BE-15).", body: HandoffDecisionInput },
  { method: "post", path: "/guardian-handoffs/{id}/staff-decision", tag: "Guardians", summary: "BTG admin: a handed-off request waiting for staff confirmation — CONFIRM runs the switch, DECLINE (a reason the requester reads — emailed as written, handoff.declinedByBtg, and on their status page) closes it (2S1-BE-15).", body: HandoffStaffDecisionInput },
  { method: "get", path: "/guardian-handoffs/{id}/documents/{documentId}", tag: "Guardians", summary: "BTG only: a five-minute, audited link to the new guardian's government ID or proof of guardianship (2S1-BE-15)." },

  // 2S1-BE-16 — contacting BTG support
  { method: "get", path: "/public/support", tag: "Public", summary: "The support address (SUPPORT_EMAIL), whether the mailbox is set up yet, and the topics (2S1-BE-16).", auth: false },
  { method: "post", path: "/public/support/messages", tag: "Public", summary: "A message to BTG support. Queued through the worker to the support mailbox (Reply-To the sender) with a copy to the sender; with attachments, each gets a private-bucket PUT and the message is queued by /send. Rate-limited (2S1-BE-16).", auth: false, body: SupportMessageInput, status: 201 },
  { method: "post", path: "/public/support/messages/{token}/send", tag: "Public", summary: "Every attachment has uploaded: queue the message (2S1-BE-16).", auth: false },
  { method: "post", path: "/public/support/messages/{token}/attachments/{attachmentId}/drop", tag: "Public", summary: "Send without an attachment that won't upload (2S1-BE-16).", auth: false },
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
