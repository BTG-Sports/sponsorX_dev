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

  // applications — public intake (P3-BE-13)
  { method: "post", path: "/applications/intake", tag: "Applications", summary: "Apply to the Athlete Network.", auth: false, body: AthleteApplicationInput, status: 201, response: ApplicationSubmissionReceipt },
  { method: "get", path: "/applications/intake/mine", tag: "Applications", summary: "An applicant reads their own application by signed link.", auth: false, query: z.object({ token: z.string() }), response: ApplicantView },
  { method: "patch", path: "/applications/intake/mine", tag: "Applications", summary: "An applicant edits their own application by signed link.", auth: false, query: z.object({ token: z.string() }), body: AthleteApplicationPatch, response: ApplicantView },
  // applications — review (P3-BE-07)
  { method: "get", path: "/applications", tag: "Applications", summary: "The review queue.", query: z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().optional(), state: AthleteState.optional() }) },
  { method: "get", path: "/applications/{id}", tag: "Applications", summary: "One application, as the review queue shows it.", response: AthleteApplicationSummary },
  { method: "post", path: "/applications/{id}/begin-review", tag: "Applications", summary: "Move an application into review." },
  { method: "post", path: "/applications/{id}/approve", tag: "Applications", summary: "Approve an application.", body: ApproveApplicationInput },
  { method: "post", path: "/applications/{id}/request-changes", tag: "Applications", summary: "Send an application back with required changes.", body: ApplicationDecisionNotes },
  { method: "post", path: "/applications/{id}/activate", tag: "Applications", summary: "Activate an approved athlete." },
  { method: "post", path: "/applications/{id}/reject", tag: "Applications", summary: "Reject an application, with reasons.", body: ApplicationDecisionNotes },

  // athletes, guardians, agreements (P3-BE-03, P3-BE-14)
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
  { method: "get", path: "/campaigns/{id}/tracking-codes", tag: "Tracking", summary: "A campaign's tracking codes.", response: list("codes", TrackingCode) },
  { method: "get", path: "/tracking-links/{id}/clicks", tag: "Tracking", summary: "Click counts for a tracking link." },
  { method: "get", path: "/public/tracking/{code}", tag: "Public", summary: "Resolve a tracking code to its destination.", auth: false, response: TrackingDestination },
  { method: "post", path: "/public/tracking/{code}/click", tag: "Public", summary: "Record a click.", auth: false, status: 202 },
  { method: "get", path: "/public/rewards/{token}", tag: "Public", summary: "What the fan's page shows — state, offer, consent wording. Writes nothing (P6-FE-02).", auth: false },
  { method: "get", path: "/catalogue/packages", tag: "Catalogue", summary: "The §7 packages at sponsor prices — never athlete pay (P4-FE-01)." },
  // SponsorX NEXT — editions and ad inventory (Stage 9 Batch A)
  { method: "post", path: "/publications", tag: "Editions", summary: "Create a masthead — a school's (propertyId) or the regional one (null) (P9-BE-02).", body: PublicationInput, status: 201 },
  { method: "post", path: "/publications/{id}/editions", tag: "Editions", summary: "Create an edition in PLANNING (P9-BE-02).", body: EditionInput, status: 201 },
  { method: "get", path: "/editions/{id}", tag: "Editions", summary: "An edition, with its production conditions and state." },
  { method: "post", path: "/editions/{id}/conditions", tag: "Editions", summary: "Set contentReady / rightsCleared. revenueMet is computed at close, never set." , body: EditionConditionsInput },
  { method: "post", path: "/editions/{id}/transition", tag: "Editions", summary: "Move an edition through its states; closing freezes revenue and computes the split (P9-BE-02, -06).", body: EditionTransitionInput },
  { method: "post", path: "/editions/{id}/slots", tag: "Editions", summary: "Add a sellable position. One back cover and one presenting sponsor per edition, enforced by Postgres (P9-BE-03).", body: AdSlotInput, status: 201 },
  { method: "get", path: "/editions/{id}/slots", tag: "Editions", summary: "The edition's inventory — open and sold (P9-BE-03)." },
  { method: "post", path: "/editions/{id}/sales", tag: "Editions", summary: "Sell a campaign the positions its package includes — all or nothing; never after close (P9-BE-03, -09).", body: AdSaleInput, status: 201 },
  { method: "get", path: "/editions/{id}/splits", tag: "Editions", summary: "The four-way revenue split, computed at close. Never Earning (P9-BE-06)." },
  { method: "post", path: "/public/editions/{id}/events", tag: "Public", summary: "A reader scanned (print) or tapped (digital) in a published edition (P9-BE-12).", auth: false, body: EditionEventInput, status: 201 },
  { method: "get", path: "/properties/mine", tag: "Properties", summary: "The property this account manages — a NEXT school is kind SCHOOL (P9-OPS-01). 404 when not linked." },
  { method: "get", path: "/catalogue/jobs", tag: "Catalogue", summary: "The NIL job catalogue at sponsor price bands — never base pay (P4-FE-01)." },
  { method: "post", path: "/public/rewards/{token}/scan", tag: "Public", summary: "A fan scanned the QR.", auth: false, status: 201 },
  { method: "post", path: "/public/rewards/{token}/landing", tag: "Public", summary: "The fan's reward page rendered.", auth: false, status: 201 },
  { method: "post", path: "/public/rewards/{token}/claim", tag: "Public", summary: "A fan claims the reward (email optional, consent versioned).", auth: false, body: RewardClaimInput, status: 201 },
  { method: "post", path: "/public/rewards/{token}/redeem", tag: "Public", summary: "Redeem at the till — single use.", auth: false, status: 201 },
  { method: "post", path: "/public/unsubscribe/{token}", tag: "Public", summary: "A fan withdraws consent — one tap, no login (P6-SEC-03).", auth: false, response: z.object({ withdrawn: z.boolean() }) },

  // money, metrics, reporting (B7)
  { method: "get", path: "/earnings/{id}", tag: "Earnings", summary: "One earning, with its adjustments.", response: EarningBreakdown },
  { method: "post", path: "/earnings/{id}/transition", tag: "Earnings", summary: "Move an earning through its states.", body: EarningTransitionInput },
  { method: "post", path: "/earnings/{id}/adjustment", tag: "Earnings", summary: "Adjust an earning, with a mandatory reason.", body: EarningAdjustmentInput },
  { method: "get", path: "/campaigns/{id}/metrics", tag: "Metrics", summary: "A campaign's metrics, by provenance label.", response: MetricBreakdown },
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
