import { z } from "./zod";

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
    followers: z.int().min(0).optional(),
    avgViews: z.int().min(0).optional(),
    source: z
      .enum(["VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED"])
      .default("SELF_REPORTED")
      .describe("How the numbers were obtained — never displayed unlabelled"),
  })
  .meta({ id: "SocialAccount", description: "An athlete's account on one platform." });

/**
 * What a person fills in at `/join`.
 *
 * Notice what is absent: no state, no tier, no score. An applicant cannot
 * propose their own lifecycle state or commercial tier — those are set by BTG
 * through the domain functions, and accepting them here would let the form
 * argue with the review process.
 */
export const AthleteApplicationInput = z
  .object({
    // §11 §1 — Identity
    legalName: z.string().min(1).max(120),
    displayName: z.string().min(1).max(120).describe("Athlete or brand name"),
    email: z.email(),
    phone: z.string().min(7).max(32).optional(),
    /** Drives the guardian path. Optional because §11 permits an age band
     *  instead, but one of the two must be present — see the refinement. */
    birthDate: z.iso.date().optional(),
    ageBand: z.enum(["UNDER_16", "16_17", "18_PLUS"]).optional(),
    city: z.string().max(80).optional(),
    stateCode: z.string().length(2).describe("US state code — NIL is US law"),

    // §11 §2 — Sports
    sport: z.string().min(1).max(60),
    position: z.string().max(60).optional(),
    school: z.string().max(120).optional(),
    level: z.enum(["HIGH_SCHOOL", "COLLEGE", "SEMI_PRO", "PRO", "AMATEUR"]).optional(),
    gradYear: z.int().min(1900).max(2100).optional(),
    achievements: z.string().max(2000).optional(),

    // §11 §3 — Social
    socials: z.array(SocialAccount).max(4).default([]),
  })
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
