/* --------------------------------------------------------------------------
   The brand-category vocabulary — P4-FE-01.

   A COPY of backend/src/domain/brand-categories.ts: the frontend cannot import
   the backend (Addendum B), and a brief's categories are the conflict-check
   input, so free text would make the check guesswork. The backend's
   alignment suite reads this file and fails if the two lists differ.
   -------------------------------------------------------------------------- */

export const BRAND_CATEGORIES = [
  "ALCOHOL",
  "TOBACCO_VAPE",
  "GAMBLING",
  "CANNABIS",
  "FIREARMS",
  "ADULT",
  "POLITICAL",
  "RELIGIOUS",
  "PHARMA",
  "CRYPTO",
  "ENERGY_DRINK",
  "SUPPLEMENTS",
  "FAST_FOOD",
  "APPAREL",
  "FOOTWEAR",
  "AUTOMOTIVE",
  "FINANCIAL",
  "TELECOM",
  "GAMING",
  "FITNESS",
  "HEALTHCARE",
  "EDUCATION",
  "LOCAL_RETAIL",
  "RESTAURANT",
  "NONPROFIT",
] as const;

export type BrandCategory = (typeof BRAND_CATEGORIES)[number];

/** "LOCAL_RETAIL" → "Local retail". */
export function categoryLabel(c: BrandCategory): string {
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
