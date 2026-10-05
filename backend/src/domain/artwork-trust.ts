/**
 * The trusted-sponsor skip — P9-BE-22, the database half of
 * `artwork-checks-rules.ts`. Mirrors P5-BE-10's `content-trust.ts` for a
 * sponsor's ad artwork instead of an athlete's drafts.
 *
 * THE CLEAN RECORD IS READ FROM TWO CLOCKS ON THE ARTWORK, not counted from
 * the audit log. `btgPassedAt` is set when a BTG reviewer (a person) sends
 * the artwork on from BTG_REVIEW to the sponsor; `btgRevisionAt` when BTG
 * asks for changes on it, from BTG_REVIEW or — on a skipped artwork — while
 * the sponsor reviews it. The sponsor's clean count is then
 *
 *   artworks BTG passed AFTER the sponsor's latest BTG revision (any
 *   artwork of theirs, any edition, this tenant), that BTG never revised.
 *
 * The system's returns (failed checks) and the sponsor's own change requests
 * touch neither clock. A skipped artwork has no `btgPassedAt`: it neither
 * adds to the record nor, unless BTG revises it, takes from it.
 */
import type { Prisma } from "../generated/prisma/client";
import { NOT_FOR_STUDENTS } from "./student";
import { artworkSkipDecision, sponsorTrust, type ArtworkSkipDecision, type SponsorTrust } from "./artwork-checks-rules";

type Db = Pick<Prisma.TransactionClient, "editionAsset" | "user" | "$queryRaw">;

/**
 * The sponsor's artwork-trust lock, held to the end of the caller's
 * transaction. Taken by a BTG revision BEFORE it stamps `btgRevisionAt`, and
 * by an upload BEFORE it reads the record — so the two cannot interleave: an
 * upload that waits on a revision reads the record the revision just broke,
 * and one that goes first skips only on a record that was still clean.
 *
 * A row lock on the Sponsor, FOR NO KEY UPDATE: it conflicts with itself but
 * not with the key-share locks that inserts referencing the sponsor take.
 */
export async function lockSponsorArtwork(db: Pick<Db, "$queryRaw">, tenantId: string, sponsorId: string): Promise<void> {
  await db.$queryRaw`SELECT "id" FROM "Sponsor" WHERE "id" = ${sponsorId} AND "tenantId" = ${tenantId} FOR NO KEY UPDATE`;
}

/** This sponsor's artwork in this tenant. */
const ofSponsor = (tenantId: string, sponsorId: string): Prisma.EditionAssetWhereInput => ({
  tenantId,
  adSlot: { is: { tenantId, campaign: { is: { tenantId, sponsorId } } } },
});

/** The sponsor's raw clean count in this tenant (see the header). */
export async function sponsorCleanCount(db: Pick<Db, "editionAsset">, tenantId: string, sponsorId: string): Promise<number> {
  const last = await db.editionAsset.aggregate({ where: ofSponsor(tenantId, sponsorId), _max: { btgRevisionAt: true } });
  const since = last._max.btgRevisionAt;
  return db.editionAsset.count({
    where: { ...ofSponsor(tenantId, sponsorId), btgRevisionAt: null, btgPassedAt: since ? { gt: since } : { not: null } },
  });
}

/** `{ trusted, cleanStreak, needed }` — BTG's view of a sponsor's artwork record. */
export async function sponsorTrustOf(db: Pick<Db, "editionAsset">, tenantId: string, sponsorId: string): Promise<SponsorTrust> {
  return sponsorTrust(await sponsorCleanCount(db, tenantId, sponsorId));
}

export type ArtworkSkipFacts = {
  tenantId: string;
  sponsorId: string;
  sponsorCategories: string[];
  briefCategories: string[];
  /** The artwork's own BTG revision clock (null on a first upload). */
  btgRevisionAt: Date | null;
};

/** Does this passing upload skip BTG? Takes the lock, then reads the record. */
export async function decideArtworkSkip(db: Db, f: ArtworkSkipFacts): Promise<ArtworkSkipDecision> {
  /* One after the other: `db` is a transaction, one connection. The lock
     first, so the record is read after any BTG revision ahead of us. */
  await lockSponsorArtwork(db, f.tenantId, f.sponsorId);
  const clean = await sponsorCleanCount(db, f.tenantId, f.sponsorId);
  const reviewer = await db.user.findFirst({
    where: { tenantId: f.tenantId, disabledAt: null, sponsorId: f.sponsorId, roles: { has: "SPONSOR_ADMIN" } },
    select: { id: true },
  });
  return artworkSkipDecision({
    clean,
    sponsorCategories: f.sponsorCategories,
    briefCategories: f.briefCategories,
    notForStudents: NOT_FOR_STUDENTS,
    btgRevisedBefore: Boolean(f.btgRevisionAt),
    sponsorReviewer: Boolean(reviewer),
  });
}
