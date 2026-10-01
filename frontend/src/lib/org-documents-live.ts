/* --------------------------------------------------------------------------
   2S1-FE-04 (the documents half) — an approved organization's Documents
   page (Claude Design OrgDocuments.dc.html, views list / replace).

   SCAFFOLD. The read and the writes are 2S1-BE-07 (organizations update
   their documents after approval), which is not built. Today the only
   document read is BTG's reviewer route, GET /onboarding/:id/documents
   (2S1-BE-02), and `propertyOnboarding` grants PROPERTY_MGR nothing — so a
   property manager cannot read their own files yet. The page renders the
   sample below, typed like the future API:

     GET  /property/documents                  (2S1-BE-07) the list + history
     POST /property/documents/:kind            (2S1-BE-07) replace or add one

   Pure: shapes, the sample, and every word the page derives. The upload
   limits are 2S1-BE-02's real ones (PDF, JPEG or PNG; 20 MB —
   backend/src/domain/onboarding-documents.ts MAX_DOCUMENT_BYTES).
   -------------------------------------------------------------------------- */

/** 2S1-BE-02's document kinds, so the future rows slot onto the same table. */
export type OrgDocumentKind = "RIGHTS_PROOF" | "BUSINESS_REGISTRATION" | "IDENTITY" | "OTHER";

export type OrgDocumentState = "ON_FILE" | "EXPIRED" | "MISSING";

export type ApiOrgDocument = {
  id: string;
  kind: OrgDocumentKind;
  /** "Authorization letter" — what BTG asks for. */
  name: string;
  /** One word for the file itself, for "Add the new letter". */
  noun: string;
  /** What it is, in a sentence — the dialog's first line. */
  why: string;
  /** What it's needed for, shown while it's missing. */
  neededFor: string | null;
  /** "League registration" — the sort of proof on file, when there is one. */
  label: string | null;
  required: boolean;
  state: OrgDocumentState;
  file: { filename: string; uploadedAt: string } | null;
  expiresAt: string | null;
  /** Earlier files — never deleted by a replacement (2S1-BE-07). */
  history: { filename: string; replacedAt: string }[];
};

export type ApiOrgDocuments = {
  organizationName: string;
  documents: ApiOrgDocument[];
  upload: { types: string[]; maxBytes: number };
};

/* ---------------------------------------------------------------- sample */

/** 2S1-BE-02's limits (MAX_DOCUMENT_BYTES, DOCUMENT_TYPES). */
const UPLOAD = { types: ["application/pdf", "image/jpeg", "image/png"], maxBytes: 20 * 1024 * 1024 };

export const SAMPLE_ORG_DOCUMENTS: ApiOrgDocuments = {
  organizationName: "Westfield Hawks",
  upload: UPLOAD,
  documents: [
    {
      id: "doc-registration", kind: "BUSINESS_REGISTRATION", name: "Proof of organization", noun: "registration",
      why: "A registration that shows Westfield Hawks is a real organization.", neededFor: null, label: "League registration",
      required: true, state: "ON_FILE", file: { filename: "hawks-league-registration.pdf", uploadedAt: "2026-09-18T15:00:00.000Z" },
      expiresAt: null, history: [{ filename: "hawks-league-registration-2025.pdf", replacedAt: "2026-09-18T15:00:00.000Z" }],
    },
    {
      id: "doc-authorization", kind: "RIGHTS_PROOF", name: "Authorization letter", noun: "letter",
      why: "A letter showing you can sign for Westfield Hawks.", neededFor: null, label: null,
      required: true, state: "EXPIRED", file: { filename: "hawks-authorization.pdf", uploadedAt: "2025-09-30T15:00:00.000Z" },
      expiresAt: "2026-09-30T00:00:00.000Z", history: [],
    },
    {
      id: "doc-insurance", kind: "OTHER", name: "Certificate of insurance", noun: "certificate",
      why: "Your organization's liability insurance certificate.", neededFor: "Needed to keep selling event items", label: null,
      required: true, state: "MISSING", file: null, expiresAt: null, history: [],
    },
  ],
};

/* ---------------------------------------------------------------- words */

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

/** "Sep 18" (UTC, so server and test agree). */
export function dayOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** The status chip — a mark as well as a colour, never colour alone. */
export function documentBadge(s: OrgDocumentState): { label: string; mark: string; tone: Tone } {
  if (s === "ON_FILE") return { label: "On file", mark: "✓", tone: "accent" };
  if (s === "EXPIRED") return { label: "Expired — please replace", mark: "!", tone: "warn" };
  return { label: "Missing", mark: "✕", tone: "danger" };
}

/** The line under the name: what's on file and when, or why it's needed. */
export function documentLine(d: ApiOrgDocument): string {
  if (!d.file) return d.neededFor ?? "Not uploaded yet";
  const parts = [d.label, d.file.filename];
  parts.push(d.state === "EXPIRED" && d.expiresAt ? `expired ${dayOf(d.expiresAt)}` : `added ${dayOf(d.file.uploadedAt)}`);
  return parts.filter(Boolean).join(" · ");
}

/** The row's one button: Replace a file on file, Upload a missing one.
 *  Primary when the document needs the manager, quiet when it doesn't. */
export function documentAction(d: ApiOrgDocument): { label: "Replace" | "Upload"; primary: boolean } {
  return { label: d.file ? "Replace" : "Upload", primary: d.state !== "ON_FILE" };
}

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => WORDS[n] ?? String(n);

/** The banner over the list, or null when every document is fine.
 *  "2 documents need you: one has expired and one is missing." */
export function needsYou(docs: readonly ApiOrgDocument[]): { title: string; body: string } | null {
  const expired = docs.filter((d) => d.state === "EXPIRED").length;
  const missing = docs.filter((d) => d.state === "MISSING").length;
  const n = expired + missing;
  if (!n) return null;
  const parts = [
    expired ? `${count(expired)} ${expired === 1 ? "has" : "have"} expired` : null,
    missing ? `${count(missing)} ${missing === 1 ? "is" : "are"} missing` : null,
  ].filter(Boolean);
  return {
    title: `${n} ${n === 1 ? "document needs" : "documents need"} you:`,
    body: `${parts.join(" and ")}. Your listings stay live while you fix them.`,
  };
}

/** "PDF, JPG or PNG, up to 20 MB" — from the upload limits. */
export function uploadHint(u: ApiOrgDocuments["upload"]): string {
  const names = u.types.map((t) => (t === "application/pdf" ? "PDF" : t === "image/jpeg" ? "JPG" : t === "image/png" ? "PNG" : t));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0] ?? "";
  return `${list}, up to ${Math.round(u.maxBytes / (1024 * 1024))} MB`;
}

/** The replace / upload dialog's words. */
export function dialogCopy(d: ApiOrgDocument) {
  const replacing = Boolean(d.file);
  const thing = d.name.charAt(0).toLowerCase() + d.name.slice(1);
  return {
    title: replacing ? `Replace the ${thing}` : `Upload the ${thing}`,
    lead: [d.why, d.state === "EXPIRED" && d.expiresAt ? `The one on file expired ${dayOf(d.expiresAt)}.` : null].filter(Boolean).join(" "),
    drop: replacing ? `Add the new ${d.noun}` : `Add the ${d.noun}`,
    note: replacing ? "BTG is told when you change a document. The old file moves to Earlier files." : "BTG is told when you change a document.",
    submit: replacing ? "Replace" : "Upload",
  };
}

/** Why the writes are off, for every disabled control on the page. */
export const DOCUMENTS_NOT_LIVE = "Not switched on yet — changing a document goes live with 2S1-BE-07. Nothing has been sent.";
