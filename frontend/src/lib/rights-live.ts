import type { ApiEditionState } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   P9-FE-09 — the rights ledger and clearance queue as
   GET /editions/:id/rights-ledger answers them.

   Clearance is the API's (rightsGap — the query the production transition
   itself runs), never recomputed here: `clearedDigital` is "a right covering
   digital is in force on the publish target", `clearedPrint` the same for
   print on the print date. The queue is simply every asset one of those two
   is false for, with who can grant what is missing.
   -------------------------------------------------------------------------- */

export type GrantorKind = "STUDENT" | "ATHLETE" | "GUARDIAN" | "BTG" | "THIRD_PARTY";
export type SourceKind = "STUDENT" | "ATHLETE" | "BTG" | "THIRD_PARTY";
/** P9-BE-25 — DESIGN: a page or a graphic a student designed (an approved design assignment). */
export type AssetKind = "ARTICLE" | "PHOTO" | "PHOTO_PACKAGE" | "INTERVIEW" | "VIDEO" | "AD_CREATIVE" | "DESIGN";

/** Every kind in words — the rights page's lists and the add-content form. */
export const ASSET_KIND_WORDS: Record<AssetKind, string> = {
  ARTICLE: "Article",
  PHOTO: "Photo",
  PHOTO_PACKAGE: "Photo package",
  INTERVIEW: "Interview",
  VIDEO: "Video",
  AD_CREATIVE: "Ad creative",
  DESIGN: "Design",
};

/* --------------------------------------------------------------------------
   P9-FE-13 — a piece of edition content and its file (P9-BE-25).

     POST /editions/:id/assets/uploads   {contentType, bytes} → {url, key, contentType}
     POST /editions/:id/assets           {…, r2Key, fileName}  add a piece with its file
     PUT  /edition-assets/:id/file       {r2Key, fileName}     a file for a piece added by title
     GET  /edition-assets/:id/file       → {url, download}     a short signed read
     GET  /editions/:id/assets           the list, with hasFile / fileType / fileBytes / fileName

   Any format, up to 2 GB. The API decides what a file is allowed to be and
   whether a piece may take one; these are the words and the two obvious
   cases the page doesn't offer (ad artwork is its sponsor's upload; a
   published or cancelled edition takes no new file).
   -------------------------------------------------------------------------- */

/** GET /editions/:id/assets — one piece, with whether it has a file and what. */
export type ApiContentPiece = {
  id: string;
  kind: AssetKind;
  title: string;
  sourceKind: SourceKind;
  studentId: string | null;
  campaignId: string | null;
  hasFile: boolean;
  fileType: string | null;
  fileBytes: number | null;
  fileName: string | null;
};

/** Published or cancelled: a piece's file can no longer be added (the API's CONTENT_FINAL_STATES). */
export const CONTENT_FINAL_STATES: readonly string[] = ["PUBLISHED_DIGITAL", "PRINTED", "DISTRIBUTED", "CANCELLED"];

