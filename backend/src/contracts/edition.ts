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
    "PLANNING → SELLING → CLOSED → IN_PRODUCTION → PUBLISHED_DIGITAL → PRINTED → DISTRIBUTED; CANCELLED until production. Production needs contentReady, rightsCleared, revenueMet and every sold slot's artwork approved (P9-BE-16).",
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
    /** P9-BE-17 — sales open by themselves on this day; null or absent: BTG opens by hand. */
    salesOpenAt: z.iso.datetime().nullable().optional(),
  })
  .meta({ id: "EditionInput" });

/* P9-BE-17 — the day an edition's sales open by themselves (null: by hand). */
export const SalesOpenInput = z
  .object({ salesOpenAt: z.iso.datetime().nullable() })
  .strict()
  .meta({ id: "SalesOpenInput" });

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
    /** cents — rack price. P9-BE-18: leave it out to take the masthead's
     *  rate-card price; a typed price that differs from the card is 422. */
    priceCents: z.number().int().nonnegative().max(INT4_MAX).optional(),
  })
  .meta({ id: "AdSlotInput" });

/* P9-BE-18 — a masthead's rate card: a price (cents) per position kind to
   set, null to clear; kinds left out are untouched. */
const RateCardPrice = z.number().int().positive().max(INT4_MAX).nullable().optional();
export const RateCardInput = z
  .object({
    prices: z
      .object({ QUARTER: RateCardPrice, HALF: RateCardPrice, FULL: RateCardPrice, BACK_COVER: RateCardPrice, PRESENTING: RateCardPrice })
      .strict(),
  })
  .strict()
  .meta({ id: "RateCardInput" });

/* P9-BE-19 — Finance locks the split with a note; BTG admin unlocks with a reason. */
export const SplitLockInput = z.object({ note: z.string().trim().min(1).max(500) }).strict().meta({ id: "SplitLockInput" });
export const SplitUnlockInput = z.object({ reason: z.string().trim().min(1).max(500) }).strict().meta({ id: "SplitUnlockInput" });

/* P9-BE-18 — the held ad sales. */
export const SaleHoldsQuery = z
  .object({ editionId: z.string().min(1).optional(), all: z.enum(["true", "false"]).optional() })
  .meta({ id: "SaleHoldsQuery" });

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
