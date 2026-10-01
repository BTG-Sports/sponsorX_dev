import { INT4_MAX, z } from "./zod";
import { hasVisibleText } from "../domain/reward-state";
import { GuardianInput } from "./guardian";

/* QA pass 6 (P6-BE-07): a required text field must hold something a reader
   can SEE. `.min(1)` and `.trim()` both pass a string of zero-width
   characters (U+200B…), which then stored an "athlete" with a blank name
   that activation counted as complete. The same visible-text rule QA-07 gave
   reward copy. */
const required = (max: number, what: string) =>
  z.string().min(1).max(max).refine(hasVisibleText, { message: `${what} can't be blank.` });

/** Today as an ISO date (UTC) — the latest birthDate that can be true. */
const todayIso = () => new Date().toISOString().slice(0, 10);

/* --------------------------------------------------------------------------
   The athlete application — P3-BE-01, §11, §21.

   §11 lists ten sections. **This contract owns four of them**, and that split
   is deliberate rather than partial work:

     1  Identity              — here
     2  Sports                — here
     3  Social                — here
    10  Compliance status     — here (the state machine and reviewer notes)

     4  Content capabilities  ┐
     5  Brand interests       ├ P3-BE-05, which depends on this task
     6  Restrictions          ┘
     7  Rates                 — P3-BE-09 (athlete rate card with tier multiplier)
     8  Payment setup         — Phase 1 payment policy: status only, and
                                Addendum A6 forbids collecting a tax ID
     9  Agreements            — P3-BE-06 (acceptance with body hash)

   Writing all ten here would duplicate three sibling tasks and pre-empt
   decisions they own. What this task guarantees is that the *form's* spine
   exists and its lifecycle is enforced; the siblings attach their sections to
   it.

   PAYMENT SETUP, EXPLICITLY: §11 asks for "payment recipient and provider
   onboarding status; no raw bank credentials in SponsorX". Phase 1's payment
   policy narrows that to earnings *status* tracking with no tax ID collected,
   so the only field here is an opaque status. If a future task wants to store
   a payment recipient identifier, that is a policy change, not an oversight.
   -------------------------------------------------------------------------- */

/** §21: DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / CHANGES_REQUESTED /
 *  REJECTED → ACTIVE / SUSPENDED. Mirrors the Prisma `AthleteState` enum. */
export const AthleteState = z
  .enum([
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "CHANGES_REQUESTED",
    "REJECTED",
    "ACTIVE",
    "SUSPENDED",
    /* SponsorX NEXT (P9-BE-11) — editorial's read-only profile; never a
       target of a transition request (the claim flow is the only way out). */
    "FEATURED",
  ])
  .meta({
    id: "AthleteState",
    description:
      "Athlete application lifecycle (§21). Transitions are enforced in the domain layer; this enum only names the states.",
  });

/** §11 §3 — one row per platform. Followers and views are self-reported in
 *  Phase 1, which is why every snapshot carries its provenance (§22). */
export const SocialAccount = z
  .object({
    platform: z.enum(["INSTAGRAM", "TIKTOK", "YOUTUBE", "X"]),
    handle: z.string().min(1).max(64),
    followers: z.int().min(0).max(INT4_MAX).optional(),
    avgViews: z.int().min(0).max(INT4_MAX).optional(),
    source: z
      .enum(["VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED"])
      .default("SELF_REPORTED")
      .describe("How the numbers were obtained — never displayed unlabelled"),
  })
  .meta({ id: "SocialAccount", description: "An athlete's account on one platform." });

/**
 * The same row as an APPLICANT submits it at `/join`.
 *
 * An applicant's numbers are self-reported by definition — a VERIFIED_* label
 * is something BTG earns by checking, not something a form can claim. The
 * intake domain already forces SELF_REPORTED whatever arrives; this schema
 * stops the published contract advertising values the server ignores
 * (QA pass 5, Info). Staff edits keep the full enum via `SocialAccount`.
 */
