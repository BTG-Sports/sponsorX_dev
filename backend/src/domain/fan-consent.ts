/**
 * Fan consent — P6-SEC-01, §26.
 *
 * "Consent is recorded with its version at claim time; no fan PII leaves the
 * system without it."
 *
 * A fan claiming a reward is the ONLY point where this product collects a
 * personal detail from a member of the public, and it does so with no account
 * and no prior relationship. There is no profile to go back and check, no
 * login to prove who agreed, and no support desk they can ask. Whatever is
 * recorded at that moment is the entire record, forever.
 *
 * THE VERSION IS THE WHOLE POINT. "They consented" stops being evidence the
 * first time the wording is edited — and consent text always gets edited. The
 * version string identifies the text that was actually on screen, so a
 * question in six months has an answer rather than an assurance.
 *
 * CONSENT IS SCOPED, NOT A BOOLEAN. Agreeing to be emailed a voucher code is
 * not agreeing to a mailing list, and one flag would lose that distinction
 * the first time somebody exported the claims for a campaign. `purpose`
 * carries it.
 */

/**
 * The current consent text's version.
 *
 * A DATE, not a number, because the question asked later is always "what did
 * it say in September" rather than "what did v3 say". Changing the wording
 * means adding a version here and leaving the old one listed — a fan's record
 * must keep resolving to the text they actually saw.
 */
export const CURRENT_CONSENT_VERSION = "2026-09-01" as const;

/** Every version that has ever been shown. Never remove an entry. */
export const KNOWN_CONSENT_VERSIONS: readonly string[] = ["2026-09-01"] as const;

/**
 * What an address may be used for.
 *
 * Only one purpose exists in Phase 1, and that is deliberate: the fan gave
 * their address to receive a voucher. Adding `marketing` here is a decision
 * with a consent-text change behind it, not a code change.
 */
export const CONSENT_PURPOSES = ["reward-delivery"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];


export type FanConsent = {
  version: string;
  purpose: ConsentPurpose;
  at: Date;
};

export class ConsentRequiredError extends Error {
  readonly status = 422;
  constructor() {
    super(
      "An email address cannot be recorded without consent. §26 allows this " +
        "one piece of fan PII only where the fan agreed to it, and the " +
        "agreement is only evidence if the version they saw is recorded " +
        "with it.",
    );
    this.name = "ConsentRequiredError";
  }
}

export class UnknownConsentVersionError extends Error {
  readonly status = 422;
  constructor(version: string) {
    super(
      `"${version}" is not a consent version this system has ever shown. ` +
        `Recording it would create a claim that resolves to no text.`,
    );
    this.name = "UnknownConsentVersionError";
  }
}

export class UnknownConsentPurposeError extends Error {
  readonly status = 422;
  constructor(purpose: string) {
    super(
      `"${purpose}" is not a purpose a fan has been asked to agree to. ` +
        `Consent is scoped: it permits what the text said and nothing else.`,
    );
    this.name = "UnknownConsentPurposeError";
  }
}

/**
 * Validate consent for an address, or refuse.
 *
 * Returns null when no address was given — the ordinary case, and not an
 * error: §16's page must work for a fan who wants the voucher and not the
 * email.
 */
export function consentFor(
  fanEmail: string | null | undefined,
  consent: { version?: string | null; purpose?: string | null } | null | undefined,
  now = new Date(),
): FanConsent | null {
  const email = fanEmail?.trim();
  if (!email) {
    /* No address, nothing to consent to. Any consent sent alongside is
       discarded rather than stored against nothing. */
    return null;
  }

  if (!consent?.version || !consent.purpose) throw new ConsentRequiredError();
  if (!KNOWN_CONSENT_VERSIONS.includes(consent.version)) {
    throw new UnknownConsentVersionError(consent.version);
  }
  if (!(CONSENT_PURPOSES as readonly string[]).includes(consent.purpose)) {
    throw new UnknownConsentPurposeError(consent.purpose);
  }

  return { version: consent.version, purpose: consent.purpose as ConsentPurpose, at: now };
}

/**
 * May this address be used for this purpose?
 *
 * The gate every outbound path asks before putting a fan's address in a `to`
 * field. Answers false for a claim recorded before consent existed, which is
 * correct — those fans agreed to nothing we can prove.
 */
export function mayContact(
  row: {
    fanEmail: string | null;
    consentVersion: string | null;
    consentPurpose: string | null;
    consentWithdrawnAt?: Date | null;
  },
  purpose: ConsentPurpose,
): boolean {
  return (
    Boolean(row.fanEmail) &&
    row.consentVersion !== null &&
    row.consentPurpose === purpose &&
    !row.consentWithdrawnAt
  );
}

