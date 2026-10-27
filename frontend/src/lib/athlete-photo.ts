/* --------------------------------------------------------------------------
   The athlete's profile photo — P8-FE-10, on P8-BE-08's upload.

   A photo is one of the twelve fields an athlete needs before the home
   page's Featured athletes panel can list them. The API pins the upload to
   the type and size declared here (POST /athletes/{id}/photo), so the
   browser checks them first and names the problem in plain words instead of
   letting a PUT fail.

   Pure, so the editor and its tests share it.
   -------------------------------------------------------------------------- */

/** As backend domain/home-featured-rules.ts: PHOTO_TYPES and MAX_PHOTO_BYTES. */
export const PHOTO_UPLOAD = {
  types: ["image/jpeg", "image/png", "image/webp"] as const,
  maxBytes: 5 * 1024 * 1024,
  /** The file picker's `accept`. */
  accept: "image/jpeg,image/png,image/webp",
};

export type PhotoContentType = (typeof PHOTO_UPLOAD.types)[number];

/** Why this file can't be the photo, or null when it can. */
export function photoFileProblem(file: { type: string; size: number }): string | null {
  if (!(PHOTO_UPLOAD.types as readonly string[]).includes(file.type)) return "Use a JPEG, PNG or WebP photo.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > PHOTO_UPLOAD.maxBytes) return "That photo is over 5 MB. Use a smaller one.";
  return null;
}
