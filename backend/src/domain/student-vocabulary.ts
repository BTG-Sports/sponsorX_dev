/* POL-BE-123 — the student word lists, in a module with no imports.
 *
 * The contracts (contracts/student.ts) need these two lists, and the frontend
 * imports that contract file. They used to live in domain/student.ts, which
 * also loads the database client, the environment and email; anything that
 * imported the contract dragged all of that in. The website's build on
 * Railway has no generated Prisma client, so it failed to type-check from
 * 2026-11-20 until this moved. domain/student.ts re-exports both lists, so
 * every existing import keeps working.
 */

export const MASTHEAD_ROLES = ["EDITOR", "WRITER", "PHOTOGRAPHER", "VIDEO", "DESIGNER", "SALES", "CORRESPONDENT"] as const;
export type MastheadRole = (typeof MASTHEAD_ROLES)[number];

/** §5.6 Sponsor Acceptance Check — why SponsorX declined a prospect. */
export const PROSPECT_REJECTION_REASONS = [
  "CATEGORY_EXCLUSIVE", "SCHOOL_RESTRICTION", "ATHLETE_CONFLICT", "BRAND_SAFETY", "OTHER",
] as const;
export type ProspectRejectionReason = (typeof PROSPECT_REJECTION_REASONS)[number];
