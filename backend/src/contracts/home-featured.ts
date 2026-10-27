import { z } from "./zod";
import { HOME_ACTIONS, HOME_REQUIRED, MAX_PHOTO_BYTES, PHOTO_TYPES } from "../domain/home-featured-rules";

/* --------------------------------------------------------------------------
   The home page's Featured athletes panel and the athlete's profile photo —
   P8-BE-08. The rules live in domain/home-featured.ts; these are the shapes.
   -------------------------------------------------------------------------- */

export const PublicFeaturedAthlete = z
  .object({
    slug: z.string(),
    displayName: z.string(),
    sport: z.string(),
    position: z.string(),
    city: z.string(),
    stateCode: z.string(),
    photoUrl: z.string(),
    followers: z.number().int(),
    verified: z.boolean().describe("The follower count's account is verified; otherwise it is self-reported."),
  })
  .meta({ id: "PublicFeaturedAthlete", description: "One athlete on the home page's Featured athletes panel: only what their public page shows." });

export const PublicFeaturedAthletes = z
  .object({ athletes: z.array(PublicFeaturedAthlete).max(4), readAt: z.string() })
  .meta({ id: "PublicFeaturedAthletes", description: "At most four. Empty when nobody qualifies — the panel hides." });

export const AthletePhotoUploadInput = z
  .object({
    contentType: z.enum(Object.keys(PHOTO_TYPES) as [keyof typeof PHOTO_TYPES, ...(keyof typeof PHOTO_TYPES)[]]),
    bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
  })
  .meta({ id: "AthletePhotoUploadInput", description: "A profile photo to upload: JPEG, PNG or WebP, at most 5 MB." });

export const AthletePhotoInput = z
  .object({ photoKey: z.string().min(1).max(300).nullable() })
  .meta({ id: "AthletePhotoInput", description: "The uploaded photo's key from POST /athletes/{id}/photo, or null to clear it." });

export const HomePageActionInput = z
  .object({ action: z.enum(HOME_ACTIONS) })
  .meta({ id: "HomePageActionInput", description: "pin / unpin, remove / restore, and approve / unapprove a minor." });

export const HomeFeatureStatus = z
  .object({
    athleteId: z.string(),
    onHomePage: z.boolean(),
    eligible: z.boolean(),
    blocks: z.array(z.enum(["not_active", "incomplete", "minor_not_approved", "removed"])),
    missing: z.array(z.enum(HOME_REQUIRED)),
    minor: z.boolean(),
    pinned: z.boolean(),
    removed: z.boolean(),
    approved: z.boolean(),
    photoUrl: z.string().nullable(),
  })
  .meta({ id: "HomeFeatureStatus", description: "Whether the athlete is on the home page now, and if not, every reason why." });
