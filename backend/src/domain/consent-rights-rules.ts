/**
 * Consent rights recorded automatically — P9-BE-23 (item 24), the pure half.
 * `content-rights.ts` reads the facts and records the right through
 * `grantRight`'s own validation.
 *
 * The programme owner (2026-10-03): a step is automatic when every safety
 * check passes. A maker's consent that is already on file IS the right — BTG
 * typing it into the ledger a second time adds nothing but a delay. So when
 * an edition asset's maker (a student or an athlete) has a consent in force,
 * the system records the consent-type right for that asset, as the system.
 * Paper consent forms, and every third-party licence, stay with BTG.
 *
 * WHAT A CONSENT COVERS (decided here — the agreement texts are data, and
 * none says which formats it reaches, so the narrowest sound reading):
 *   FEATURE    — being featured in the edition: digital and print.
 *   RELEASE    — a media release for content they made: digital and print.
 *   COMMERCIAL — commercial activation: digital, print AND commercial reuse.
 *   PROFILE    — a public profile page, not edition content: nothing here.
 *   anything else (COLLAB, CAMPAIGN_ORDER, GUARDIAN) — not content consent.
 * Promotion (`mayPromote`) is never granted automatically; BTG adds it by
 * hand where a consent reaches it. Commercial reuse comes ONLY from a
 * COMMERCIAL agreement — grantRight refuses it otherwise, and this table
 * never asks.
 *
 * WHO MAY CONSENT. A minor's consent is their verified guardian's: the
 * acceptance must carry the guardian linked to the maker, and that guardian
 * must be verified. Where the maker's age is not on file nothing is recorded
 * automatically (unknown age is "adult" elsewhere; for skipping BTG it is
 * the other way round, as P5-BE-10 decided) — BTG can still grant by hand.
 *
 * Pure: no database, no clock.
 */
export type ConsentScope = { digital: boolean; print: boolean; commercial: boolean };

export const CONSENT_COVERAGE: Readonly<Record<string, ConsentScope>> = {
  FEATURE: { digital: true, print: true, commercial: false },
  RELEASE: { digital: true, print: true, commercial: false },
  COMMERCIAL: { digital: true, print: true, commercial: true },
};

/** The agreement kinds that can record a right automatically. */
export const CONSENT_KINDS = Object.keys(CONSENT_COVERAGE);

export type ConsentGrantInput = {
  agreementKind: string;
  /** The acceptance is of its agreement's current version, as shown. */
  inForce: boolean;
  /** Who made the asset — and so whose consent this must be. */
  makerKind: "STUDENT" | "ATHLETE";
  /** A date of birth or an age band is on file for the maker. */
  ageKnown: boolean;
  /** The maker is a minor, or a guardian still acts for them. */
  minor: boolean;
  /** The guardian who signed the acceptance, if any. */
  acceptanceGuardianId: string | null;
  /** The guardian linked to the maker, and whether they are verified. */
  makerGuardianId: string | null;
  guardianVerified: boolean;
};

export type ConsentGrant =
  | {
      grant: true;
      grantorKind: "STUDENT" | "ATHLETE" | "GUARDIAN";
      mayPublishDigital: boolean;
      mayPublishPrint: boolean;
      mayReuseCommercially: boolean;
    }
  | { grant: false; reason: string };

/** Does this acceptance record a right on the maker's asset, and which? */
export function consentGrant(i: ConsentGrantInput): ConsentGrant {
  const scope = CONSENT_COVERAGE[i.agreementKind];
  if (!scope) return { grant: false, reason: `A ${i.agreementKind.toLowerCase()} agreement is not consent for edition content` };
  if (!i.inForce) return { grant: false, reason: "The consent is not of the agreement's current version" };
  if (!i.ageKnown) return { grant: false, reason: "The maker's age is not on file — BTG records the right" };
  if (i.minor) {
    if (!i.acceptanceGuardianId || i.acceptanceGuardianId !== i.makerGuardianId || !i.guardianVerified) {
      return { grant: false, reason: "A minor's consent is given by their verified guardian" };
    }
  }
  return {
    grant: true,
    grantorKind: i.acceptanceGuardianId ? "GUARDIAN" : i.makerKind,
    mayPublishDigital: scope.digital,
    mayPublishPrint: scope.print,
    mayReuseCommercially: scope.commercial && i.agreementKind === "COMMERCIAL",
  };
}
