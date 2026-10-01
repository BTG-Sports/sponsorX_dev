import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";

/* --------------------------------------------------------------------------
   2S1-FE-03 — BTG's sponsor-request screens (Claude Design
   SponsorRequests.dc.html, SR-1…SR-9), over 2S1-BE-05's API:

     GET  /sponsor-requests?state=NEW|APPROVED|DECLINED   a tab + every count
     GET  /sponsor-requests/:id                            one request, its checks, its progress
     POST /sponsor-requests/:id/decision                   APPROVE {categories, linkSponsorId?, newSponsor?}
                                                           DECLINE {note}

   Pure: shapes, tabs, and every word the screens show that is derived
   rather than read. Every figure and status comes from the API — a step is
   "done" only when the API says it happened.
   -------------------------------------------------------------------------- */

export type SponsorRequestState = "NEW" | "APPROVED" | "DECLINED";

export type ApiSponsorRequest = {
  id: string;
  state: SponsorRequestState;
  businessName: string;
  contactName: string;
  email: string;
  categoryText: string | null;
  budget: string | null;
  zoho: "LEAD" | "PENDING";
  createdAt: string;
  decidedAt: string | null;
  sponsorId: string | null;
};

export type ApiSponsorRequestList = { requests: ApiSponsorRequest[]; counts: Record<SponsorRequestState, number> };

export type ApiSponsorRequestDetail = ApiSponsorRequest & {
  phone: string | null;
  answers: { label: string; value: string }[];
  suggestedCategories: BrandCategory[];
  zohoLeadId: string | null;
  decisionNote: string | null;
  checks: {
    emailInUse: boolean;
    matches: { id: string; name: string; fromZoho: boolean; hasLogin: boolean }[];
  };
  progress: null | {
    categories: string[];
    decidedBy: { email: string; roles: string[] } | null;
    emailSentAt: string | null;
    signedIn: boolean | null;
  };
};

/* ------------------------------------------------------------------ tabs */

export const REQUEST_TABS: readonly { key: "waiting" | "approved" | "declined"; label: string; state: SponsorRequestState }[] = [
  { key: "waiting", label: "Waiting", state: "NEW" },
  { key: "approved", label: "Approved", state: "APPROVED" },
  { key: "declined", label: "Declined", state: "DECLINED" },
];

export function requestTab(raw: string | string[] | undefined) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return REQUEST_TABS.find((t) => t.key === v) ?? REQUEST_TABS[0]!;
}

export function tabFor(state: SponsorRequestState) {
  return REQUEST_TABS.find((t) => t.state === state)!.key;
}

/* ---------------------------------------------------------------- words */

const DAY = 86_400_000;

/** "today", "yesterday", "3 days ago" — how long it has waited. */
export function askedAgo(iso: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function stampOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC";
}

export function zohoLabel(r: Pick<ApiSponsorRequest, "zoho">): string {
  return r.zoho === "LEAD" ? "Lead received" : "Lead on its way";
}

export function stateBadge(s: SponsorRequestState): { label: string; tone: "warn" | "accent" | "neutral" } {
  if (s === "APPROVED") return { label: "✓ Account opened", tone: "accent" };
  if (s === "DECLINED") return { label: "Declined", tone: "neutral" };
  return { label: "● Waiting for BTG", tone: "warn" };
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
}

export function roleWords(roles: string[]): string {
  if (roles.includes("SUPER_ADMIN")) return "Super admin";
  if (roles.includes("BTG_ADMIN")) return "BTG admin";
  if (roles.includes("SALES")) return "BTG Sales";
  return "BTG";
}

/* ------------------------------------------------------ business type */

/** Every category BTG can pick, suggested ones first. */
export function categoryOptions(suggested: readonly BrandCategory[]) {
  const rest = BRAND_CATEGORIES.filter((c) => !suggested.includes(c));
  return [...suggested, ...rest].map((c) => ({ value: c, label: categoryLabel(c), suggested: suggested.includes(c) }));
}

