/**
 * /api/v1 router. Feature routers mount here as they are built, one loop-slice
 * at a time (SponsorX-Phase1-Build-Roadmap.md, Block B): applications,
 * approvals, briefs, matching, invitations, campaign orders, deliverables,
 * rewards, earnings, reports. The scaffold ships with the index only so the
 * shape is in place and the first feature has somewhere to land.
 */
import { Router } from "express";
import { auditRouter } from "./audit";

import { applicationsRouter } from "./applications";
import { athletesRouter } from "./athletes";
import { profileChangesRouter } from "./profile-changes";
import { campaignsRouter } from "./campaigns";
import { deliverablesRouter } from "./deliverables";
import { earningsRouter } from "./earnings";
import { guardiansRouter } from "./guardians";
import { metricsRouter } from "./metrics";
import { zohoWebhooksRouter } from "./zoho-webhooks";
import { inquiriesRouter } from "./inquiries";
import { catalogueRouter } from "./catalogue";
import { rewardsRouter } from "./rewards";
import { meRouter } from "./me";
import { signupsRouter } from "./signups";
import { propertiesRouter } from "./properties";
import { editionsRouter } from "./editions";
import { studentsRouter } from "./students";
import { rightsRouter } from "./rights";
import { editionArtworkRouter } from "./edition-artwork";
import { onboardingRouter } from "./onboarding";
import { marketplaceRouter } from "./marketplace";
import { payoutsRouter } from "./payouts";
import { sponsorRequestsRouter } from "./sponsor-requests";
import { restrictedWordsRouter } from "./restricted-words";
import { accountRouter } from "./account";
import { guardianHandoffsRouter } from "./guardian-handoffs";
import { supportRouter } from "./support";
import { openapiRouter } from "./openapi";

export const v1Router = Router();

v1Router.get("/", (_req, res) => {
  res.json({ service: "sponsorx-api", version: "v1" });
});

/* Identity first: every portal asks who it is talking to before it renders. */
v1Router.use("/me", meRouter);

/* 2S1-BE-09 / -10 / -11 / -12 — athletes and guardians signing up: the
   applicant's checklist and ID upload (by intake token), the guardian's own
   page and the coming-of-age upload (public, by signed link), BTG's New
   sign-ups desk and sign-up rules. Full paths; mounted before
   /applications so its intake paths are matched here first. */
v1Router.use("/", signupsRouter);

/* B1 — athlete onboarding. The review queue and the three admin decisions
   (P3-BE-07). */
v1Router.use("/applications", applicationsRouter);

/* The athlete's own profile — what the portal's §24 profile page and its §11
   completion meter render (P3-FE-03). */
v1Router.use("/athletes", athletesRouter);

/* P3-BE-16, reshaped by 2S1-BE-14 — edits publish at once, so BTG's desk is
   gone; what is left is BTG's list of sensitive edits, the five-minute view
   of a legal-name change's ID, and the athlete's confirm and withdraw. The
   athlete's edit/list-mine routes are under /athletes above. */
v1Router.use("/profile-changes", profileChangesRouter);

/* B1 — the guardian gate and agreement acceptance (P3-BE-14). Mounted at the
   root of /v1 rather than under a prefix, because these hang off athletes,
   guardians and agreements rather than off one noun. */
v1Router.use("/", guardiansRouter);

/* B3 — brief, matching, campaign and invitations (P4-BE-02..06). Mounted at
   the root for the same reason as guardians: these hang off several nouns
   rather than one. */
v1Router.use("/", campaignsRouter);

/* B5 — deliverables, the approval chain and creative assets
   (P5-BE-05, P5-BE-06, P5-BE-08). Mounted at the root like the routers above:
   these hang off deliverables and their assets rather than one noun. */
v1Router.use("/", deliverablesRouter);

/* B6 — the fan funnel and tracking links (P6-BE-01..04, P6-BE-07). Carries
   BOTH the staff routes and the six unauthenticated /public ones §16 needs,
   which is why that file groups them explicitly. */
v1Router.use("/", rewardsRouter);

/* B7 — earnings (P7-BE-01, P7-BE-03). Finance only; no public surface, and
   no create endpoint — an earning is raised by acceptOrder inside the
   transaction that creates the contract it belongs to. */
v1Router.use("/", earningsRouter);

/* B7 — metrics and the sponsor report (P7-DATA-01, P7-BE-05). Every read
   returns a breakdown by provenance label, never a blended number (§22). */
v1Router.use("/", metricsRouter);

/* B7 — inbound Zoho (P7-BE-04, §18, §20). PUBLIC and unauthenticated by
   necessity: Zoho cannot log in. Guarded by an HMAC shared secret instead,
   which the production env guard refuses to boot without. */
v1Router.use("/", zohoWebhooksRouter);

/* B8 — a prospective sponsor's enquiry (P8-INT-06). PUBLIC and rate-limited;
   writes one row and queues the Zoho Lead push. */
v1Router.use("/", inquiriesRouter);

/* B3 — the sponsor marketplace's catalogue reads (P4-FE-01). Sponsor prices
   only; athlete pay is not selected (P4-SEC-02). */
v1Router.use("/", catalogueRouter);

/* Stage 9 — the property portal's own property (P9-OPS-01). A NEXT school
   is a Property with kind SCHOOL; its advisor is that property's manager. */
v1Router.use("/", propertiesRouter);

/* Stage 9 Batch A — SponsorX NEXT editions and ad inventory (P9-BE-02/03/06/12).
   One public route: a reader's engagement with a published edition. */
v1Router.use("/", editionsRouter);

/* Stage 9 Batch B — SponsorX NEXT students, codes, sales credit, points and
   prospects (P9-BE-04/05/07/13/15, P9-SEC-01). Two public routes: the
   student application and the /s/[code] resolver. */
v1Router.use("/", studentsRouter);

/* Stage 9 Batch C — rights ledger, featured athletes and the claim flow, the
   DMV school pools (P9-BE-10/11/14). Two public routes: a featured athlete's
   profile and the claim. */
v1Router.use("/", rightsRouter);

/* P9-BE-16 — a sold ad slot's artwork on the approval board: the upload,
   BTG's review, the buying sponsor's sign-off. Full paths, at the root. */
v1Router.use("/", editionArtworkRouter);

/* Phase 2 Sprint 1 — external property onboarding (2S1-BE-01, -03). Public
   wizard by resume token; BTG's verification queue behind requireActor. */
v1Router.use("/", onboardingRouter);

/* Phase 2 Sprint 2–3 — inventory, the team roster, listings, formal offers
   and tenant branding (2S2-BE-01/-03/-04, 2S3-BE-01, 2S7-BE-01). */
v1Router.use("/", marketplaceRouter);
v1Router.use("/", payoutsRouter);

/* 2S1-BE-05 — BTG reviews businesses asking to sponsor, and opens their accounts. */
v1Router.use("/", sponsorRequestsRouter);

/* 2S1-BE-18 — BTG's restricted-words list. */
v1Router.use("/", restrictedWordsRouter);

/* 2S1-BE-13 — closing an account and coming back (POST /me/close, the
   public reactivation page, BTG's closures). 2S1-BE-15 — changing a minor's
   guardian (public request page; the current guardian's answer). 2S1-BE-16 —
   the public contact form, queued to the support mailbox. */
v1Router.use("/", accountRouter);
v1Router.use("/", guardianHandoffsRouter);
v1Router.use("/", supportRouter);
v1Router.use("/", auditRouter);

/* The published contract, generated from the Zod registry (§38). Public: a
   consumer has to be able to read how to authenticate before it can. */
v1Router.use("/openapi.json", openapiRouter);
