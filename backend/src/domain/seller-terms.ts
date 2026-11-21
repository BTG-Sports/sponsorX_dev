/**
 * A seller accepts the seller terms in force — POL-BE-120 (owner, 2026-11-21:
 * "yes, ask them").
 *
 * A team or venue accepts the SponsorX Marketplace Seller and Payout Terms
 * once, in onboarding (onboarding.ts, the "agreements" step). A new version —
 * PROPERTY_TERMS v3 carries the partnership agreement's wording: access is
 * free, the fees are those disclosed on each order, and a change needs written
 * acceptance — reached only sellers onboarding after it. Its own clause A11
 * says "a new version applies once accepted; until then Seller cannot list new
 * items". So a signed-in seller reads the version in force here and accepts it
 * by its hash, recorded where onboarding records it (PropertyOnboarding's
 * terms fields, with the IP and browser) and audited the same way.
 *
 * THE GATE. With FEE_STATEMENT_REQUIRED on, a team that hasn't accepted the
 * version in force can't list, resume or accept a listing's fees, accept an
 * order, or sign a Deal agreement as the seller (409 seller_terms_required).
 * An athlete selling their own items signs no seller terms today; their fees
 * are disclosed per listing and order like everyone's.
 */
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/client";
import { audit, AUDIT_ACTIONS } from "../db/audit";
import { env } from "../config/env";
import type { Actor } from "../auth/actor";
import { ForbiddenError } from "../auth/errors";
import { currentTerms, PROPERTY_TERMS_KIND, termsBody } from "./onboarding";

type Tx = Prisma.TransactionClient;

export class SellerTermsRequiredError extends Error {
  readonly status = 409;
  readonly code = "seller_terms_required";
  readonly details: { version: number };
  constructor(version: number) {
    super(`Accept the current SponsorX seller terms (version ${version}) before listing or accepting orders. Nothing was changed.`);
    this.name = "SellerTermsRequiredError";
    this.details = { version };
  }
}

export class SellerTermsError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "SellerTermsError";
    this.status = status;
  }
}

/** The signed-in team's onboarding record, where its terms acceptance lives. */
async function onboardingOf(tx: Tx | typeof prisma, actor: Actor) {
  if (!actor.propertyId) return null;
  return tx.propertyOnboarding.findFirst({
    /* tenant-scope: the actor's own property's onboarding, by the property id their login carries (it lives in the operator's tenant). */
    where: { propertyId: actor.propertyId, property: { tenantId: actor.tenantId } },
    select: { id: true, tenantId: true, termsAgreementId: true, termsAcceptedAt: true },
  });
}

/** GET /seller-terms — the version in force, its words and hash, and whether this team has accepted it. */
export async function sellerTermsOf(actor: Actor) {
  const onb = await onboardingOf(prisma, actor);
  if (!onb) throw new ForbiddenError("listing", "write");
  const terms = await prisma.$transaction((tx) => currentTerms(tx, onb.tenantId));
  if (!terms) throw new SellerTermsError("No seller terms are published yet.", 503);
  const body = await termsBody(terms.version, terms.bodyHash);
  const accepted = onb.termsAgreementId
    ? await prisma.agreement.findFirst({ where: { id: onb.termsAgreementId, tenantId: onb.tenantId }, select: { version: true } })
    : null;
  return {
    agreement: { id: terms.id, kind: PROPERTY_TERMS_KIND, version: terms.version, bodyHash: terms.bodyHash, body },
    accepted: accepted && onb.termsAcceptedAt ? { version: accepted.version, at: onb.termsAcceptedAt.toISOString() } : null,
    upToDate: onb.termsAgreementId === terms.id,
    /** Whether listing and accepting orders wait for it (FEE_STATEMENT_REQUIRED). */
    required: env.FEE_STATEMENT_REQUIRED,
  };
}

/** POST /seller-terms/accept — the team's manager accepts the version shown, by its hash. */
export async function acceptSellerTerms(actor: Actor, input: { agreementId: string; bodyHashShown: string; ip: string; userAgent: string }) {
  if (!actor.roles.includes("PROPERTY_MGR")) throw new ForbiddenError("listing", "write");
  await prisma.$transaction(async (tx) => {
    const onb = await onboardingOf(tx, actor);
    if (!onb) throw new ForbiddenError("listing", "write");
    const terms = await currentTerms(tx, onb.tenantId);
    if (!terms) throw new SellerTermsError("No seller terms are published yet.", 503);
    if (terms.id !== input.agreementId || terms.bodyHash !== input.bodyHashShown) {
      throw new SellerTermsError("The terms shown are not the current version. Reload and accept again.");
    }
    await tx.propertyOnboarding.update({
      /* tenant-scope: the actor's own property's onboarding, read above. */
      where: { id: onb.id },
      data: { termsAgreementId: terms.id, termsHash: terms.bodyHash, termsAcceptedAt: new Date(), termsIp: input.ip, termsUserAgent: input.userAgent },
      select: { id: true },
    });
    await audit(tx, actor, AUDIT_ACTIONS.agreement.accept, "Agreement", terms.id, {
      after: { onboardingId: onb.id, propertyId: actor.propertyId, kind: PROPERTY_TERMS_KIND, version: terms.version, bodyHash: terms.bodyHash, reaccepted: true },
    });
  });
  return sellerTermsOf(actor);
}

/** The gate, in the caller's transaction: a team acting as a seller has accepted the terms in force. */
export async function assertSellerTermsCurrent(tx: Tx, actor: Actor): Promise<void> {
  if (!env.FEE_STATEMENT_REQUIRED || !actor.propertyId) return;
  const onb = await onboardingOf(tx, actor);
  if (!onb) return;
  const terms = await currentTerms(tx, onb.tenantId);
  if (terms && onb.termsAgreementId !== terms.id) throw new SellerTermsRequiredError(terms.version);
}
