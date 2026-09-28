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
 * The words each version stands for — what the fan actually reads.
 *
 * Written down 2026-09-24 with the first page that shows it (P6-FE-02):
 * until then no screen had rendered a consent line, so no fan had seen any
 * text under this version. The redeem page takes the wording from the API,
 * never from its own copy, so the words on screen and the version stored
 * with the claim cannot drift apart.
 */
export const CONSENT_TEXT: Record<string, string> = {
  "2026-09-01":
    "Email me my reward code. SponsorX uses this address only to send this " +
    "reward — not for marketing — and does not share it with the sponsor.",
};

/**
 * What an address may be used for.
 *
 * `reward-delivery` is why a fan gives an address at all: to be sent the
 * voucher. `sponsor-contact` (2S6-BE-03) is the second, separate, OPTIONAL
 * agreement — that the sponsor of this reward may contact them about offers.
 * It has its own box, unticked by default, and its own dated text below;
 * agreeing to the first never implies the second.
 */
export const CONSENT_PURPOSES = ["reward-delivery", "sponsor-contact"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * The sponsor-contact wording, versioned on its own clock (2S6-BE-03). Same
 * rule as the delivery text: a date, never edited in place, every version
 * ever shown kept so a stored claim always resolves to the words the fan saw.
 */
export const CURRENT_SPONSOR_CONTACT_VERSION = "2026-09-28" as const;
export const SPONSOR_CONTACT_TEXT: Record<string, string> = {
  "2026-09-28":
    "Also let the sponsor of this reward contact me about their offers. " +
    "Optional — you get your reward either way, and every message has a " +
    "one-tap unsubscribe.",
};
export const KNOWN_SPONSOR_CONTACT_VERSIONS: readonly string[] = Object.keys(SPONSOR_CONTACT_TEXT);

/**
 * THE CONDITION under which a fan's address may be read for the sponsor —
 * spread into the WHERE of every such query (fan-leads.ts, the Zoho lead job
 * in zoho-sync.ts), so a claim without the tick, or withdrawn, is never
 * fetched at all. tests/fan-pii.test.ts fails any read of the address that
 * does not carry it. Plain data, no imports, so the worker can use it too.
 */
export const SPONSOR_CONTACTABLE = {
  type: "CLAIM",
  fanEmail: { not: null },
  sponsorContactVersion: { not: null },
  sponsorContactWithdrawnAt: null,
  consentWithdrawnAt: null,
} as const;

export class SponsorContactNeedsAddressError extends Error {
  readonly status = 422;
  constructor() {
    super(
      "The sponsor-contact option extends an email address given for the " +
        "reward, with its consent. Without that address there is nothing the " +
        "sponsor could be given.",
    );
    this.name = "SponsorContactNeedsAddressError";
  }
}

/**
 * Validate the optional second consent. Null when the box was left unticked
 * — the default, and the ordinary case. It rides on the delivery consent:
 * refused unless an address was given with that consent (Postgres enforces
 * the same, `RewardEvent_sponsor_contact_needs_address`).
 */
export function sponsorContactFor(
  delivery: FanConsent | null,
  sponsorContact: { version?: string | null } | null | undefined,
  now = new Date(),
): { version: string; at: Date } | null {
  if (!sponsorContact?.version) return null;
  if (!delivery) throw new SponsorContactNeedsAddressError();
  if (!KNOWN_SPONSOR_CONTACT_VERSIONS.includes(sponsorContact.version)) {
    throw new UnknownConsentVersionError(sponsorContact.version);
  }
  return { version: sponsorContact.version, at: now };
}


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
  /* The address is given for delivery. Sponsor contact is never the
     address's own purpose — it is the separate, optional second consent. */
  if (consent.purpose !== "reward-delivery") throw new UnknownConsentPurposeError(consent.purpose);

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

