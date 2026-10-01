import type { ApiSponsorRequest } from "@/lib/sponsor-requests-live";

/* --------------------------------------------------------------------------
   2S1-FE-07 — BTG's New sign-ups desk (Claude Design NewSignups.dc.html,
   views all / review / athlete / guardian / reject / viewer).

   Three sources, kept apart on the screen:

   - ORGANIZATIONS are live since 2S1-BE-06 (organisations approved
     automatically), from the onboarding API:
       GET /onboarding/signups                → { signups: ApiOrgSignup[] }
     Each opens the organisation's profile, /admin/onboarding/:id, which
     has Reject, Reinstate and the 5-minute document links.
   - ATHLETES (2S1-BE-09) and GUARDIANS (2S1-BE-10) are live — their shapes
     and words are lib/signups-live.ts.
   - SPONSORS are live since 2S1-BE-17, from the sponsor-request API:
       GET /sponsor-requests?state=APPROVED   approved — automatically or by BTG
       GET /sponsor-requests?state=NEW        the ones held with review reasons

   Pure: shapes, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

/** The backend task behind each section of the desk. */
export const SIGNUP_BACKEND = {
  ORGANIZATION: "2S1-BE-06 (organizations approved automatically)",
  ATHLETE: "2S1-BE-09 (adult athletes approved automatically)",
  GUARDIAN: "2S1-BE-10 (minors and their guardians)",
  SPONSOR: "2S1-BE-17 (sponsors approved automatically)",
} as const;

/* ------------------------------------------------------------ the shapes */

export type SignupKind = "ORGANIZATION" | "ATHLETE" | "GUARDIAN";
export type SignupState = "AUTO_APPROVED" | "APPROVED" | "NEEDS_REVIEW" | "REJECTED";

export type Signup = {
  id: string;
  kind: SignupKind;
  name: string;
  /** One line under the name: sport and team, place, who they look after. */
  sub: string;
  signedUpAt: string;
  state: SignupState;
  /** Why it is held — empty when every check passed. */
  reasons: string[];
};

/** One row of GET /onboarding/signups (backend domain/onboarding-profile.ts). */
export type ApiOrgSignup = Omit<Signup, "kind" | "state"> & {
  kind: "ORGANIZATION";
  /** The desk's words; the API never says APPROVED — `autoApproved` tells the two apart. */
  state: "AUTO_APPROVED" | "NEEDS_REVIEW" | "REJECTED";
  onboardingState: string;
  /** False when a BTG person approved it: the desk says "Approved by BTG". */
  autoApproved: boolean;
  approvedAt: string | null;
  flagged: boolean;
};

export const KIND_WORDS: Record<SignupKind, string> = { ORGANIZATION: "Organization", ATHLETE: "Athlete", GUARDIAN: "Guardian" };

/** Where an organisation's row opens: Group A's profile, with Reject / Reinstate and the document links. */
export function orgHref(id: string): string {
  return `/admin/onboarding/${encodeURIComponent(id)}`;
}

/** An organisation's desk state: an approved one BTG approved by hand reads "Approved by BTG". */
export function orgState(r: Pick<ApiOrgSignup, "state" | "autoApproved">): SignupState {
  return r.state === "AUTO_APPROVED" && !r.autoApproved ? "APPROVED" : r.state;
}

/* ------------------------------------------------------------------ tabs */

export const SIGNUP_TABS: readonly { key: "all" | "org" | "ath" | "gua" | "spo" | "review"; label: string; kind?: SignupKind | "SPONSOR" }[] = [
  { key: "all", label: "All" },
  { key: "org", label: "Organizations", kind: "ORGANIZATION" },
  { key: "ath", label: "Athletes", kind: "ATHLETE" },
  { key: "gua", label: "Guardians", kind: "GUARDIAN" },
  { key: "spo", label: "Sponsors", kind: "SPONSOR" },
  { key: "review", label: "Needs review" },
];

/** Does a section of this kind show under the tab? (Needs review filters rows within each.) */
export function tabShows(tab: SignupTab, kind: SignupKind | "SPONSOR"): boolean {
  return tab.key === "all" || tab.key === "review" || tab.kind === kind;
}
export type SignupTab = (typeof SIGNUP_TABS)[number];

export function signupTab(raw: string | string[] | undefined): SignupTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SIGNUP_TABS.find((t) => t.key === v) ?? SIGNUP_TABS[0]!;
}

export function inTab(tab: SignupTab, s: Signup): boolean {
  if (tab.key === "review") return s.state === "NEEDS_REVIEW";
  return !tab.kind || s.kind === tab.kind;
}

export function tabCount(tab: SignupTab, rows: readonly Signup[]): number {
  return rows.filter((s) => inTab(tab, s)).length;
}

/* ---------------------------------------------------------------- words */

/** "Sep 23" */
export function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Sep 23, 10:02 AM" (UTC) */
export function momentOf(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

export function signupBadge(s: Pick<Signup, "state">, at?: string | null): { label: string; tone: "accent" | "warn" | "neutral"; mark: string } {
  if (s.state === "NEEDS_REVIEW") return { label: "Needs review", tone: "warn", mark: "!" };
  if (s.state === "REJECTED") return { label: "Rejected", tone: "neutral", mark: "✕" };
  if (s.state === "APPROVED") return { label: "Approved by BTG", tone: "accent", mark: "✓" };
  return { label: at ? `Approved automatically · ${dayOf(at)}` : "Approved automatically", tone: "accent", mark: "✓" };
}

export function checksWord(s: Signup): string {
  return s.reasons.length ? s.reasons.join(" · ") : "All checks passed";
}

export function firstName(name: string): string {
  return name.startsWith("[") ? name : name.split(/\s+/)[0] ?? name;
}

/* --------------------------------------------------------- live sponsors */

/** The sponsor-request summary, with the automatic-approval fields 2S1-BE-17 added. */
export type ApiSponsorSignup = ApiSponsorRequest & { autoApproved: boolean; reviewReasons: string[]; emailConfirmed?: boolean };

export type SponsorSignupRow = {
  id: string;
  name: string;
  sub: string;
  when: string;
  badge: { label: string; tone: "accent" | "warn" | "neutral"; mark: string };
  reason: string;
};

/**
 * Sponsor sign-ups as this desk shows them: the ones held for review first
 * (NEW with review reasons — NEW without any is still waiting on the
 * sponsor, e.g. to confirm their email, so it isn't a sign-up yet), then the
 * approved ones, newest first.
 */
export function sponsorRows(approved: readonly ApiSponsorSignup[], waiting: readonly ApiSponsorSignup[]): SponsorSignupRow[] {
  const heldRows = waiting.filter((r) => r.reviewReasons?.length).map((r) => ({
    id: r.id, name: r.businessName, sub: r.contactName, when: dayOf(r.createdAt),
    badge: { label: "Needs review", tone: "warn" as const, mark: "!" }, reason: r.reviewReasons.join(" · "),
  }));
  const approvedRows = approved.map((r) => ({
    id: r.id, name: r.businessName, sub: r.contactName, when: dayOf(r.decidedAt ?? r.createdAt),
    badge: r.autoApproved
      ? { label: "Approved automatically", tone: "accent" as const, mark: "✓" }
      : { label: "Approved by BTG", tone: "accent" as const, mark: "✓" },
    reason: r.autoApproved ? "All checks passed" : "Reviewed and approved by BTG",
  }));
  return [...heldRows, ...approvedRows];
}
