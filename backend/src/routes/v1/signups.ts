/**
 * Athletes and guardians signing up — 2S1-BE-09, -10, -11, -12.
 *
 * Three kinds of caller, kept in three blocks so no route is protected by
 * position:
 *
 *   1. THE APPLICANT, by the intake token /join handed their browser
 *      (`?token=`), or the email token from their receipt: their checklist,
 *      the ID upload, naming a guardian, resending the emails.
 *   2. THE GUARDIAN, by the set-up token emailed to them; and the athlete
 *      coming of age, by their coming-of-age link. Public routes, under
 *      /public, like every bearer-token route.
 *   3. SIGNED-IN users: BTG's New sign-ups desk and sign-up rules, and the
 *      coming-of-age reminder on the athlete's (or acting guardian's) portal.
 *
 * Routes parse and hand over; every rule is in the domain.
 */
import { Router, type Request, type RequestHandler } from "express";

import { requireActor } from "../../auth/actor";
import { limit } from "../../lib/rate-limit";
import { clientIp, clientUserAgent } from "../../lib/client-ip";
import { readIntakeToken } from "../../lib/intake-token";
import { GuardianInput } from "../../contracts/guardian";
import {
  AgeRowInput, AthleteDocumentInput, GuardianAgreementInput, GuardianDetailsInput, GuardianDocumentInput, IdDocumentInput,
  SignupRejectInput, SignupSettingsInput, SignupTokenInput,
} from "../../contracts/signups";
import { ApplicationNotFoundError } from "../../domain/application-intake";
import {
  confirmAthleteDocument, confirmAthleteEmail, nameGuardianAfterApplying, recheckStaffHeld, requestAthleteDocument,
  resendAthleteEmail, resendGuardianEmail, signupStatus,
} from "../../domain/athlete-signup";
import {
  acceptGuardianAgreement, confirmGuardianDocument, guardianSetupStatus, openGuardianSetup, requestGuardianDocument, saveGuardianDetails,
} from "../../domain/guardian-setup";
import {
  approveHeldAthlete, getAthleteSignup, getGuardianSignup, listSignups, reinstateAthleteSignup, reinstateGuardianSignup,
  rejectAthleteSignup, rejectGuardianSignup, viewSignupDocument,
} from "../../domain/signups-desk";
import { listAgeTable, removeAgeRow, setAgeRow, setSignupSettings, signupSettings } from "../../domain/age-of-majority";
import {
  comingOfAgeByToken, confirmComingOfAgeUpload, myComingOfAge, requestComingOfAgeUpload, sendComingOfAgeLink,
} from "../../domain/coming-of-age";

export const signupsRouter = Router();

/* ─────────────── 1. the applicant, by intake token ────────────────────── */

/** The application a `?token=` reaches — a bad token and a missing one answer alike. */
function applicant(req: Request): string {
  const raw = req.query.token;
  const id = readIntakeToken(typeof raw === "string" ? raw : null);
  if (!id) throw new ApplicationNotFoundError();
  return id;
}

