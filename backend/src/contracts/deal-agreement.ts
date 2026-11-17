import { z } from "./zod";

/* --------------------------------------------------------------------------
   Deal Chat's agreement on the wire — 2S4-BE-14 (feature spec §3.6, §3.9).
   -------------------------------------------------------------------------- */

export const DealAgreementSignInput = z
  .object({
    /** The fingerprint of the text the signer was shown (GET …/:id → bodyHash). */
    bodyHashShown: z.string().min(1).max(200),
  })
  .meta({ id: "DealAgreementSignInput", description: "Sign the deal agreement: the hash of the exact text shown. A stale hash is refused (409)." });

const Summary = z.object({
  id: z.string(),
  state: z.enum(["OPEN", "SIGNED", "WITHDRAWN"]),
  forms: z.array(z.enum(["CONTENT", "IN_PERSON", "PLACEMENT"])),
  amountCents: z.int(),
  signedAt: z.string().nullable(),
  sponsorSigned: z.boolean(),
  sellerSigned: z.boolean(),
  downloadPath: z.string(),
});
export const DealAgreementSummary = Summary.meta({
  id: "DealAgreementSummary",
  description: "A Deal Chat agreement as the order card and the item card carry it: its state, who has signed, and the PDF's path (downloadable at any time by both sides).",
});

export const DealAgreement = z
  .object({
    id: z.string(), orderId: z.string(), orderRef: z.string(),
    state: z.enum(["OPEN", "SIGNED", "WITHDRAWN"]), version: z.int(),
    forms: z.array(z.enum(["CONTENT", "IN_PERSON", "PLACEMENT"])), lineIds: z.array(z.string()),
    amountCents: z.int(), originalAmountCents: z.int(),
    sponsorSignedAt: z.string().nullable(), sellerSignedAt: z.string().nullable(), signedByGuardian: z.boolean(), signedAt: z.string().nullable(),
    body: z.string(), bodyHash: z.string(), downloadPath: z.string(), createdAt: z.string(),
  })
  .meta({ id: "DealAgreement", description: "The filled-in deal agreement between an order's sponsor and one seller: the exact text, its fingerprint, and who has signed." });