/* ----------------------------------------------------------- the checks */

export type LinkChoice = { kind: "link"; sponsorId: string } | { kind: "new" } | null;

export type DecisionCheck = { key: string; ok: boolean; label: string; status: string };

export function decisionChecks(d: ApiSponsorRequestDetail): DecisionCheck[] {
  const match = d.checks.matches[0];
  return [
    d.checks.emailInUse
      ? { key: "email", ok: false, label: `${d.email} already has a SponsorX login`, status: "Blocks approval" }
      : { key: "email", ok: true, label: "Email not already in use", status: "Passed" },
    match
      ? { key: "name", ok: false, label: `A sponsor named “${match.name}” already exists${match.fromZoho ? " (from Zoho)" : ""}`, status: "Choose below" }
      : { key: "name", ok: true, label: "No existing sponsor with this name", status: "Passed" },
    d.zohoLeadId
      ? { key: "zoho", ok: true, label: "Zoho: lead received", status: "Passed" }
      : { key: "zoho", ok: true, label: "Zoho: lead on its way", status: "Queued" },
  ];
}

/** Why Approve is off right now, in words — or null when it can go. */
export function approveBlock(d: ApiSponsorRequestDetail, picked: readonly string[], link: LinkChoice): string | null {
  if (d.checks.emailInUse) return `${d.email} already has a SponsorX login. Ask them for a different contact, or link this request to that sponsor.`;
  if (!picked.length) return "Pick at least one business type.";
  if (d.checks.matches.length && !link) return `Choose whether to link to “${d.checks.matches[0]!.name}” or create a new sponsor.`;
  if (link?.kind === "link" && d.checks.matches.find((m) => m.id === link.sponsorId)?.hasLogin) {
    return "That sponsor already has people signing in — add this contact from the sponsor's page instead.";
  }
  return null;
}

/** SR-3 — what approving does, in the order it happens. */
export function whatHappens(d: ApiSponsorRequestDetail, picked: readonly BrandCategory[], link: LinkChoice): string[] {
  const types = picked.map(categoryLabel).join(", ");
  const linked = link?.kind === "link" ? d.checks.matches.find((m) => m.id === link.sponsorId) : null;
  return [
    linked ? `${d.businessName} is linked to the existing sponsor “${linked.name}”, with business type ${types}` : `${d.businessName}’s account is created with business type ${types}`,
    `A login for ${d.email}`,
    "A sign-in email is sent",
    linked?.fromZoho ? "It stays linked to its account in Zoho" : "It’s added to Zoho as an account",
  ];
}

/* ------------------------------------------------ SR-4, the account's progress */

export type Step = { label: string; state: "done" | "current" | "todo"; note: string };

export function accountTracker(d: ApiSponsorRequestDetail): Step[] | null {
  if (d.state !== "APPROVED" || !d.progress) return null;
  const sent = Boolean(d.progress.emailSentAt);
  const signed = d.progress.signedIn === true;
  return [
    { label: "Requested", state: "done", note: stampOf(d.createdAt) },
    { label: "Approved by BTG", state: "done", note: stampOf(d.decidedAt) },
    { label: "Sign-in email sent", state: sent ? "done" : "current", note: sent ? stampOf(d.progress.emailSentAt) : "Queued — it goes once our email service is connected" },
    { label: "Signed in", state: signed ? "done" : sent ? "current" : "todo", note: signed ? "Signed in" : "Not yet" },
  ];
}

/* ------------------------------------------------------------- writes */

export type RequestWriteFailure = { ok: false; status: number; message: string };

export function requestRefusal(status: number, body: unknown): RequestWriteFailure {
  const m = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return { ok: false, status, message: typeof m === "string" && m ? m : status === 403 ? "You can’t decide sponsor requests." : "Something went wrong — nothing changed." };
}
