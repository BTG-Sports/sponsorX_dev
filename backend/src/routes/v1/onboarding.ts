/**
 * /api/v1 — external property onboarding (2S1-BE-01, 2S1-BE-03).
 *
 * The PUBLIC routes are the wizard: an organisation with no login starts an
 * application, saves each step with its resume token, and submits. The
 * STAFF routes are BTG's verification queue and decisions. No business rule
 * lives here; see domain/onboarding.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp } from "../../lib/client-ip";
import { OnboardingDecisionInput, OnboardingDocumentInput, OnboardingStartInput, OnboardingState, OnboardingStepInput } from "../../contracts/onboarding";
import { confirmDocumentUpload, requestDocumentUpload, reviewDocuments } from "../../domain/onboarding-documents";
import {
  decideOnboarding,
  getOnboarding,
  readOnboarding,
  reviewQueue,
  saveStep,
  startOnboarding,
  submitOnboarding,
  type StepInput,
} from "../../domain/onboarding";

export const onboardingRouter = Router();

/* ── staff: the verification queue (2S1-BE-03) ──────────────────────────── */

const queue: RequestHandler = async (req, res) => {
  const state = req.query.state ? OnboardingState.parse(req.query.state) : undefined;
  res.json({ onboardings: await reviewQueue(req.actor!, state) });
};
const one: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await getOnboarding(req.actor!, req.params.id));
};
const decide: RequestHandler<{ id: string }> = async (req, res) => {
  const b = OnboardingDecisionInput.parse(req.body);
  res.json(await decideOnboarding(req.actor!, req.params.id, b.decision, b.notes));
};

onboardingRouter.get("/onboarding", requireActor, queue);
onboardingRouter.get("/onboarding/:id", requireActor, one);
onboardingRouter.post("/onboarding/:id/decision", requireActor, decide);

/* 2S1-BE-02 — the reviewer reads verification documents, each through an audited link. */
const documents: RequestHandler<{ id: string }> = async (req, res) => {
  res.json({ documents: await reviewDocuments(req.actor!, req.params.id) });
};
onboardingRouter.get("/onboarding/:id/documents", requireActor, documents);

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

onboardingRouter.post("/public/onboarding", start);
onboardingRouter.get("/public/onboarding/:token", read);
onboardingRouter.patch("/public/onboarding/:token", step);
onboardingRouter.post("/public/onboarding/:token/submit", submit);

/* 2S1-BE-02 — the applicant uploads to the private bucket; it is never given a read. */
const upload: RequestHandler<{ token: string }> = async (req, res) => {
  await limit("onboarding:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestDocumentUpload(req.params.token, OnboardingDocumentInput.parse(req.body) as Parameters<typeof requestDocumentUpload>[1]));
};
const confirm: RequestHandler<{ token: string; documentId: string }> = async (req, res) => {
  await limit("onboarding:document", clientIp(req), 30, 3600);
  res.json(await confirmDocumentUpload(req.params.token, req.params.documentId));
};
onboardingRouter.post("/public/onboarding/:token/documents", upload);
onboardingRouter.post("/public/onboarding/:token/documents/:documentId/confirm", confirm);
