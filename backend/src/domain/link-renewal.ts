/**
 * Exchanging an expired link for a fresh one — 2S8-PMO-02, owner decision 4.
 *
 * Links now expire after 14 days (lib/signed-link.ts). Several flows hand out
 * their next link only to a holder of the current one — the applicant's
 * "resend" needs the intake token, the onboarding resend needs the resume
 * token — so without this an expired link was a dead end.
 *
 * POST /public/links/renew `{ kind, token }`. The token's SIGNATURE must be
 * ours; its age does not matter (that is the point). The fresh link is never
 * returned: it is emailed to the address already on file for that record, so
 * an old link that leaked gives whoever holds it nothing but an email to its
 * owner. The answer is the same whether anything was sent, so it says
 * nothing about the record either.
 *
 * What is sent is the MAILBOX link of each flow — opening it proves the
 * mailbox again and hands the browser a fresh token, exactly as the first
 * email did:
 *   intake, athlete-email                → /join/confirm?t=…         (fresh continuation)
 *   guardian-setup                       → /guardian/setup?t=…
 *   coming-of-age                        → /coming-of-age/…
 *   onboarding, onboarding-email         → /onboarding/confirm?t=…   (fresh resume token)
 *   sponsor-request, sponsor-request-email → /sponsor-request/confirm?t=… (fresh request token)
 *   handoff, handoff-email               → /guardian/handoff?e=…     (fresh hand-off token)
 *   claim-email                          → the claim confirmation (domain/featured.ts renewClaimLink)
 * A reactivation link has its own by-address page (POST
 * /public/account/reactivation-link), and a support message is sent again.
 *
 * At most one email per record and kind per hour, however often it is asked.
 * Each one sent is audited as `link.renewed`.
 */
import { env } from "../config/env";
import { audit, type AuditActor } from "../db/audit";
import { prisma } from "../db/client";
import { alreadyQueued, send } from "../lib/email";
import { ONBOARDING_EMAIL_LINK, ONBOARDING_LINK, issueOnboardingEmailToken } from "../lib/onboarding-token";
import { INTAKE_LINK } from "../lib/intake-token";
import { issuePurposeToken, verifyPurposeToken } from "../lib/purpose-token";
import { linkSubject, linkTtlDays, verifyLinkSignature, type LinkSpec, type RenewableKind } from "../lib/signed-link";
import {
  ATHLETE_EMAIL_LINK,
  COMING_OF_AGE_LINK,
  GUARDIAN_SETUP_LINK,
  issueAthleteEmailToken,
  issueComingOfAgeToken,
  issueGuardianSetupToken,
  splitGuardianSetupSubject,
} from "../lib/signup-token";
import { SPONSOR_EMAIL_LINK, SPONSOR_REQUEST_LINK, issueSponsorEmailToken } from "../lib/sponsor-request-token";
import { renewClaimLink } from "./featured";
import { primaryEmail } from "./onboarding";

const SYSTEM = (tenantId: string): AuditActor => ({ userId: null, tenantId });
const appUrl = () => env.APP_URL.replace(/\/+$/, "");
const firstWord = (s: string | null | undefined) => (s ?? "").trim().split(/\s+/)[0] || "there";

/** Where a fresh link goes, and what it opens. */
type Fresh = { tenantId: string; entity: string; entityId: string; to: string; name: string; what: string; url: string };

const signed = (spec: LinkSpec, token: string, bound?: string) => verifyLinkSignature(spec, token, bound)?.subject ?? null;

async function athleteApplication(token: string, spec: LinkSpec): Promise<Fresh | null> {
  const id = signed(spec, token);
  if (!id) return null;
  const a = await prisma.athlete.findFirst({
    where: { id, tenantId: env.PUBLIC_INTAKE_TENANT_ID },
    select: { id: true, tenantId: true, email: true, legalName: true, displayName: true },
  });
  if (!a?.email) return null;
  return {
    tenantId: a.tenantId, entity: "Athlete", entityId: a.id, to: a.email, name: firstWord(a.legalName || a.displayName),
    what: "carry on with your SponsorX application",
    url: `${appUrl()}/join/confirm?t=${encodeURIComponent(issueAthleteEmailToken(a.id))}`,
  };
}

async function guardianSetup(token: string): Promise<Fresh | null> {
  const ids = splitGuardianSetupSubject(signed(GUARDIAN_SETUP_LINK, token));
  if (!ids) return null;
  const a = await prisma.athlete.findFirst({
    where: { id: ids.athleteId, guardianId: ids.guardianId, tenantId: env.PUBLIC_INTAKE_TENANT_ID },
    select: { id: true, tenantId: true, legalName: true, displayName: true, guardian: { select: { id: true, email: true, legalName: true } } },
  });
  if (!a?.guardian?.email) return null;
  return {
    tenantId: a.tenantId, entity: "Guardian", entityId: a.guardian.id, to: a.guardian.email, name: firstWord(a.guardian.legalName),
    what: `set up your guardian account for ${firstWord(a.legalName || a.displayName)}`,
    url: `${appUrl()}/guardian/setup?t=${encodeURIComponent(issueGuardianSetupToken(a.guardian.id, a.id))}`,
  };
}

