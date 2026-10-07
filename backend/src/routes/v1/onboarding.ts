/**
 * /api/v1 — external property onboarding (2S1-BE-01, 2S1-BE-03), its
 * automatic approval and BTG's checks afterwards (2S1-BE-06), and an
 * approved organisation's own documents (2S1-BE-07).
 *
 * The PUBLIC routes are the wizard: an organisation with no login starts an
 * application, saves each step with its resume token, and submits. The
 * STAFF routes are BTG's verification queue, profiles and decisions. The
 * PROPERTY routes are the organisation's own manager keeping its papers
 * current. No business rule lives here; see domain/onboarding*.ts and
 * domain/organization-documents.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { pageRequest } from "../../lib/paging";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import {
  OnboardingConfirmEmailInput,
  OnboardingDecisionInput,
  OnboardingDocumentInput,
  OnboardingList,
  OnboardingStartInput,
  OnboardingState,
  OnboardingStepInput,
  OrganizationDocumentInput,
} from "../../contracts/onboarding";
import { confirmDocumentUpload, requestDocumentUpload, reviewDocuments, viewOnboardingDocument } from "../../domain/onboarding-documents";
import { getOrganizationProfile, listOrganizationSignups } from "../../domain/onboarding-profile";
import {
  confirmOrganizationUpload,
  listOrganizationDocuments,
  removeOrganizationDocument,
  requestOrganizationUpload,
  type OrganizationUploadInput,
} from "../../domain/organization-documents";
import {
  confirmOnboardingEmail,
  decideOnboarding,
  getOnboarding,
  readOnboarding,
  resendOnboardingConfirmation,
  reviewQueue, reviewQueuePage,
  saveStep,
  startOnboarding,
  submitOnboarding,
  type StepInput,
} from "../../domain/onboarding";

export const onboardingRouter = Router();

/* ── staff: the verification queue (2S1-BE-03) ──────────────────────────── */

const queue: RequestHandler = async (req, res) => {
  const state = req.query.state ? OnboardingState.parse(req.query.state) : undefined;
  const list = req.query.list ? OnboardingList.parse(req.query.list) : undefined;
  /* ?page= turns on the house pager (lib/paging.ts), with every tab's count; without it the old whole list. */
  const page = pageRequest(req.query as Record<string, unknown>);
  res.json(page ? await reviewQueuePage(req.actor!, page, state, list) : { onboardings: await reviewQueue(req.actor!, state, list) });
};
const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getOnboarding(req.actor!, req.params.id));
};
const decide: RequestHandler<{ id: string }> = async (req, res) => {
  const b = OnboardingDecisionInput.parse(req.body);
  res.json(await decideOnboarding(req.actor!, req.params.id, b.decision, b.notes));
};

/* 2S1-BE-06 — the New sign-ups desk's organisations, before /onboarding/:id takes the word. */
const signups: RequestHandler = async (req, res) => {
  res.json(await listOrganizationSignups(req.actor!));
};
onboardingRouter.get("/onboarding/signups", requireActor, signups);

onboardingRouter.get("/onboarding", requireActor, queue);
onboardingRouter.get("/onboarding/:id", requireActor, one);
onboardingRouter.post("/onboarding/:id/decision", requireActor, decide);

/* 2S1-BE-06 — the profile BTG's email links to. */
const profile: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getOrganizationProfile(req.actor!, req.params.id));
};
onboardingRouter.get("/onboarding/:id/profile", requireActor, profile);

/* 2S1-BE-02 — the reviewer reads verification documents, each through an audited link. */
const documents: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ documents: await reviewDocuments(req.actor!, req.params.id) });
};
onboardingRouter.get("/onboarding/:id/documents", requireActor, documents);
/* 2S1-BE-06 — one document, through a five-minute audited link. */
const viewDocument: RequestHandler<{ id: string; documentId: string }> = async (req, res) => {
  res.json(await viewOnboardingDocument(req.actor!, req.params.id, req.params.documentId));
};
onboardingRouter.get("/onboarding/:id/documents/:documentId", requireActor, viewDocument);

/* ── the organisation's own manager: its documents (2S1-BE-07) ─────────── */

const ownDocuments: RequestHandler = async (req, res) => {
  res.json(await listOrganizationDocuments(req.actor!));
};
const ownUpload: RequestHandler = async (req, res) => {
  res.status(201).json(await requestOrganizationUpload(req.actor!, OrganizationDocumentInput.parse(req.body) as OrganizationUploadInput));
};
const ownConfirm: RequestHandler<{ documentId: string }> = async (req, res) => {
  res.json(await confirmOrganizationUpload(req.actor!, req.params.documentId));
};
const ownRemove: RequestHandler<{ documentId: string }> = async (req, res) => {
  res.json(await removeOrganizationDocument(req.actor!, req.params.documentId));
};
onboardingRouter.get("/property/documents", requireActor, ownDocuments);
onboardingRouter.post("/property/documents", requireActor, ownUpload);
onboardingRouter.post("/property/documents/:documentId/confirm", requireActor, ownConfirm);
onboardingRouter.delete("/property/documents/:documentId", requireActor, ownRemove);

/* ── public: the wizard (2S1-BE-01) ─────────────────────────────────────── */

const start: RequestHandler = async (req, res) => {
  await limit("onboarding:start", clientIp(req), 5, 3600);
  res.status(201).json(await startOnboarding(OnboardingStartInput.parse(req.body)));
};
const read: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:read", clientIp(req), 120, 3600);
  res.json(await readOnboarding(req.params.token));
};
const step: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:step", clientIp(req), 120, 3600);
  res.json(await saveStep(req.params.token, OnboardingStepInput.parse(req.body) as StepInput));
};
const submit: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:submit", clientIp(req), 20, 3600);
  res.json(await submitOnboarding(req.params.token));
};

/* 2S1-BE-06 — the confirmation email's link, and sending it again. Before /:token. */
const confirmEmail: RequestHandler = async (req, res) => {
  await limit("onboarding:confirm-email", clientIp(req), 30, 3600);
  res.json(await confirmOnboardingEmail(OnboardingConfirmEmailInput.parse(req.body).token));
};
onboardingRouter.post("/public/onboarding/confirm-email", confirmEmail);

onboardingRouter.post("/public/onboarding", start);
onboardingRouter.get("/public/onboarding/:token", read);
onboardingRouter.patch("/public/onboarding/:token", step);
onboardingRouter.post("/public/onboarding/:token/submit", submit);

const resend: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:resend", clientIp(req), 10, 3600);
  res.json(await resendOnboardingConfirmation(req.params.token));
};
onboardingRouter.post("/public/onboarding/:token/resend-confirmation", resend);

/* 2S1-BE-02 — the applicant uploads to the private bucket; it is never given a read. */
const upload: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:document", clientIp(req), 120, 3600);
  res.status(201).json(await requestDocumentUpload(req.params.token, OnboardingDocumentInput.parse(req.body) as Parameters<typeof requestDocumentUpload>[1]));
};
const confirm: RequestHandler<{ token: string; documentId: string }> = async (req, res) => {
  await limit("onboarding:document", clientIp(req), 120, 3600);
  res.json(await confirmDocumentUpload(req.params.token, req.params.documentId));
};
onboardingRouter.post("/public/onboarding/:token/documents", upload);
onboardingRouter.post("/public/onboarding/:token/documents/:documentId/confirm", confirm);
