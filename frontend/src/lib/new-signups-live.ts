import type { ApiSponsorRequest } from "@/lib/sponsor-requests-live";

/* --------------------------------------------------------------------------
   2S1-FE-07 — BTG's New sign-ups desk (Claude Design NewSignups.dc.html,
   views all / review / athlete / guardian / reject / viewer).

   Three sources, kept apart on the screen:

   - ATHLETES and GUARDIANS are live since 2S1-BE-09 / -10 — their shapes
     and words are lib/signups-live.ts.
   - SPONSORS are live since 2S1-BE-17, from the sponsor-request API:
       GET /sponsor-requests?state=APPROVED   approved — automatically or by BTG
       GET /sponsor-requests?state=NEW        the ones held with review reasons
   - ORGANIZATIONS are samples until 2S1-BE-06 builds their automatic
     approval. The fixtures below are typed like the rows it will add, so
     wiring them is a swap of the source.

   Pure: shapes, fixtures, tabs and the words the screens derive.
   -------------------------------------------------------------------------- */

export const SIGNUP_BACKEND = "2S1-BE-06 (organizations approved automatically)";

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

export type SignupDetail = Signup & {
  approvedAt: string | null;
  details: { label: string; value: string }[];
  /** The checks it passed when approved. */
  checks: string[];
  documents: { id: string; name: string; sub: string }[];
  activity: { at: string; text: string }[];
  /** A guardian's athletes. */
  guardianOf: { name: string; sub: string; state: SignupState }[];
};

/* -------------------------------------------------------------- fixtures */

export const KIND_WORDS: Record<SignupKind, string> = { ORGANIZATION: "Organization", ATHLETE: "Athlete", GUARDIAN: "Guardian" };

const row = (id: string, kind: SignupKind, name: string, sub: string, signedUpAt: string, reasons: string[] = []): SignupDetail => ({
  id, kind, name, sub, signedUpAt, state: reasons.length ? "NEEDS_REVIEW" : "AUTO_APPROVED", reasons,
  approvedAt: reasons.length ? null : signedUpAt, details: [], checks: [], documents: [], activity: [], guardianOf: [],
});

/** Held rows get their own small record: what they gave us, and when they were held. */
const held = (s: SignupDetail): SignupDetail => ({
  ...s,
  details: [{ label: "Signed up as", value: KIND_WORDS[s.kind] }, { label: "Email", value: "Confirmed" }],
  activity: [{ at: s.signedUpAt, text: "Signed up" }, { at: s.signedUpAt, text: "Held for BTG’s review" }],
});

const approvedOrg = (s: SignupDetail): SignupDetail => ({
  ...s,
  details: [{ label: "Type", value: "Team" }, { label: "Place", value: "Laurel, MD" }, { label: "Email", value: "Confirmed" }],
  checks: ["Email confirmed", "Name not already registered", "Certificate of insurance uploaded"],
  documents: [{ id: "doc-hawks-coi", name: "Certificate of insurance", sub: "Uploaded Sep 20" }],
  activity: [{ at: "2026-09-20T14:00:00Z", text: "Signed up" }, { at: "2026-09-20T14:06:00Z", text: "Approved automatically" }],
});

/** Organization samples only — athletes and guardians are live (2S1-BE-09 / -10). */
export const SAMPLE_SIGNUPS: readonly SignupDetail[] = [
  approvedOrg(row("westfield-hawks", "ORGANIZATION", "Westfield Hawks", "Team · Laurel, MD", "2026-09-20T14:00:00Z")),
  held(row("org-same-name", "ORGANIZATION", "[Organization name]", "Organization sign-up", "2026-09-28T12:00:00Z", ["Name already registered: “Westfield Hawks”"])),
  held(row("org-document-removed", "ORGANIZATION", "[Organization name]", "Approved Sep 18", "2026-09-25T12:00:00Z", ["Document removed after approval: Certificate of insurance"])),
];

export function sampleSignup(id: string): SignupDetail | null {
  return SAMPLE_SIGNUPS.find((s) => s.id === id) ?? null;
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