async function comingOfAge(token: string): Promise<Fresh | null> {
  const id = signed(COMING_OF_AGE_LINK, token);
  if (!id) return null;
  const a = await prisma.athlete.findFirst({
    /* tenant-scope: the athlete named inside a signed coming-of-age link (as domain/coming-of-age.ts reads it). */
    where: { id },
    select: { id: true, tenantId: true, email: true, legalName: true, displayName: true },
  });
  if (!a?.email) return null;
  return {
    tenantId: a.tenantId, entity: "Athlete", entityId: a.id, to: a.email, name: firstWord(a.legalName || a.displayName),
    what: "upload your ID now that you're 18",
    url: `${appUrl()}/coming-of-age/${encodeURIComponent(issueComingOfAgeToken(a.id))}`,
  };
}

async function onboarding(token: string, emailLink: boolean): Promise<Fresh | null> {
  const id = linkSubject(token);
  if (!id) return null;
  const row = await prisma.propertyOnboarding.findFirst({
    /* tenant-scope: found by the id inside a signed onboarding link; the signature is checked below before anything is sent. */
    where: { id },
    select: { id: true, tenantId: true, orgName: true, contacts: true },
  });
  const email = row ? primaryEmail(row) : null;
  if (!row || !email) return null;
  /* The email link is bound to the contact's address: one sent to an earlier contact renews nothing. */
  const ok = emailLink ? signed(ONBOARDING_EMAIL_LINK, token, email.trim().toLowerCase()) === row.id : signed(ONBOARDING_LINK, token) === row.id;
  if (!ok) return null;
  return {
    tenantId: row.tenantId, entity: "PropertyOnboarding", entityId: row.id, to: email, name: "there",
    what: `carry on with ${row.orgName}'s application to SponsorX`,
    url: `${appUrl()}/onboarding/confirm?t=${encodeURIComponent(issueOnboardingEmailToken(row.id, email))}`,
  };
}

async function sponsorRequest(token: string, spec: LinkSpec): Promise<Fresh | null> {
  const id = signed(spec, token);
  if (!id) return null;
  const row = await prisma.inquiry.findFirst({
    /* tenant-scope: found by the id inside a signed sponsor-request link. */
    where: { id },
    select: { id: true, tenantId: true, email: true, firstName: true, lastName: true },
  });
  if (!row?.email) return null;
  return {
    tenantId: row.tenantId, entity: "Inquiry", entityId: row.id, to: row.email, name: firstWord(row.firstName ?? row.lastName),
    what: "carry on with your request to sponsor on SponsorX",
    url: `${appUrl()}/sponsor-request/confirm?t=${encodeURIComponent(issueSponsorEmailToken(row.id))}`,
  };
}

async function handoff(token: string, purpose: "handoff" | "handoff-email"): Promise<Fresh | null> {
  const id = verifyPurposeToken(purpose, token)?.id;
  if (!id) return null;
  const r = await prisma.guardianHandoff.findFirst({
    /* tenant-scope: found by the id inside a signed hand-off link. */
    where: { id },
    select: { id: true, tenantId: true, requesterEmail: true, requesterName: true },
  });
  if (!r?.requesterEmail) return null;
  return {
    tenantId: r.tenantId, entity: "GuardianHandoff", entityId: r.id, to: r.requesterEmail, name: firstWord(r.requesterName),
    what: "carry on with your request to become the guardian",
    url: `${appUrl()}/guardian/handoff?e=${encodeURIComponent(issuePurposeToken("handoff-email", r.id))}`,
  };
}

const RESOLVERS: Record<Exclude<RenewableKind, "claim-email">, (token: string) => Promise<Fresh | null>> = {
  intake: (t) => athleteApplication(t, INTAKE_LINK),
  "athlete-email": (t) => athleteApplication(t, ATHLETE_EMAIL_LINK),
  "guardian-setup": guardianSetup,
  "coming-of-age": comingOfAge,
  onboarding: (t) => onboarding(t, false),
  "onboarding-email": (t) => onboarding(t, true),
  "sponsor-request": (t) => sponsorRequest(t, SPONSOR_REQUEST_LINK),
  "sponsor-request-email": (t) => sponsorRequest(t, SPONSOR_EMAIL_LINK),
  handoff: (t) => handoff(t, "handoff"),
  "handoff-email": (t) => handoff(t, "handoff-email"),
};

/** Email a fresh link for a genuine one of this kind, whatever its age. Same answer either way. */
export async function renewLink(kind: RenewableKind, token: string): Promise<{ sent: true }> {
  /* A profile claim has its own email and state rule (domain/featured.ts). */
  if (kind === "claim-email") {
    await renewClaimLink(token);
    return { sent: true };
  }
  const fresh = await RESOLVERS[kind](token);
  if (fresh) {
    const hour = Math.floor(Date.now() / 3_600_000);
    const key = `link.fresh:${kind}:${fresh.entityId}:${hour}`;
    await prisma.$transaction(async (tx) => {
      /* One per record and kind per hour, however often it is asked for. */
      if (await alreadyQueued(tx, fresh.tenantId, key)) return;
      await send(tx, fresh.tenantId, {
        template: "link.fresh", to: fresh.to, idempotencyKey: key,
        data: { name: fresh.name, what: fresh.what, url: fresh.url, days: String(linkTtlDays()) },
      });
      await audit(tx, SYSTEM(fresh.tenantId), "link.renewed", fresh.entity, fresh.entityId, { after: { kind } });
    });
  }
  return { sent: true };
}
