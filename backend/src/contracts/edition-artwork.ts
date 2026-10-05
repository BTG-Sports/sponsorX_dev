import { z } from "./zod";

/* --------------------------------------------------------------------------
   P9-BE-22 — edition ad artwork checked on upload, on the wire.
   -------------------------------------------------------------------------- */

/**
 * The artwork presign. Like CreativeUploadInput (the server picks the key),
 * plus the file's size: the type and the size are signed into the PUT, so the
 * stored object is exactly what the grant recorded, and the upload's checks
 * read them from the grant. The checks — not this schema — decide whether a
 * type or size is acceptable, so a refused file is sent back with the reason
 * in words rather than failing here; the ceiling below only stops a
 * credential for something absurd.
 */
export const ArtworkUploadInput = z
  .object({
    contentType: z.string().min(1).max(255),
    /** The file's size in bytes, exactly. */
    bytes: z.number().int().positive().max(2 * 1024 ** 3),
  })
  .meta({
    id: "ArtworkUploadInput",
    description:
      "Presign a PUT of a sold slot's artwork to the private bucket. Content-Type and Content-Length are signed: the upload must be that type and exactly that many bytes. The server chooses the key.",
  });
