import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

// Importing ./zod first is load-bearing: it applies the `.openapi()` extension
// that registry.register() depends on. See src/contracts/zod.ts.
import "./zod";
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
