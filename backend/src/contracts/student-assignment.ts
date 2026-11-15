import { z } from "./zod";

/* --------------------------------------------------------------------------
   P9-BE-24 — student assignments and the advisor's content review, on the
   wire. The rules (who, when, which school) are the domain's —
   domain/student-assignment.ts; these only shape the request.
   -------------------------------------------------------------------------- */

export const AssignmentInput = z
  .object({
    studentId: z.string().min(1),
    kind: z.enum(["ARTICLE", "INTERVIEW", "PHOTO", "DESIGN"]),
    title: z.string().trim().min(1).max(200),
    section: z.string().trim().max(80).nullish(),
    brief: z.string().trim().min(1).max(4000),
    /** ISO date or date-time; the day the advisor wants it by. */
    dueAt: z.string().datetime({ offset: true }).or(z.string().date()).nullish(),
  })
  .meta({ id: "AssignmentInput", description: "Give an ACTIVE student at the edition's school a piece of the edition to make." });

export const DraftUploadInput = z
  .object({
    contentType: z.string().min(1).max(255),
    /** The file's size in bytes, exactly — signed into the PUT. */
    bytes: z.number().int().positive().max(2 * 1024 ** 3),
  })
  .meta({ id: "DraftUploadInput", description: "Presign a PUT of the draft's file (JPG, PNG or PDF, up to 20 MB) to the private bucket. The server chooses the key." });

export const DraftSubmitInput = z
  .object({
    text: z.string().max(40_000).nullish(),
    /** A key a draft upload presign returned for this assignment. */
    r2Key: z.string().max(512).nullish(),
  })
  .meta({ id: "DraftSubmitInput", description: "The student's draft: words, the uploaded file's key, or both." });

export const AssignmentRevisionInput = z
  .object({ note: z.string().max(4000) })
  .meta({ id: "AssignmentRevisionInput", description: "What the student should change — they read it word for word." });
