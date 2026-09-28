import { z } from "./zod";

import {
  hasVisibleText,
  RESERVE_MINUTES,
  REWARD_ELIGIBILITIES,
  REWARD_EVENT_TYPES,
  REWARD_STATES,
} from "../domain/reward-state";

/* --------------------------------------------------------------------------
   The fan funnel and tracking links on the wire — P6-BE-01…04, P6-BE-07.

   Enums are built from the domain's own lists rather than retyped, as
   everywhere else here: a published schema naming a state the machine has
   never heard of is a lie that only surfaces at runtime.
   -------------------------------------------------------------------------- */

export const RewardState = z.enum(REWARD_STATES).meta({
  id: "RewardState",
  description:
    "DRAFT → ACTIVE → PAUSED → EXPIRED / ARCHIVED. Only an ACTIVE reward can be scanned, claimed or redeemed (§21).",
});

export const RewardEventType = z.enum(REWARD_EVENT_TYPES).meta({
  id: "RewardEventType",
  description:
    "The four moments of §16's fan funnel — SCAN, LANDING, CLAIM, REDEEM. Four separate rows, never one counter: the drop-off between them is the number the feature exists to produce.",
});

export const RewardEligibility = z.enum(REWARD_ELIGIBILITIES).meta({
  id: "RewardEligibility",
  description:
    "Who the reward is for (§9 screen 10). STATED to the fan and to booth staff, not checked by the API — the fan page has no login (§16), so there is nothing to check it against.",
});

/* Optional copy. Blank means "not set" — the page's default wording — and
   the domain stores it as null (no transform here: a transform cannot be
   represented in the published OpenAPI). */
const optionalCopy = (max: number) => z.string().trim().max(max).nullable().optional();

/* Required copy must have something a reader can see — whitespace and
   zero-width characters alone are refused as blank (QA-07). */
const requiredCopy = (max: number, what: string) =>
  z.string().min(1).max(max).refine(hasVisibleText, { message: `${what} can't be blank.` });

export const RewardInput = z
  .object({
    offerText: requiredCopy(500, "The offer"),
    terms: requiredCopy(4000, "The terms"),
    /** Must be in the future (checked by the domain — F-09). */
    expiresAt: z.iso.datetime(),
    /** A single-use reward is redeemable exactly once, enforced by a partial
     *  unique index rather than by application code (P6-BE-04). */
    singleUse: z.boolean().default(true),
    /* P6-BE-08 — eligibility, the redemption cap and the landing copy. */
    eligibility: RewardEligibility.default("ANYONE"),
    eligibilityNote: optionalCopy(280),
    /** Most redemptions across every token of the reward; null = unlimited.
     *  Enforced race-safely in the redeem transaction, not by the page. */
    redemptionCap: z.int().min(1).max(1_000_000).nullable().optional(),
    /** QA-09 — on a capped reward, a fan's claim holds one unit for them
     *  this many minutes; after that the unit is released. Default an hour. */
    reserveMinutes: z.int().min(RESERVE_MINUTES.min).max(RESERVE_MINUTES.max).default(RESERVE_MINUTES.default),
    landingHeadline: optionalCopy(120),
    landingSubhead: optionalCopy(280),
  })
  .meta({
    id: "RewardInput",
    description:
      "Consent wording is deliberately not a reward field: it is versioned centrally (P6-SEC-01) so every claim records the exact text the fan saw.",
  });

export const RewardTransitionInput = z
  .object({ to: RewardState })
  .meta({ id: "RewardTransitionInput" });

export const RewardTokenInput = z
  .object({
    /** Which athlete's QR this is, so the funnel can answer "who drove it?" */
    athleteId: z.string().min(1).nullable().optional(),
  })
  .meta({ id: "RewardTokenInput" });

export const RewardClaimInput = z
  .object({
    /** Optional. §16's fan page has no login, and asking for an email as a
     *  condition of claiming would be a barrier at a stall. */
    fanEmail: z.email().max(320).nullable().optional(),
    /**
     * Required WHENEVER `fanEmail` is present — P6-SEC-01.
     *
     * Not enforced by the schema, because a Zod refinement would return a
     * validation error and this is a §26 rule, not a shape problem: the
     * domain raises ConsentRequiredError so the refusal reads the same
     * whether it arrives from this route, §8's service account or a test.
     */
    consent: z
      .object({
        /** The version of the text the fan actually saw. */
        version: z.string().min(1).max(40),
        /** What they agreed the address would be used for. */
        purpose: z.string().min(1).max(60),
      })
      .nullable()
      .optional(),
    /**
     * 2S6-BE-03 — the OPTIONAL second box: "the sponsor may contact me".
     * Unticked by default; when ticked, the version of its own wording. Only
     * valid alongside an address given with the delivery consent.
     */
    sponsorContact: z.object({ version: z.string().min(1).max(40) }).nullable().optional(),
  })
  .meta({
    id: "RewardClaimInput",
    description:
      "An email address may only be recorded together with consent carrying the VERSION of the text shown (§26). Claiming without an address needs no consent and is the ordinary case.",
  });

export const RewardFunnel = z
  .object({
    SCAN: z.int().min(0),
    LANDING: z.int().min(0),
    CLAIM: z.int().min(0),
    REDEEM: z.int().min(0),
  })
  .meta({
    id: "RewardFunnel",
    description:
      "All four counts or none — the shape makes it impossible to read one number without the others it is only meaningful against.",
  });

/* http and https only (P8-SEC-03). z.url() accepts any scheme the URL
   parser does — `javascript:`, `data:`, `file:` — and this value becomes a
   public redirect's Location. */
const WebUrl = z.url().max(2000).refine((u) => /^https?:\/\//i.test(u), {
  message: "Destination must be an http or https URL.",
});

export const TrackingLinkInput = z
  .object({ destinationUrl: WebUrl })
  .meta({ id: "TrackingLinkInput" });

export const TrackingDestination = z
  .object({ destinationUrl: WebUrl })
  .meta({
    id: "TrackingDestination",
    description:
      "Carries the destination and nothing else — no link id, no tenant id. The redirect is public, so the response is the minimum a browser needs.",
  });

export const TrackingCode = z
  .object({
    athleteId: z.string(),
    deliverableId: z.string(),
    code: z.string(),
    clicks: z.int().min(0),
  })
  .meta({ id: "TrackingCode" });