signupsRouter.get("/applications/intake/status", async (req, res) => {
  await limit("intake:read", clientIp(req), 120, 3600);
  res.json(await signupStatus(applicant(req)));
});
/** The link in the receipt. Opening it proves the mailbox; then the checks run. */
signupsRouter.post("/applications/intake/confirm-email", async (req, res) => {
  await limit("intake:confirm", clientIp(req), 30, 3600);
  res.json(await confirmAthleteEmail(SignupTokenInput.parse(req.body ?? {}).token));
});
signupsRouter.post("/applications/intake/confirm-email/resend", async (req, res) => {
  const id = applicant(req);
  await limit("intake:resend", clientIp(req), 10, 3600);
  res.json(await resendAthleteEmail(id));
});
signupsRouter.post("/applications/intake/documents", async (req, res) => {
  const id = applicant(req);
  await limit("intake:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestAthleteDocument(id, AthleteDocumentInput.parse(req.body ?? {})));
});
signupsRouter.post<{ documentId: string }>("/applications/intake/documents/:documentId/confirm", async (req, res) => {
  const id = applicant(req);
  await limit("intake:document", clientIp(req), 30, 3600);
  res.json(await confirmAthleteDocument(id, req.params.documentId));
});
/** A minor names (or changes) their guardian after applying. */
signupsRouter.post("/applications/intake/guardian", async (req, res) => {
  const id = applicant(req);
  await limit("intake:guardian", clientIp(req), 10, 3600);
  res.json(await nameGuardianAfterApplying(id, GuardianInput.parse(req.body ?? {})));
});
signupsRouter.post("/applications/intake/guardian/resend", async (req, res) => {
  const id = applicant(req);
  await limit("intake:resend", clientIp(req), 10, 3600);
  res.json(await resendGuardianEmail(id));
});

/* ─────────────── 2. the guardian's page and coming of age (public) ───── */

/** Opening the emailed link confirms the guardian's email. */
signupsRouter.post("/public/guardian-setup/open", async (req, res) => {
  await limit("guardian-setup:open", clientIp(req), 60, 3600);
  res.json(await openGuardianSetup(SignupTokenInput.parse(req.body ?? {}).token));
});
signupsRouter.get<{ token: string }>("/public/guardian-setup/:token", async (req, res) => {
  await limit("guardian-setup:read", clientIp(req), 120, 3600);
  res.json(await guardianSetupStatus(req.params.token));
});
signupsRouter.patch<{ token: string }>("/public/guardian-setup/:token", async (req, res) => {
  await limit("guardian-setup:write", clientIp(req), 30, 3600);
  res.json(await saveGuardianDetails(req.params.token, GuardianDetailsInput.parse(req.body ?? {})));
});
signupsRouter.post<{ token: string }>("/public/guardian-setup/:token/documents", async (req, res) => {
  await limit("guardian-setup:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestGuardianDocument(req.params.token, GuardianDocumentInput.parse(req.body ?? {})));
});
signupsRouter.post<{ token: string; documentId: string }>("/public/guardian-setup/:token/documents/:documentId/confirm", async (req, res) => {
  await limit("guardian-setup:document", clientIp(req), 30, 3600);
  res.json(await confirmGuardianDocument(req.params.token, req.params.documentId));
});
signupsRouter.post<{ token: string }>("/public/guardian-setup/:token/accept", async (req, res) => {
  await limit("guardian-setup:write", clientIp(req), 30, 3600);
  const input = GuardianAgreementInput.parse(req.body ?? {});
  /* §12 — captured for evidential weight, from the request. */
  res.json(await acceptGuardianAgreement(req.params.token, input, { ip: clientIp(req) ?? "", userAgent: clientUserAgent(req) ?? "" }));
});

signupsRouter.get<{ token: string }>("/public/coming-of-age/:token", async (req, res) => {
  await limit("coming-of-age:read", clientIp(req), 120, 3600);
  res.json(await comingOfAgeByToken(req.params.token));
});
signupsRouter.post<{ token: string }>("/public/coming-of-age/:token/documents", async (req, res) => {
  await limit("coming-of-age:document", clientIp(req), 30, 3600);
  res.status(201).json(await requestComingOfAgeUpload(req.params.token, IdDocumentInput.parse(req.body ?? {})));
});
signupsRouter.post<{ token: string; documentId: string }>("/public/coming-of-age/:token/documents/:documentId/confirm", async (req, res) => {
  await limit("coming-of-age:document", clientIp(req), 30, 3600);
  res.json(await confirmComingOfAgeUpload(req.params.token, req.params.documentId));
});

/* ─────────────── 3. signed in ─────────────────────────────────────────── */

/** The coming-of-age reminder, for the athlete's own portal or the guardian acting for them. */
signupsRouter.get("/coming-of-age/mine", requireActor, async (req, res) => {
  res.json(await myComingOfAge(req.actor!));
});
/** The guardian's "Send <athlete> the link". */
signupsRouter.post("/coming-of-age/send-link", requireActor, async (req, res) => {
  res.json(await sendComingOfAgeLink(req.actor!));
});

/* BTG's New sign-ups desk — athletes and guardians. */
signupsRouter.get("/signups", requireActor, async (req, res) => {
  res.json(await listSignups(req.actor!));
});
signupsRouter.get<{ id: string }>("/signups/athletes/:id", requireActor, async (req, res) => {
  res.json(await getAthleteSignup(req.actor!, req.params.id));
});
signupsRouter.get<{ id: string }>("/signups/guardians/:id", requireActor, async (req, res) => {
  res.json(await getGuardianSignup(req.actor!, req.params.id));
});
const viewDocument = (owner: "athletes" | "guardians"): RequestHandler<{ id: string; documentId: string }> => async (req, res) => {
  res.json(await viewSignupDocument(req.actor!, owner, req.params.id, req.params.documentId));
};
signupsRouter.get<{ id: string; documentId: string }>("/signups/athletes/:id/documents/:documentId", requireActor, viewDocument("athletes"));
signupsRouter.get<{ id: string; documentId: string }>("/signups/guardians/:id/documents/:documentId", requireActor, viewDocument("guardians"));
signupsRouter.post<{ id: string }>("/signups/athletes/:id/approve", requireActor, async (req, res) => {
  res.json(await approveHeldAthlete(req.actor!, req.params.id));
});
signupsRouter.post<{ id: string }>("/signups/athletes/:id/reject", requireActor, async (req, res) => {
  res.json(await rejectAthleteSignup(req.actor!, req.params.id, SignupRejectInput.parse(req.body ?? {}).note));
});
signupsRouter.post<{ id: string }>("/signups/athletes/:id/reinstate", requireActor, async (req, res) => {
  res.json(await reinstateAthleteSignup(req.actor!, req.params.id));
});
signupsRouter.post<{ id: string }>("/signups/guardians/:id/reject", requireActor, async (req, res) => {
  res.json(await rejectGuardianSignup(req.actor!, req.params.id, SignupRejectInput.parse(req.body ?? {}).note));
});
signupsRouter.post<{ id: string }>("/signups/guardians/:id/reinstate", requireActor, async (req, res) => {
  res.json(await reinstateGuardianSignup(req.actor!, req.params.id));
});

/* The rules automatic approval reads — BTG admins keep them. */
signupsRouter.get("/signup-rules/age-table", requireActor, async (req, res) => {
  res.json(await listAgeTable(req.actor!));
});
signupsRouter.put("/signup-rules/age-table", requireActor, async (req, res) => {
  res.json(await setAgeRow(req.actor!, AgeRowInput.parse(req.body ?? {})));
});
signupsRouter.delete<{ id: string }>("/signup-rules/age-table/:id", requireActor, async (req, res) => {
  res.json(await removeAgeRow(req.actor!, req.params.id));
});
signupsRouter.get("/signup-rules/settings", requireActor, async (req, res) => {
  res.json(await signupSettings(req.actor!));
});
signupsRouter.put("/signup-rules/settings", requireActor, async (req, res) => {
  const result = await setSignupSettings(req.actor!, SignupSettingsInput.parse(req.body ?? {}));
  /* Switched off: the minors it was holding go through their checks again. */
  if (!result.staffConfirmMinors) await recheckStaffHeld(req.actor!.tenantId);
  res.json(result);
});
