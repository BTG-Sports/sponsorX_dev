/* --------------------------------------------------------------------------
   2S1-FE-05 — BTG's organization profile page, the page each BTG email links
   to (/admin/onboarding/:id). Live on 2S1-BE-06:

     GET /onboarding/:id/profile                    this shape
     GET /onboarding/:id/documents/:documentId      a five-minute audited link (viewer)
     POST /onboarding/:id/decision                  Reject (reason emailed) / Reinstate / the rest
     GET /onboarding?list=auto | list=flagged       the spot-check lists
     GET /onboarding/signups                        the New sign-ups desk's organization rows

   Pure: the API's shape and the words the page derives.
   -------------------------------------------------------------------------- */

import type { OnboardingDecision, OnboardingState } from "@/lib/onboarding-live";

export type SignupState = "AUTO_APPROVED" | "NEEDS_REVIEW" | "REJECTED";

export type ApiOrgProfile = {
  id: string;
  kind: "ORGANIZATION";
  name: string;
  sub: string;
  signedUpAt: string;
  state: SignupState;
  reasons: string[];
  onboardingState: OnboardingState;
  autoApproved: boolean;
  approvedAt: string | null;
  flagged: boolean;
  orgType: string;
  stateCode: string | null;
  details: { label: string; value: string }[];
  contactEmail: string | null;
  /** The checklist as it stood when approved (or the live one while it waits). */
  checksAt: string | null;
  checks: { key: string; label: string; ok: boolean }[];
  liveChecks: { key: string; label: string; ok: boolean }[];
  nameTakenBy: string | null;
  reviewReasons: string[];
  flags: string[];
  flaggedAt: string | null;
  reviewNotes: string | null;
  decidedAt: string | null;
  requirements: { key: string; label: string; done: boolean; documentId: string | null }[];
  documents: {
    id: string; kind: string; stateCode: string | null; filename: string; contentType: string; bytes: number; label: string;
    uploadedAt: string; expiresOn: string | null; current: boolean; replacedAt: string | null; removedAt: string | null;
  }[];
  activity: { at: string; text: string; byBtg: boolean }[];
  logins: { email: string; switchedOff: boolean; signedIn: boolean }[];
  decisions: OnboardingDecision[];
};

/** "Sep 23, 10:02 AM" (UTC, so server and test agree). */
export function momentOf(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

/** The heading over the checklist: as approved (with when), or live while it waits. */
export function checklistHeading(p: Pick<ApiOrgProfile, "onboardingState" | "autoApproved" | "checksAt">): string {
  if (p.autoApproved && p.checksAt) return `Checklist when approved · ${momentOf(p.checksAt)}`;
  if (p.onboardingState === "PENDING_REVIEW") return "Checklist now";
  return "Checklist now (approved by BTG, not automatically)";
}

/** The state line under the name. */
export function profileStanding(p: Pick<ApiOrgProfile, "onboardingState" | "autoApproved" | "approvedAt" | "flagged">): { label: string; tone: "accent" | "warn" | "neutral" | "danger"; mark: string } {
  if (p.onboardingState === "REJECTED") return { label: p.approvedAt ? "Rejected after approval" : "Rejected", tone: "neutral", mark: "✕" };
  if (p.onboardingState === "SUSPENDED") return { label: "Suspended", tone: "danger", mark: "!" };
  if (p.onboardingState === "PENDING_REVIEW") return { label: "Needs review", tone: "warn", mark: "!" };
  if (p.flagged) return { label: "Flagged after a document change", tone: "warn", mark: "!" };
  if (p.onboardingState === "APPROVED") return { label: p.autoApproved ? "Approved automatically" : "Approved by BTG", tone: "accent", mark: "✓" };
  return { label: p.onboardingState.replace("_", " ").toLowerCase(), tone: "neutral", mark: "○" };
}

/** One document's line: what it is, and where it stands in the history. */
export function profileDocumentLine(d: ApiOrgProfile["documents"][number]): string {
  const when = d.removedAt ? `removed ${momentOf(d.removedAt)}` : d.replacedAt ? `replaced ${momentOf(d.replacedAt)}` : `uploaded ${momentOf(d.uploadedAt)}`;
  return [d.label, when, d.expiresOn ? `valid until ${momentOf(d.expiresOn).split(",")[0]}` : null].filter(Boolean).join(" · ");
}
