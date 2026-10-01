/* --------------------------------------------------------------------------
   2S1-FE-04 (the documents half) — an approved organization's Documents
   page (Claude Design OrgDocuments.dc.html, views list / replace).

   LIVE on 2S1-BE-07 (organizations update their documents after approval):

     GET    /property/documents                    the list, what's missing, the history
     POST   /property/documents                    a private-bucket PUT for a new or replacement file
     POST   /property/documents/:documentId/confirm   counted once it has arrived; the old file moves to history
     DELETE /property/documents/:documentId        off the list, kept in the history

   Only the organization's own manager reaches these (the API scopes them to
   the signed-in PROPERTY_MGR's own property). Every change re-runs the
   checklist and emails BTG; a required document removed without a
   replacement flags the organization for BTG and suspends nothing.

   Pure: the API's shapes and every word the page derives. The kinds and
   their words mirror backend/src/domain/onboarding-rules.ts DOCUMENT_LABEL.
   -------------------------------------------------------------------------- */

export type OrgDocumentKind = "RIGHTS_PROOF" | "BUSINESS_REGISTRATION" | "IDENTITY" | "REPRESENTATION_AGREEMENT" | "OTHER";

export type OrgDocumentState = "ON_FILE" | "EXPIRED" | "MISSING";

/** One row of GET /property/documents — a requirement (or an extra paper), what's on file, its history. */
export type ApiOrgDocument = {
  /** "IDENTITY", "BUSINESS_REGISTRATION:VA", or "doc:<id>" for an extra paper. */
  key: string;
  kind: OrgDocumentKind | string;
  stateCode: string | null;
  required: boolean;
  /** The API's label, e.g. "Business registration (VA)". */
  label: string;
  state: OrgDocumentState;
  file: { documentId: string; filename: string; uploadedAt: string; expiresOn: string | null } | null;
  /** Earlier files — never deleted by a replacement or a removal (2S1-BE-07). */
  history: { documentId: string; filename: string; uploadedAt: string; endedAt: string; ended: "REPLACED" | "REMOVED" }[];
};

export type ApiOrgDocuments = {
  organizationName: string;
  orgType: string;
  state: string;
  /** Set by the API when a required document is missing after a change — BTG has been told. */
  flags: string[];
  documents: ApiOrgDocument[];
  /** Grants not yet confirmed — a half-finished upload can be checked again. */
  pending: { documentId: string; kind: string; stateCode: string | null; filename: string; replacesId: string | null }[];
  upload: { types: string[]; maxBytes: number; maxIdBytes: number };
};

/* ---------------------------------------------------------------- words */

type Tone = "neutral" | "primary" | "accent" | "danger" | "warn";

const WORDS: Record<string, { noun: string; why: string; neededFor: string }> = {
  IDENTITY: { noun: "ID", why: "A government ID for the person who signs for your organization.", neededFor: "Needed to keep selling" },
  RIGHTS_PROOF: { noun: "proof", why: "Proof you have the rights to sell your organization's inventory.", neededFor: "Needed to keep selling" },
  BUSINESS_REGISTRATION: { noun: "registration", why: "A business registration in your organization's name.", neededFor: "Needed to keep selling" },
  REPRESENTATION_AGREEMENT: { noun: "agreement", why: "An agreement showing your agency represents the athletes it lists.", neededFor: "Needed to keep selling" },
  OTHER: { noun: "document", why: "Anything else that helps BTG.", neededFor: "Not required" },
};

/** The kinds a manager can add from "Add a document". */
export const ADDABLE_KINDS: readonly { kind: OrgDocumentKind; label: string }[] = [
  { kind: "IDENTITY", label: "Government ID of the person signing" },
  { kind: "RIGHTS_PROOF", label: "Proof of the rights to sell your inventory" },
  { kind: "BUSINESS_REGISTRATION", label: "Business registration" },
  { kind: "REPRESENTATION_AGREEMENT", label: "Representation agreement with your athletes" },
  { kind: "OTHER", label: "Other document" },
];

