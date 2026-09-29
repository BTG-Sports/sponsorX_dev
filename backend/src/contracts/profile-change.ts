import { z } from "./zod";
import { hasVisibleText } from "../domain/reward-state";
import { BRAND_CATEGORIES, CONTENT_CAPABILITIES } from "../domain/brand-categories";

/* --------------------------------------------------------------------------
   Post-approval profile edits — P3-BE-16, §11, §24, §26.

   What an approved athlete may PROPOSE about themselves, by §11 section. The
   shape mirrors the application's (contracts/athlete.ts) on purpose: the
   same fields, the same bounds — an edit is not a way to store something the
   application could not.

   What is deliberately absent:
     · legalName, email, phone, birthDate, ageBand — identity and age facts
       BTG verified at review. Changing them is a compliance event, done by
       BTG, not a profile edit.
     · socials — a direct write already (PUT /athletes/:id/socials), labelled
       self-reported; routing them through review would only delay a number
       nobody vouches for anyway.
     · state, tier, rates, scores — BTG's, never the athlete's.

   A key that is absent leaves the column alone; a key that is present
   replaces it (null clears an optional one). The domain then drops anything
   equal to the row as it stands, so a request records only what would change.
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
    /** A word to the reviewer — why, or what to look at. */
    note: z.string().max(1000).optional(),
  })
  .refine((v) => Boolean(v.identity || v.sport || v.capabilities || v.interests || v.restrictions), {
    message: "Send at least one section to change.",
  })
  .meta({
    id: "ProfileChangeInput",
    description:
      "An approved athlete's proposed edit to their own profile, by §11 section. Held for BTG review; the profile changes only on approval (P3-BE-16).",
  });
export type ProfileChangeInput = z.infer<typeof ProfileChangeInput>;

export const ProfileChangeState = z
  .enum(["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"])
  .meta({ id: "ProfileChangeState", description: "A proposed profile edit's lifecycle (P3-BE-16)." });

export const ProfileChangeDecisionInput = z
  .object({ reviewerNotes: z.string().max(2000).optional() })
  .meta({ id: "ProfileChangeDecisionInput", description: "Reviewer notes — required to decline, sent to the athlete verbatim." });
