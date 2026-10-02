import { z } from "./zod";

import { REFUND_METHODS, REFUND_STATES } from "../domain/refunds";

/* --------------------------------------------------------------------------
   Refunds to send (2S4-BE-13) on the wire. Rules live in domain/refunds.ts.
   Never a card or bank number: the reference is checked like a payment's.
   -------------------------------------------------------------------------- */

export const RefundsQuery = z
  .object({ state: z.enum(REFUND_STATES).optional().describe("OPEN — still to send (oldest first); SENT — sent (latest first). Omitted: both.") })
  .meta({ id: "RefundsQuery", description: "Which refunds: still to send, or sent." });

export const RefundSentInput = z
  .object({
    method: z.enum(REFUND_METHODS).describe("How it was sent"),
    reference: z.string().trim().min(1).max(200).describe("The bank transfer's, cheque's or other reference — never a card or bank number"),
    sentOn: z.iso.date().describe("The day it was sent (YYYY-MM-DD), not in the future"),
  })
  .strict()
  .meta({ id: "RefundSentInput", description: "Finance (or BTG admin) sent a refund by hand: how, its reference, and the day. Once only; the sponsor is emailed." });
