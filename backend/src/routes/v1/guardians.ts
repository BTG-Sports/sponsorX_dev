/**
 * /api/v1 — guardians and agreements (P3-BE-14, §4, §12, §37).
 *
 * `linkGuardian`, `verifyGuardian`, `readGuardianReadiness` and
 * `acceptAgreement` were built by P3-BE-03 and P3-BE-06, and no endpoint
 * called any of them. B1's exit asks for an athlete ACTIVE "with agreements
 * and (if minor) verified-guardian captured" — none of which the API could do.
 *
 * WHAT STAYS OUT OF THE BODY. The signer, the IP and the user agent are taken
 * from the request. A caller who can nominate their own signer can manufacture
 * an acceptance for someone else, and evidence a caller supplies about itself
 * is not evidence.
 *
 * WHAT IS NOT HERE. The applicant-facing half — a minor's parent submitting
 * their own details at /join — has no home yet, for the same reason the
 * application intake needed one: a guardian at sign-up has no account, and
 * `linkGuardian` takes an `Actor`. These are the BTG-side endpoints; the
 * public path is raised separately once /join's guardian step is settled.
 */
import { Router, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { GuardianInput, AgreementAcceptanceInput } from "../../contracts/guardian";
import {
  linkGuardian,
  readGuardianReadiness,
  verifyGuardian,
} from "../../domain/guardian";
import { acceptAgreement } from "../../domain/agreement";

export const guardiansRouter = Router();

/**
 * POST /athletes/:id/guardian — attach an authorised adult to a minor.
 *
 * Refused for an adult athlete by the domain, deliberately: `guardianReadiness`
 * treats "has a guardian" as meaningful, so a stray guardian on an adult would
 * make an adult look like a supervised minor in every downstream check.
 */
const link: RequestHandler<{ id: string }> = async (req, res) => {
  const input = GuardianInput.parse(req.body ?? {});
  res.status(201).json(await linkGuardian(req.actor!, req.params.id, input));
};

/**
 * POST /guardians/:id/verify — BTG attests that this adult is who they say.
 *
 * The attestation is the point: §26 needs "who confirmed this adult, and
 * when" to survive, because it is the evidence if a minor's participation is
 * ever challenged. The actor comes from `requireActor`, never the body.
 */
const verify: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await verifyGuardian(req.actor!, req.params.id));
};

/** GET /athletes/:id/guardian-readiness — §37's gate, as an answer. */
const readiness: RequestHandler<{ id: string }> = async (req, res) => {
  res.json(await readGuardianReadiness(req.actor!, req.params.id));
};

/**
 * POST /agreements/accept — record an acceptance against the text shown.
 *
 * `bodyHashShown` is what makes this evidential. If the stored agreement has
 * moved on since the signer read it, the acceptance is refused rather than
 * recorded against wording they never saw.
 */
const accept: RequestHandler = async (req, res) => {
  const input = AgreementAcceptanceInput.parse(req.body ?? {});
  res.status(201).json(
    await acceptAgreement(req.actor!, {
      agreementId: input.agreementId,
      bodyHashShown: input.bodyHashShown,
      /* §12 — captured for evidential weight, from the request. */
      ip: req.ip ?? "",
      userAgent: req.get("user-agent") ?? "",
    }),
  );
};

guardiansRouter.post("/athletes/:id/guardian", requireActor, link);
guardiansRouter.get("/athletes/:id/guardian-readiness", requireActor, readiness);
guardiansRouter.post("/guardians/:id/verify", requireActor, verify);
guardiansRouter.post("/agreements/accept", requireActor, accept);

export { link, verify, readiness, accept };
