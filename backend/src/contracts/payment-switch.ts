/** POL-BE-36 — BTG's payments switch. */
import { z } from "./zod";

export const PaymentSwitchInput = z
  .object({
    open: z.boolean(),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .meta({ id: "PaymentSwitchInput", description: "Turn payment on or off, and why — the reason is audited with the change." });