export const SocialAccountIntake = SocialAccount.extend({
  source: z
    .enum(["SELF_REPORTED"])
    .default("SELF_REPORTED")
    .describe("Always SELF_REPORTED at intake — verification is BTG's step, not the applicant's"),
}).meta({
  id: "SocialAccountIntake",
  description: "A social account as an applicant submits it. Numbers are self-reported.",
});

/**
 * What a person fills in at `/join`.
 *
 * Notice what is absent: no state, no tier, no score. An applicant cannot
 * propose their own lifecycle state or commercial tier — those are set by BTG
 * through the domain functions, and accepting them here would let the form
 * argue with the review process.
 */
const AthleteApplicationFields = z.object({
    // §11 §1 — Identity
    legalName: required(120, "Legal name"),
    displayName: required(120, "Display name").describe("Athlete or brand name"),
    email: z.email(),
    phone: z.string().min(7).max(32).optional(),
    /** Drives the guardian path. Optional because §11 permits an age band
     *  instead, but one of the two must be present — see the refinement. */
    /* Bounded: "0000-01-01" is a valid ISO date that Postgres refuses, which
       reached the column as a 500 (found re-testing QA-03, pass 5). */
    /* And not in the future (QA pass 6, P6-BE-08): nobody applies before
       they are born, and a future date makes every age rule meaningless. An
       age FLOOR (e.g. under 13) is a product question, not enforced here. */
    birthDate: z.iso
      .date()
      .refine((d) => d >= "1900-01-01", "birthDate must be 1900 or later.")
      .refine((d) => d <= todayIso(), "birthDate can't be in the future.")
      .optional(),
    ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).optional(),
    city: z.string().max(80).optional(),
    stateCode: z.string().length(2).refine(hasVisibleText, { message: "State can't be blank." }).describe("US state code — NIL is US law"),
    /* 2S1-BE-12 — the age of majority follows the athlete's state or country. */
    countryCode: z.string().regex(/^[A-Z]{2}$/, "A two-letter country code, e.g. US.").optional().describe("ISO country code; US when absent"),
    /* 2S1-BE-10 — a minor names their guardian, who is emailed a link to their own page. */
    guardian: GuardianInput.optional().describe("A minor's guardian. Ignored for an adult (by their place's age of majority)."),

    // §11 §2 — Sports
    sport: required(60, "Sport"),
    position: z.string().max(60).optional(),
    school: z.string().max(120).optional(),
    level: z.enum(["HIGH_SCHOOL", "COLLEGE", "SEMI_PRO", "PRO", "AMATEUR"]).optional(),
    gradYear: z.int().min(1900).max(2100).optional(),
    achievements: z.string().max(2000).optional(),

  // §11 §3 — Social
  socials: z.array(SocialAccountIntake).max(4).default([]),
});

/* --------------------------------------------------------------------------
   What "complete" means for activation (QA pass 5, product decision 3).

   An athlete may only go ACTIVE when their record holds everything the
   application form requires. The list is DERIVED from the form's own shape —
   a field is required when the contract refuses it missing — so adding a
   required field to `/join` tightens activation too, with no second list to
   forget. Plus the one-of rule the refinement below states: a birthDate or
   an ageBand, because without either nobody can say whether a guardian is
   needed (§26), and an unknown age must never pass as an adult.
   -------------------------------------------------------------------------- */

/** Required keys of the application form, derived: ["legalName",
 *  "displayName", "email", "stateCode", "sport"] today. */
export const APPLICATION_REQUIRED_FIELDS: readonly string[] = Object.entries(
  AthleteApplicationFields.shape,
)
  .filter(([, schema]) => !(schema as z.ZodType).safeParse(undefined).success)
  .map(([key]) => key);

/** The key reported when neither birthDate nor ageBand is on record. */
export const AGE_FIELD = "birthDateOrAgeBand";

/**
 * Which required application fields this record is missing — empty when it
 * is complete. Blank strings count as missing: a `""` legal name is not one,
 * and neither is one made only of invisible characters (QA pass 6, P6-BE-07).
 */
