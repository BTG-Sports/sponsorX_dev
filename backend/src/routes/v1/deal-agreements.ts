/**
 * /api/v1/deal-agreements — Deal Chat's agreement between an order's sponsor
 * and one seller (2S4-BE-14). Read, signed and downloaded by its two sides;
 * read and downloaded by BTG. The rules live in domain/deal-agreement.ts.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { clientIp, clientUserAgent } from "../../lib/client-ip";
import { DealAgreementSignInput } from "../../contracts/deal-agreement";
import { dealAgreementPdf, readDealAgreement, signDealAgreement } from "../../domain/deal-agreement";
import { announceDealChat } from "../../realtime/deal-chat-socket";

export const dealAgreementsRouter = Router();

/** GET /deal-agreements/:id — the filled-in text, its fingerprint, who has signed. */
const read: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await readDealAgreement(req.actor!, req.params.id));
};

/** POST /deal-agreements/:id/sign — one side signs the text it was shown (its hash). */
const sign: RequestHandler<{ id: string }> = async (req, res) => {
  const { bodyHashShown } = DealAgreementSignInput.parse(req.body ?? {});
  res.json(
    await signDealAgreement(req.actor!, req.params.id, {
      bodyHashShown,
      /* §12 — captured for evidential weight, from the request. */
      ip: clientIp(req) ?? "",
      userAgent: clientUserAgent(req) ?? "",
    }),
  );
  /* A signature moves the deal on for both sides (and, with the second, the order): tell the chat's listeners. */
  announceDealChat({ agreementId: req.params.id });
};

/** GET /deal-agreements/:id/download — the PDF, at any time (owner, 2026-11-17). */
const download: RequestHandler<{ id: string }> = async (req, res) => {
  const { filename, pdf } = await dealAgreementPdf(req.actor!, req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(pdf);
};

dealAgreementsRouter.get("/deal-agreements/:id", requireActor, read);
dealAgreementsRouter.post("/deal-agreements/:id/sign", requireActor, sign);
dealAgreementsRouter.get("/deal-agreements/:id/download", requireActor, download);
