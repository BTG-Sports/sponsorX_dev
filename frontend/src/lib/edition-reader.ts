/* --------------------------------------------------------------------------
   P9-FE-07 / P9-FE-14 — the free digital edition as
   GET /public/editions/:school/:id answers it, and what the reader draws.

   P9-BE-26 / -27 added the pictures: each piece's photo or video
   (`contents[].picture`), each sponsor's ad (`sponsors[].ad`) and the cover
   (`cover`). Each is the PUBLIC copy the worker made, and the API returns it
   only while the same rule still lets the reader show it (a right in force;
   a minor's by their guardian) — so null is normal, not an error: a piece
   with no picture is a piece of writing, and reads as one.

   Pure: the shapes, the order, and which address is safe to put in a `src`.
   -------------------------------------------------------------------------- */

export type PublicPicture = { url: string; kind: "image" | "video" };

export type PublicEdition = {
  id: string;
  label: string;
  state: "PUBLISHED_DIGITAL" | "PRINTED" | "DISTRIBUTED";
  publishTarget: string;
  printDate: string | null;
  publication: string;
  school: { slug: string; name: string; city: string | null; stateCode: string | null } | null;
  /** POL-BE-77 — text: the approved text of a student's piece, or null (a photo, a design, an older API).
   *  P9-BE-26 — picture: its photo or video, or null / absent (none, not shown, or an older API). */
  contents: Array<{ id: string; kind: string; title: string; byline: string | null; text?: string | null; picture?: PublicPicture | null }>;
  /** P9-BE-27 — the cover's public copy, once made. */
  cover?: { url: string } | null;
  /** P9-BE-26 — ad: the sponsor's artwork as a picture (a PDF ad is already one), or null / absent. */
  sponsors: Array<{ id: string; slotCode: string; kind: string; sponsor: string; ad?: { url: string } | null }>;
};

export const PIECE_KIND_WORDS: Record<string, string> = {
  ARTICLE: "Article",
  PHOTO: "Photo",
  PHOTO_PACKAGE: "Photo package",
  INTERVIEW: "Interview",
  VIDEO: "Video",
  DESIGN: "Design",
};

export const POSITION_WORDS: Record<string, string> = {
  BACK_COVER: "Back cover",
  PRESENTING: "Presenting sponsor",
  FULL: "Full page",
  HALF: "Half page",
  QUARTER: "Quarter page",
};

/** An address the reader may put in a `src`: http(s) only — never a
 *  `javascript:` or `data:` address, whatever the API answered. */
export function mediaUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export type PieceMedia = { kind: "image" | "video"; url: string; alt: string } | null;

/** A piece's photo or video as the reader draws it, or null: no picture. */
export function pieceMedia(c: PublicEdition["contents"][number]): PieceMedia {
  const url = mediaUrl(c.picture?.url);
  if (!url) return null;
  const kind = c.picture?.kind === "video" ? "video" : "image";
  const by = c.byline ? `, by ${c.byline}` : "";
  return { kind, url, alt: kind === "video" ? `Video: ${c.title}${by}` : `${c.title}${by}` };
}

/** The cover's address, or null. */
export function coverUrl(e: Pick<PublicEdition, "cover">): string | null {
  return mediaUrl(e.cover?.url);
}

export type ReaderSponsor = { id: string; sponsor: string; position: string; kind: string; ad: string | null; wide: boolean };

/* presenting and back cover first — the positions readers see most */
const ORDER = ["PRESENTING", "BACK_COVER", "FULL", "HALF", "QUARTER"];
const rank = (kind: string) => (ORDER.indexOf(kind) === -1 ? ORDER.length : ORDER.indexOf(kind));

/** The sponsors in reading order, each with its ad (or null) and its position
 *  in words. `wide`: a presenting, back-cover or full-page ad takes the full
 *  column; a half or quarter sits two across from tablet width up. */
export function readerSponsors(e: Pick<PublicEdition, "sponsors">): ReaderSponsor[] {
  return [...e.sponsors]
    .sort((a, b) => rank(a.kind) - rank(b.kind) || a.slotCode.localeCompare(b.slotCode))
    .map((s) => {
      const ad = mediaUrl(s.ad?.url);
      return {
        id: s.id,
        sponsor: s.sponsor,
        kind: s.kind,
        position: POSITION_WORDS[s.kind] ?? s.kind.replace(/_/g, " ").toLowerCase(),
        ad,
        wide: ad !== null && (s.kind === "PRESENTING" || s.kind === "BACK_COVER" || s.kind === "FULL"),
      };
    });
}

/** What the issue holds, for the line under the masthead: "3 pieces · 2 with pictures". */
export function issueLine(e: Pick<PublicEdition, "contents">): string | null {
  const n = e.contents.length;
  if (!n) return null;
  const pictured = e.contents.filter((c) => pieceMedia(c)).length;
  const pieces = `${n} piece${n === 1 ? "" : "s"}`;
  return pictured ? `${pieces} · ${pictured} with ${pictured === 1 ? "a picture or video" : "pictures or video"}` : pieces;
}
