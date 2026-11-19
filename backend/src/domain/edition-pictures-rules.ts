/**
 * P9-BE-26 — which pieces of an edition the public reader may show as a
 * picture or a video. Pure: no database, no clock (`now` is passed in).
 *
 * A piece may be shown when ALL of these hold:
 *   - its edition is published (digital, printed or distributed);
 *   - it has a file, and the file is something a reader can show: an image
 *     (not SVG) or a video — or, for a sold slot's ad, also a PDF, which the
 *     worker draws as a picture of its first page;
 *   - an ad is its slot's APPROVED artwork, and the slot is still sold;
 *   - a digital right is in force for it today (the publishing gate's own
 *     question, asked again every time, so a right that ends takes it down);
 *   - when the person who made it is a minor, that digital right is their
 *     verified guardian's (grantor GUARDIAN) — a minor never consents alone.
 *
 * "Who made it" is the piece's student or athlete. Who appears IN a photo
 * isn't recorded, so a BTG or outside photo rests on its licence alone.
 */
import { isPicture } from "../lib/file-formats";
import { requiresGuardian } from "./guardian-rules";
import { PUBLISHED_STATES, type EditionState } from "./edition-state";

export type PieceRight = { grantorKind: string; mayPublishDigital: boolean; startsAt: Date; endsAt: Date | null };
export type Maker = { birthDate: Date | null; ageBand: string | null; majorityAge?: number | null } | null;

export type Piece = {
  kind: string;
  r2Key: string | null;
  fileType: string | null;
  /** Ad artwork: its slot, review state and type. */
  adSlotId: string | null;
  slotSold: boolean;
  reviewState: string | null;
  artworkContentType: string | null;
  rights: PieceRight[];
  maker: Maker;
};

const inForce = (r: PieceRight, now: Date) => r.mayPublishDigital && r.startsAt <= now && (r.endsAt === null || r.endsAt > now);

/** The type a piece's public copy is made from: an ad's artwork type, otherwise its file's. */
export function sourceType(p: Pick<Piece, "adSlotId" | "fileType" | "artworkContentType">): string | null {
  return p.adSlotId ? p.artworkContentType : p.fileType;
}

/** Whether the reader may show this piece now — and so whether it should have a public copy. */
export function mayShow(p: Piece, editionState: EditionState | string, now: Date): boolean {
  if (!(PUBLISHED_STATES as readonly string[]).includes(editionState)) return false;
  if (!p.r2Key) return false;
  const type = sourceType(p);
  if (p.adSlotId) {
    if (!p.slotSold || p.reviewState !== "APPROVED") return false;
    if (!isPicture(type) && type !== "application/pdf") return false;
  } else if (!isPicture(type)) {
    return false;
  }
  const rights = p.rights.filter((r) => inForce(r, now));
  if (!rights.length) return false;
  if (p.maker && requiresGuardian(p.maker)) return rights.some((r) => r.grantorKind === "GUARDIAN");
  return true;
}
