/* --------------------------------------------------------------------------
   Profile edits, as the API answers them — P3-BE-16, reshaped by 2S1-BE-14
   (2026-10-01): BTG no longer reviews edits.

     GET  /athletes/me/profile-changes   the athlete's own history (the editor's banner)
     GET  /profile-changes               BTG: SENSITIVE edits only (New sign-ups)

   An ordinary edit is APPROVED (live) the moment it is saved. A sensitive
   one — legal name, date of birth, guardian — is live too, with the checks
   it re-ran in `checkNotes`; a new legal name alone waits (PENDING) for its
   matching ID. DECLINED appears only on records from before 2S1-BE-14.

   POL-FE-02 / POL-BE-02 (2026-10-28) — a minor's new date of birth, or a
   move, that would make them an adult is NOT applied by the edit: it comes
   back as a PENDING change with `fields` holding `birthDate` and/or
   `stateCode`, no ID upload, and `checkNotes` "BTG checks this change
   before it applies…". The athlete sees "Waiting for BTG" and can withdraw
   it; BTG applies or declines it (with a note) on the same decision route
   as a held legal name.

   Pure: shapes and the words both screens derive. No fetch, no clock.
   -------------------------------------------------------------------------- */

import type { ApiDocumentCheck, DocumentCheckState } from "./document-checks-live";

export type ProfileChangeState = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN";

/** The §11 sections an edit can touch, plus the guardian (2S1-BE-14). */
export type ChangeSection = "identity" | "sport" | "capabilities" | "interests" | "restrictions" | "guardian";

export type ApiProfileChange = {
  id: string;
  athleteId: string;
  sections: ChangeSection[];
  /** Athlete column → new value (only what differed). */
  fields: Record<string, unknown>;
  note: string | null;
  state: ProfileChangeState;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  /** 2S1-BE-14 — a legal name, date of birth or guardian. */
  sensitive?: boolean;
  appliedAt?: string | null;
  /** What the re-run checks found, in plain words. */
  checkNotes?: string[];
  idDocumentFilename?: string | null;
  idDocumentUploadedAt?: string | null;
  /** P8-BE-11 — what reading the ID found (null until read); P8-BE-10 — BTG sent it back, and why. */
  idDocumentCheckState?: DocumentCheckState | null;
  /** The API sends the stored findings as written: `{ code, says }` objects (the
   *  other document views flatten them to `says` strings). Either is read. */
  idDocumentCheckFindings?: Array<string | { code?: string; says?: string }> | null;
  idDocumentCheckedAt?: string | null;
  idDocumentReturnedAt?: string | null;
  idDocumentReturnedReason?: string | null;
};

/** One row of BTG's list (GET /profile-changes). */
export type ApiSensitiveEdit = ApiProfileChange & {
  athlete: { id: string; slug: string; displayName: string; legalName: string; state: string };
  idDocument: { filename: string | null; uploadedAt: string } | null;
};

/* ─────────────────────── P8-FE-11 — the ID's check ─────────────────────── */

/** The ID's result as the shared document-check words take it (null when it was never read). */
export function editIdCheck(c: Pick<ApiProfileChange, "idDocumentCheckState" | "idDocumentCheckFindings" | "idDocumentCheckedAt">): ApiDocumentCheck {
  if (!c.idDocumentCheckState) return null;
  return {
    state: c.idDocumentCheckState,
    findings: Array.isArray(c.idDocumentCheckFindings)
      ? c.idDocumentCheckFindings
          .map((f) => (typeof f === "string" ? f : f && typeof f === "object" && typeof f.says === "string" ? f.says : ""))
          .filter((f) => f.trim().length > 0)
      : [],
    checkedAt: c.idDocumentCheckedAt ?? null,
  };
}

type PendingShape = Pick<ApiProfileChange, "state" | "idDocumentUploadedAt"> & { fields?: Record<string, unknown>; idDocument?: { uploadedAt: string } | null };

const idIn = (c: PendingShape) => Boolean(c.idDocumentUploadedAt ?? c.idDocument?.uploadedAt);

/** POL-FE-02 — a held adulthood change: PENDING with no ID in play (a date of birth and/or a move, never a legal name). It waits for BTG alone. */
export function heldForBtg(c: PendingShape): boolean {
  return c.state === "PENDING" && !idIn(c) && !("legalName" in (c.fields ?? {}));
}

/** PENDING and BTG's to answer: a legal name whose ID arrived but didn't read clear, or an adulthood change held with no ID at all. */
export function awaitingBtg(c: PendingShape): boolean {
  return c.state === "PENDING" && (idIn(c) || heldForBtg(c));
}

/** The chip on BTG's list: a PENDING change is waiting either for the athlete's ID or for BTG. */
export function editStatusLabel(c: PendingShape): string {
  if (c.state === "PENDING") return awaitingBtg(c) ? "Waiting for you" : "Waiting for the ID";
  return STATE_COPY[c.state].label;
}

/** The athlete's banner chip: "Waiting for BTG" once it is BTG's turn, else the ID is still theirs to send. */
export function bannerLabel(c: PendingShape): string {
  if (c.state === "PENDING") return awaitingBtg(c) ? "Waiting for BTG" : "Waiting for your ID";
  return STATE_COPY[c.state].label;
}