export function missingApplicationFields(
  record: Record<string, unknown>,
): string[] {
  const blank = (v: unknown) =>
    v === null || v === undefined || (typeof v === "string" && !hasVisibleText(v));
  const missing = APPLICATION_REQUIRED_FIELDS.filter((k) => blank(record[k]));
  if (blank(record.birthDate) && blank(record.ageBand)) missing.push(AGE_FIELD);
  return missing;
}

/**
 * The refinement lives here and not on the shape above, because
 * `AthleteApplicationPatch` needs `.partial()` and Zod refuses that on a
 * refined object — for a good reason: "one of these two is required" cannot
 * survive every field becoming optional. The patch re-checks nothing, since a
 * patch that omits both dates is not asserting the applicant has neither.
 */
export const AthleteApplicationInput = AthleteApplicationFields
  .refine((v) => v.birthDate !== undefined || v.ageBand !== undefined, {
    message:
      "Either birthDate or ageBand is required: the guardian workflow (§26) cannot be decided without knowing whether the applicant is a minor.",
    path: ["birthDate"],
  })
  .meta({
    id: "AthleteApplicationInput",
    description:
      "Sections 1-3 of §11's onboarding form. Capabilities, interests, restrictions, rates and agreements are attached by sibling tasks.",
  });

/** §11 §10 — Compliance status, as the reviewer sees it. */
export const AthleteApplicationReview = z
  .object({
    state: AthleteState,
    /** Free text from the Athlete Network Manager. Never shown to the
     *  applicant unless the state is CHANGES_REQUESTED. */
    reviewerNotes: z.string().max(4000).nullable(),
    reviewedAt: z.iso.datetime().nullable(),
    /** §11 asks for expiration dates on compliance status — a restriction or
     *  clearance that never expires is one nobody revisits. */
    complianceExpiresAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "AthleteApplicationReview", description: "Review state of an application." });

export type AthleteApplicationInput = z.infer<typeof AthleteApplicationInput>;
export type AthleteApplicationReview = z.infer<typeof AthleteApplicationReview>;
export type SocialAccount = z.infer<typeof SocialAccount>;
export type AthleteState = z.infer<typeof AthleteState>;

/* --------------------------------------------------------------------------
   Review decisions — P3-BE-07, §13, §23.

   Three admin actions, and the contracts differ in exactly one way: whether
   reviewer notes are required. That difference is the whole reason these are
   three schemas rather than one with an optional string.

   An approval needs no explanation — the applicant is in, and the email says
   so. A request for changes with no notes is unactionable: the applicant is
   told to fix something and not told what, and the only way back is a support
   conversation. A rejection with no reason is worse, because §23's review
   checklist is also the record BTG would rely on if a refusal were ever
   questioned.

   So `min(1)` on those two is not input hygiene. It is the acceptance
   criterion "every decision recorded" expressed where it cannot be skipped.
   -------------------------------------------------------------------------- */

/** The three destinations §21 allows out of UNDER_REVIEW. */
export const ApplicationReviewDecision = z
  .enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"])
  .meta({
    id: "ApplicationReviewDecision",
    description:
      "An admin's decision on an athlete application. The legal transitions out of UNDER_REVIEW (§21).",
  });

/** Approve. Notes are optional — an approval explains itself. */
export const ApproveApplicationInput = z
  .object({
    reviewerNotes: z
      .string()
      .max(4000)
      .optional()
      .describe("Internal note. Not shown to the applicant on approval."),
  })
  .meta({
    id: "ApproveApplicationInput",
    description: "Body for POST /applications/{id}/approve.",
  });

/**
 * Request changes, or reject. Notes are required and reach the applicant.
 *
 * The same shape serves both because the constraint is the same one; the
 * difference is what the templates do with it, which is the worker's business
 * rather than the contract's.
 */
