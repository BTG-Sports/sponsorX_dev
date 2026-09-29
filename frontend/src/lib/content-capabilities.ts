/* --------------------------------------------------------------------------
   The content-capability vocabulary — §11 §4, P3-BE-16.

   A COPY of backend/src/domain/brand-categories.ts's CONTENT_CAPABILITIES:
   the frontend cannot import the backend (Addendum B). Closed, like the
   brand categories, because capabilities feed matching.
   -------------------------------------------------------------------------- */

export const CONTENT_CAPABILITIES = [
  "PHOTO",
  "SHORT_FORM_VIDEO",
  "LONG_FORM_VIDEO",
  "LIVE_STREAM",
  "PODCAST",
  "WRITTEN",
  "IN_PERSON_APPEARANCE",
  "PRODUCT_REVIEW",
  "COACHING_CLINIC",
] as const;

export type ContentCapability = (typeof CONTENT_CAPABILITIES)[number];

/** "SHORT_FORM_VIDEO" → "Short form video". */
export function capabilityLabel(c: string): string {
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