export const wordsFor = (kind: string) => WORDS[kind] ?? WORDS.OTHER!;

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
  if (!d.file) return d.required ? wordsFor(d.kind).neededFor : "Not uploaded yet";
  const parts = [d.file.filename];
  if (d.state === "EXPIRED" && d.file.expiresOn) parts.push(`expired ${dayOf(d.file.expiresOn)}`);
  else parts.push(`added ${dayOf(d.file.uploadedAt)}`, ...(d.file.expiresOn ? [`valid until ${dayOf(d.file.expiresOn)}`] : []));
  return parts.join(" · ");
}

/** One line of Earlier files. */
export function historyLine(h: ApiOrgDocument["history"][number]): string {
  return `${h.ended === "REPLACED" ? "Replaced" : "Removed"} ${dayOf(h.endedAt)}`;
}

/** The row's one button: Replace a file on file, Upload a missing one.
 *  Primary when the document needs the manager, quiet when it doesn't. */
export function documentAction(d: ApiOrgDocument): { label: "Replace" | "Upload"; primary: boolean } {
  return { label: d.file ? "Replace" : "Upload", primary: d.state !== "ON_FILE" };
}

const COUNT = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => COUNT[n] ?? String(n);

/** The banner over the list, or null when every document is fine.
 *  "2 documents need you: one has expired and one is missing." */
export function needsYou(docs: readonly ApiOrgDocument[]): { title: string; body: string } | null {
  const expired = docs.filter((d) => d.state === "EXPIRED").length;
  const missing = docs.filter((d) => d.state === "MISSING" && d.required).length;
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

/** "PDF, JPG or PNG, up to 20 MB (an ID up to 10 MB)" — from the upload limits. */
export function uploadHint(u: ApiOrgDocuments["upload"], kind?: string): string {
  const names = u.types.map((t) => (t === "application/pdf" ? "PDF" : t === "image/jpeg" ? "JPG" : t === "image/png" ? "PNG" : t));
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0] ?? "";
  const mb = (b: number) => Math.round(b / (1024 * 1024));
  if (kind === "IDENTITY") return `${list}, up to ${mb(u.maxIdBytes)} MB`;
  return `${list}, up to ${mb(u.maxBytes)} MB${kind ? "" : ` (an ID up to ${mb(u.maxIdBytes)} MB)`}`;
}

/** Why this file can't be sent, or null — the API checks again. */
export function checkFile(u: ApiOrgDocuments["upload"], kind: string, file: { type: string; size: number }): string | null {
  if (!u.types.includes(file.type)) return "Documents are PDF, JPEG or PNG.";
  if (file.size < 1) return "That file is empty.";
  const max = kind === "IDENTITY" ? u.maxIdBytes : u.maxBytes;
  if (file.size > max) return `${kind === "IDENTITY" ? "An ID" : "A document"} is at most ${Math.round(max / (1024 * 1024))} MB.`;
  return null;
}

/** The replace / upload dialog's words. */
export function dialogCopy(d: Pick<ApiOrgDocument, "kind" | "label" | "file" | "state">) {
  const replacing = Boolean(d.file);
  const w = wordsFor(d.kind);
  const thing = d.label.charAt(0).toLowerCase() + d.label.slice(1);
  return {
    title: replacing ? `Replace the ${thing}` : `Upload the ${thing}`,
    lead: [w.why, d.state === "EXPIRED" && d.file?.expiresOn ? `The one on file expired ${dayOf(d.file.expiresOn)}.` : null].filter(Boolean).join(" "),
    drop: replacing ? `Add the new ${w.noun}` : `Add the ${w.noun}`,
    note: replacing ? "BTG is told when you change a document. The old file moves to Earlier files." : "BTG is told when you change a document.",
    submit: replacing ? "Replace" : "Upload",
  };
}

/** What removing a document does, said before it happens. */
export function removeWarning(d: Pick<ApiOrgDocument, "required">): string {
  return d.required
    ? "BTG is told, and your organization is flagged for BTG until you upload a new one. Your listings stay live. The file moves to Earlier files."
    : "BTG is told. The file moves to Earlier files.";
}