export const ApplicationDecisionNotes = z
  .object({
    reviewerNotes: z
      .string()
      .min(1, "A reason is required: it is sent to the applicant and kept as the record of the decision.")
      .max(4000)
      .describe("Sent to the applicant verbatim, and stored on the application."),
  })
  .meta({
    id: "ApplicationDecisionNotes",
    description:
      "Body for POST /applications/{id}/request-changes and /reject. The note reaches the applicant.",
  });

/** One row of the admin review queue (§23's applications desk). */
export const AthleteApplicationSummary = z
  .object({
    id: z.string(),
    displayName: z.string(),
    legalName: z.string(),
    sport: z.string(),
    stateCode: z.string().nullable(),
    state: AthleteState,
    /** §37's gate, surfaced on the queue row so a reviewer can see before
     *  opening an application that it cannot be activated yet. */
    guardianStatus: z.enum(["not-required", "missing", "unverified", "ready"]),
    /** Required application fields this record lacks — activation refuses
     *  with `profile_incomplete` until it is empty. `birthDateOrAgeBand`
     *  stands for "neither is on record". */
    missingFields: z.array(z.string()),
    reviewerNotes: z.string().nullable(),
    reviewedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({
    id: "AthleteApplicationSummary",
    description: "An application as the review queue lists it.",
  });

export type ApplicationReviewDecision = z.infer<typeof ApplicationReviewDecision>;
export type ApproveApplicationInput = z.infer<typeof ApproveApplicationInput>;
export type ApplicationDecisionNotes = z.infer<typeof ApplicationDecisionNotes>;
export type AthleteApplicationSummary = z.infer<typeof AthleteApplicationSummary>;

/* --------------------------------------------------------------------------
   Public intake — P3-BE-13, §11, §21.

   `AthleteApplicationInput` above has existed since P3-BE-01 and, until this
   task, nothing consumed it: the contract was published in `openapi.json`
   while no endpoint would accept it. These are the shapes that close that.
   -------------------------------------------------------------------------- */

/**
 * An edit to an application already submitted once.
 *
 * Every field optional, and `socials` deliberately replaces rather than
 * merges — a partial merge on an array keyed by platform has no obvious
 * meaning, and "remove the TikTok account I listed by mistake" has to be
 * expressible. Omitting the key leaves the existing accounts alone.
 */
export const AthleteApplicationPatch = AthleteApplicationFields.partial().meta({
  id: "AthleteApplicationPatch",
  description:
    "Fields an applicant may change while their application is DRAFT or CHANGES_REQUESTED. Sending `socials` replaces the whole set.",
});

/**
 * What comes back from a submission.
 *
 * The token is the applicant's only way back to their own application — they
 * have no account, and will not have one unless they are approved. It is
 * returned once, on creation, and never listed anywhere.
 */
export const ApplicationSubmissionReceipt = z
  .object({
    id: z.string(),
    state: AthleteState,
    /** Signed, scoped to this one application, and not a credential for
     *  anything else. See src/lib/intake-token.ts. */
    continuationToken: z.string(),
  })
  .meta({
    id: "ApplicationSubmissionReceipt",
    description: "Returned to an applicant after they submit. Carries the link back to their own application.",
  });

/** What an applicant may see of their own application — not the reviewer's
 *  view. `reviewerNotes` is included only because §11 §10 says it is shown to
 *  the applicant when the state is CHANGES_REQUESTED, and it is nulled
 *  otherwise rather than filtered by the client. */
export const ApplicantView = z
  .object({
    id: z.string(),
    state: AthleteState,
    displayName: z.string(),
    legalName: z.string(),
    email: z.email(),
    sport: z.string(),
    stateCode: z.string().nullable(),
    reviewerNotes: z.string().nullable(),
    socials: z.array(SocialAccount),
  })
  .meta({
    id: "ApplicantView",
    description: "An application as its own applicant sees it.",
  });

export type AthleteApplicationPatch = z.infer<typeof AthleteApplicationPatch>;
export type ApplicationSubmissionReceipt = z.infer<typeof ApplicationSubmissionReceipt>;
export type ApplicantView = z.infer<typeof ApplicantView>;
