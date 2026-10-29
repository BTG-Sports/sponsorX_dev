/* --------------------------------------------------------------------------
   Document checks on screen — P8-FE-11, over P8-BE-09 / -10 / -11.

   Three things the API now says about a document, and the words for each:

   1. A confirm call can refuse the file (422) with a reason a person can act
      on — "That photo is too dark to read. Retake it in good light, with no
      shadow on it." The upload shows it with a Try again (a new file pick).
      While the confirm runs the server opens and reads the file, which
      takes a few seconds: "Checking your document…".

   2. BTG sent a document back (P8-BE-10): `returned: { at, reason }` on
      BTG's views (`returnedAt` / `returnedReason` on the organisation's own
      list). The person reads "BTG asked for a new one: …" and uploads again;
      BTG sees it was sent back and can't open it (its file is gone).

   3. What reading it found (P8-BE-11): `check`, null when it was never read,
      else { state: CLEAR | FLAGGED | UNREAD, findings, checkedAt }. BTG
      reads Clear, Flagged with each finding, or "Couldn't read — check it by
      eye", and can send the document back with a reason (5–1,000
      characters, the API's DocumentSendBackInput).

   Pure: shapes and words only. Each BTG desk's own lib adds these fields to
   its document type; the components in components/document-check.tsx draw
   them.
   -------------------------------------------------------------------------- */

export type DocumentCheckState = "CLEAR" | "FLAGGED" | "UNREAD";

/** `check` on a document in any BTG view: null when it was never read. */
export type ApiDocumentCheck = { state: DocumentCheckState; findings: string[]; checkedAt: string | null } | null;

/** `returned` on a document BTG sent back: its file is gone. */
export type ApiDocumentReturned = { at: string; reason: string } | null;

type Tone = "accent" | "warn" | "neutral" | "danger";

/** The words BTG reads beside a document, or null when it was never read. */
export function checkBadge(check: ApiDocumentCheck): { label: string; tone: Tone; mark: string } | null {
  if (!check) return null;
  if (check.state === "CLEAR") return { label: "Clear", tone: "accent", mark: "✓" };
  if (check.state === "FLAGGED") return { label: "Flagged", tone: "warn", mark: "!" };
  return { label: "Couldn't read — check it by eye", tone: "neutral", mark: "?" };
}

/** The findings BTG reads under a flagged document; nothing for the rest. */
export function checkFindings(check: ApiDocumentCheck): string[] {
  if (!check || check.state !== "FLAGGED") return [];
  return check.findings.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
}

/** A document that needs a person: flagged, or unreadable. */
export function needsEyes(check: ApiDocumentCheck): boolean {
  return check !== null && check.state !== "CLEAR";
}

/** "Sep 18" (UTC, so server and test agree). */
function dayOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** What BTG reads on a document it sent back: when, and the reason it gave. */
export function returnedLine(returned: ApiDocumentReturned): string | null {
  if (!returned) return null;
  const when = dayOf(returned.at);
  const reason = returned.reason.trim();
  return `Sent back${when ? ` ${when}` : ""}${reason ? ` — ${reason}` : ""}`;
}

/** What the person reads on a document BTG sent back, over the upload. */
export function returnedAsk(returned: ApiDocumentReturned): string | null {
  if (!returned) return null;
  const reason = returned.reason.trim();
  return reason ? `BTG asked for a new one: ${reason}` : "BTG asked for a new one.";
}

/** A document on the organisation's own list (`returnedAt` / `returnedReason`), as `returned`. */
export function returnedOf(d: { returnedAt?: string | null; returnedReason?: string | null }): ApiDocumentReturned {
  if (!d.returnedAt) return null;
  return { at: d.returnedAt, reason: d.returnedReason ?? "" };
}

/* ─────────────────────────────── send back ─────────────────────────────── */

/** The API's limits on the reason (DocumentSendBackInput: trimmed, 5–1,000 characters). */
export const SEND_BACK_REASON = { min: 5, max: 1000 } as const;

/** Why this reason can't be sent, or null — the API checks again. */
export function sendBackProblem(reason: string): string | null {
  const r = reason.trim();
  if (r.length < SEND_BACK_REASON.min) return "Say why it's being sent back — the person reads it.";
  if (r.length > SEND_BACK_REASON.max) return "Keep the reason under 1,000 characters.";
  return null;
}

/** What BTG reads when the API refuses a send-back. */
export function sendBackRefusal(status: number, body: unknown, fallback = "It wasn't sent back"): string {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  if (status === 403) return "Your role can't send documents back here.";
  if (status === 409) return typeof e?.message === "string" ? e.message : "This document changed since the page loaded — reload to see where it stands.";
  if (status >= 500) return "Something went wrong on our side — nothing changed. Try again in a minute.";
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string") return issue;
  if (typeof e?.message === "string") return e.message;
  return `${fallback} (HTTP ${status}).`;
}

/* ──────────────────────────────── confirm ──────────────────────────────── */

/** Shown while the confirm call runs: the server opens and reads the file. */
export const CHECKING_WORDS = "Checking your document…";

/**
 * After a confirm that didn't work, which button to offer:
 *  - the API answered (a 4xx: the file was refused, or sent back, or the
 *    link is wrong): the person reads the reason and picks a new file —
 *    "Try again";
 *  - nothing answered (unreachable, or the API broke): the bytes may well
 *    be in storage, so "Check again" asks the same document to be
 *    confirmed once more rather than uploading it twice.
 */
export function confirmFailureKind(status: number | undefined): "try-again" | "check-again" {
  if (status === undefined || status === 0 || status >= 500) return "check-again";
  return "try-again";
}

/**
 * The words a person reads when a confirm is refused: the API's own
 * sentence (a 422's plain-words reason, a 409's "BTG sent that document
 * back") when it has one, else the fallback — never a bare status.
 */
export function confirmRefusal(status: number, body: unknown, fallback: string): string {
  const e = (body as { error?: { message?: unknown; issues?: { message?: unknown }[] } } | null)?.error;
  if (status >= 500) return "Something went wrong on our side. Try again in a minute.";
  const issue = e?.issues?.[0]?.message;
  if (typeof issue === "string" && issue) return issue;
  if (typeof e?.message === "string" && e.message) return e.message;
  return fallback;
}
