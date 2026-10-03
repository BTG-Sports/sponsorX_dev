/* --------------------------------------------------------------------------
   2S1-FE-07 — BTG's New sign-ups desk, the athlete and guardian rows: LIVE
   since 2S1-BE-09 / -10 (backend/src/domain/signups-desk.ts).

     GET  /signups                                    every athlete and guardian approved, held or rejected
     GET  /signups/athletes/:id · /signups/guardians/:id   one, with checks, documents, activity
     GET  /signups/{athletes|guardians}/:id/documents/:documentId   a 5-minute audited link
     POST /signups/athletes/:id/{approve|reject|reinstate}
     POST /signups/guardians/:id/{reject|reinstate}

   Organizations (2S1-BE-06) join this desk with their own rows; sponsors are
   their own section (new-signups-live.ts). Pure: shapes and words.
   -------------------------------------------------------------------------- */

import type { ContentTrust } from "@/lib/content-trust";

export type LiveSignupKind = "ATHLETE" | "GUARDIAN";
export type LiveSignupState = "AUTO_APPROVED" | "APPROVED" | "NEEDS_REVIEW" | "REJECTED";

/** One row of GET /signups. */
export type ApiSignupRow = {
  id: string;
  kind: LiveSignupKind;
  name: string;
  sub: string;
  signedUpAt: string;
  state: LiveSignupState;
  /** Why it is held — BTG's words. */
  reasons: string[];
  /** Never a reason to hold — e.g. a place not in the age table. */
  flags: string[];
};

export type ApiSignupList = {
  signups: ApiSignupRow[];
  counts: { all: number; athletes: number; guardians: number; review: number };
};

/** GET /signups/athletes/:id and /signups/guardians/:id. */
export type ApiSignupDetail = ApiSignupRow & {
  approvedAt: string | null;
  details: { label: string; value: string }[];
  checks: string[];
  /** What a held sign-up still waits on from the applicant. */
  missing: string[];
  documents: { id: string; name: string; sub: string; viewable: boolean }[];
  activity: { at: string; text: string }[];
  guardian: { id: string; name: string; rejected: boolean } | null;
  guardianOf: (ApiSignupRow & { rejectedWithGuardian?: boolean })[];
  rejectNote: string | null;
  rejectedWithGuardian: boolean;
  /** P5-BE-10 — an athlete's content standing (BTG only; absent for a guardian). */
  contentTrust?: ContentTrust;
  can: { approve: boolean; reject: boolean; reinstate: boolean };
};

export const LIVE_KIND_WORDS: Record<LiveSignupKind, string> = { ATHLETE: "Athlete", GUARDIAN: "Guardian" };

/** Where one live sign-up opens on the desk — the link BTG's emails carry. */
export function signupHref(kind: LiveSignupKind, id: string): string {
  return `/admin/new-signups/${kind === "ATHLETE" ? "athletes" : "guardians"}/${encodeURIComponent(id)}`;
}

/** Held, or flagged: what the Needs review tab shows. */
export function needsReview(s: Pick<ApiSignupRow, "state" | "flags">): boolean {
  return s.state === "NEEDS_REVIEW" || s.flags.length > 0;
}

const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function liveBadge(s: Pick<ApiSignupRow, "state" | "flags">, at?: string | null): { label: string; tone: "accent" | "warn" | "neutral"; mark: string } {
  if (s.state === "NEEDS_REVIEW") return { label: "Needs review", tone: "warn", mark: "!" };
  if (s.state === "REJECTED") return { label: "Rejected", tone: "neutral", mark: "✕" };
  if (s.flags.length) return { label: "Approved · flagged", tone: "warn", mark: "!" };
  if (s.state === "APPROVED") return { label: at ? `Approved by BTG · ${dayOf(at)}` : "Approved by BTG", tone: "accent", mark: "✓" };
  return { label: at ? `Approved automatically · ${dayOf(at)}` : "Approved automatically", tone: "accent", mark: "✓" };
}

/** The desk's one-line reason column. */
export function liveChecksWord(s: Pick<ApiSignupRow, "state" | "reasons" | "flags">): string {
  if (s.reasons.length) return s.reasons.join(" · ");
  if (s.flags.length) return s.flags.join(" · ");
  if (s.state === "REJECTED") return "Rejected by BTG";
  return s.state === "APPROVED" ? "Reviewed and approved by BTG" : "All checks passed";
}

/** The reject dialog's warning for a guardian: the athletes it takes with them. */
export function cascadeWords(d: Pick<ApiSignupDetail, "kind" | "guardianOf">): string | null {
  if (d.kind !== "GUARDIAN") return null;
  const kids = d.guardianOf.filter((w) => w.state !== "REJECTED").map((w) => w.name);
  if (!kids.length) return null;
  const list = kids.length === 1 ? kids[0]! : `${kids.slice(0, -1).join(", ")} and ${kids.at(-1)}`;
  return `This also rejects ${list}.`;
}

/** Why an API refusal happened, in the API's own words when it gave some. */
export function refusalWords(body: unknown, status: number): string {
  const said = (body as { error?: { message?: string } } | null)?.error?.message;
  if (said && status < 500) return said;
  if (status === 403) return "Your role can't do that here.";
  return status >= 500 ? "Something went wrong on our side. Try again in a minute." : `That didn't work (${status}).`;
}
