import { z } from "./zod";
import { hasVisibleText } from "../domain/reward-state";
import { BRAND_CATEGORIES, CONTENT_CAPABILITIES } from "../domain/brand-categories";

/* --------------------------------------------------------------------------
   Profile edits — P3-BE-16, then 2S1-BE-14 (2026-10-01).

   What an approved athlete may change about themselves, by §11 section. The
   shape mirrors the application's (contracts/athlete.ts) on purpose: the
   same fields, the same bounds — an edit is not a way to store something the
   application could not.

   2S1-BE-14: edits are no longer held for BTG. Ordinary edits publish at
   once. Three SENSITIVE edits publish too, but re-run the sign-up checks,
   and BTG admins are emailed about them:
     · identity.legalName — needs a matching ID upload (`idDocument`), and
       takes effect when the file arrives;
     · identity.birthDate — adulthood is worked out again;
     · guardian           — a minor naming their guardian. A guardian who
       already exists changes only by the handoff (2S1-BE-15).

   Still absent: email, phone, ageBand (contact and identity facts BTG
   keeps); socials (a direct write already, PUT /athletes/:id/socials);
   state, tier, rates, scores — BTG's, never the athlete's.

   A key that is absent leaves the column alone; a key that is present
   replaces it (null clears an optional one). The domain then drops anything
   equal to the row as it stands, so a change records only what moved.
   -------------------------------------------------------------------------- */

const text = (max: number, what: string) =>
  z.string().min(1).max(max).refine(hasVisibleText, { message: `${what} can't be blank.` });
const optionalText = (max: number) => z.string().max(max).nullable();

export const ProfileChangeInput = z
  .object({
    identity: z
      .object({
        displayName: text(120, "Display name").optional(),
        city: optionalText(80).optional(),
        stateCode: z.string().length(2).refine(hasVisibleText, { message: "State can't be blank." }).optional(),
        /* 2S1-BE-14 — sensitive: needs `idDocument`; applied when the file arrives. */
        legalName: text(160, "Legal name").optional(),
        /* 2S1-BE-14 — sensitive: adulthood is worked out again. */
        birthDate: z.iso.date().optional(),
      })
      .optional(),
    sport: z
      .object({
        sport: text(60, "Sport").optional(),
        position: optionalText(60).optional(),
        school: optionalText(120).optional(),
        level: z.enum(["HIGH_SCHOOL", "COLLEGE", "SEMI_PRO", "PRO", "AMATEUR"]).nullable().optional(),
        gradYear: z.int().min(1900).max(2100).nullable().optional(),
        achievements: optionalText(2000).optional(),
      })
      .optional(),
    capabilities: z.object({ contentCapabilities: z.array(z.enum(CONTENT_CAPABILITIES)).max(CONTENT_CAPABILITIES.length) }).optional(),
    interests: z.object({ brandInterests: z.array(z.enum(BRAND_CATEGORIES)).max(BRAND_CATEGORIES.length) }).optional(),
    restrictions: z
      .object({
        restrictedCategories: z.array(z.enum(BRAND_CATEGORIES)).max(BRAND_CATEGORIES.length).optional(),
        restrictionNotes: optionalText(2000).optional(),
      })
      .optional(),
    /** 2S1-BE-14 — sensitive: a minor names their guardian. */
    guardian: z
      .object({
        legalName: text(160, "Guardian's name"),
        email: z.email().max(254),
        phone: z.string().trim().min(1).max(40).optional(),
        relationship: z.enum(["PARENT", "LEGAL_GUARDIAN", "AUTHORIZED_REP"]),
      })
      .strict()
      .optional(),
    /** 2S1-BE-14 — the ID that matches a new legal name: PDF, JPEG or PNG, at most 10 MB. */
    idDocument: z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
        bytes: z.number().int().min(1).max(10 * 1024 * 1024),
      })
      .strict()
      .optional(),
    /** A word kept with the change in the athlete's history. */
    note: z.string().max(1000).optional(),
  })
  .refine((v) => Boolean(v.identity || v.sport || v.capabilities || v.interests || v.restrictions || v.guardian), {
    message: "Send at least one section to change.",
  })
  .meta({
    id: "ProfileChangeInput",
    description:
      "An approved athlete's edit to their own profile, by §11 section. Ordinary edits publish at once; a legal name (with its matching ID), a date of birth or a guardian is a sensitive edit that re-runs the checks and is emailed to BTG admins (2S1-BE-14).",
  });
export type ProfileChangeInput = z.infer<typeof ProfileChangeInput>;

export const ProfileChangeState = z
  .enum(["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"])
  .meta({ id: "ProfileChangeState", description: "A profile edit's record: APPROVED = applied (2S1-BE-14: at once); PENDING = a legal name waiting for its ID; WITHDRAWN; DECLINED only on records from before 2S1-BE-14." });