/** A file's type in a word a person uses: "PDF", "JPG photo", "MP4 video", "InDesign file" … */
export function fileTypeWords(type: string | null | undefined, name?: string | null): string {
  const t = (type ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = (name ?? "").includes(".") ? (name ?? "").split(".").pop()!.toLowerCase() : "";
  if (t === "application/pdf") return "PDF";
  if (t.startsWith("image/")) return `${(t.slice(6).replace("jpeg", "jpg").replace("svg+xml", "svg") || "image").toUpperCase()} picture`;
  if (t.startsWith("video/")) return `${(ext || t.slice(6).replace("quicktime", "mov")).toUpperCase()} video`;
  if (t.startsWith("audio/")) return `${(ext || t.slice(6)).toUpperCase()} audio`;
  const known: Record<string, string> = { indd: "InDesign file", psd: "Photoshop file", ai: "Illustrator file", docx: "Word document", doc: "Word document", zip: "ZIP archive", txt: "Text file" };
  if (known[ext]) return known[ext];
  return ext ? `${ext.toUpperCase()} file` : "File";
}

/** "cover-story.indd · InDesign file · 48 MB" — or "No file yet". */
export function pieceFileLine(p: Pick<ApiContentPiece, "hasFile" | "fileType" | "fileBytes" | "fileName">, size: (bytes: number) => string): string {
  if (!p.hasFile) return "No file yet";
  return [p.fileName, fileTypeWords(p.fileType, p.fileName), p.fileBytes ? size(p.fileBytes) : null].filter(Boolean).join(" · ");
}

/** Whether the page offers "Add its file" on this piece. The API still decides
 *  (a student's piece carries its draft's file, and says so). */
export function mayAttachFile(p: Pick<ApiContentPiece, "hasFile" | "kind">, editionState: string): boolean {
  return !p.hasFile && p.kind !== "AD_CREATIVE" && !CONTENT_FINAL_STATES.includes(editionState);
}

/** The pieces in the order the page lists them: what still has no file first, then as added. */
export function contentPieces(pieces: ApiContentPiece[]): ApiContentPiece[] {
  return [...pieces].sort((a, b) => Number(a.hasFile) - Number(b.hasFile));
}

export type ApiRight = {
  id: string;
  grantorKind: GrantorKind;
  grantorRef: string;
  mayPublishDigital: boolean;
  mayPublishPrint: boolean;
  mayPromote: boolean;
  mayReuseCommercially: boolean;
  territory: string | null;
  startsAt: string;
  endsAt: string | null;
  attribution: string | null;
  acceptanceId: string | null;
  licenseRef: string | null;
  /** P9-BE-22 / -23 — recorded by the system, and on what; null (or absent,
   *  from an API before it) when BTG recorded it by hand. */
  autoBasis?: AutoBasis | null;
};

export type AutoBasis = "AD_APPROVAL" | "CONSENT";

/** "Recorded automatically" and why — or null for a grant BTG typed in. */
export function autoRecorded(r: Pick<ApiRight, "autoBasis">): { label: string; hint: string } | null {
  if (r.autoBasis === "AD_APPROVAL") {
    return { label: "Recorded automatically", hint: "From the sponsor's approval of their own ad artwork — digital and print, for this edition." };
  }
  if (r.autoBasis === "CONSENT") {
    return { label: "Recorded automatically", hint: "From the maker's consent on file — what that consent covers, nothing more." };
  }
  return null;
}

export type ApiRightsAsset = {
  id: string;
  kind: AssetKind;
  title: string;
  sourceKind: SourceKind;
  studentId: string | null;
  athleteId: string | null;
  campaignId: string | null;
  clearedDigital: boolean;
  clearedPrint: boolean;
  /** absent for a role with no contentRight read */
  rights?: ApiRight[];
};

export type ApiRightsLedger = {
  edition: { id: string; label: string; state: ApiEditionState; publishTarget: string; printDate: string | null };
  assets: ApiRightsAsset[];
};

/** Consent grantors point at a signed acceptance; the rest at a licence. */
export const CONSENT_GRANTORS: GrantorKind[] = ["STUDENT", "ATHLETE", "GUARDIAN"];

export type QueueItem = {
  asset: ApiRightsAsset;
  missing: string;
  /** Who can grant it, by the asset's source. */
  grantedBy: string;
};

export function clearanceQueue(assets: ApiRightsAsset[]): QueueItem[] {
  return assets
    .filter((a) => !a.clearedDigital || !a.clearedPrint)
    .map((a) => ({
      asset: a,
      missing: !a.clearedDigital && !a.clearedPrint ? "Digital + print" : !a.clearedDigital ? "Digital" : "Print",
      grantedBy:
        a.sourceKind === "STUDENT"
          ? "the student's consent (their guardian's, if a minor)"
          : a.sourceKind === "ATHLETE"
            ? "the athlete's consent (their guardian's, if a minor)"
            : a.sourceKind === "BTG"
              ? "a SponsorX licence record"
              : "the third party's licence",
    }));
}

export function coverage(assets: ApiRightsAsset[]) {
  return {
    total: assets.length,
    digital: assets.filter((a) => a.clearedDigital).length,
    print: assets.filter((a) => a.clearedPrint).length,
  };
}

/** One ledger row per grant, with its asset. */
export function ledgerRows(assets: ApiRightsAsset[]): Array<ApiRight & { asset: string; assetKind: AssetKind }> {
  return assets.flatMap((a) => (a.rights ?? []).map((r) => ({ ...r, asset: a.title, assetKind: a.kind })));
}

/** The forward move from each state — the menu the advance control offers.
 *  The API's state machine decides; CANCELLED is deliberately not offered
 *  from a one-click control. */
export const NEXT_STATE: Partial<Record<ApiEditionState, ApiEditionState>> = {
  PLANNING: "SELLING",
  SELLING: "CLOSED",
  CLOSED: "IN_PRODUCTION",
  IN_PRODUCTION: "PUBLISHED_DIGITAL",
  PUBLISHED_DIGITAL: "PRINTED",
  PRINTED: "DISTRIBUTED",
};

export const STATE_VERB: Partial<Record<ApiEditionState, string>> = {
  SELLING: "Open for sale",
  CLOSED: "Close ads",
  IN_PRODUCTION: "Send to production",
  PUBLISHED_DIGITAL: "Publish digital",
  PRINTED: "Mark printed",
  DISTRIBUTED: "Mark distributed",
};
