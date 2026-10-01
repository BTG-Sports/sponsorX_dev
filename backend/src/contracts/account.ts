import { z } from "./zod";

/* 2S1-BE-13 — closing an account and coming back. */

export const CloseAccountInput = z
  .object({
    /* A deliberate act: an empty body is refused, so nothing closes by accident. */
    confirm: z.literal(true),
    /* Which of this login's accounts, when it is more than one (an athlete who is also a guardian). */
    account: z.enum(["athlete", "guardian", "property"]).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .meta({ id: "CloseAccountInput", description: "Close the account this login is. confirm must be true." });

export const ReactivationLinkInput = z
  .object({ email: z.email().max(254) })
  .strict()
  .meta({ id: "ReactivationLinkInput", description: "The account's email; a reactivation link is sent there if a closed account uses it. The answer is the same either way." });

export const ReactivationActionInput = z
  .discriminatedUnion("action", [
    /* A self-closed account, inside its 30 days. */
    z.object({ action: z.literal("REACTIVATE") }).strict(),
    /* A rejected account asks BTG to look again. */
    z.object({ action: z.literal("REQUEST"), note: z.string().trim().max(2000).optional() }).strict(),
  ])
  .meta({ id: "ReactivationActionInput", description: "REACTIVATE a self-closed account, or REQUEST that BTG reviews a rejected one." });

export const ReactivationDecisionInput = z
  .object({ decision: z.literal("DECLINE"), note: z.string().trim().min(1).max(2000) })
  .strict()
  .meta({ id: "ReactivationDecisionInput", description: "BTG declines a rejected account's request to come back, with a reason the person reads. To bring it back, Reinstate it on its own page." });
