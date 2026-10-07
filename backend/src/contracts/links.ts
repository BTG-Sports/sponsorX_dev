import { z } from "./zod";

import { RENEWABLE_KINDS } from "../lib/link-kinds";

/* --------------------------------------------------------------------------
   Signed links — 2S8-PMO-02, owner decision 4.

   Links expire 14 days after issue. A person holding an expired one asks
   for a fresh one, which is emailed to the address on file — never returned.
   -------------------------------------------------------------------------- */

export const LinkRenewInput = z
  .object({
    kind: z.enum(RENEWABLE_KINDS as unknown as [string, ...string[]]),
    token: z.string().min(1).max(600),
  })
  .strict()
  .meta({ id: "LinkRenewInput", description: "The kind of link (from the 410 `link_expired` answer's `kind`) and the expired link's token." });

export const LinkRenewReceipt = z
  .object({ sent: z.literal(true) })
  .meta({ id: "LinkRenewReceipt", description: "Always the same, whether or not a link was sent." });
