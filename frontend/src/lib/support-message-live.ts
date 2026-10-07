/* --------------------------------------------------------------------------
   2S1-FE-14 — one support message, on BTG's desk (/admin/support/[id]).
   The support email carries the message; when it has attachments it links
   here instead of carrying the files (2S0-SEC-01). Each file opens through
   its own five-minute, audited link. BTG admin (own tenant) and SUPER_ADMIN.

     GET /support-messages/:id                              the message and its files' names
     GET /support-messages/:id/attachments/:attachmentId    { url, expiresInSeconds }

   A message outside the caller's books is 403, not 404 — the page reads
   that as "no support message matches this link".

   Pure: shapes and the words the page derives.
   -------------------------------------------------------------------------- */

export type SupportMessageState = "DRAFT" | "QUEUED" | string;

export type ApiSupportAttachment = {
  id: string;
  filename: string;
  contentType: string;
  bytes: number;
  uploadedAt: string | null;
  /** The file reached the private bucket and was checked (2S8-SEC-03). */
  arrived: boolean;
};

export type ApiSupportMessage = {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  state: SupportMessageState;
  createdAt: string;
  queuedAt: string | null;
  topicLabel: string;
  attachments: ApiSupportAttachment[];
};

/** "PDF", "JPEG image", "PNG image" — or the type as the sender's browser named it. */
export function fileKind(contentType: string): string {
  switch (contentType) {
    case "application/pdf": return "PDF";
    case "image/jpeg": return "JPEG image";
    case "image/png": return "PNG image";
    default: return contentType || "File";
  }
}

/** "812 KB", "2.4 MB", "640 B". */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The state badge: QUEUED is on its way to the support mailbox; anything else is still being assembled. */
export function stateWords(m: Pick<ApiSupportMessage, "state" | "queuedAt">): { label: string; tone: "accent" | "warn" } {
  return m.state === "QUEUED"
    ? { label: "Sent to support", tone: "accent" }
    : { label: "Not sent yet — files still uploading", tone: "warn" };
}

/** What the Open button says about a file that can't be opened. */
export function attachmentProblem(a: Pick<ApiSupportAttachment, "arrived">): string | null {
  return a.arrived ? null : "This file never finished uploading.";
}

/** BTG's words for a refused open, from the API's error body. */
export function attachmentRefusal(status: number, body: unknown): string {
  if (status === 403) return "No support message matches this link, or it isn't in your books.";
  const e = (body as { error?: { message?: unknown } } | null)?.error;
  if (typeof e?.message === "string") return e.message;
  return `The file couldn't be opened (HTTP ${status}).`;
}
