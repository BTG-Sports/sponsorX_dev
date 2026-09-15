import { z } from "./zod";

/**
 * Cross-cutting API shapes (P2-BE-07, Guide §02).
 *
 * Only shapes every endpoint shares live here. Domain contracts — athlete,
 * campaign, reward — are authored by the milestone that builds their endpoints
 * (B1 onwards), against the real Prisma models from P2-BE-02. Writing them now
 * would mean guessing at a schema that does not exist yet.
 */

/** RFC 9457 problem details — the one error shape every endpoint returns. */
export const ProblemDetails = z
  .object({
    type: z.string().describe("URI identifying the problem type"),
    title: z.string().describe("Short, human-readable summary"),
    status: z.int().min(400).max(599).describe("HTTP status code"),
    detail: z.string().optional().describe("Explanation specific to this occurrence"),
    instance: z.string().optional().describe("URI identifying this occurrence"),
  })
  .meta({
    id: "ProblemDetails",
    description:
      "Error envelope for every /api/v1 endpoint, following RFC 9457 problem details.",
  });

/**
 * Cursor pagination. Cursor, not offset: §19 collections are tenant-scoped and
 * change under the caller, and an offset silently skips or repeats rows when
 * that happens.
 */
export const PageQuery = z
  .object({
    cursor: z.string().optional().describe("Opaque cursor from the previous page"),
    limit: z.int().min(1).max(100).default(25).describe("Maximum items to return"),
  })
  .meta({
    id: "PageQuery",
    description: "Cursor-based pagination parameters.",
  });

export const PageMeta = z
  .object({
    nextCursor: z.string().nullable().describe("Cursor for the next page, null when exhausted"),
    hasMore: z.boolean(),
  })
  .meta({
    id: "PageMeta",
    description: "Pagination state returned alongside a collection.",
  });

/**
 * Metric provenance (§22, P0-DATA-01). Carried end to end so a screen can always
 * tell a measured number from an assumed one — the project's stated biggest
 * credibility risk.
 */
export const Provenance = z
  .enum([
    "verified-api",
    "verified-manual",
    "self-reported",
    "estimated",
    "attributed",
    "curated",
  ])
  .meta({
    id: "Provenance",
    description:
      "How a metric was obtained. Anything not verified-* must be visibly labelled in the UI.",
  });

export type ProblemDetails = z.infer<typeof ProblemDetails>;
export type PageQuery = z.infer<typeof PageQuery>;
export type PageMeta = z.infer<typeof PageMeta>;
export type Provenance = z.infer<typeof Provenance>;
