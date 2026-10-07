/**
 * The New sign-ups stream's pure rules (P1-ART-15) — no database, so they
 * are unit-tested on their own. The reads are signups-stream.ts.
 */

export const STREAM_KINDS = ["ORGANIZATION", "ATHLETE", "GUARDIAN", "SPONSOR"] as const;
export type StreamKind = (typeof STREAM_KINDS)[number];

export type SourceKey = "athlete" | "guardianVerified" | "guardianRejected" | "sponsorApproved" | "sponsorHeld" | "organization";

/** One row's place in the stream, before its full row is loaded. */
export type StreamKey = { source: SourceKey; kind: StreamKind; id: string; at: Date };

const KIND_ORDER: Record<StreamKind, number> = { ORGANIZATION: 0, ATHLETE: 1, GUARDIAN: 2, SPONSOR: 3 };

/**
 * Newest first across sources; ties by kind, then id descending — the same
 * order each source reads in (date desc, id desc), so the merge never
 * reorders rows within a source.
 */
export function mergeNewest(lists: readonly StreamKey[][], skip: number, take: number): StreamKey[] {
  return lists
    .flat()
    .sort((a, b) => b.at.getTime() - a.at.getTime() || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
    .slice(skip, skip + take);
}
