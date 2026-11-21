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

/**
 * The age-restricted categories — a COPY of the backend's SENSITIVE_CATEGORIES
 * (P4-BE-11); the same alignment suite checks the two match.
 *
 * POL-FE-122: "Select everything" on the athlete's Brands step leaves these
 * out. That step shows on the public page, including a minor's, so each of
 * these stays a deliberate tap (owner, 2026-11-21).
 */
export const SENSITIVE_CATEGORIES = ["ALCOHOL", "TOBACCO_VAPE", "CANNABIS", "GAMBLING", "FIREARMS", "ADULT"] as const satisfies readonly BrandCategory[];

/** Every category that is not age-restricted, in the vocabulary's order. */
export const EVERYDAY_CATEGORIES: readonly BrandCategory[] = BRAND_CATEGORIES.filter(
  (c) => !(SENSITIVE_CATEGORIES as readonly string[]).includes(c),
);

/** "LOCAL_RETAIL" → "Local retail". */
export function categoryLabel(c: BrandCategory): string {
  const s = c.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
