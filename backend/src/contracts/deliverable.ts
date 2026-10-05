import { z } from "./zod";

import { DELIVERABLE_STATES } from "../domain/deliverable-state";
import { CAPTION_MAX } from "../domain/content-check-rules";

/* --------------------------------------------------------------------------
   Deliverables on the wire — P5-BE-05, P5-BE-06, P5-BE-08, §13 steps 7–9.

   The state enum is built from the domain's list rather than retyped, for the
   same reason as every other contract here: a published schema that names a
   state the machine has never heard of is a lie that only shows up at
   runtime.
   -------------------------------------------------------------------------- */

export const DeliverableState = z.enum(DELIVERABLE_STATES).meta({
  id: "DeliverableState",
  description:
    "NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED. A revision request from either review returns the deliverable to DRAFT_SUBMITTED (§21).",
});

export const RevisionRequestInput = z
  .object({
    /** Mandatory. The athlete is being asked to redo paid work. */
    reason: z.string().min(1).max(2000),
  })
  .meta({ id: "RevisionRequestInput" });

export const MarkPublishedInput = z
  .object({
    /** Where the work went live. VERIFIED means BTG checked this link. */
    publishedUrl: z.url().max(2000),
  })
  .meta({ id: "MarkPublishedInput" });

export const CreativeUploadInput = z
  .object({
    contentType: z.string().min(1).max(255),
    /** The file's size in bytes, exactly — signed into the PUT as
     *  Content-Length, as Content-Type is. 2S8-SEC-03 made it required:
     *  every private upload URL is signed for one type and one size. */
    bytes: z.number().int().positive().max(2 * 1024 ** 3),
  })
  .meta({
    id: "CreativeUploadInput",
    description:
      "Requests a presigned PUT against the private R2 bucket. The key is chosen by the server — a client-chosen key is a client-chosen path (§11, Addendum A8). Content-Type and Content-Length are both signed into the PUT (the upload must be that type and exactly `bytes` long — the file-type check reads the type from the grant).",
  });

/** P5-BE-09 — the draft, with the caption the athlete will post. The
 *  automatic checks run on submission; a failing draft is sent back with the
 *  failures in words and never reaches BTG's queue. */
export const SubmitDraftInput = z
  .object({
    caption: z.string().max(CAPTION_MAX).nullable().optional(),
  })
  .strict()
  .meta({
    id: "SubmitDraftInput",
    description:
      "Submit — or, while it is back with the athlete, resubmit — a draft. The caption must carry every disclosure the accepted offer requires (e.g. #ad), ignoring case.",
  });

export const CreativeAssetInput = z
  .object({
    /** The key returned by the presign call, not one the client invented. */
    r2Key: z.string().min(1).max(1024),
  })
  .meta({ id: "CreativeAssetInput" });
