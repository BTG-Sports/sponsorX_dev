/**
 * POST /api/v1/public/links/renew — an expired link exchanged for a fresh one
 * emailed to the address on file (2S8-PMO-02, owner decision 4). PUBLIC and
 * rate-limited; the rules are in domain/link-renewal.ts.
 */
import { Router } from "express";

import { LinkRenewInput } from "../../contracts/links";
import { renewLink } from "../../domain/link-renewal";
import { clientIp } from "../../lib/client-ip";
import type { RenewableKind } from "../../lib/link-kinds";
import { limit } from "../../lib/rate-limit";

export const linksRouter = Router();

linksRouter.post("/public/links/renew", async (req, res) => {
  await limit("links:renew", clientIp(req), 10, 3600);
  const b = LinkRenewInput.parse(req.body);
  res.status(202).json(await renewLink(b.kind as RenewableKind, b.token));
});
