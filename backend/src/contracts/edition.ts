import { INT4_MAX, z } from "./zod";

import { EDITION_STATES } from "../domain/edition-state";
import { ENGAGEMENT_TYPES, TARGET_KINDS } from "../domain/edition";

/* --------------------------------------------------------------------------
   SponsorX NEXT editions on the wire — P9-BE-02, -03, -06, -12.
   Enums come from the domain's own lists, as everywhere else here.
   -------------------------------------------------------------------------- */

export const EditionState = z.enum(EDITION_STATES).meta({
  id: "EditionState",
  description:
    "PLANNING → SELLING → CLOSED → IN_PRODUCTION → PUBLISHED_DIGITAL → PRINTED → DISTRIBUTED; CANCELLED until production. Production needs contentReady, rightsCleared and revenueMet.",
});

export const AdSlotKind = z.enum(["QUARTER", "HALF", "FULL", "BACK_COVER", "PRESENTING"]).meta({
  id: "AdSlotKind",
  description: "The position kind. An edition has at most one BACK_COVER and one PRESENTING — enforced by Postgres.",
});

export const EngagementType = z.enum(ENGAGEMENT_TYPES).meta({
  id: "EngagementType",
  description: "QR_SCAN is print; the rest are digital. Reported separately, never pooled (spec §6.4).",
});

export const PublicationInput = z
  .object({
    name: z.string().min(1).max(200),
    /** The school's Property, or null for the regional DMV edition. */
    propertyId: z.string().min(1).nullable(),
  })
  .meta({ id: "PublicationInput" });

export const EditionInput = z
  .object({
    label: z.string().min(1).max(100),
    closeDate: z.iso.datetime(),
    publishTarget: z.iso.datetime(),
    printDate: z.iso.datetime().nullable().optional(),
    pageCount: z.number().int().positive().max(500).nullable().optional(),
    /** cents — the minimum viable edition */
    thresholdCents: z.number().int().nonnegative().max(INT4_MAX),
  })
  .meta({ id: "EditionInput" });

export const EditionTransitionInput = z.object({ to: EditionState }).meta({ id: "EditionTransitionInput" });

/* rightsCleared is not here: it is computed from the rights ledger at the
   transition (P9-BE-10), never typed in. */
export const EditionConditionsInput = z
  .object({ contentReady: z.boolean().optional() })
  .strict()
  .meta({ id: "EditionConditionsInput" });

export const AdSlotInput = z
  .object({
    slotCode: z.string().min(1).max(40),
    kind: AdSlotKind,
    /** cents — rack price */
    priceCents: z.number().int().nonnegative().max(INT4_MAX),
  })
  .meta({ id: "AdSlotInput" });

export const AdSaleInput = z.object({ campaignId: z.string().min(1) }).meta({ id: "AdSaleInput" });

export const EditionEventInput = z
  .object({
    type: EngagementType,
    targetKind: z.enum(TARGET_KINDS),
    targetRef: z.string().min(1).max(200),
    city: z.string().max(100).nullable().optional(),
    region: z.string().max(100).nullable().optional(),
  })
  .meta({ id: "EditionEventInput" });

/* P9-BE-16 — a sold slot's ad artwork on the approval board. The upload
   itself reuses CreativeUploadInput (deliverable.ts): same presign, same
   private bucket, key chosen by the server. */

export const ArtworkInput = z
  .object({
    /** The key the slot's presign call returned — any other is refused. */
    r2Key: z.string().min(1).max(1024),
    title: z.string().min(1).max(300).nullable().optional(),
  })
  .meta({ id: "ArtworkInput", description: "Record an uploaded file as the slot's artwork. The first upload puts it on the board (DRAFT_SUBMITTED); a later one, while it is still DRAFT_SUBMITTED, replaces the file and answers any open change request." });

export const ArtworkRevisionInput = z
  .object({
    /** Mandatory. Whoever supplies the artwork gets these words. */
    reason: z.string().min(1).max(2000),
  })
  .meta({ id: "ArtworkRevisionInput" });
