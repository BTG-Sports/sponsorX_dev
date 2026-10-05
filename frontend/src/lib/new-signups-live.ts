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

/* --------------------------------------------------------------------------
   P1-ART-15 — the Intake Stream: every kind on the desk in one server-paged
   list (GET /signups/stream, /signups/stream/summary). The URL holds the
   filters (`kind`, `review=1`, `q`, plus the house `page` / `size`); the old
   tabs' `?tab=` links (emails carry `?tab=review`) still land on the same
   view. Pure.
   -------------------------------------------------------------------------- */

export const STREAM_KINDS = ["ORGANIZATION", "ATHLETE", "GUARDIAN", "SPONSOR"] as const;
export type StreamKind = (typeof STREAM_KINDS)[number];

export type ApiStreamRow = {
  kind: StreamKind;
  id: string;
  name: string;
  sub: string;
  signedUpAt: string;
  state: SignupState;
  reasons: string[];
  flags: string[];
};
export type KindFigures = { total: number; held: number; auto: number };
export type ApiStreamSummary = { kinds: Partial<Record<StreamKind, KindFigures>>; all: KindFigures };

/** The chips, in the desk's order, and each kind's two-letter mark. */
export const STREAM_CHIPS: readonly { kind: StreamKind | ""; label: string }[] = [
  { kind: "", label: "All" },
  { kind: "ORGANIZATION", label: "Organizations" },
  { kind: "ATHLETE", label: "Athletes" },
  { kind: "GUARDIAN", label: "Guardians" },
  { kind: "SPONSOR", label: "Sponsors" },
];
const MONO: Record<StreamKind, string> = { ORGANIZATION: "OR", ATHLETE: "AT", GUARDIAN: "GU", SPONSOR: "SP" };
const KIND_WORD: Record<StreamKind, string> = { ORGANIZATION: "Organization", ATHLETE: "Athlete", GUARDIAN: "Guardian", SPONSOR: "Sponsor" };
const LEGACY_TAB: Record<string, { kind?: StreamKind; review?: boolean }> = {
  org: { kind: "ORGANIZATION" }, ath: { kind: "ATHLETE" }, gua: { kind: "GUARDIAN" }, spo: { kind: "SPONSOR" }, review: { review: true },
};

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? "").trim();

/** The stream's filters from the URL; an explicit filter beats a legacy `?tab=`. */
export function streamParams(sp: Params): { kind: StreamKind | ""; review: boolean; q: string } {
  const legacy = LEGACY_TAB[first(sp.tab)] ?? {};
  const raw = first(sp.kind);
  const kind = (STREAM_KINDS as readonly string[]).includes(raw) ? (raw as StreamKind) : legacy.kind ?? "";
  const review = sp.review !== undefined ? first(sp.review) === "1" : Boolean(legacy.review);
  return { kind, review, q: first(sp.q).slice(0, 100) };
}

/** `?page&size&kind&review&q` for GET /signups/stream (page always sent: it turns paging on). */
export function streamApiQuery(sp: Params): string {
  const { kind, review, q } = streamParams(sp);
  const p = Number(first(sp.page));
  const s = Number(first(sp.size));
  const u = new URLSearchParams({
    page: String(Number.isInteger(p) && p >= 1 ? p : 1),
    size: String([12, 24, 60].includes(s) ? s : 12),
  });
  if (kind) u.set("kind", kind);
  if (review) u.set("review", "1");
  if (q) u.set("q", q);
  return `?${u}`;
}

export type StreamRowView = {
  key: string;
  kind: StreamKind;
  mono: string;
  kindWord: string;
  name: string;
  sub: string;
  when: string;
  badge: { label: string; tone: "accent" | "warn" | "neutral"; mark: string };
  reason: string;
  href: string;
  /** Held or flagged — what Needs review shows, and the row BTG acts on. */
  held: boolean;
};

function streamHref(kind: StreamKind, id: string): string {
  const e = encodeURIComponent(id);
  if (kind === "ORGANIZATION") return orgHref(id);
  if (kind === "SPONSOR") return `/admin/sponsor-requests/${e}`;
  return `/admin/new-signups/${kind === "ATHLETE" ? "athletes" : "guardians"}/${e}`;
}

/** One stream row in the desk's words (the same as its old per-kind section). */
export function streamRowView(r: ApiStreamRow): StreamRowView {
  const held = r.state === "NEEDS_REVIEW" || r.flags.length > 0;
  const badge =
    r.state === "NEEDS_REVIEW" ? { label: "Needs review", tone: "warn" as const, mark: "!" }
    : r.state === "REJECTED" ? { label: "Rejected", tone: "neutral" as const, mark: "✕" }
    : r.flags.length ? { label: "Approved · flagged", tone: "warn" as const, mark: "!" }
    : r.state === "APPROVED" ? { label: "Approved by BTG", tone: "accent" as const, mark: "✓" }
    : { label: "Approved automatically", tone: "accent" as const, mark: "✓" };
  const reason = r.reasons.length ? r.reasons.join(" · ")
    : r.flags.length ? r.flags.join(" · ")
    : r.state === "NEEDS_REVIEW" ? "Waiting for BTG’s review"
    : r.state === "REJECTED" ? "Rejected by BTG"
    : r.state === "APPROVED" ? "Reviewed and approved by BTG"
    : "All checks passed";
  return {
    key: `${r.kind}-${r.id}`, kind: r.kind, mono: MONO[r.kind], kindWord: KIND_WORD[r.kind], name: r.name, sub: r.sub,
    when: dayOf(r.signedUpAt), badge, reason, href: streamHref(r.kind, r.id), held,
  };
}

/** The hero: "186 sign-ups / approved themselves." and "4 need you." — from the summary, never a page. */
export function intakeHeadline(all: KindFigures): { count: string; approved: string; held: string } {
  const n = all.auto.toLocaleString("en-US");
  return {
    count: all.auto === 0 ? "No sign-ups" : all.auto === 1 ? `${n} sign-up` : `${n} sign-ups`,
    approved: all.auto === 0 ? "approved themselves yet." : all.auto === 1 ? "approved itself." : "approved themselves.",
    held: all.held === 0 ? "Nothing needs you." : all.held === 1 ? "1 needs you." : `${all.held.toLocaleString("en-US")} need you.`,
  };
}
