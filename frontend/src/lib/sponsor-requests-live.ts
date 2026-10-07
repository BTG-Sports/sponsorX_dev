import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   2S1-FE-03 — BTG's sponsor-request screens (Claude Design
   SponsorRequests.dc.html, SR-1…SR-9), over 2S1-BE-05's API:

     GET  /sponsor-requests?state=NEW|APPROVED|DECLINED|REJECTED   a tab + every count
     GET  /sponsor-requests/:id                            one request, its checks, its progress,
                                                           its proof of business, why it waited
                                                           (reviewReasons) or that it was approved
                                                           automatically (autoApproved)
     GET  /sponsor-requests/:id/documents/:documentId      a five-minute, audited link to one document
     POST /sponsor-requests/:id/decision                   APPROVE {categories, linkSponsorId?, newSponsor?}
                                                           DECLINE {note}
                                                           REJECT {note}   — an approved account: logins off,
                                                                             the reason emailed (2S1-BE-17)
                                                           REINSTATE       — a rejected one: logins back on

   Pure: shapes, tabs, and every word the screens show that is derived
   rather than read. Every figure and status comes from the API — a step is
   "done" only when the API says it happened.
   -------------------------------------------------------------------------- */

/** REJECTED — an approved account BTG rejected afterwards: its logins are off (2S1-BE-17). */
export type SponsorRequestState = "NEW" | "APPROVED" | "DECLINED" | "REJECTED";

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
  /** The system approved it by itself — every check passed (2S1-BE-17). */
  autoApproved: boolean;
  /** Why the system could not approve it by itself: what BTG is to look at. */
  reviewReasons: string[];
};

export type ApiSponsorRequestList = { requests: ApiSponsorRequest[]; counts: Record<SponsorRequestState, number>; /** P1-FE-31 — present on a paged read. */ page?: PageInfo };

export type ApiSponsorRequestDetail = ApiSponsorRequest & {
  phone: string | null;
  answers: { label: string; value: string }[];
  suggestedCategories: BrandCategory[];
  zohoLeadId: string | null;
  decisionNote: string | null;
  /** The proof of business they uploaded — opened through a five-minute link. */
  documents: ApiSponsorDocument[];
  checks: {
    emailInUse: boolean;
    matches: { id: string; name: string; fromZoho: boolean; hasLogin: boolean }[];
  };
  progress: null | {
    categories: string[];
    decidedBy: { email: string; roles: string[] } | null;
    emailSentAt: string | null;
    signedIn: boolean | null;
    /** Approved by the system rather than a person. */
    automatic?: boolean;
    /** The account's login is switched off (a Reject). */
    loginSwitchedOff?: boolean | null;
  };
};

export type ApiSponsorDocument = { id: string; kind: string; filename: string; contentType: string; bytes: number; uploadedAt: string | null };

/* ------------------------------------------------------------------ tabs */

export type RequestTabKey = "waiting" | "approved" | "declined" | "rejected";

export const REQUEST_TABS: readonly { key: RequestTabKey; label: string; state: SponsorRequestState }[] = [
  { key: "waiting", label: "Waiting", state: "NEW" },
  { key: "approved", label: "Approved", state: "APPROVED" },
  { key: "declined", label: "Declined", state: "DECLINED" },
  /* An approved account BTG rejected afterwards — where its Reinstate is. */
  { key: "rejected", label: "Rejected", state: "REJECTED" },
];

export function requestTab(raw: string | string[] | undefined) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return REQUEST_TABS.find((t) => t.key === v) ?? REQUEST_TABS[0]!;
}

/** The tab a request sits in. A state this screen doesn't know yet falls back to Waiting rather than failing the page. */
export function tabFor(state: SponsorRequestState): RequestTabKey {
  return REQUEST_TABS.find((t) => t.state === state)?.key ?? "waiting";
}

export function tabLabel(key: RequestTabKey): string {
  return REQUEST_TABS.find((t) => t.key === key)?.label ?? "Waiting";
}

/** The empty tab, in words. */
export function emptyTitle(state: SponsorRequestState): string {
  if (state === "NEW") return "No requests waiting";
  if (state === "APPROVED") return "None approved yet";
  if (state === "REJECTED") return "None rejected";
  return "None declined";
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

export function stateBadge(s: SponsorRequestState): { label: string; tone: "warn" | "accent" | "neutral" | "danger" } {
  if (s === "APPROVED") return { label: "✓ Account opened", tone: "accent" };
  if (s === "DECLINED") return { label: "Declined", tone: "neutral" };
  if (s === "REJECTED") return { label: "✕ Rejected — logins off", tone: "danger" };
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

/** How it got to BTG — approved by the system, or why the system held it. */
export function reviewLine(d: Pick<ApiSponsorRequest, "state" | "autoApproved" | "reviewReasons">): { text: string; reasons: string[] } | null {
  if (d.autoApproved) return { text: "Approved automatically — every check passed, so no one at BTG had to review it.", reasons: [] };
  if (d.state === "NEW" && d.reviewReasons.length) return { text: "Waiting for BTG because:", reasons: d.reviewReasons };
  return null;
}

const DOC_KINDS: Record<string, string> = { PROOF_OF_BUSINESS: "Proof of business" };

/** "Proof of business · harbor-licence.pdf · 240 KB" */
export function documentLine(doc: ApiSponsorDocument): string {
  const kb = Math.max(1, Math.round(doc.bytes / 1024));
  const size = kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
  return `${DOC_KINDS[doc.kind] ?? doc.kind.replace(/_/g, " ").toLowerCase()} · ${doc.filename} · ${size}`;
}

/* ------------------------------------------- Reject / Reinstate (2S1-BE-17) */

/** What rejecting an approved account does, for the confirm dialog. */
export function rejectSteps(d: Pick<ApiSponsorRequest, "businessName" | "email">): string[] {
  return [
    `Every login for ${d.businessName} is switched off — they can’t sign in`,
    `Your reason is emailed to ${d.email}, exactly as written`,
    "Their files are kept for 30 days, then deleted — unless you reinstate them before then",
    "They can ask BTG to look again from the link in that email",
  ];
}

/** What reinstating a rejected account does, for the confirm dialog. */
export function reinstateSteps(d: Pick<ApiSponsorRequest, "businessName" | "email">): string[] {
  return [
    `The logins this rejection switched off are switched back on — ${d.businessName} can sign in again`,
    `${d.email} is emailed that the account is back`,
    "Nothing is deleted: the 30-day countdown on their files stops",
  ];
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
    { label: d.autoApproved ? "Approved automatically" : "Approved by BTG", state: "done", note: stampOf(d.decidedAt) },
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