/** What the athlete's banner says after the chip and the sections, for a PENDING change. */
export function pendingLine(c: PendingShape): string {
  if (heldForBtg(c)) return "BTG checks this change before it applies. Nothing changes until they do; you can withdraw it meanwhile.";
  if (idIn(c)) return "Your ID is in. BTG is checking it; your new legal name goes live once they apply it.";
  return "Your new legal name goes live once its matching ID arrives.";
}

/** "Withdrawn. Your date of birth stays as it is." — after the athlete's own withdraw. */
export function withdrawnLine(c: { fields: Record<string, unknown> }): string {
  const what = sensitiveWhat(c).toLowerCase() || "profile";
  return `Withdrawn. Your ${what} stays as it is.`;
}

/** BTG sent the ID back (the change is declined with that reason): "BTG asked for a new one: …", for the athlete. */
export function sentBackAsk(c: Pick<ApiProfileChange, "idDocumentReturnedAt" | "idDocumentReturnedReason" | "reviewerNotes">): string | null {
  if (!c.idDocumentReturnedAt) return null;
  const reason = (c.idDocumentReturnedReason ?? c.reviewerNotes ?? "").trim();
  return reason ? `BTG asked for a new one: ${reason}` : "BTG asked for a new one.";
}

export const SECTION_LABELS: Record<ChangeSection, string> = {
  identity: "Identity",
  sport: "Sport & team",
  capabilities: "Content capabilities",
  interests: "Brand interests",
  restrictions: "Restrictions & conflicts",
  guardian: "Guardian",
};

export const FIELD_LABELS: Record<string, string> = {
  displayName: "Display name",
  legalName: "Legal name",
  birthDate: "Date of birth",
  guardianId: "Guardian",
  city: "City",
  stateCode: "State",
  sport: "Sport",
  position: "Position",
  school: "School / team",
  level: "Level",
  gradYear: "Class of",
  achievements: "Achievements",
  contentCapabilities: "Jobs they'll deliver",
  brandInterests: "Brand interests",
  restrictedCategories: "Never promote",
  restrictionNotes: "Restriction notes",
};

/** "HIGH_SCHOOL" → "High school"; lists join; empty is a dash. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.length === 0 ? "— (none)" : v.map((x) => words(String(x))).join(", ");
  if (typeof v === "string" && /^[A-Z][A-Z_]+$/.test(v)) return words(v);
  return String(v);
}

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");

export type ChangeRow = { field: string; label: string; value: string };

/** What an edit changed, in §11 order. An unknown field (a future column)
 *  still renders, under its own key, rather than vanishing. A guardian is
 *  shown as "named" — its id means nothing to a person. */
export function changeRows(change: { fields: Record<string, unknown> }): ChangeRow[] {
  const order = Object.keys(FIELD_LABELS);
  return Object.keys(change.fields)
    .sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] ?? field,
      value: field === "guardianId" ? "Named" : formatValue(change.fields[field]),
    }));
}

/** "Legal name, Date of birth" — what a sensitive edit was about. */
export function sensitiveWhat(change: { fields: Record<string, unknown> }): string {
  return changeRows(change).map((r) => r.label).join(", ");
}

export const STATE_COPY: Record<ProfileChangeState, { label: string; tone: "warn" | "accent" | "danger" | "neutral" }> = {
  PENDING: { label: "Waiting for your ID", tone: "warn" },
  APPROVED: { label: "Live", tone: "accent" },
  DECLINED: { label: "Declined", tone: "danger" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

/** The athlete's banner: a legal name waiting for its ID, else the latest
 *  sensitive edit with what its checks found. Ordinary edits need no banner. */
export function latestForBanner(changes: ApiProfileChange[]): ApiProfileChange | null {
  const pending = changes.find((c) => c.state === "PENDING");
  if (pending) return pending;
  /* P8-FE-11 — BTG sent the ID back: the athlete reads why and submits the
     name again with a clearer one. Only while nothing newer took its place. */
  const sentBack = changes
    .filter((c) => c.state === "DECLINED" && Boolean(c.idDocumentReturnedAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const superseded = sentBack && changes.some((c) => c.id !== sentBack.id && "legalName" in c.fields && c.createdAt > sentBack.createdAt && c.state !== "DECLINED" && c.state !== "WITHDRAWN");
  if (sentBack && !superseded) return sentBack;
  return changes.find((c) => c.state === "APPROVED" && c.sensitive && (c.checkNotes?.length ?? 0) > 0) ?? null;
}

/** Under 18 now (today's rule in the API, guardian-rules.ts; 2S1-BE-12's
 *  table by place replaces it there). Unknown is adult, as there. */
export function isMinorNow(birthDate: string | null | undefined, ageBand: string | null | undefined, now = new Date()): boolean {
  if (birthDate) {
    const eighteenth = new Date(birthDate);
    eighteenth.setUTCFullYear(eighteenth.getUTCFullYear() + 18);
    return eighteenth > now;
  }
  return ageBand === "UNDER_16" || ageBand === "16_17";
}

/** The legal-name field: does saving it need an ID upload? */
export function legalNameNeedsId(current: string, typed: string): boolean {
  return typed.trim() !== "" && typed.trim() !== current.trim();
}
