/**
 * The category vocabulary — P3-BE-05, §11 §5-§6, §26.
 *
 * Pure, like `athlete-state.ts` and `guardian-rules.ts`: it imports nothing,
 * because a conflict check compares an athlete's restrictions against a
 * sponsor's categories and both sides need this list without either pulling
 * in a database client. B3's sponsor and brief models read the same file.
 */

/**
 * §11 §5 and §6's vocabulary, and §26's conflict categories — one list, not
 * two. A sponsor's category and an athlete's restriction have to be drawn
 * from the same set or they can never be compared.
 */
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

/** §11 §4 — what the athlete can actually produce. */
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
