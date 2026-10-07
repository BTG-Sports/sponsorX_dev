import { z } from "zod";

/* 2S5-INT-01 / 2S5-INT-03 / 2S5-BE-04 / 2S5-BE-05 — payout accounts, card
   payments and payouts. Amounts are whole cents; the payee requests its whole
   requestable balance, so the request itself carries no amount. */

export const PayoutAccountLinkInput = z
  .object({ returnPath: z.string().max(300).optional() })
  .meta({ id: "PayoutAccountLinkInput", description: "Where to come back to in SponsorX after the payment provider's set-up page (a path on this site)." });

export const PayoutDecisionInput = z
  .object({ decision: z.enum(["APPROVE", "REJECT"]), note: z.string().max(2000).nullable().optional() })
  .meta({ id: "PayoutDecisionInput", description: "BTG's decision on a payout request. APPROVE hands it to the payment provider; REJECT (send back) needs a note the payee reads." });

export const PayoutListQuery = z
  .object({
    state: z.string().max(80).optional(),
    /* 2S5-BE-07 — who the payout waits on. BTG = REQUESTED, and FAILED left for BTG. */
    waitingOn: z.enum(["BTG", "SYSTEM_RETRY", "PAYEE_ACCOUNT"]).optional(),
    /* The house pager (lib/paging.ts): present → one page and its count. */
    page: z.coerce.number().int().optional(),
    size: z.coerce.number().int().optional(),
  })
  .meta({ id: "PayoutListQuery", description: "Comma-separated payout states: REQUESTED, APPROVED, SENDING, PAID, REJECTED, FAILED; and optionally who it waits on (BTG, SYSTEM_RETRY, PAYEE_ACCOUNT)." });

export const StandinAccountInput = z
  .object({ token: z.string().min(10).max(2000), outcome: z.enum(["READY", "NEEDS_INFO"]) })
  .meta({ id: "StandinAccountInput", description: "The stand-in payment provider's set-up page (staging only): finish, or ask for more information." });

export const StandinCheckoutInput = z
  .object({ token: z.string().min(10).max(2000), outcome: z.enum(["SUCCEED", "DECLINE"]) })
  .meta({ id: "StandinCheckoutInput", description: "The stand-in payment provider's payment page (staging only): pay with the test card, or decline." });
